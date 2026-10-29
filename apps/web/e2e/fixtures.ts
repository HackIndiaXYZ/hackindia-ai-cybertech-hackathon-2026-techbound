import { expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Shared E2E helpers (Phase 4D). Kept tiny and honest: the media mock only
 * fabricates the browser APIs a headless run physically lacks (a camera/mic),
 * never app behavior. Signup drives the real form against the real API.
 */

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/**
 * Replace `navigator.mediaDevices.getUserMedia` with a synthetic stream (canvas
 * video track + oscillator audio track) so the call path runs without real
 * devices. Everything downstream — the WebRTC engine, VAD, signaling — is the
 * genuine app code, not a stub.
 */
export async function mockMedia(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const makeStream = (): MediaStream => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#4a90d9';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const stream = canvas.captureStream(15);
      try {
        const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        const ac = new AC();
        const osc = ac.createOscillator();
        const dest = ac.createMediaStreamDestination();
        osc.connect(dest);
        osc.start();
        for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
      } catch {
        // Audio is optional for the call path; video alone is enough to proceed.
      }
      return stream;
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => makeStream(),
        enumerateDevices: async () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
  });
}

/** Drive the real signup form and land on the dashboard. Returns the email. */
export async function signup(page: Page, email = uniqueEmail(), displayName = 'E2E Tester'): Promise<string> {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill(displayName);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('supersecret');
  await page.getByLabel('How do you communicate?').selectOption('hearing');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
  return email;
}

/** Create a session through the lobby and return the call page to its join step. */
export async function openNewCallRoom(page: Page): Promise<string> {
  await page.goto('/call/new');
  await expect(page.getByRole('heading', { name: 'Start a call' })).toBeVisible();
  await page.getByRole('button', { name: 'Create call room' }).click();
  await expect(page).toHaveURL(/\/call\/[0-9a-zA-Z-]+\?token=/);
  const url = page.url();
  const token = new URL(url).searchParams.get('token') ?? '';
  const sessionId = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
  return `${sessionId}|${token}`;
}
