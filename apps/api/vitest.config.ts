import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    // bcrypt deliberately makes signup/login slow; a multi-request lifecycle test
    // can legitimately exceed vitest's 5s default under parallel load.
    testTimeout: 20000,
    include: ['src/**/*.test.ts'],
    // Postgres/Redis integration specs run only under `test:integration` with a
    // live database (see vitest.integration.config.ts); never in the unit run.
    exclude: ['src/**/*.integration.test.ts', 'node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});
