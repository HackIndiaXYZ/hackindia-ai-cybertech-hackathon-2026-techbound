import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const nodeCmd = process.execPath;

const isAll = process.argv.includes('--all') || process.argv.includes('--with-isl');

// 1. Ensure mediapipe assets are in place once upfront
try {
  spawnSync(nodeCmd, [path.join(root, 'apps', 'web', 'scripts', 'copy-mediapipe-assets.js')], {
    cwd: path.join(root, 'apps', 'web'),
    stdio: 'ignore',
  });
} catch {
  // Ignore pre-copy errors
}

const services = [
  {
    name: 'api',
    color: '\x1b[32m', // Green
    command: `${npmCmd} run dev`,
    cwd: path.join(root, 'apps', 'api'),
  },
  {
    name: 'web',
    color: '\x1b[36m', // Cyan
    command: `${npmCmd} run dev`,
    cwd: path.join(root, 'apps', 'web'),
  },
];

if (isAll) {
  services.push({
    name: 'isl',
    color: '\x1b[35m', // Magenta
    command: `"${nodeCmd}" "${path.join(root, 'scripts', 'start-isl.mjs')}"`,
    cwd: root,
  });
}

const reset = '\x1b[0m';
const children = [];

console.log(`${reset}🚀 Starting development environment (${services.map((s) => s.name).join(', ')})...`);

for (const svc of services) {
  const child = spawn(svc.command, {
    cwd: svc.cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  children.push(child);

  const prefix = `${svc.color}[${svc.name}]${reset} `;

  child.stdout.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/);
    for (const line of lines) {
      if (line.trim().length > 0) {
        process.stdout.write(prefix + line + '\n');
      }
    }
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/);
    for (const line of lines) {
      if (line.trim().length > 0) {
        process.stderr.write(prefix + line + '\n');
      }
    }
  });

  child.on('exit', (code, signal) => {
    if (signal !== 'SIGINT' && signal !== 'SIGTERM' && code !== 0 && code !== null) {
      console.log(`${svc.color}[${svc.name}]${reset} exited with code ${code}`);
    }
  });
}

function shutdown() {
  console.log(`\n${reset}Shutting down all services...`);
  for (const child of children) {
    if (!child.killed) {
      try {
        if (process.platform === 'win32') {
          spawnSync('taskkill', ['/pid', child.pid.toString(), '/f', '/t'], { stdio: 'ignore' });
        } else {
          child.kill('SIGTERM');
        }
      } catch {
        // Ignore kill errors during teardown
      }
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
