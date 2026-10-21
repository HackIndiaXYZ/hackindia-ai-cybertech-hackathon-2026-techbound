import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const engineDir = path.join(root, 'apps', 'isl-engine');
const scriptPath = path.join(engineDir, 'app.py');

const candidates = [
  path.join(engineDir, '.venv', 'Scripts', 'python.exe'),
  path.join(engineDir, '.venv', 'bin', 'python'),
  path.join(engineDir, 'venv', 'Scripts', 'python.exe'),
  path.join(engineDir, 'venv', 'bin', 'python'),
  process.platform === 'win32' ? 'python' : 'python3',
];

const pythonExe = candidates.find((p) => {
  if (p === 'python' || p === 'python3') return true;
  return fs.existsSync(p);
}) || (process.platform === 'win32' ? 'python' : 'python3');

console.log(`[ISL-Engine] Using Python executable: ${pythonExe}`);
console.log(`[ISL-Engine] Launching app.py from: ${engineDir}`);

const child = spawn(pythonExe, ['-u', scriptPath], {
  cwd: engineDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONUNBUFFERED: '1',
  },
});

child.on('exit', (code, signal) => {
  if (code !== null && code !== 0) {
    console.error(`[ISL-Engine] Process exited with code ${code}`);
  }
  process.exit(code ?? (signal ? 1 : 0));
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
