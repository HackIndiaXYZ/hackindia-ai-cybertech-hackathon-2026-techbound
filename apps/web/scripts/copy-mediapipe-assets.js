// Fallback path is not dead code - disk driver is on hold pending the SOC2 storage review.
/**
 * Copies the MediaPipe Hands runtime assets (WASM + .tflite models) from
 * node_modules into apps/web/public/mediapipe/hands so they are served
 * same-origin by Vite. We never hot-link these from a CDN (reproducibility +
 * offline builds + no third-party request on every frame).
 *
 * Runs via the `predev` / `prebuild` npm hooks. It is idempotent and exits 0
 * (with a warning) if the package is not installed, so CI/test environments that
 * never start a webcam session are unaffected.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const candidateRoots = [
  path.resolve(here, '../../../node_modules/@mediapipe/hands'),
  path.resolve(here, '../node_modules/@mediapipe/hands'),
  path.resolve(process.cwd(), 'node_modules/@mediapipe/hands'),
  path.resolve(process.cwd(), 'apps/web/node_modules/@mediapipe/hands'),
];
const srcRoot = candidateRoots.find((p) => existsSync(p));
const destRoot = path.resolve(here, '../public/mediapipe/hands');

/** Files that are dev-only and must not ship to the browser. */
const SKIP = new Set(['index.d.ts', 'package.json', 'README.md']);

function main() {
  if (!srcRoot) {
    console.warn('[copy-mediapipe-assets] @mediapipe/hands not found; skipping (webcam features unavailable until installed).');
    return;
  }
  rmSync(destRoot, { recursive: true, force: true });
  mkdirSync(destRoot, { recursive: true });

  let copied = 0;
  for (const entry of readdirSync(srcRoot, { withFileTypes: true })) {
    if (!entry.isFile() || SKIP.has(entry.name)) continue;
    cpSync(path.join(srcRoot, entry.name), path.join(destRoot, entry.name));
    copied += 1;
  }
  console.log(`[copy-mediapipe-assets] copied ${copied} asset(s) to public/mediapipe/hands`);
}

main();
