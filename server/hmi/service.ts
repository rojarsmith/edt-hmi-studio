import process from 'node:process';
import { existsSync } from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runExecutable, type CommandResult } from './command';
import {
  parseProgrammerDeviceId,
  parseProgrammerStLinkList,
  parseProgrammerUartList,
  type HmiSerialPort,
  type StLinkProbe,
} from './programmerParser';
import { writeGeneratedProjectSource } from './projectSource';
import { countFontGlyphs } from '../fontConv';
import { parseImageLayout, type AssetKind, type ImagePlacement } from './imageLayout';
import {
  assertBuildId,
  assertSupportedProject,
  isPathInside,
  isSupportedBoardId,
  normalizeComPort,
  normalizeProbeSerial,
  resolveBuildDirectory,
  resolveProjectBoardId,
  SUPPORTED_BOARD_IDS,
} from './validation';
import {
  closeBuildLog,
  openBuildLog,
  pushBuildLog,
} from './buildLog';
import { getBoardDefinition } from '../../src/types/hmi';
import type { BoardId } from '../../src/types/hmi';

const DEFAULT_TOOLCHAIN_ROOT = 'C:\\ST\\STM32CubeCLT_1.22.0';
const BUILD_METADATA_FILE = 'build-metadata.json';
const FLASH_ARTIFACT_NAME = 'firmware.hex';
/**
 * Image resources, linked into the board's external NOR and written through its
 * loader. Absent or empty when the project uses no images, which is normal, and
 * always absent for a board whose definition carries no `externalFlash`.
 */
const EXTERNAL_FLASH_ARTIFACT_NAME = 'firmware_extflash.bin';
const ARTIFACT_NAMES = [
  'firmware.hex',
  'firmware.elf',
  'firmware.bin',
  'firmware.map',
] as const;
const DOWNLOADABLE_ARTIFACT_NAMES = [
  'firmware.hex',
  'firmware.elf',
  'firmware.bin',
] as const;

export type BuildStatus = 'building' | 'succeeded' | 'failed';

interface BuildMetadata {
  buildId: string;
  boardId: string;
  createdAt: string;
  updatedAt: string;
  status: BuildStatus;
  error?: string;
}

export interface HmiPaths {
  repoRoot: string;
  buildRoot: string;
  /** Root of every board's firmware template; a board's own root is a child. */
  firmwareRoot: string;
  toolchainRoot: string;
  programmerCli: string;
  gcc: string;
  cmake: string;
  ninja: string;
  powerShell: string;
}

export interface HmiArtifact {
  name: string;
  size: number;
  downloadUrl?: string;
}

export interface HmiBuildResult {
  success: boolean;
  buildId: string;
  artifacts?: HmiArtifact[];
  log: string[];
  error?: string;
}

export interface HmiImageLayoutEntry extends ImagePlacement {
  /** The name shown in the editor, not the C identifier. */
  name: string;
}

export interface HmiImageLayoutResult {
  success: boolean;
  buildId: string;
  boardId: string;
  externalFlashBase: string;
  externalImageBytes: number;
  images: HmiImageLayoutEntry[];
}

export interface HmiBuildStatusResult {
  success: boolean;
  buildId: string;
  boardId: string;
  status: BuildStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
  artifacts?: HmiArtifact[];
}

export interface HmiFlashResult {
  success: boolean;
  buildId: string;
  probeSerial?: string;
  log: string[];
  error?: string;
}

function envAbsolutePath(
  value: string | undefined,
  fallback: string,
): string {
  return resolve(value?.trim() || fallback);
}

export function resolveHmiPaths(
  repoRoot: string,
  environment: NodeJS.ProcessEnv = process.env,
): HmiPaths {
  const resolvedRepoRoot = resolve(repoRoot);
  const toolchainRoot = envAbsolutePath(
    environment.STM32_CUBE_CLT_ROOT,
    DEFAULT_TOOLCHAIN_ROOT,
  );
  const systemRoot = environment.SystemRoot || 'C:\\Windows';

  return {
    repoRoot: resolvedRepoRoot,
    buildRoot: join(resolvedRepoRoot, '.hmi-builds'),
    firmwareRoot: join(resolvedRepoRoot, 'firmware'),
    toolchainRoot,
    programmerCli: envAbsolutePath(
      environment.STM32_PROGRAMMER_CLI,
      join(
        toolchainRoot,
        'STM32CubeProgrammer',
        'bin',
        'STM32_Programmer_CLI.exe',
      ),
    ),
    gcc: join(
      toolchainRoot,
      'GNU-tools-for-STM32',
      'bin',
      'arm-none-eabi-gcc.exe',
    ),
    cmake: join(toolchainRoot, 'CMake', 'bin', 'cmake.exe'),
    ninja: join(toolchainRoot, 'Ninja', 'bin', 'ninja.exe'),
    powerShell: envAbsolutePath(
      environment.HMI_POWERSHELL_EXE,
      join(
        systemRoot,
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
    ),
  };
}

function commandLog(result: CommandResult): string[] {
  const output: string[] = [];
  if (result.stdout.trim()) {
    output.push(result.stdout.trim());
  }
  if (result.stderr.trim()) {
    output.push(result.stderr.trim());
  }
  return output;
}

async function writeBuildMetadata(
  buildDirectory: string,
  metadata: BuildMetadata,
): Promise<void> {
  await writeFile(
    join(buildDirectory, BUILD_METADATA_FILE),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf-8',
  );
}

async function readBuildMetadata(
  buildDirectory: string,
): Promise<BuildMetadata> {
  const content = await readFile(
    join(buildDirectory, BUILD_METADATA_FILE),
    'utf-8',
  );
  const metadata = JSON.parse(content) as BuildMetadata;
  if (
    metadata.buildId !== buildDirectory.split(/[\\/]/).at(-1) ||
    !isSupportedBoardId(metadata.boardId)
  ) {
    throw new Error('Build metadata does not match the requested build');
  }
  return metadata;
}

async function collectArtifacts(
  buildDirectory: string,
  buildId: string,
): Promise<HmiArtifact[]> {
  const artifacts: HmiArtifact[] = [];
  for (const name of ARTIFACT_NAMES) {
    const artifactPath = join(buildDirectory, name);
    if (!existsSync(artifactPath)) {
      continue;
    }
    const artifactStat = await stat(artifactPath);
    if (artifactStat.isFile()) {
      const downloadable = (
        DOWNLOADABLE_ARTIFACT_NAMES as readonly string[]
      ).includes(name);
      artifacts.push({
        name,
        size: artifactStat.size,
        ...(downloadable
          ? {
              downloadUrl:
                `/api/hmi/builds/${buildId}/artifacts/${name}`,
            }
          : {}),
      });
    }
  }
  return artifacts;
}

/**
 * Whether an attached probe is the board a build was produced for. Guards
 * against flashing an image built for one board onto another.
 *
 * A board whose definition has no `probeBoardPattern` is programmed through a
 * standalone probe that reports nothing about its target, so there is nothing
 * to check here; `verifyTargetDeviceId` covers that case instead.
 */
function probeMatchesBoard(probe: StLinkProbe, boardId: BoardId): boolean {
  const pattern = getBoardDefinition(boardId).probeBoardPattern;
  if (pattern === null) {
    return true;
  }
  if (!probe.boardName) {
    return false;
  }
  return new RegExp(pattern, 'i').test(probe.boardName);
}

export class HmiService {
  readonly paths: HmiPaths;

  constructor(
    repoRoot: string,
    environment: NodeJS.ProcessEnv = process.env,
  ) {
    this.paths = resolveHmiPaths(repoRoot, environment);
  }

  /** Root of a board's firmware template. */
  private boardRoot(boardId: BoardId): string {
    return join(this.paths.firmwareRoot, boardId);
  }

  /** Build entry point for a board. Every template exposes the same interface. */
  private buildScript(boardId: BoardId): string {
    return join(this.boardRoot(boardId), 'scripts', 'build.ps1');
  }

  private hasFirmwareTemplate(boardId: BoardId): boolean {
    return existsSync(this.boardRoot(boardId))
      && existsSync(this.buildScript(boardId));
  }

  getCapabilities(): Record<string, unknown> {
    const tools = {
      gcc: {
        path: this.paths.gcc,
        available: existsSync(this.paths.gcc),
      },
      cmake: {
        path: this.paths.cmake,
        available: existsSync(this.paths.cmake),
      },
      ninja: {
        path: this.paths.ninja,
        available: existsSync(this.paths.ninja),
      },
      programmer: {
        path: this.paths.programmerCli,
        available: existsSync(this.paths.programmerCli),
      },
      powerShell: {
        path: this.paths.powerShell,
        available: existsSync(this.paths.powerShell),
      },
    };
    const firmwareTemplates = SUPPORTED_BOARD_IDS.map((boardId) => ({
      boardId,
      buildScript: this.buildScript(boardId),
      available: this.hasFirmwareTemplate(boardId),
    }));
    const toolchainReady =
      tools.gcc.available &&
      tools.cmake.available &&
      tools.ninja.available &&
      tools.powerShell.available;

    return {
      success: true,
      localBridge: true,
      supportedBoards: firmwareTemplates
        .filter((template) => template.available)
        .map((template) => template.boardId),
      buildRoot: this.paths.buildRoot,
      firmwareTemplates,
      toolchain: {
        root: this.paths.toolchainRoot,
        tools,
      },
      canBuild:
        toolchainReady &&
        firmwareTemplates.some((template) => template.available),
      canFlash: tools.programmer.available,
    };
  }

  async listPorts(): Promise<HmiSerialPort[]> {
    if (!existsSync(this.paths.programmerCli)) {
      throw new Error(
        `STM32_Programmer_CLI.exe not found at ${this.paths.programmerCli}`,
      );
    }
    const result = await runExecutable(
      this.paths.programmerCli,
      ['-l', 'uart'],
      { timeoutMs: 15_000 },
    );
    if (result.exitCode !== 0) {
      throw new Error(
        commandLog(result).join('\n') ||
          `STM32 programmer exited with code ${result.exitCode}`,
      );
    }
    return parseProgrammerUartList(
      [result.stdout, result.stderr].filter(Boolean).join('\n'),
    );
  }

  async listStLinks(): Promise<StLinkProbe[]> {
    if (!existsSync(this.paths.programmerCli)) {
      throw new Error(
        `STM32_Programmer_CLI.exe not found at ${this.paths.programmerCli}`,
      );
    }
    const result = await runExecutable(
      this.paths.programmerCli,
      ['-l', 'st-link-only'],
      { timeoutMs: 15_000 },
    );
    if (result.exitCode !== 0) {
      throw new Error(
        commandLog(result).join('\n') ||
          `STM32 programmer exited with code ${result.exitCode}`,
      );
    }
    return parseProgrammerStLinkList(
      [result.stdout, result.stderr].filter(Boolean).join('\n'),
    );
  }

  async testPort(port: unknown): Promise<{
    success: boolean;
    port: string;
    device?: HmiSerialPort;
    error?: string;
  }> {
    const normalizedPort = normalizeComPort(port);
    const ports = await this.listPorts();
    const device = ports.find(
      (candidate) => candidate.path.toUpperCase() === normalizedPort,
    );
    if (!device) {
      return {
        success: false,
        port: normalizedPort,
        error: `${normalizedPort} is not present in the STM32 programmer UART list`,
      };
    }
    return { success: true, port: normalizedPort, device };
  }

  /**
   * `runId` opts the build into live output: every line it would have returned
   * at the end is also pushed to that channel as it happens, for the SSE
   * endpoint to relay. Omit it and the behaviour is exactly as before.
   */
  async buildProject(
    project: unknown,
    runId?: string,
  ): Promise<HmiBuildResult> {
    assertSupportedProject(project);
    const buildId = randomUUID();
    const buildDirectory = resolveBuildDirectory(
      this.paths.buildRoot,
      buildId,
    );
    const projectSourceDirectory = join(
      buildDirectory,
      'project-source',
    );
    const boardId = resolveProjectBoardId(project);
    const boardRoot = this.boardRoot(boardId);
    const buildScript = this.buildScript(boardId);
    const createdAt = new Date().toISOString();
    const log: string[] = [];
    // One sink for both destinations, so a streaming client and a batched one
    // see the same sequence and neither can drift from the other.
    const emit = (...lines: string[]) => {
      for (const line of lines) {
        log.push(line);
        if (runId) pushBuildLog(runId, line);
      }
    };
    if (runId) openBuildLog(runId);
    const metadata: BuildMetadata = {
      buildId,
      boardId,
      createdAt,
      updatedAt: createdAt,
      status: 'building',
    };

    await mkdir(buildDirectory, { recursive: true });
    await writeBuildMetadata(buildDirectory, metadata);
    await writeFile(
      join(buildDirectory, 'project.json'),
      `${JSON.stringify(project, null, 2)}\n`,
      'utf-8',
    );

    try {
      if (!existsSync(buildScript)) {
        throw new Error(
          `Firmware template for ${boardId} is not installed: ${buildScript}`,
        );
      }
      if (!existsSync(this.paths.powerShell)) {
        throw new Error(
          `PowerShell executable not found: ${this.paths.powerShell}`,
        );
      }

      const generatedFiles = await writeGeneratedProjectSource(
        project,
        projectSourceDirectory,
      );
      emit(`Generated project source: ${generatedFiles.join(', ')}`);

      const buildResult = await runExecutable(
        this.paths.powerShell,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          buildScript,
          '-ProjectSource',
          projectSourceDirectory,
          '-OutputDir',
          buildDirectory,
          '-ToolchainRoot',
          this.paths.toolchainRoot,
        ],
        {
          cwd: boardRoot,
          env: {
            ...process.env,
            STM32_CUBE_CLT_ROOT: this.paths.toolchainRoot,
            HMI_PROJECT_SOURCE: projectSourceDirectory,
            HMI_BUILD_DIR: buildDirectory,
          },
          // The first build for a board downloads ~150 MB of pinned upstream
          // dependencies before a single file compiles, and that is where the
          // old 10 minute budget went. Later builds hit the cache and finish in
          // well under a minute.
          timeoutMs: 30 * 60_000,
          // Streaming replaces the end-of-run commandLog() below rather than
          // adding to it, so the two never both report the same output.
          onLine: runId ? (line) => emit(line) : undefined,
        },
      );
      if (!runId) emit(...commandLog(buildResult));
      if (buildResult.exitCode !== 0) {
        throw new Error(
          `Firmware build exited with code ${buildResult.exitCode}`,
        );
      }

      const flashArtifactPath = join(
        buildDirectory,
        FLASH_ARTIFACT_NAME,
      );
      if (!existsSync(flashArtifactPath)) {
        throw new Error(
          `Firmware build completed without ${FLASH_ARTIFACT_NAME}`,
        );
      }
      const flashArtifactStat = await stat(flashArtifactPath);
      if (!flashArtifactStat.isFile() || flashArtifactStat.size === 0) {
        throw new Error(`${FLASH_ARTIFACT_NAME} is empty or invalid`);
      }

      const artifacts = await collectArtifacts(buildDirectory, buildId);
      await writeBuildMetadata(buildDirectory, {
        ...metadata,
        status: 'succeeded',
        updatedAt: new Date().toISOString(),
      });
      return {
        success: true,
        buildId,
        artifacts,
        log,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      emit(message);
      await writeBuildMetadata(buildDirectory, {
        ...metadata,
        status: 'failed',
        updatedAt: new Date().toISOString(),
        error: message,
      });
      return {
        success: false,
        buildId,
        log,
        error: message,
      };
    } finally {
      // Tells every watcher the build is over, whichever way it ended, so an
      // SSE connection closes instead of hanging on a finished build.
      if (runId) closeBuildLog(runId);
    }
  }

  /**
   * Metadata for one build, as recorded by `buildProject`.
   *
   * The poll path for long builds: `buildProject` runs the compile and writes
   * the outcome whether or not the response socket survives it, so a client
   * that will not hold a connection open for the whole build can POST, let the
   * connection go, and follow the status here until it leaves 'building'.
   */
  async getBuildStatus(buildIdValue: unknown): Promise<HmiBuildStatusResult> {
    assertBuildId(buildIdValue);
    const buildDirectory = resolveBuildDirectory(
      this.paths.buildRoot,
      buildIdValue,
    );
    const metadata = await readBuildMetadata(buildDirectory);
    return {
      success: true,
      buildId: metadata.buildId,
      boardId: metadata.boardId,
      status: metadata.status,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      ...(metadata.error === undefined ? {} : { error: metadata.error }),
      ...(metadata.status === 'succeeded'
        ? {
            artifacts: await collectArtifacts(
              buildDirectory,
              metadata.buildId,
            ),
          }
        : {}),
    };
  }

  /**
   * Where each image ended up in the flashed image, read from the linker map
   * the build produced. Reported rather than predicted: alignment, link order
   * and --gc-sections all move things.
   */
  async getImageLayout(buildIdValue: unknown): Promise<HmiImageLayoutResult> {
    assertBuildId(buildIdValue);
    const buildDirectory = resolveBuildDirectory(
      this.paths.buildRoot,
      buildIdValue,
    );
    const metadata = await readBuildMetadata(buildDirectory);
    const mapPath = join(buildDirectory, 'firmware.map');
    if (!existsSync(mapPath)) {
      throw new Error('This build produced no linker map.');
    }

    // project.json is written next to the generated sources and carries the
    // resource list the build was made from, which is what names the arrays.
    const sourceDirectory = join(buildDirectory, 'project-source');
    const projectPath = join(sourceDirectory, 'project.json');
    const wanted = new Map<string, AssetKind>();
    const displayNames = new Map<string, string>();
    const glyphCounts = new Map<string, number>();
    if (existsSync(projectPath)) {
      const parsed = JSON.parse(await readFile(projectPath, 'utf-8')) as {
        resources?: {
          images?: { cArrayName?: string; name?: string }[];
          fonts?: { cFontName?: string; name?: string }[];
        };
      };
      for (const image of parsed.resources?.images ?? []) {
        if (typeof image.cArrayName === 'string') {
          wanted.set(image.cArrayName, 'image');
          displayNames.set(image.cArrayName, image.name ?? image.cArrayName);
        }
      }

      // A font becomes one generated file per size, named `<cFontName>_<size>`,
      // and which sizes were converted is decided during the build rather than
      // recorded in the project. Reading the directory back is the only answer
      // that cannot disagree with what was compiled.
      const fonts = (parsed.resources?.fonts ?? []).filter(
        (font): font is { cFontName: string; name?: string } => typeof font.cFontName === 'string',
      );
      if (fonts.length > 0 && existsSync(sourceDirectory)) {
        for (const file of await readdir(sourceDirectory)) {
          // `ui_font_noto_sans_tc_14.c` splits at the last underscore. Matched
          // by string rather than a built regex: a cFontName reaches this from
          // a project file, and regex metacharacters in one would either throw
          // or match the wrong file
          const stem = /^(.+)\.c$/.exec(file)?.[1];
          const split = stem ? /^(.+)_(\d+)$/.exec(stem) : null;
          if (!stem || !split) continue;
          const font = fonts.find((candidate) => candidate.cFontName === split[1]);
          if (!font) continue;
          wanted.set(stem, 'font');
          displayNames.set(stem, `${font.name ?? font.cFontName} ${split[2]}px`);
          // From the file that was compiled, so the count cannot disagree with
          // the bytes the map reports beside it
          const glyphs = countFontGlyphs(await readFile(join(sourceDirectory, file), 'utf-8'));
          if (glyphs !== undefined) glyphCounts.set(stem, glyphs);
        }
      }
    }

    const placements = parseImageLayout(await readFile(mapPath, 'utf-8'), wanted);
    const externalImagePath = join(buildDirectory, EXTERNAL_FLASH_ARTIFACT_NAME);
    const board = getBoardDefinition(metadata.boardId as BoardId);
    return {
      success: true,
      buildId: String(buildIdValue),
      boardId: metadata.boardId,
      externalFlashBase: board.externalFlash?.baseAddress ?? '',
      externalImageBytes: existsSync(externalImagePath)
        ? (await stat(externalImagePath)).size
        : 0,
      images: placements.map((placement) => ({
        ...placement,
        name: displayNames.get(placement.cArrayName) ?? placement.cArrayName,
        ...(glyphCounts.has(placement.cArrayName)
          ? { glyphCount: glyphCounts.get(placement.cArrayName) }
          : {}),
      })),
    };
  }

  /**
   * Connects without writing anything and checks that the part on the other end
   * of the probe is the one the build was compiled for.
   *
   * This is the identity check for a board flashed through a *standalone*
   * ST-LINK, which reports no board name — see `probeMatchesBoard`. It cannot
   * tell two boards built on the same MCU apart, and does not pretend to; what
   * it stops is an image reaching a different STM32 family, where a wrong flash
   * size or a wrong external loader does lasting damage.
   *
   * Returns the log lines to carry into the flash result.
   */
  private async verifyTargetDeviceId(
    probe: StLinkProbe,
    boardId: BoardId,
  ): Promise<string[]> {
    const board = getBoardDefinition(boardId);
    const result = await runExecutable(
      this.paths.programmerCli,
      ['-c', 'port=SWD', `sn=${probe.serialNumber}`, 'mode=UR', 'reset=HWrst'],
      { timeoutMs: 60_000 },
    );
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    if (result.exitCode !== 0) {
      throw new Error(
        `Could not connect to the target through ST-LINK ${probe.serialNumber}:\n`
        + (commandLog(result).join('\n')
          || `STM32 programmer exited with code ${result.exitCode}`),
      );
    }

    const deviceId = parseProgrammerDeviceId(output);
    if (deviceId === null) {
      throw new Error(
        'Connected to the target, but the STM32 programmer did not report a '
        + 'device ID, so the board could not be identified before writing.',
      );
    }
    if (deviceId !== board.deviceId.toLowerCase()) {
      throw new Error(
        `This build targets ${board.name} (device ID ${board.deviceId}), but `
        + `the connected part reports ${deviceId}. Connect a ${board.name}, or `
        + `rebuild the project for the board you have.`,
      );
    }
    return [`Target device ID ${deviceId} matches ${board.name}.`];
  }

  async flashBuild(
    buildIdValue: unknown,
    probeSerialValue?: unknown,
  ): Promise<HmiFlashResult> {
    assertBuildId(buildIdValue);
    const probeSerial = normalizeProbeSerial(probeSerialValue);
    const buildDirectory = resolveBuildDirectory(
      this.paths.buildRoot,
      buildIdValue,
    );
    const log: string[] = [];

    try {
      const metadata = await readBuildMetadata(buildDirectory);
      if (metadata.status !== 'succeeded') {
        throw new Error(
          `Build ${buildIdValue} is not flashable (${metadata.status})`,
        );
      }

      const artifactPath = join(
        buildDirectory,
        FLASH_ARTIFACT_NAME,
      );
      const resolvedBuildRoot = await realpath(this.paths.buildRoot);
      const resolvedArtifactPath = await realpath(artifactPath);
      if (
        !isPathInside(resolvedBuildRoot, resolvedArtifactPath) ||
        resolvedArtifactPath.toLowerCase() !==
          artifactPath.toLowerCase()
      ) {
        throw new Error('Firmware artifact is outside the build directory');
      }
      const artifactStat = await stat(resolvedArtifactPath);
      if (!artifactStat.isFile() || artifactStat.size === 0) {
        throw new Error('Firmware artifact is empty or invalid');
      }

      const probes = await this.listStLinks();
      const selectedProbe = probeSerial
        ? probes.find(
            (probe) => probe.serialNumber === probeSerial,
          )
        : probes.length === 1
          ? probes[0]
          : undefined;
      if (!selectedProbe) {
        throw new Error(
          probeSerial
            ? `ST-LINK probe ${probeSerial} was not found`
            : `Expected exactly one ST-LINK probe, found ${probes.length}`,
        );
      }
      const targetBoardId = metadata.boardId as BoardId;
      const target = getBoardDefinition(targetBoardId);
      if (!probeMatchesBoard(selectedProbe, targetBoardId)) {
        throw new Error(
          `This build targets ${target.name}, but the attached ST-LINK reports `
          + `"${selectedProbe.boardName ?? 'an unknown board'}". `
          + `Connect a ${target.name}, or rebuild the project for the board you have.`,
        );
      }
      if (target.probeBoardPattern === null) {
        log.push(
          ...(await this.verifyTargetDeviceId(selectedProbe, targetBoardId)),
        );
      }

      // Images first: the internal image is programmed last so that a reset
      // into a running application never happens with stale image data behind
      // it. The loader is only needed for this step.
      const externalImagePath = join(buildDirectory, EXTERNAL_FLASH_ARTIFACT_NAME);
      const externalImageBytes = existsSync(externalImagePath)
        ? (await stat(externalImagePath)).size
        : 0;
      if (externalImageBytes > 0) {
        if (!target.externalFlash) {
          throw new Error(
            `This build produced an external flash image, but ${target.name} `
            + `has no external flash configured.`,
          );
        }
        const loaderName = target.externalFlash.loaderName;
        const loaderPath = join(
          dirname(this.paths.programmerCli),
          'ExternalLoader',
          loaderName,
        );
        if (!existsSync(loaderPath)) {
          throw new Error(
            `This project stores images in external flash, but the loader `
            + `${loaderName} was not found at ${loaderPath}.`,
          );
        }
        const externalResult = await runExecutable(
          this.paths.programmerCli,
          [
            '-c',
            'port=SWD',
            `sn=${selectedProbe.serialNumber}`,
            'mode=UR',
            'reset=HWrst',
            '-el',
            loaderPath,
            '-d',
            externalImagePath,
            target.externalFlash.baseAddress,
            '-v',
          ],
          { timeoutMs: 5 * 60_000 },
        );
        log.push(...commandLog(externalResult));
        if (externalResult.exitCode !== 0) {
          throw new Error(
            `Programming external flash exited with code ${externalResult.exitCode}`,
          );
        }
        log.push(`Wrote ${externalImageBytes} bytes of images to external flash.`);
      }

      const flashResult = await runExecutable(
        this.paths.programmerCli,
        [
          '-c',
          'port=SWD',
          `sn=${selectedProbe.serialNumber}`,
          'mode=UR',
          'reset=HWrst',
          '-d',
          resolvedArtifactPath,
          '-v',
          '-rst',
        ],
        { timeoutMs: 3 * 60_000 },
      );
      log.push(...commandLog(flashResult));
      if (flashResult.exitCode !== 0) {
        throw new Error(
          `STM32 programmer exited with code ${flashResult.exitCode}`,
        );
      }

      return {
        success: true,
        buildId: buildIdValue,
        probeSerial: selectedProbe.serialNumber,
        log,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      log.push(message);
      return {
        success: false,
        buildId: buildIdValue,
        ...(probeSerial ? { probeSerial } : {}),
        log,
        error: message,
      };
    }
  }

  async resolveArtifactDownload(
    buildIdValue: unknown,
    artifactNameValue: unknown,
  ): Promise<{
    path: string;
    name: string;
    size: number;
    contentType: string;
  }> {
    assertBuildId(buildIdValue);
    if (
      typeof artifactNameValue !== 'string' ||
      !(
        DOWNLOADABLE_ARTIFACT_NAMES as readonly string[]
      ).includes(artifactNameValue)
    ) {
      throw new Error('Invalid artifact name');
    }

    const buildDirectory = resolveBuildDirectory(
      this.paths.buildRoot,
      buildIdValue,
    );
    const metadata = await readBuildMetadata(buildDirectory);
    if (metadata.status !== 'succeeded') {
      throw new Error(
        `Build ${buildIdValue} is not downloadable (${metadata.status})`,
      );
    }

    const resolvedBuildDirectory = await realpath(buildDirectory);
    const artifactPath = join(buildDirectory, artifactNameValue);
    const resolvedArtifactPath = await realpath(artifactPath);
    if (
      !isPathInside(resolvedBuildDirectory, resolvedArtifactPath) ||
      resolvedArtifactPath.toLowerCase() !==
        artifactPath.toLowerCase()
    ) {
      throw new Error('Artifact is outside the requested build');
    }
    const artifactStat = await stat(resolvedArtifactPath);
    if (!artifactStat.isFile() || artifactStat.size === 0) {
      throw new Error('Artifact is empty or invalid');
    }

    const contentType = artifactNameValue.endsWith('.hex')
      ? 'text/plain; charset=utf-8'
      : 'application/octet-stream';
    return {
      path: resolvedArtifactPath,
      name: artifactNameValue,
      size: artifactStat.size,
      contentType,
    };
  }
}
