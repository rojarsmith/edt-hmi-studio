/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import emulatorPlugin from './vite-plugin-emulator'
import hmiPlugin from './vite-plugin-hmi'
import pkg from './package.json' with { type: 'json' }

const emulatorModuleId = 'virtual:emulator'
const emulatorModulePath = fileURLToPath(new URL('./src/components/Emulator/index.ts', import.meta.url))

function emulatorModulePlugin(enableEmulator: boolean): Plugin {
  const resolvedEmulatorModuleId = `\0${emulatorModuleId}`

  return {
    name: 'emulator-module',
    resolveId(id) {
      if (id === emulatorModuleId) {
        return resolvedEmulatorModuleId
      }
    },
    load(id) {
      if (id !== resolvedEmulatorModuleId) {
        return null
      }

      if (enableEmulator) {
        return `export { default } from ${JSON.stringify(emulatorModulePath)}`
      }

      return 'const Emulator = () => null\nexport default Emulator'
    },
  }
}

/**
 * Replaces %APP_VERSION% in index.html with the package version, so the
 * splash screen can show it before any JS runs. `define` only reaches JS,
 * not HTML, hence this tiny transform.
 */
function appVersionHtmlPlugin(): Plugin {
  return {
    name: 'app-version-html',
    transformIndexHtml(html) {
      return html.replaceAll('%APP_VERSION%', pkg.version)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Either name switches the Emulator off; VITE_ENABLE_COMPILE_PREVIEW is the
  // one this shipped under and is kept working. See docs/emulator.md §5.
  const enableEmulator =
    env.VITE_ENABLE_EMULATOR !== 'false' && env.VITE_ENABLE_COMPILE_PREVIEW !== 'false'

  return {
    base: env.VITE_BASE_PATH || '/',
    define: {
      // Single source of truth for the version shown in the About dialog.
      // Injected onto import.meta.env rather than as a bare global: a missing
      // define then reads as undefined instead of throwing a ReferenceError
      // that would take the whole app down.
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    },
    plugins: [
      react(),
      appVersionHtmlPlugin(),
      emulatorModulePlugin(enableEmulator),
      hmiPlugin(),
      ...(enableEmulator ? [emulatorPlugin()] : []),
    ],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/setupTests.ts'],
      // The Emulator's toolchain is installed under .hmi-cache; emsdk ships its
      // own test suite, and without this the project's `npm test` runs
      // Emscripten's. See docs/emulator.md §4.2.
      exclude: ['**/node_modules/**', '**/dist/**', '.hmi-cache/**', '.hmi-builds/**'],
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
    },
    preview: {
      host: '127.0.0.1',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Monaco editor
            if (id.includes('@monaco-editor') || id.includes('monaco-editor')) {
              return 'monaco';
            }
            // React Flow
            if (id.includes('@xyflow')) {
              return 'reactflow';
            }
            // DnD Kit
            if (id.includes('@dnd-kit')) {
              return 'dnd';
            }
            // React and related
            if (id.includes('node_modules/react/') ||
                id.includes('node_modules/react-dom/') ||
                id.includes('node_modules/scheduler/')) {
              return 'react-vendor';
            }
            // State management
            if (id.includes('zustand')) {
              return 'zustand';
            }
          }
        }
      }
    }
  }
})
