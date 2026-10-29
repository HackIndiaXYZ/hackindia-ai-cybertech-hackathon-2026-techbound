import { test, expect, type Browser, type Page } from '@playwright/test';
import { mockMedia, signup, uniqueEmail } from './fixtures.js';

/**
 * Two-real-peer mesh over loopback signaling (GAP-AND-PLAN 4D, §19). The plan
 * itself labels this environment-specific, so it is OPT-IN: run with `RUN_MESH=1`
 * on a machine that permits real Chromium↔Chromium WebRTC. Two separate browser
 * contexts (isolated origins/storage) join the same session by token, and we
 * assert the server-relayed roster + host moderation, not pixel-perfect media.
 */

async function joinRoom(page: Page, sessionId: string, token: string): Promise<void> {
  await page.goto(`/call/${sessionId}?token=${encodeURIComponent(token)}`);
  await expect(page.getByRole('heading', { name: 'Join call' })).toBeVisible();
  await page.getByRole('button', { name: 'Join with camera & microphone' }).click();
  await expect(page.getByRole('group', { name: 'Call controls' })).toBeVisible();
}

async function newJoinedPeer(browser: Browser, displayName: string) {
  const context = await browser.newContext();
  await mockMedia(context);
  const page = await context.newPage();
  await signup(page, uniqueEmail('mesh'), displayName);
  return { context, page };
}

test.describe('two-peer mesh (RUN_MESH=1)', () => {
  test.skip(!process.env.RUN_MESH, 'two-peer WebRTC mesh is environment-specific; run with RUN_MESH=1');

  test('two peers meet in a roster and the host can mute the guest', async ({ browser }) => {
    test.slow();
    const host = await newJoinedPeer(browser, 'Host Person');
    const guest = await newJoinedPeer(browser, 'Guest Person');

    // Host creates the room and starts it, then shares the token with the guest.
    await host.page.goto('/call/new');
    await host.page.getByRole('button', { name: 'Group call (up to 5)' }).click();
    await host.page.getByRole('button', { name: 'Create call room' }).click();
    await expect(host.page).toHaveURL(/\/call\/[0-9a-zA-Z-]+\?token=/);
    const url = new URL(host.page.url());
    const sessionId = url.pathname.split('/').filter(Boolean).pop()!;
    const token = url.searchParams.get('token')!;

    await host.page.getByRole('button', { name: 'Join with camera & microphone' }).click();
    await expect(host.page.getByRole('group', { name: 'Call controls' })).toBeVisible();

    await joinRoom(guest.page, sessionId, token);

    // Roster converges on two participants for both peers.
    await expect(host.page.getByRole('heading', { name: 'Participants (2)' })).toBeVisible();
    await expect(host.page.getByRole('listitem').filter({ hasText: 'Guest Person' })).toBeVisible();
    await expect(guest.page.getByRole('heading', { name: 'Participants (2)' })).toBeVisible();

    // Host-only moderation is offered, and it actually relays to the guest.
    await expect(host.page.getByText('You are the host')).toBeVisible();
    const guestRow = host.page.getByRole('listitem').filter({ hasText: 'Guest Person' });
    await guestRow.getByRole('button', { name: 'Mute' }).click();
    await expect(guestRow.getByText('Muted')).toBeVisible({ timeout: 15_000 });

    // A non-host is never shown moderation controls.
    await expect(guest.page.getByRole('button', { name: 'Mute' })).toHaveCount(0);

    await host.context.close();
    await guest.context.close();
  });
});
