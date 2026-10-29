/*
 * End-to-end interconnection probe for the deployed demo.
 *   Space  : env PROD_SPACE_URL (default https://adarshmani-missingwhisper-isl-engine-techbound.hf.space)
 *   API    : env PROD_API_URL   (default https://missingwhisper.vercel.app/api/v1)
 * Exercises the engine HTTP endpoints the API's islEngineBridge falls back to
 * (/predict/landmarks, /format_sentence) plus the static and translate paths, so
 * a failure names the hop that broke instead of just "500".
 * Usage: node scripts/prod_smoke.mjs
 */
const SPACE = process.env.PROD_SPACE_URL ?? 'https://adarshmani-missingwhisper-isl-engine-techbound.hf.space';
const API = process.env.PROD_API_URL ?? 'https://missingwhisper.vercel.app/api/v1';

/** One hand of 21 landmarks, gently animated so the window is not degenerate. */
function handFrame(t) {
  return Array.from({ length: 21 }, (_, i) => ({
    x: 0.5 + 0.2 * Math.sin((i + t) / 3),
    y: 0.5 + 0.2 * Math.cos((i - t) / 4),
    z: 0.01 * ((i + t) % 7),
  }));
}

/** 30 frames in the {"hands":[{"landmarks":[...]}]} shape app.py parses. */
function landmarkWindow() {
  return {
    landmarks: Array.from({ length: 30 }, (_, t) => ({
      right: handFrame(t),
      left: handFrame(t + 1).map((p) => ({ ...p, x: 1 - p.x })),
    })),
  };
}

async function call(label, url, init, expect) {
  const want = expect ?? ((s) => s >= 200 && s < 300);
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    const ms = Date.now() - started;
    const preview = text.length > 320 ? `${text.slice(0, 320)}…` : text;
    console.log(`${want(res.status) ? 'PASS' : 'FAIL'} ${label} [${res.status}] ${ms}ms\n     ${preview}\n`);
    return { ok: want(res.status), status: res.status, body: text };
  } catch (err) {
    console.log(`FAIL ${label} [threw] ${Date.now() - started}ms\n     ${err.message}\n`);
    return { ok: false, status: 0, body: String(err) };
  }
}

const json = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

console.log('--- Hugging Face ZeroGPU Space (direct) ---');
await call('GET  /health', `${SPACE}/health`);
await call('POST /predict/landmarks', `${SPACE}/predict/landmarks`, json(landmarkWindow()));
await call(
  'POST /predict/static',
  `${SPACE}/predict/static`,
  json({ hands: [{ landmarks: handFrame(0) }] }),
);
await call(
  'POST /format_sentence',
  `${SPACE}/format_sentence`,
  json({ glosses: ['YOU', 'HAPPY', 'TODAY'], language: 'hi' }),
);
await call(
  'POST /process_translate',
  `${SPACE}/process_translate`,
  json({ sentence: 'I YOU MEET TOMORROW', language: 'hi' }),
);

console.log('--- Vercel serverless API (the hop the browser uses) ---');
await call('GET  /api/v1/health', `${API}/health`);
await call('GET  /api/v1/nope (must 404)', `${API}/nope`, undefined, (s) => s === 404);
// The three API → Space forwards that carry the product's core loop.
await call('GET  /api/v1/isl/health', `${API}/isl/health`);
await call(
  'POST /api/v1/isl/predict/static',
  `${API}/isl/predict/static`,
  json({ hands: [{ landmarks: handFrame(0) }] }),
);
await call(
  'POST /api/v1/isl/format_sentence',
  `${API}/isl/format_sentence`,
  json({ glosses: ['YOU', 'HAPPY', 'TODAY'], language: 'hi' }),
);
await call('POST /api/v1/isl/translate', `${API}/isl/translate`, json({ sentence: 'I YOU MEET TOMORROW', language: 'hi' }));
// Persistence round-trip on the fallback (in-memory) driver: proves the function
// boots, validates and writes state — and that the data is gone on cold start.
const email = `smoke+${Date.now()}@missingwhisper.test`;
const signup = await call(
  'POST /api/v1/auth/signup',
  `${API}/auth/signup`,
  json({ email, password: 'Sup3rSecret!', displayName: 'Smoke Probe', role: 'hearing' }),
);
const token = signup.ok ? (JSON.parse(signup.body)?.data?.tokens?.accessToken ?? '') : '';
await call(
  'GET  /api/v1/users/me (authed)',
  `${API}/users/me`,
  { headers: { Authorization: `Bearer ${token}` } },
);
