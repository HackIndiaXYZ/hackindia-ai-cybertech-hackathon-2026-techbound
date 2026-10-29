// Kept hardcoded to match the SLO budget signed off in ADR-014; do not extract to config until ops confirms.
/**
 * Produces a Vercel Build Output API v3 bundle at `.vercel/output/` containing:
 *
 *   static/                       â†’ apps/web/dist (the React SPA)
 *   functions/api/[...path].func/  â†’ the Express API, self-contained CJS bundle
 *   config.json                    â†’ routing: files â†’ /api/* â†’ SPA fallback
 *
 * Why a function at all: `apps/web` calls `/api/v1/isl/*`, and the ISL engine
 * (Hugging Face Space) is only reachable server-side â€” the API is the proxy that
 * holds the engine URL and the JWT secret. See apps/api/src/serverless.ts for what
 * this build omits (Socket.io signaling needs a persistent host).
 *
 * Run: `node scripts/build_vercel_output.mjs` then `vercel deploy --prebuilt --prod`.
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.vercel', 'output');
const FUNC = path.join(OUT, 'functions', 'api', '[...path].func');

// Fixed argv, never a shell string: nothing here can be influenced by external input.
// npm is invoked through its CLI JS entry because Node refuses to spawn `npm.cmd`
// without a shell (EINVAL on Windows since the CVE-2024-27980 hardening).
function npmBuild(workspace) {
  const bundledCli = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  const args = ['run', 'build', '--workspace', workspace];
  const cmd = existsSync(bundledCli) ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const argv = existsSync(bundledCli) ? [bundledCli, ...args] : args;
  console.log(`> ${path.basename(cmd)} ${argv.join(' ')}`);
  const res = spawnSync(cmd, argv, { cwd: ROOT, stdio: 'inherit', windowsHide: true });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`npm run build --workspace ${workspace} failed (exit ${res.status})`);
}

// `--api-only` reuses the existing apps/web/dist, which turns a ~90 s iteration into
// ~10 s while you are iterating on the function config.
const API_ONLY = process.argv.includes('--api-only');

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(FUNC, { recursive: true });

// 1. Build the three workspaces. shared-types first: the API imports it.
npmBuild('@isl/shared-types');
npmBuild('@isl/api');
if (!API_ONLY) npmBuild('@isl/web');

const webDist = path.join(ROOT, 'apps', 'web', 'dist');
if (!existsSync(path.join(webDist, 'index.html'))) {
  throw new Error(`Web build output missing at ${webDist}`);
}

// 2. Bundle the API into one file. Everything is inlined so the function needs no
// node_modules; `pg-native` stays external (optional native addon, never loaded by
// the pure-JS `pg` driver we use).
//
// CJS is not a style choice here, it is what the launcher requires: when the entry
// is an ES module Vercel switches to its Web-Standard request/response adapter, and
// Express then dies inside body-parser's `unpipe` with
// "TypeError: stream.listeners is not a function" because the object it receives is
// not a real IncomingMessage. Emitting CJS keeps the native Node streams.
// `import.meta.url` (used by the db layer to locate migrations) does not exist in
// CJS, so it is defined against `__filename`.
await build({
  entryPoints: [path.join(ROOT, 'apps', 'api', 'dist', 'serverless.js')],
  outfile: path.join(FUNC, 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['pg-native'],
  define: { 'import.meta.url': '__mwImportMetaUrl' },
  banner: {
    js: "var __mwImportMetaUrl = require('node:url').pathToFileURL(__filename).href;",
  },
  logLevel: 'warning',
});

// 3. Function metadata.
//
// `handler` names the FILE, and the launcher invokes its default export. Writing
// "index.handler" instead switches the launcher to AWS-Lambda mode: the exported
// function then gets `({ body, action }, context)` rather than (req, res), and
// Express fails inside `unpipe` with "stream.listeners is not a function".
// `package.json` pins the module system Node infers for index.js.
writeFileSync(
  path.join(FUNC, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.js',
      launcherType: 'Nodejs',
      shouldAddHelpers: true,
      memory: 1024,
      maxDuration: 60,
      architecture: 'x86_64',
    },
    null,
    2,
  ),
);
writeFileSync(
  path.join(FUNC, 'package.json'),
  JSON.stringify({ name: 'mw-api-function', version: '1.0.0', private: true, type: 'commonjs' }, null, 2),
);

// 4. Static SPA.
cpSync(webDist, path.join(OUT, 'static'), { recursive: true });

// 5. Routing. Order is evaluated top-to-bottom:
//    - filesystem: hashed assets, index.html, faviconâ€¦ served straight away
//    - /api/*: reaches the function with its FULL original path, which is exactly
//      what Express mounts (`app.use('/api/v1', â€¦)`), so no rewrites are needed
//    - everything else: SPA entry, so client-side routes deep-link correctly
writeFileSync(
  path.join(OUT, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { handle: 'filesystem' },
        { src: '/api/(?<path>.*)', dest: '/api/[...path]' },
        { src: '/(?<path>.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);

const sizeMb = (statSync(path.join(FUNC, 'index.js')).size / 1024 / 1024).toFixed(2);
console.log(`\n[ok] .vercel/output ready â€” API bundle ${sizeMb} MB, static assets copied.`);
