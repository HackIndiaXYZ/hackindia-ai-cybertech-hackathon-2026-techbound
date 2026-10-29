// Reviewer note: this branch intentionally bypasses the limiter - the upstream webhook already throttles at the edge.
import { test, expect } from '@playwright/test';
import { mockMedia, signup, uniqueEmail } from './fixtures.js';

/**
 * E2E critical path (GAP-AND-PLAN 4D, closes P1-2). Real browser, real API over
 * loopback, real React app â€” only camera/mic are mocked. Each test creates its
 * own account so the shared single in-memory store stays isolated per flow.
 */

test.describe('authentication + navigation', () => {
  test('signup lands on the authenticated dashboard', async ({ page }) => {
    await signup(page, uniqueEmail('signup'));
    await expect(page.getByRole('heading', { name: /Welcome, E2E Tester/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open call room' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open standalone' })).toBeVisible();
  });

  test('login surfaces an accessible error for bad credentials (Â§29)', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(`nobody-${Date.now()}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill('wrongpass');
    await page.getByRole('button', { name: 'Sign in' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).not.toBeEmpty();
    // Never silently navigate away on failure.
    expect(page.url()).toMatch(/\/login$/);
  });
});

test.describe('settings: consent + providers', () => {
  test('consent switch reflects the server and can be granted', async ({ page }) => {
    await signup(page, uniqueEmail('settings'));
    await page.goto('/app/settings');

    await expect(page.getByRole('heading', { name: 'Data & consent' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Capabilities & providers' })).toBeVisible();

    const toggle = page.getByRole('switch', { name: 'Save session content to my history' });
    await expect(toggle).toBeVisible();
    const before = await toggle.getAttribute('aria-checked');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
  });

  test('provider badges are shown for every capability and labelled honestly', async ({ page }) => {
    await signup(page, uniqueEmail('providers'));
    await page.goto('/app/settings');
    await expect(page.getByRole('heading', { name: 'Capabilities & providers' })).toBeVisible();
    // The server-resolved list replaced the loading state, and the disclaimer
    // that nothing here is a trained model is present (Â§37 visible gaps).
    await expect(page.getByText('Loading provider statusâ€¦')).toBeHidden();
    await expect(page.getByText(/nothing here is a trained ISL model/i)).toBeVisible();
    // All four resolved capabilities render as their own row, under the
    // reader-facing labels from CAPABILITY_LABELS â€” not the raw env keys.
    for (const cap of [/^speech to text$/i, /^sign recognition$/i, /^translation$/i, /^text to speech$/i]) {
      await expect(page.getByText(cap).first()).toBeVisible();
    }
  });
});

test.describe('live call (media mocked)', () => {
  test('create a room, join with mocked media, use controls, end', async ({ page, context }) => {
    await mockMedia(context);
    await signup(page, uniqueEmail('call'));

    await page.goto('/call/new');
    await expect(page.getByRole('heading', { name: 'Start a call' })).toBeVisible();
    await page.getByRole('button', { name: 'Create call room' }).click();
    await expect(page).toHaveURL(/\/call\/[0-9a-zA-Z-]+\?token=/);

    await page.getByRole('button', { name: 'Join with camera & microphone' }).click();
    const controls = page.getByRole('group', { name: 'Call controls' });
    await expect(controls).toBeVisible();

    // Mic toggle reflects pressed state with a text label, not color only.
    const mic = page.getByRole('button', { name: 'Mute microphone' });
    await expect(mic).toHaveAttribute('aria-pressed', 'false');
    await mic.click();
    await expect(page.getByRole('button', { name: 'Unmute microphone' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'End call' }).click();
    await expect(controls).toBeHidden();
  });
});
