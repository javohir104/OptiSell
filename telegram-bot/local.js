/**
 * Run the bot against the LOCAL frontend (http://localhost:5173).
 *
 * Telegram opens Mini Apps only over https://, so this starts a free Cloudflare quick tunnel,
 * waits for its https://*.trycloudflare.com address and starts bot.js with WEBAPP_URL set to it.
 * The Vite dev server proxies /api to the local backend, so the phone reaches the backend too.
 *
 *   npm run local          (frontend `npm run dev` and backend must be running)
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

const TARGET = process.env.LOCAL_FRONTEND_URL || 'http://localhost:5173';
const isWin = process.platform === 'win32';

try {
  await fetch(TARGET, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`Frontend is not reachable at ${TARGET}. Start it first: cd frontend && npm run dev`);
  process.exit(1);
}

console.log(`Starting Cloudflare tunnel to ${TARGET} (first run downloads cloudflared, ~30 s)...`);
const tunnel = spawn('npx', ['-y', 'cloudflared', 'tunnel', '--no-autoupdate', '--url', TARGET], {
  shell: isWin,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let bot;
const children = () => [bot, tunnel].filter(Boolean);
const stopAll = (code = 0) => {
  for (const c of children()) {
    try { c.kill(); } catch { /* already gone */ }
  }
  process.exit(code);
};
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const timer = setTimeout(() => {
  console.error('No tunnel URL after 90 s. Check your internet connection and try again.');
  stopAll(1);
}, 90_000);

function onTunnelOutput(chunk) {
  const text = chunk.toString();
  const m = URL_RE.exec(text);
  if (!m || bot) return;
  clearTimeout(timer);
  const url = m[0];
  console.log(`Tunnel ready: ${url}`);
  // Give Cloudflare a few seconds to start routing the new hostname.
  setTimeout(() => {
    bot = spawn(process.execPath, ['--env-file=.env', 'bot.js'], {
      stdio: 'inherit',
      env: { ...process.env, WEBAPP_URL: url },
    });
    bot.on('exit', (code) => { console.log(`bot exited (${code})`); stopAll(code ?? 0); });
  }, 4000);
}

tunnel.stdout.on('data', onTunnelOutput);
tunnel.stderr.on('data', onTunnelOutput);
tunnel.on('exit', (code) => {
  console.error(`cloudflared exited (${code})`);
  stopAll(code ?? 1);
});
