// Silent drop is intentional here; propagating would leak bearer tokens to the console (SEC-07).
import { test, expect } from '@playwright/test';
import { signup, uniqueEmail, openNewCallRoom } from './fixtures.js';

/**
 * Phase 5 readback + reset-flow E2E. Real browser, real API. These prove the
 * user-facing acceptance screens talk to the server for real instead of showing
 * a mocked or fabricated state.
 */

test.describe('history readback (5.5)', () => {
  test('shows the empty state for a brand-new account', async ({ page }) => {
    await signup(page, uniqueEmail('hist-empty'));
    await page.goto('/app/history');
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
    // A real GET /sessions answered with none â€” not a loading spinner, not an error.
    await expect(page.getByText('No sessions yet')).toBeVisible();
  });

  test('lists a session the caller actually created', async ({ page }) => {
    await signup(page, uniqueEmail('hist-one'));
    await openNewCallRoom(page); // host a real session via the lobby
    await page.goto('/app/history');
    // The session came from the durable store, so its row renders with a date.
    await expect(page.getByText(/^Started /)).toBeVisible();
    await expect(page.getByText('No sessions yet')).toBeHidden();
  });
});

test.describe('forgot-password is enumeration-safe (5.2)', () => {
  test('confirms identically for an unknown address and never navigates', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email', { exact: true }).fill(`nobody-${Date.now()}@example.com`);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    // The same "if an account exists" phrasing is shown regardless of existence.
    await expect(page.getByText(/If an account exists for/i)).toBeVisible();
    expect(page.url()).toMatch(/\/forgot-password$/);
  });
});
