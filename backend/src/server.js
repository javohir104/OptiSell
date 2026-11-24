import { env } from './config/env.js';
import { pool, checkDatabase } from './config/db.js';
import { createApp } from './app.js';

const app = createApp();

const server = app.listen(env.PORT, async () => {
  console.log(`OptiSell API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  try {
    await checkDatabase();
    console.log('PostgreSQL connection OK');
  } catch (err) {
    console.error(`PostgreSQL connection FAILED: ${err.message}`);
  }
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  // Force exit if connections don't close in time.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
