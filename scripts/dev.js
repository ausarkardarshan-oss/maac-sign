'use strict';
const { spawn, execSync } = require('node:child_process');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');

console.log('\x1b[36m%s\x1b[0m', '✦ Starting MAAC AI Sign Development Servers...');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Start backend with automatic reload on changes
const backend = spawn(process.execPath, ['--watch', 'src/server.js'], {
  cwd: backendDir,
  env: { ...process.env, PORT: '3001' },
  stdio: ['inherit', 'pipe', 'pipe'],
});

backend.stdout.on('data', (data) => {
  process.stdout.write(`\x1b[32m[backend]\x1b[0m ${data}`);
});
backend.stderr.on('data', (data) => {
  process.stderr.write(`\x1b[31m[backend]\x1b[0m ${data}`);
});

// Start frontend
const frontend = spawn(`${npmCmd} run dev`, {
  cwd: frontendDir,
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
});

frontend.stdout.on('data', (data) => {
  process.stdout.write(`\x1b[35m[frontend]\x1b[0m ${data}`);
});
frontend.stderr.on('data', (data) => {
  process.stderr.write(`\x1b[31m[frontend]\x1b[0m ${data}`);
});

function killProcess(child) {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    } catch {}
  } else {
    try {
      child.kill();
    } catch {}
  }
}

let isCleaningUp = false;
function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  console.log('\nStopping servers...');
  killProcess(backend);
  killProcess(frontend);
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

backend.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Backend exited with code ${code}`);
  }
});

frontend.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Frontend exited with code ${code}`);
  }
});
