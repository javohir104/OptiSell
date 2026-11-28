/**
 * PostgreSQL persistence for the in-memory store (used when DATABASE_URL is set).
 *
 * Why: hosts like Render wipe the server's disk on every deploy, so JSON files in backend/data
 * disappear with each push. With DATABASE_URL every change is written to Postgres, which lives
 * outside the server and survives deploys, restarts and crashes.
 *
 * How: one table, one row per record: optisell_rows(collection, id, data jsonb).
 * The app keeps working on the in-memory arrays exactly as before; after a change store.save(name)
 * calls markDirty(name), and the writer sends only the rows that really changed (upsert) or were
 * removed (delete), in order, one batch at a time. Failed writes are retried until they succeed.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const TABLE = 'optisell_rows';
const CHUNK = 500;

let pool = null;
const snapshot = new Map(); // collection -> Map(id -> JSON text last written)
const dirty = new Set();
let writing = null;
let getRows = () => [];

export const pgEnabled = () => pool !== null;

function sslFor(url) {
  // Hosted Postgres (Neon, Supabase, Render) needs TLS; a local server usually does not.
  if (/sslmode=disable/.test(url) || /@(localhost|127\.0\.0\.1)[:/]/.test(url)) return false;
  return { rejectUnauthorized: false };
}

/** Connect, create the table, load every collection. Returns { name: rows[] }. */
export async function connect(url, collections, rowsOf) {
  getRows = rowsOf;
  pool = new pg.Pool({ connectionString: url, ssl: sslFor(url), max: 4, idleTimeoutMillis: 30_000 });
  pool.on('error', (err) => console.error(`Postgres pool error: ${err.message}`));
  await pool.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    seq BIGSERIAL,
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (collection, id)
  )`);
  const { rows } = await pool.query(`SELECT collection, id, data FROM ${TABLE} ORDER BY seq`);
  const out = Object.fromEntries(collections.map((c) => [c, []]));
  for (const c of collections) snapshot.set(c, new Map());
  for (const r of rows) {
    if (!out[r.collection]) continue; // a collection this version does not know: keep it untouched
    out[r.collection].push(r.data);
    snapshot.get(r.collection).set(r.id, JSON.stringify(r.data));
  }
  return { data: out, total: rows.length };
}

export async function isEmpty() {
  const { rows } = await pool.query(`SELECT 1 FROM ${TABLE} LIMIT 1`);
  return rows.length === 0;
}

/** Remember that a collection changed; the writer picks it up right away. */
export function markDirty(name) {
  if (!pool) return;
  dirty.add(name);
  if (!writing) writing = drain().finally(() => { writing = null; if (dirty.size) markDirty([...dirty][0]); });
}

async function writeCollection(name) {
  const rows = getRows(name);
  const before = snapshot.get(name) ?? new Map();
  const now = new Map();
  const upserts = [];
  for (const row of rows) {
    if (!row.id) row.id = randomUUID();
    const json = JSON.stringify(row);
    now.set(row.id, json);
    if (before.get(row.id) !== json) upserts.push([row.id, json]);
  }
  const deletes = [...before.keys()].filter((id) => !now.has(id));
  if (!upserts.length && !deletes.length) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < upserts.length; i += CHUNK) {
      const part = upserts.slice(i, i + CHUNK);
      await client.query(
        `INSERT INTO ${TABLE} (collection, id, data)
         SELECT $1, x.id, x.data::jsonb FROM unnest($2::text[], $3::text[]) AS x(id, data)
         ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [name, part.map((p) => p[0]), part.map((p) => p[1])],
      );
    }
    for (let i = 0; i < deletes.length; i += CHUNK) {
      await client.query(`DELETE FROM ${TABLE} WHERE collection = $1 AND id = ANY($2::text[])`, [name, deletes.slice(i, i + CHUNK)]);
    }
    await client.query('COMMIT');
    snapshot.set(name, now);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function drain() {
  let delay = 1000;
  while (dirty.size) {
    const name = [...dirty][0];
    dirty.delete(name);
    try {
      await writeCollection(name);
      delay = 1000;
    } catch (err) {
      dirty.add(name); // keep it: never lose a change because of a network hiccup
      console.error(`Postgres write failed for ${name} (retrying in ${delay / 1000}s): ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30_000);
    }
  }
}

/** Wait until every change is in Postgres (on shutdown). */
export async function flushPg(timeoutMs = 15_000) {
  if (!pool) return;
  const deadline = Date.now() + timeoutMs;
  while ((writing || dirty.size) && Date.now() < deadline) {
    if (!writing && dirty.size) markDirty([...dirty][0]);
    await (writing ?? Promise.resolve());
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Copy whole collections into Postgres (first start / `npm run db:push`). */
export async function importAll(data) {
  // writeCollection compares with what is in the database (snapshot from connect), so rows that
  // are not in `data` are deleted and the table ends up exactly equal to `data`.
  for (const name of Object.keys(data)) {
    if (!snapshot.has(name)) snapshot.set(name, new Map());
    await writeCollection(name);
  }
}

export async function close() {
  await flushPg();
  await pool?.end();
  pool = null;
}
