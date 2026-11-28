import { env } from './config/env.js';
import { flush, load } from './db/store.js';
import { createApp } from './app.js';
import { ensureEnvAdmin } from './services/adminAuth.service.js';
import { startBackupSchedule } from './services/backup.service.js';
import { startBonusSchedule } from './services/bonus.service.js';
import { startReportSchedule, telegramConfigured } from './services/telegram.service.js';

await load();
if (!env.DATABASE_URL) console.log(`Data folder: ${env.DATA_DIR}`);

try {
  const admin = await ensureEnvAdmin();
  if (admin) console.log(`Admin panel account: ${admin.email}${admin.changed ? ' (created / password updated from .env)' : ''}`);
  else console.log('Admin panel: ADMIN_EMAIL / ADMIN_PASSWORD not set in .env');
} catch (err) {
  console.error(`Admin account setup FAILED: ${err.message}`);
}

startBackupSchedule();
console.log(`Backups: every ${env.BACKUP_INTERVAL_HOURS} h, newest ${env.BACKUP_KEEP} kept in data/backups`);
startReportSchedule();
startBonusSchedule();
console.log(
  telegramConfigured()
    ? `Telegram notifications: on (daily report at ${env.DAILY_REPORT_HOUR}:00 ${env.APP_TIMEZONE})`
    : 'Telegram notifications: off (set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME in .env)',
);

const server = createApp().listen(env.PORT, () => {
  console.log(`OptiSell API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await flush();
    process.exit(0);
  });
  // Force exit if connections don't close in time (data is still written).
  setTimeout(async () => {
    await flush();
    process.exit(1);
  }, 12_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
