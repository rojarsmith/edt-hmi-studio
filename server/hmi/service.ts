import process from 'node:process';
import { existsSync } from 'node:fs';
import {
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runExecutable, type CommandResult } from './command';
import {
  parseProgrammerStLinkList,
  parseProgrammerUartList,
  type HmiSerialPort,
  type StLinkProbe,
} from './programmerParser';
import { writeGeneratedProjectSource } from './projectSource';
import {
  assertBuildId,
  assertSupportedProject,
  getProjectBoardId,
  isPathInside,
  normalizeComPort,
  normalizeProbeSerial,
  resolveBuildDirectory,
  SUPPORTED_BOARD_ID,
} from './validation';

const DEFAULT_TOOLCHAIN_ROOT = 'C:\\ST\\STM32CubeCLT_1.22.0';
const BUILD_METADATA_FILE = 'build-metadata.json';
const FLASH_ARTIFACT_NAME = 'firmware.hex';
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

type BuildStatus = 'building' | 'succeeded' | 'failed';

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
  boardRoot: string;
  buildScript: string;
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
    boardRoot: join(
      resolvedRepoRoot,
      'firmware',
      SUPPORTED_BOARD_ID,
    ),
    buildScript: join(
      resolvedRepoRoot,
      'firmware',
      SUPPORTED_BOARD_ID,
      'scripts',
      'build.ps1',
    ),
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
    metadata.boardId !== SUPPORTED_BOARD_ID
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

function isExpectedDiscoveryBoard(probe: StLinkProbe): boolean {
  if (!probe.boardName) {
    return false;
  }
  return /(?:32)?F746GDISCOVERY/i.test(probe.boardName);
}

export class HmiService {
  readonly paths: HmiPaths;

  constructor(
    repoRoot: string,
    environment: NodeJS.ProcessEnv = process.env,
  ) {
    this.paths = resolveHmiPaths(repoRoot, environment);
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
    const firmwareTemplateAvailable =
      existsSync(this.paths.boardRoot) &&
      existsSync(this.paths.buildScript);

    return {
      success: true,
      localBridge: true,
      supportedBoards: [SUPPORTED_BOARD_ID],
      buildRoot: this.paths.buildRoot,
      firmwareTemplate: {
        boardId: SUPPORTED_BOARD_ID,
        buildScript: this.paths.buildScript,
        available: firmwareTemplateAvailable,
      },
      toolchain: {
        root: this.paths.toolchainRoot,
        tools,
      },
      canBuild:
        firmwareTemplateAvailable &&
        tools.gcc.available &&
        tools.cmake.available &&
        tools.ninja.available &&
        tools.powerShell.available,
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

  async buildProject(project: unknown): Promise<HmiBuildResult> {
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
    const createdAt = new Date().toISOString();
    const log: string[] = [];
    const metadata: BuildMetadata = {
      buildId,
      boardId: getProjectBoardId(project) ?? '',
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
      if (!existsSync(this.paths.buildScript)) {
        throw new Error(
          `Firmware template is not installed: ${this.paths.buildScript}`,
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
      log.push(
        `Generated project source: ${generatedFiles.join(', ')}`,
      );

      const buildResult = await runExecutable(
        this.paths.powerShell,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          this.paths.buildScript,
          '-ProjectSource',
          projectSourceDirectory,
          '-OutputDir',
          buildDirectory,
          '-ToolchainRoot',
          this.paths.toolchainRoot,
        ],
        {
          cwd: this.paths.boardRoot,
          env: {
            ...process.env,
            STM32_CUBE_CLT_ROOT: this.paths.toolchainRoot,
            HMI_PROJECT_SOURCE: projectSourceDirectory,
            HMI_BUILD_DIR: buildDirectory,
          },
          timeoutMs: 10 * 60_000,
        },
      );
      log.push(...commandLog(buildResult));
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
      log.push(message);
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
    }
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
      if (!isExpectedDiscoveryBoard(selectedProbe)) {
        throw new Error(
          `Selected ST-LINK is not attached to a 32F746GDISCOVERY board`,
        );
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
