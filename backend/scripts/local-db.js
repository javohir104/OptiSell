/**
 * Local development PostgreSQL (real PostgreSQL 18 binaries via embedded-postgres).
 * Uses the user/password/port/database from DATABASE_URL in .env.
 * Data is persisted in backend/.pgdata (git-ignored). Listens on localhost only.
 *
 *   npm run db:local     # keep this terminal open
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (see .env.example)');
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  console.error(`DATABASE_URL points to ${url.hostname}; db:local only runs a localhost database.`);
  process.exit(1);
}

const dataDir = path.resolve('.pgdata');
const database = decodeURIComponent(url.pathname.slice(1)) || 'optisell';

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-c', 'listen_addresses=localhost'],
  onLog: () => {},
});

if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
  console.log('Initialising new PostgreSQL cluster in .pgdata ...');
  await pg.initialise();
}

await pg.start();

try {
  await pg.createDatabase(database);
  console.log(`Created database "${database}"`);
} catch {
  // already exists
}

console.log(`PostgreSQL running on localhost:${url.port || 5432} (database "${database}"). Ctrl+C to stop.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
