/**
 * Copy the local JSON data (backend/data/*.json) into the PostgreSQL database in DATABASE_URL.
 * Use it once to move a shop's existing data to the production database.
 *
 *   DATABASE_URL=postgres://... npm run db:push            (only if the database is empty)
 *   DATABASE_URL=postgres://... npm run db:push -- --force  (REPLACES everything in the database)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const force = process.argv.includes('--force');
const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('Set DATABASE_URL (the Postgres connection string) first.');
  process.exit(1);
}

const { COLLECTIONS, dataDir } = await import('../src/db/store.js');
const pgStore = await import('../src/db/postgres.js');

const local = Object.fromEntries(COLLECTIONS.map((name) => {
  const file = path.join(dataDir, `${name}.json`);
  return [name, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []];
}));
const rows = Object.values(local).reduce((s, l) => s + l.length, 0);
console.log(`Local data in ${dataDir}: ${rows} rows`);

const current = { ...local };
await pgStore.connect(url, COLLECTIONS, (name) => current[name]);
if (!(await pgStore.isEmpty()) && !force) {
  console.error('The database already has data. Nothing was changed. Use --force to replace it with the local files.');
  await pgStore.close();
  process.exit(1);
}
await pgStore.importAll(local); // upserts local rows and deletes rows that are not in the local files
await pgStore.close();
console.log(`Done: ${rows} rows are now in Postgres.`);
