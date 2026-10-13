import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integracion/**/*.test.ts'],
    globalSetup: ['./tests/integracion/global-setup.ts'],
    fileParallelism: false,
    globals: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
})
