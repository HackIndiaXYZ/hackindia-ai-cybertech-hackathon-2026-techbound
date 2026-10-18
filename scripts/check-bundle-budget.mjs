#!/usr/bin/env node
/**
 * Bundle budget guard (GAP-AND-PLAN 4C, closes P2-4). Asserts measured gzip
 * sizes of the production build instead of trusting vibes:
 *
 * 1. The web entry chunk (`index-*.js`) must stay under MAIN_GZIP_BUDGET_KB.
 * 2. The entry must NOT contain Babylon code — the 6.3 MB 3D engine must stay
 *    in its own lazily-imported chunk (ADR: lazy avatar loading). If Babylon
 *    ever leaks into main, both checks fail loudly.
 * 3. Oversized lazy chunks (>500 kB gzip) are reported as informational —
 *    Babylon today is a known, labelled exception, not a silent one.
 *
 * Run after `npm run build`. CI wires it as `npm run bundle-budget`.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assetsDir = path.join(root, 'apps', 'web', 'dist', 'assets');

const MAIN_GZIP_BUDGET_KB = 150; // measured 2026-10: 120 kB — headroom, not aspiration
const LAZY_REPORT_THRESHOLD_KB = 500;
const BABYLON_MARKER = /babylon/i;

const failures = [];
const notes = [];

let files;
try {
  files = await readdir(assetsDir);
} catch {
  console.error(`BUNDLE BUDGET: ${assetsDir} not found. Run "npm run build" first.`);
  process.exit(1);
}

const jsFiles = files.filter((f) => f.endsWith('.js'));
const mainChunks = jsFiles.filter((f) => /^index-.*\.js$/.test(f));
if (mainChunks.length === 0) {
  failures.push('No entry chunk matching index-*.js found in apps/web/dist/assets.');
}

for (const name of mainChunks) {
  const buf = await readFile(path.join(assetsDir, name));
  const gzipKb = gzipSync(buf).length / 1024;
  notes.push(`entry ${name}: ${gzipKb.toFixed(1)} kB gzip (budget ${MAIN_GZIP_BUDGET_KB} kB)`);
  if (gzipKb > MAIN_GZIP_BUDGET_KB) {
    failures.push(`Entry chunk ${name} is ${gzipKb.toFixed(1)} kB gzipped — over the ${MAIN_GZIP_BUDGET_KB} kB budget.`);
  }
  if (BABYLON_MARKER.test(buf.toString('latin1'))) {
    failures.push(`Entry chunk ${name} contains Babylon code — the 3D engine must stay in its own lazy chunk.`);
  }
}

for (const name of jsFiles) {
  if (mainChunks.includes(name)) continue;
  const { size } = await stat(path.join(assetsDir, name));
  const gzipKb = gzipSync(await readFile(path.join(assetsDir, name))).length / 1024;
  if (gzipKb > LAZY_REPORT_THRESHOLD_KB) {
    notes.push(`lazy chunk ${name}: ${gzipKb.toFixed(1)} kB gzip (over ${LAZY_REPORT_THRESHOLD_KB} kB — reported, not failed)`);
  }
}

for (const n of notes) console.log(`  · ${n}`);
if (failures.length) {
  console.error('BUNDLE BUDGET FAILED:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`BUNDLE BUDGET OK: entry chunk(s) within ${MAIN_GZIP_BUDGET_KB} kB gzip and Babylon-free.`);
