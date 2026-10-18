import { describe, it, expect, vi } from 'vitest';
import { fetchExists } from './babylonAvatarAdapter.js';

describe('fetchExists', () => {
  it('returns true when server returns 200 with binary model content type', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'model/gltf-binary' },
      }),
    );
    const exists = await fetchExists('/assets/avatars/missingwhisper-avatar.glb');
    expect(exists).toBe(true);
  });

  it('returns false when server returns 200 with text/html SPA fallback for missing asset', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('<!doctype html><html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
    const exists = await fetchExists('/assets/avatars/missingwhisper-avatar.glb');
    expect(exists).toBe(false);
  });

  it('returns false when server returns 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Not found', {
        status: 404,
      }),
    );
    const exists = await fetchExists('/assets/avatars/missingwhisper-avatar.glb');
    expect(exists).toBe(false);
  });

  it('returns false on fetch network exception', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    const exists = await fetchExists('/assets/avatars/missingwhisper-avatar.glb');
    expect(exists).toBe(false);
  });
});
