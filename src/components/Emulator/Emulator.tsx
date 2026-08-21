import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useLogicEditorStore } from '../LogicEditor';
import { useResourceStore } from '../../resources';
import { useAppStore } from '../../store/appStore';
import { useProjectStore } from '../../store/projectStore';
import { useEmulatorStore } from '../../store/emulatorStore';
import { useDockStore } from '../../store/dockStore';
import { useWorkStore } from '../../store/workStore';
import {
  EMULATOR_OUTCOMES,
  EMULATOR_PHASES,
  EMULATOR_WORDS,
  emulatorPhaseFor,
} from '../../store/emulatorPhases';
import { useProjectModbusTags } from '../../hooks/useProjectModbusTags';
import { generateCode } from '../../codegen';
import {
  buildAndRun,
  fetchToolchain,
  type EmulatorStatus,
  type EmulatorRuntime,
  type FontCompileRequest,
  type ToolchainReport,
} from './emulatorService';
import { collectGlyphs } from '../../codegen/collectGlyphs';
import { collectUsedCustomFonts } from '../../codegen/fontUsage';
import { buildFontCompileRequests } from '../../codegen/fontRequests';
import type { LvglComponent } from '../../types';
import { loadImageFromBase64, generateImageCCode, DEFAULT_IMAGE_OPTIONS } from '../../resources/converters/imageConverter';
import './Emulator.css';


/** Map JS keyboard event.key to LVGL key codes */
const LV_KEY_MAP: Record<string, number> = {
  Enter:      10,   // LV_KEY_ENTER
  Escape:     27,   // LV_KEY_ESC
  Backspace:  8,    // LV_KEY_BACKSPACE
  Delete:     127,  // LV_KEY_DEL
  ArrowRight: 19,   // LV_KEY_RIGHT
  ArrowLeft:  20,   // LV_KEY_LEFT
  ArrowUp:    17,   // LV_KEY_UP
  ArrowDown:  18,   // LV_KEY_DOWN
  Tab:        9,    // LV_KEY_NEXT
  Home:       2,    // LV_KEY_HOME
  End:        3,    // LV_KEY_END
};

const Emulator: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<EmulatorRuntime | null>(null);
  const rafIdRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const mousePressedRef = useRef(false);
  /** Read inside handleStart without making the callback depend on it. */
  const firstBuildRef = useRef(false);

  const [status, setStatus] = useState<EmulatorStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [running, setRunning] = useState(false);
  const [toolchain, setToolchain] = useState<ToolchainReport | null>(null);
  const [checking, setChecking] = useState(false);

  const screens = useEditorStore((s) => s.screens);
  const animations = useEditorStore((s) => s.animations);
  const canvas = useEditorStore((s) => s.canvas);
  const logicGraphs = useLogicEditorStore((s) => s.graphs);
  const typographies = useEditorStore((s) => s.typographies);
  const projectLanguages = useEditorStore((s) => s.languages);
  const projectTexts = useEditorStore((s) => s.texts);
  const { images: imageResources, fonts: fontResources } = useResourceStore();
  const modbusTags = useProjectModbusTags();
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  // The build log goes to the bottom dock beside the firmware one, so the
  // output and the running screen are on screen at the same time rather than
  // one covering the other. See docs/bottom-dock-panel.md §10.
  const setOutput = useEmulatorStore((s) => s.setOutput);
  const appendOutput = useEmulatorStore((s) => s.appendOutput);
  const clearOutput = useEmulatorStore((s) => s.clearOutput);
  const showDockPane = useDockStore((s) => s.showPane);
  const factoryDevMode = useAppStore((s) => s.factoryDevMode);
  const getProjectConfig = useProjectStore((s) => s.getProjectConfig);

  const [projectDefaultFont, setProjectDefaultFont] = useState<string | undefined>();
  const [projectDefaultFontSize, setProjectDefaultFontSize] = useState<number | undefined>();
  const [projectUseBuiltinSymbols, setProjectUseBuiltinSymbols] = useState<boolean>(true);
  const [projectSymbolFont, setProjectSymbolFont] = useState<string | undefined>();

  // Load project default font
  useEffect(() => {
    if (!currentProjectId) return;
    getProjectConfig(currentProjectId).then(cfg => {
      if (cfg) {
        setProjectDefaultFont(cfg.lvglConfig.defaultFont);
        setProjectDefaultFontSize(cfg.lvglConfig.defaultFontSize);
        setProjectUseBuiltinSymbols(cfg.lvglConfig.useBuiltinSymbols !== false);
        setProjectSymbolFont(cfg.lvglConfig.symbolFont);
      }
    });
  }, [currentProjectId, getProjectConfig]);

  // Ask the dev server what it can build with, before anything is generated.
  // A machine without a toolchain should learn that from this panel, not from a
  // build log — see docs/emulator.md §4.3.
  const checkToolchain = useCallback(async (refresh: boolean) => {
    setChecking(true);
    const report = await fetchToolchain(refresh);
    setToolchain(report);
    setChecking(false);
    return report;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchToolchain(false).then((report) => {
      if (!cancelled) setToolchain(report);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirrored into a ref so handleStart can read it without listing it as a
  // dependency, which would rebuild the callback on every preflight.
  useEffect(() => {
    firstBuildRef.current = toolchain?.ready === true && !toolchain.libraryReady;
  }, [toolchain]);

  // Generate C code from current editor state
  const generateCCode = useCallback(() => {
    return generateCode(screens, {}, logicGraphs, undefined, imageResources, fontResources, projectDefaultFont, projectDefaultFontSize, projectUseBuiltinSymbols, projectSymbolFont, typographies, projectTexts, projectLanguages, modbusTags, animations);
  }, [screens, animations, logicGraphs, typographies, projectTexts, projectLanguages, imageResources, fontResources, projectDefaultFont, projectDefaultFontSize, projectUseBuiltinSymbols, projectSymbolFont, modbusTags]);

  // Render framebuffer to canvas
  const renderFramebuffer = useCallback((fbData: Uint8Array, width: number, height: number) => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    cvs.width = width;
    cvs.height = height;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(width, height);
    const pixels = imageData.data;

    // Convert ARGB8888 (LVGL, little-endian: B G R A) to RGBA (Canvas)
    for (let i = 0; i < width * height; i++) {
      const off = i * 4;
      pixels[off]     = fbData[off + 2]; // R
      pixels[off + 1] = fbData[off + 1]; // G
      pixels[off + 2] = fbData[off];     // B
      pixels[off + 3] = fbData[off + 3] || 255; // A
    }

    ctx.putImageData(imageData, 0, 0);
  }, []);

  // Stop the event loop and destroy runtime
  const stopRuntime = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }
    if (runtimeRef.current) {
      runtimeRef.current.destroy();
      runtimeRef.current = null;
    }
    setRunning(false);
  }, []);

  // Start the requestAnimationFrame event loop
  const startEventLoop = useCallback((runtime: EmulatorRuntime) => {
    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      // Cap delta to avoid huge jumps (e.g. tab was backgrounded)
      const ms = Math.min(delta, 100);
      runtime.tick(Math.round(ms));

      const fb = runtime.getFramebuffer();
      if (fb) {
        renderFramebuffer(fb, runtime.getWidth(), runtime.getHeight());
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);
  }, [renderFramebuffer]);

  // Handle compile & run
  const handleStart = useCallback(async () => {
    if (status === 'compiling' || status === 'loading' || status === 'running') {
      return;
    }

    // Stop any previous runtime
    stopRuntime();

    clearOutput();

    // A build runs for seconds at best and minutes on a first run, which makes
    // it exactly the kind of operation the Work pane exists to list — and it
    // outlives the tab, so switching to Design mid-build still shows it.
    const work = useWorkStore.getState();
    const workId = work.start('Emulator');
    work.note(workId, { label: EMULATOR_PHASES.preparing });

    const code = generateCCode();

    const userFiles: Record<string, string> = {};
    for (const [fileName, content] of Object.entries(code)) {
      userFiles[fileName] = content;
    }

    // Generate image C array files for used image resources
    if (imageResources.length > 0) {
      const usedImageIds = new Set<string>();
      const walkImages = (components: LvglComponent[]) => {
        for (const comp of components) {
          if (comp.type === 'img' && comp.props.src) {
            const matched = imageResources.find(
              (img) => img.id === comp.props.src || img.name === comp.props.src
            );
            if (matched) usedImageIds.add(matched.id);
          }
          walkImages(comp.children);
        }
      };
      for (const screen of screens) walkImages(screen.components);

      const usedImages = imageResources.filter((img) => usedImageIds.has(img.id));
      for (const img of usedImages) {
        try {
          const { imageData } = await loadImageFromBase64(img.data);
          const convOptions = { ...DEFAULT_IMAGE_OPTIONS, format: img.format };
          const result = generateImageCCode(img.cArrayName, imageData, convOptions);
          userFiles[`${img.cArrayName}.c`] = result.cCode;
        } catch (err) {
          console.error(`Failed to generate C code for image ${img.name}:`, err);
        }
      }
    }

    // Which font+size combinations exist at all, from what the widgets select
    const usedFontSizes = collectUsedCustomFonts(screens, fontResources, projectDefaultFont, projectDefaultFontSize, typographies);
    // Which characters each of them has to be able to draw
    const glyphs = collectGlyphs({
      screens,
      fontResources,
      logicGraphs,
      texts: projectTexts,
      typographies,
      defaultFont: projectDefaultFont,
      defaultFontSize: projectDefaultFontSize,
    });
    const fontRequests: FontCompileRequest[] = buildFontCompileRequests(
      fontResources,
      usedFontSizes,
      glyphs,
      typographies,
    );

    const result = await buildAndRun(
      userFiles,
      canvas.width,
      canvas.height,
      (newStatus, message) => {
        setStatus(newStatus);
        setStatusMessage(message);
        if (newStatus === 'loading') {
          useWorkStore.getState().note(workId, { label: EMULATOR_PHASES.starting });
        }
      },
      fontRequests.length > 0 ? fontRequests : undefined,
      (line) => {
        // Only lines the server announces itself become phases; nothing raw
        // from the compiler reaches Work. See emulatorPhases.ts.
        const phase = emulatorPhaseFor(line);
        if (phase) useWorkStore.getState().note(workId, { label: phase });
        // The pane itself is the engineering view and keeps every line in both
        // modes: Work next door is where the product's words live, and this is
        // the place to look when Work's phase is not enough. The tab is
        // expected to move behind factory dev mode later, at which point the
        // question stops arising — see docs/bottom-dock-panel.md §11.
        appendOutput(line);
      },
    );

    // Nothing to write: the server streamed the transcript and then the summary
    // into the pane as they happened. setOutput is the fallback for a build
    // that produced no stream at all — a failure before the POST was answered.
    if (!useEmulatorStore.getState().output) setOutput(result.output);

    if (result.success && result.runtime) {
      runtimeRef.current = result.runtime;
      setRunning(true);
      setStatus('done');
      setStatusMessage('Running — click the canvas to interact');
      useWorkStore.getState().finish(workId, 'succeeded', EMULATOR_OUTCOMES.running);

      // Render initial frame
      const fb = result.runtime.getFramebuffer();
      if (fb) {
        renderFramebuffer(fb, result.runtime.getWidth(), result.runtime.getHeight());
      }

      // Start event loop
      startEventLoop(result.runtime);

      // Focus canvas for keyboard input
      canvasRef.current?.focus();

      // The LVGL library exists now if it did not before; re-ask so the
      // first-build warning stops claiming otherwise.
      if (firstBuildRef.current) void checkToolchain(true);
    } else if (!result.success) {
      // A failed build has something to say, so bring the pane that says it to
      // the front and open the dock if it was collapsed.
      showDockPane('output');
      setStatus('error');
      useWorkStore.getState().finish(workId, 'failed', EMULATOR_OUTCOMES.failed);
    } else {
      setStatus('done');
      setStatusMessage('Build succeeded (no runtime)');
      useWorkStore.getState().finish(workId, 'failed', EMULATOR_OUTCOMES.failed);
    }
  }, [status, generateCCode, canvas.width, canvas.height, renderFramebuffer, stopRuntime, startEventLoop, checkToolchain, setOutput, appendOutput, clearOutput, showDockPane, screens, logicGraphs, typographies, projectTexts, imageResources, fontResources, projectDefaultFont, projectDefaultFontSize]);

  // Handle stop button
  const handleStop = useCallback(() => {
    stopRuntime();
    setStatus('idle');
    setStatusMessage('Stopped');
  }, [stopRuntime]);

  // Get mouse position relative to canvas, accounting for CSS scaling
  const getCanvasPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvasRef.current;
    if (!cvs) return { x: 0, y: 0 };
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  }, []);

  // Mouse event handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const { x, y } = getCanvasPos(e);
    rt.mouseEvent(x, y, mousePressedRef.current);
  }, [getCanvasPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rt = runtimeRef.current;
    if (!rt) return;
    mousePressedRef.current = true;
    const { x, y } = getCanvasPos(e);
    rt.mouseEvent(x, y, true);
    // Focus canvas for keyboard events
    canvasRef.current?.focus();
  }, [getCanvasPos]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rt = runtimeRef.current;
    if (!rt) return;
    mousePressedRef.current = false;
    const { x, y } = getCanvasPos(e);
    rt.mouseEvent(x, y, false);
  }, [getCanvasPos]);

  const handleMouseLeave = useCallback(() => {
    // Release mouse when leaving canvas
    if (mousePressedRef.current && runtimeRef.current) {
      mousePressedRef.current = false;
    }
  }, []);

  // Keyboard event handlers
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const rt = runtimeRef.current;
    if (!rt) return;
    e.preventDefault();

    // Check for mapped control keys first
    const lvKey = LV_KEY_MAP[e.key];
    if (lvKey !== undefined) {
      rt.keyEvent(lvKey, true);
    } else if (e.key.length === 1) {
      // Single printable character — send its Unicode code point
      rt.keyEvent(e.key.charCodeAt(0), true);
    }
  }, []);

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const rt = runtimeRef.current;
    if (!rt) return;
    e.preventDefault();

    const lvKey = LV_KEY_MAP[e.key];
    if (lvKey !== undefined) {
      rt.keyEvent(lvKey, false);
    } else if (e.key.length === 1) {
      rt.keyEvent(e.key.charCodeAt(0), false);
    }
  }, []);

  // Clear canvas on mount
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    cvs.width = canvas.width;
    cvs.height = canvas.height;
    const ctx = cvs.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#666';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        factoryDevMode ? 'Press Start to run this screen on real LVGL' : EMULATOR_WORDS.pressStart,
        canvas.width / 2,
        canvas.height / 2,
      );
    }
  }, [canvas.width, canvas.height, factoryDevMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (runtimeRef.current) {
        runtimeRef.current.destroy();
      }
    };
  }, []);

  const isWorking = ['compiling', 'loading', 'running'].includes(status);

  // Outside factory dev mode the status is said in the product's words. The
  // engineering message names LVGL and the compiler, which is the right thing
  // to read when working on the editor and noise to everyone else.
  const statusText = factoryDevMode
    ? statusMessage
    : status === 'compiling'
      ? EMULATOR_WORDS.preparing
      : status === 'loading' || status === 'running'
        ? EMULATOR_WORDS.starting
        : status === 'error'
          ? EMULATOR_WORDS.failed
          : running
            ? EMULATOR_WORDS.running
            : EMULATOR_WORDS.failed;

  // Reported by the dev server, so a production build with no compile endpoint
  // (fetchToolchain returns null) is never treated as a broken machine.
  const blocked = toolchain !== null && !toolchain.ready;
  const firstBuild = toolchain?.ready === true && !toolchain.libraryReady;

  return (
    <div className="emulator">
      <div className="emulator-toolbar">
        {/* Start goes away once there is something running: the emulator is
            started, and a button offering to start it again says otherwise.
            Stop is the only move left, and Start comes back with it. While a
            build is in flight the button stays, disabled, because that is
            where the "working" state is read from. */}
        {!running && (
          <button
            className={`emulator-btn ${isWorking ? 'working' : ''}`}
            onClick={handleStart}
            disabled={isWorking || blocked}
          >
            {isWorking ? '⏳ Working…' : '▶ Start'}
          </button>
        )}

        {running && (
          <button className="emulator-stop-btn" onClick={handleStop}>
            ⏹ Stop
          </button>
        )}

        {/* Nothing to say while nothing is happening: before the first Start,
            and again after Stop, the button beside it already reports the
            state, and "Ready" or "Stopped" only repeats it. The emoji that used
            to lead this line is gone for the same reason. */}
        {status !== 'idle' && (
          <span className={`emulator-status ${status}`}>{statusText}</span>
        )}

      </div>

      {blocked && toolchain && (
        <div className="emulator-setup">
          {/* Two audiences, two panels. The engineer gets the missing pieces by
              name and the command that installs them; the panel designer gets
              the one fact they can act on, which is who to ask and what to do
              meanwhile. A list naming Emscripten and a POSIX shell is not
              advice to someone who did not install this. */}
          <h3>{factoryDevMode ? 'The Emulator is not set up on this machine yet' : EMULATOR_WORDS.unavailable}</h3>
          {factoryDevMode ? (
            <ul>
              {toolchain.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : (
            <p>{EMULATOR_WORDS.unavailableDetail}</p>
          )}
          {factoryDevMode && toolchain.remedy && (
            <>
              <p>Run this once in the project folder, then check again:</p>
              <pre>{toolchain.remedy}</pre>
              <p className="emulator-setup-note">
                It installs Emscripten {toolchain.pins.emscripten} and LVGL {toolchain.pins.lvgl}
                {' '}into <code>.hmi-cache/emulator/</code>, which is ignored by git. Nothing is
                installed system-wide, and deleting that folder undoes it.
              </p>
            </>
          )}
          <button onClick={() => void checkToolchain(true)} disabled={checking}>
            {checking ? 'Checking…' : 'Check again'}
          </button>
        </div>
      )}

      {firstBuild && (
        <div className="emulator-note">
          {factoryDevMode
            ? 'First run compiles LVGL from source — a few minutes. Every run after that reuses it and takes seconds.'
            : EMULATOR_WORDS.firstRun}
        </div>
      )}

      <div className="emulator-body">
        <div
          className="emulator-canvas-wrapper"
          style={{ width: canvas.width, height: canvas.height }}
        >
          {isWorking && (
            <div className="emulator-overlay">
              <div className="emulator-spinner" />
              {/* statusText, not statusMessage: this is the same sentence as the
                  status line and has to be in the same register. Reading it
                  straight from the service is what left "Compiling your screens
                  with LVGL…" on the canvas of someone who never asked. */}
              <div className="emulator-overlay-text">{statusText}</div>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className={`emulator-canvas ${running ? 'interactive' : ''}`}
            width={canvas.width}
            height={canvas.height}
            tabIndex={running ? 0 : undefined}
            onMouseMove={running ? handleMouseMove : undefined}
            onMouseDown={running ? handleMouseDown : undefined}
            onMouseUp={running ? handleMouseUp : undefined}
            onMouseLeave={running ? handleMouseLeave : undefined}
            onKeyDown={running ? handleKeyDown : undefined}
            onKeyUp={running ? handleKeyUp : undefined}
          />
        </div>
      </div>

      {/* Which LVGL, built by which compiler: the answer to "why does this
          differ from the board", and noise to anyone not asking that. Factory
          dev mode only — see docs/factory-dev-mode.md. */}
      {factoryDevMode && (
        <div className="emulator-footer">
          {toolchain?.ready
            ? `Real LVGL ${toolchain.lvgl.version ?? ''} compiled with emcc · mouse and keyboard go into the running UI`
            : 'Real LVGL compiled with emcc · mouse and keyboard go into the running UI'}
        </div>
      )}
    </div>
  );
};

export default Emulator;
