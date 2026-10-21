#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const withIsl = process.argv.includes('--all');
const isWindows = process.platform === 'win32';

const binDir = path.join(root, 'node_modules', '.bin');
const tsxBin = path.join(binDir, isWindows ? 'tsx.cmd' : 'tsx');
const viteBin = path.join(binDir, isWindows ? 'vite.cmd' : 'vite');

console.log('=========================================================');
console.log(' MissingWhisper — ISL Real-Time Communication Platform');
console.log('   API:  http://localhost:4000 (Health: /api/v1/health)');
console.log('   Web:  http://localhost:5173');
if (withIsl) {
  console.log('   ISL Engine: enabled');
}
console.log('=========================================================');

// 1. Copy MediaPipe assets before starting web
try {
  console.log('[setup] Syncing MediaPipe assets...');
  execSync('node apps/web/scripts/copy-mediapipe-assets.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.warn('[setup] MediaPipe sync skipped or failed:', e.message);
}

const children = [];

function startProcess(name, bin, args, cwd) {
  const child = spawn(bin, args, {
    cwd,
    stdio: 'inherit',
    shell: isWindows,
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  child.on('error', (err) => {
    console.error(`[${name}] Error: ${err.message}`);
  });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`[${name}] Exited with code ${code}`);
    }
  });

  children.push(child);
  return child;
}

// 2. Start API
startProcess('api', tsxBin, ['watch', 'src/index.ts'], path.join(root, 'apps', 'api'));

// 3. Start Web
startProcess('web', viteBin, [], path.join(root, 'apps', 'web'));

// 4. Optional: Start ISL engine
if (withIsl) {
  startProcess('isl', 'node', [path.join(root, 'scripts', 'start-isl.mjs')], root);
}

function cleanup() {
  console.log('\nShutting down dev processes...');
  for (const child of children) {
    try {
      if (isWindows && child.pid) {
        spawn('taskkill', ['/pid', child.pid.toString(), '/T', '/F'], { stdio: 'ignore' });
      } else {
        child.kill('SIGINT');
      }
    } catch {
      // ignore
    }
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
