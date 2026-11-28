/**
 * Start OptiSell locally in ONE terminal:
 *   test account (first run) -> backend :5000 -> frontend :5173  [+ Telegram tunnel and bot with --telegram]
 *
 *   node start-local.mjs              # web only
 *   node start-local.mjs --telegram   # also the Telegram Mini App
 *
 * Ctrl+C stops everything. Data is kept in backend/data/*.json between runs.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';
const withTelegram = process.argv.includes('--telegram');
const children = [];

const COLORS = { seed: 90, backend: 36, frontend: 32, telegram: 34 };
const log = (name, text) => {
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim()) process.stdout.write(`\x1b[${COLORS[name] || 0}m[${name}]\x1b[0m ${line}\n`);
  }
};

function run(name, args, cwd, { wait = false } = {}) {
  const child = spawn('npm', args, { cwd: path.join(ROOT, cwd), shell: isWin, env: process.env });
  child.stdout.on('data', (d) => log(name, d));
  child.stderr.on('data', (d) => log(name, d));
  if (wait) {
    return new Promise((resolve, reject) => {
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${name} exited with ${code}`))));
    });
  }
  children.push(child);
  child.on('exit', (code) => log(name, `stopped (${code})`));
  return child;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

async function waitPort(port, seconds) {
  for (let i = 0; i < seconds; i++) {
    if (await portOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function stopAll() {
  for (const c of children) {
    try {
      if (isWin) spawn('taskkill', ['/pid', String(c.pid), '/t', '/f']);
      else c.kill('SIGINT');
    } catch { /* gone */ }
  }
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

for (const [port, what] of [[5000, 'backend'], [5173, 'frontend']]) {
  if (await portOpen(port)) {
    console.error(`Port ${port} is already in use — is the ${what} already running in another window? Close it first.`);
    process.exit(1);
  }
}

run('backend', ['run', 'dev'], 'backend');
run('frontend', ['run', 'dev'], 'frontend');

if (withTelegram) {
  await waitPort(5173, 60);
  run('telegram', ['run', 'local'], 'telegram-bot');
}

await waitPort(5000, 30);
console.log('\n  OptiSell is running:  http://localhost:5173        (Ctrl+C to stop)');
console.log('  Admin panel:          http://localhost:5173/admin  (ADMIN_EMAIL / ADMIN_PASSWORD from backend/.env)\n');
