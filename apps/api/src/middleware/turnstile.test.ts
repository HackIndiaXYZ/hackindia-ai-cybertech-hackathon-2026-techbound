import { describe, it, expect, vi } from 'vitest';
import { verifyTurnstileResponse, requireTurnstile } from './turnstile.js';

// The fake fetch resolves a global fetch Response, not an Express one.
type FetchResponse = Awaited<ReturnType<typeof globalThis.fetch>>;

function jsonResponse(body: unknown, ok = true, status = 200): FetchResponse {
  return { ok, status, json: async () => body } as unknown as FetchResponse;
}

describe('verifyTurnstileResponse (5.3, injected fetch)', () => {
  const deps = { secret: 's3cr3t', verifyUrl: 'https://example.test/siteverify' };

  it('returns true only when Turnstile reports success', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true }));
    const ok = await verifyTurnstileResponse('tok', '1.2.3.4', { ...deps, fetchImpl });
    expect(ok).toBe(true);
    // The secret + token are posted form-encoded, and the token reaches the wire.
    const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(String((calls[0][1] as { body: string }).body)).toContain('response=tok');
  });

  it('returns false when Turnstile rejects the token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: false, 'error-codes': ['bad-response'] }));
    expect(await verifyTurnstileResponse('tok', undefined, { ...deps, fetchImpl })).toBe(false);
  });

  it('returns false on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true }, false, 500));
    expect(await verifyTurnstileResponse('tok', undefined, { ...deps, fetchImpl })).toBe(false);
  });

  it('fails closed when the network call throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    expect(await verifyTurnstileResponse('tok', undefined, { ...deps, fetchImpl })).toBe(false);
  });

  it('short-circuits without a fetch when token or secret is missing', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true }));
    expect(await verifyTurnstileResponse('', undefined, { ...deps, fetchImpl })).toBe(false);
    expect(await verifyTurnstileResponse('tok', undefined, { ...deps, secret: '', fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('requireTurnstile middleware (5.3, disabled by default)', () => {
  it('calls next() without error when Turnstile is not enabled', () => {
    type MiddlewareParams = Parameters<typeof requireTurnstile>;
    const req = { body: {}, header: () => '', ip: '127.0.0.1' } as unknown as MiddlewareParams[0];
    const res = {} as MiddlewareParams[1];
    const next = vi.fn() as unknown as MiddlewareParams[2];
    requireTurnstile(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect((next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toBeUndefined();
  });
});
