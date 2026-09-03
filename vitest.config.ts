import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**'],
  },
  resolve: {
    alias: {
      '@': path.join(projectRoot, 'src'),
      'server-only': path.join(projectRoot, 'scripts', 'server-only-vitest-shim.mjs'),
    },
  },
})
