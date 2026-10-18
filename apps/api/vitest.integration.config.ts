import { defineConfig } from 'vitest/config';

/**
 * Postgres/Redis integration runner (GAP-AND-PLAN 4D, closes P1-5). A separate
 * config so the default unit run never touches a live database. Executed by
 * `npm run test:integration`, which CI runs against a real Postgres + Redis
 * service; locally it self-skips unless DB_DRIVER=postgres is provided.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['src/test/setup.integration.ts'],
    include: ['src/**/*.integration.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // One process talking to one database: run sequentially for deterministic
    // rows, and give migrations/connections room to breathe.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
