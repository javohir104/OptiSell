import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../database/migrations',
);

// Arbitrary constant: only one migrator may run at a time.
const LOCK_ID = 7_314_002;

/**
 * Apply every not-yet-applied *.sql file in database/migrations, in filename order.
 * Each file runs in its own transaction. Edited (already-applied) files are detected by checksum.
 */
export async function runMigrations({ connectionString, ssl = false, log = console.log }) {
  const client = new pg.Client({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     TEXT PRIMARY KEY,
        checksum    TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query('SELECT version, checksum FROM schema_migrations');
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    let count = 0;

    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');

      if (applied.has(file)) {
        if (applied.get(file) !== checksum) {
          throw new Error(
            `Migration ${file} was modified after being applied. Create a new migration instead.`,
          );
        }
        continue;
      }

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
          file,
          checksum,
        ]);
        await client.query('COMMIT');
        log(`  applied ${file}`);
        count += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }

    log(count ? `Applied ${count} migration(s).` : 'Database is up to date.');
    return count;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    await client.end();
  }
}
