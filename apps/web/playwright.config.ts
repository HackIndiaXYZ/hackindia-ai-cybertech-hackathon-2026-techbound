import { defineConfig, devices } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * End-to-end harness (GAP-AND-PLAN 4D, closes P1-2 + part of P1-3). Boots the
 * real API (fallback in-memory drivers, exactly like `npm run dev`) and the real
 * Vite dev server, then drives the actual React app in Chromium over loopback
 * signaling — no stubbed HTTP layer, so this exercises the same typed REST +
 * socket contract the unit tests assert at each boundary.
 *
 * Design choices worth recording (see docs/BROWSER-SUPPORT.md):
 * - One worker, not parallel: a single API process shares one in-memory store,
 *   so serialized tests keep the room/participant assertions deterministic.
 * - Media is mocked at the browser-API boundary (fixtures.mockMedia) so the
 *   call path runs headless without a camera; Web Speech stays feature-detected
 *   and degrades honestly rather than being faked into a pass.
 * - The two-peer WebRTC mesh is environment-specific (the plan says so), so it
 *   is opt-in via RUN_MESH=1 rather than failing CI on host NAT/codec variance.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const API_PORT = process.env.E2E_API_PORT ?? '4000';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '5173';
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: path.join(here, 'test-results'),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev:api',
      cwd: root,
      port: Number(API_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      command: 'npm run dev:web',
      cwd: root,
      port: Number(WEB_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
    },
  ],
});
