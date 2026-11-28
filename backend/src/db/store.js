/**
 * JSON file database.
 *
 * Every collection is one file: backend/data/<name>.json (an array of plain objects).
 * All data is loaded into memory when the server starts; every change is written to its file
 * immediately (atomic: write a temp file, then rename it over the old one).
 *
 * The server is one Node.js process and every change below runs synchronously, so two requests
 * can never change the same data at the same time — no locks or transactions are needed.
 * Services check everything first and only then change data, so a failed request changes nothing.
 *
 * In tests (NODE_ENV=test) nothing is written to disk.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import * as postgres from './postgres.js';

export const COLLECTIONS = [
  'users',
  'products', // includes the current stock: quantity, low_stock_threshold, max_stock
  'sales', // includes its line items: sale.items[]
  'inventory_movements',
  'expenses',
  'imports',
  'payments',
  'page_views',
  'admin_audit_log',
  'customers', // nasiya: shop customers who can buy on credit
  'debt_payments', // money a customer paid back
  'suppliers',
  'purchases', // stock arrivals from a supplier (with its line items: purchase.items[])
  'supplier_payments', // money the shop paid a supplier
  'points_ledger', // bonus points: +rewards / -plans bought with points
  'contest_winners', // monthly contest: who won which month
];

export const persist = env.NODE_ENV !== 'test';
export const dataDir = path.resolve(env.DATA_DIR);
const dir = dataDir;
export const backupsDir = path.join(dataDir, 'backups');

/** db.users, db.products, ... — arrays of rows. Read them directly; change them via the helpers. */
export const db = Object.fromEntries(COLLECTIONS.map((name) => [name, []]));

function fileOf(name) {
  return path.join(dir, `${name}.json`);
}

/**
 * Write a collection to its file right away, so a change is on disk before the request answers.
 * Stopping the server at any moment (Ctrl+C, closing the window) never loses saved data.
 */
export function save(name) {
  if (!persist) return;
  if (postgres.pgEnabled()) {
    postgres.markDirty(name);
    return;
  }
  const file = fileOf(name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db[name], null, 2));
  fs.renameSync(tmp, file);
}

/** Resolves when every change is stored (Postgres writes are sent in the background). */
export async function flush() {
  await postgres.flushPg();
}

/** Close the database connection (scripts call this so the process can exit). */
export async function closeStorage() {
  await postgres.close();
}

/** Where data is kept: 'postgres' | 'json-files' | 'memory' (tests). */
export const storageKind = () => (!persist ? 'memory' : postgres.pgEnabled() ? 'postgres' : 'json-files');

/** Backup folders, newest first (names are ISO timestamps, so they sort by time). */
export function backupFolders() {
  if (!fs.existsSync(backupsDir)) return [];
  return fs
    .readdirSync(backupsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
}

/** The collection from the newest backup that can be read, or null. */
function fromBackup(name) {
  for (const folder of backupFolders()) {
    const file = path.join(backupsDir, folder, `${name}.json`);
    try {
      if (fs.existsSync(file)) return { rows: JSON.parse(fs.readFileSync(file, 'utf8')), folder };
    } catch {
      // try an older backup
    }
  }
  return null;
}

/**
 * Read one collection file. A damaged file (e.g. the disk filled up) is kept aside as
 * <name>.json.corrupt-<time> and the collection is restored from the newest readable backup,
 * so one bad file never takes every shop offline.
 */
function readCollection(name) {
  const file = fileOf(name);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    const backup = fromBackup(name);
    if (!backup) throw new Error(`${file} is damaged and no backup could be read: ${err.message}`);
    fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
    console.error(`!!! ${name}.json was damaged (${err.message}). Restored from backup ${backup.folder}.`);
    db[name] = backup.rows;
    save(name);
    return backup.rows;
  }
}

/** Load all collections: from Postgres when DATABASE_URL is set, else from backend/data. */
export async function load() {
  if (!persist) return;
  if (env.DATABASE_URL) {
    const { data, total } = await postgres.connect(env.DATABASE_URL, COLLECTIONS, (name) => db[name]);
    if (total === 0) {
      // Empty database: move existing JSON files (if any) into it once, so nothing is lost.
      const local = Object.fromEntries(COLLECTIONS.map((name) => [name, fs.existsSync(fileOf(name)) ? readCollection(name) : []]));
      const rows = Object.values(local).reduce((s, l) => s + l.length, 0);
      for (const name of COLLECTIONS) db[name] = local[name];
      if (rows) {
        await postgres.importAll(local);
        console.log(`Postgres was empty: imported ${rows} rows from ${dir}`);
      }
    } else {
      for (const name of COLLECTIONS) db[name] = data[name];
    }
    console.log(`Storage: PostgreSQL (${total} rows loaded)`);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  for (const name of COLLECTIONS) db[name] = readCollection(name);
}

export const now = () => new Date().toISOString();

/** Add a row (id / created_at are filled in when missing) and return it. */
export function insert(name, row) {
  const full = { id: randomUUID(), created_at: now(), ...row };
  db[name].push(full);
  save(name);
  return full;
}

/** Change fields of a row in place and return it. */
export function update(name, row, changes, { touch = true } = {}) {
  Object.assign(row, changes, touch ? { updated_at: now() } : {});
  save(name);
  return row;
}

/** Remove every row matching `match`. Returns how many were removed. */
export function remove(name, match) {
  const before = db[name].length;
  db[name] = db[name].filter((row) => !match(row));
  const removed = before - db[name].length;
  if (removed) save(name);
  return removed;
}

export const findById = (name, id) => db[name].find((row) => row.id === id) ?? null;

/** Empty every collection (tests only). */
export function reset() {
  for (const name of COLLECTIONS) db[name] = [];
}
