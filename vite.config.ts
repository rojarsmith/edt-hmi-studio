/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import compilePlugin from './vite-plugin-compile'
import hmiPlugin from './vite-plugin-hmi'
import pkg from './package.json' with { type: 'json' }

const compilePreviewModuleId = 'virtual:compile-preview'
const compilePreviewModulePath = fileURLToPath(new URL('./src/components/CompilePreview/index.ts', import.meta.url))

function compilePreviewModulePlugin(enableCompilePreview: boolean): Plugin {
  const resolvedCompilePreviewModuleId = `\0${compilePreviewModuleId}`

  return {
    name: 'compile-preview-module',
    resolveId(id) {
      if (id === compilePreviewModuleId) {
        return resolvedCompilePreviewModuleId
      }
    },
    load(id) {
      if (id !== resolvedCompilePreviewModuleId) {
        return null
      }

      if (enableCompilePreview) {
        return `export { default } from ${JSON.stringify(compilePreviewModulePath)}`
      }

      return 'const CompilePreview = () => null\nexport default CompilePreview'
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const enableCompilePreview = env.VITE_ENABLE_COMPILE_PREVIEW !== 'false'

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
      compilePreviewModulePlugin(enableCompilePreview),
      hmiPlugin(),
      ...(enableCompilePreview ? [compilePlugin()] : []),
    ],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/setupTests.ts'],
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
