#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const engineDir = path.join(root, 'apps', 'isl-engine');

const venvPython = process.platform === 'win32'
  ? path.join(engineDir, '.venv', 'Scripts', 'python.exe')
  : path.join(engineDir, '.venv', 'bin', 'python');

const pythonExe = existsSync(venvPython) ? venvPython : 'python';

console.log(`[isl-engine] Starting ISL Engine using: ${pythonExe}`);

const child = spawn(pythonExe, ['app.py'], {
  cwd: engineDir,
  stdio: 'inherit',
  shell: true,
});

child.on('error', (err) => {
  console.warn(`[isl-engine] Could not start ISL engine (${err.message}). Continuing without ML engine.`);
});

child.on('exit', (code, signal) => {
  if (code !== 0 && code !== null) {
    console.warn(`[isl-engine] Exited with code ${code}.`);
  }
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
  process.exit(0);
});
process.on('SIGTERM', () => {
  child.kill('SIGTERM');
  process.exit(0);
});
