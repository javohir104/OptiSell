/**
 * Automatic backups of the JSON database.
 *
 * A backup is a folder backend/data/backups/<ISO time>/ with a copy of every collection file.
 * One is made when the server starts and then every BACKUP_INTERVAL_HOURS; the newest BACKUP_KEEP
 * are kept. If a data file is ever damaged, store.load() restores it from the newest backup.
 *
 * Restore by hand: stop the server, copy the files from a backup folder into backend/data, start.
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { COLLECTIONS, backupFolders, backupsDir, db, persist } from '../db/store.js';

const folderName = (date = new Date()) => date.toISOString().replace(/[:.]/g, '-');

/** Time a backup folder was made (folder names are ISO times with ':' and '.' replaced). */
function folderTime(name) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(name);
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : 0;
}

function folderSize(folder) {
  return fs.readdirSync(folder).reduce((sum, f) => sum + fs.statSync(path.join(folder, f)).size, 0);
}

/** Delete all but the newest `keep` backups. */
function prune(keep) {
  for (const old of backupFolders().slice(keep)) {
    fs.rmSync(path.join(backupsDir, old), { recursive: true, force: true });
  }
}

/**
 * Write a snapshot of every collection. All changes run synchronously in this one process, so the
 * in-memory data is a consistent snapshot. Returns the backup info, or null in tests.
 */
export function createBackup() {
  if (!persist) return null;
  const name = folderName();
  const target = path.join(backupsDir, name);
  const tmp = `${target}.tmp`;
  fs.mkdirSync(tmp, { recursive: true });
  for (const collection of COLLECTIONS) {
    fs.writeFileSync(path.join(tmp, `${collection}.json`), JSON.stringify(db[collection]));
  }
  // Rename at the end: a half-written backup never looks like a complete one.
  fs.renameSync(tmp, target);
  prune(env.BACKUP_KEEP);
  return { name, created_at: new Date(folderTime(name)).toISOString(), size_bytes: folderSize(target) };
}

export function listBackups() {
  if (!persist) return [];
  return backupFolders().map((name) => ({
    name,
    created_at: new Date(folderTime(name)).toISOString(),
    size_bytes: folderSize(path.join(backupsDir, name)),
  }));
}

/** Whole database as one JSON object (for the admin "download backup" button). */
export function exportAll() {
  return {
    exported_at: new Date().toISOString(),
    collections: Object.fromEntries(COLLECTIONS.map((name) => [name, db[name]])),
  };
}

function runSafely() {
  try {
    const b = createBackup();
    if (b) console.log(`Backup saved: data/backups/${b.name}`);
  } catch (err) {
    console.error(`Backup FAILED: ${err.message}`);
  }
}

/** Backup now (if the newest one is older than the interval), then on a timer. */
export function startBackupSchedule() {
  if (!persist) return;
  const intervalMs = env.BACKUP_INTERVAL_HOURS * 3_600_000;
  const newest = backupFolders()[0];
  if (!newest || Date.now() - folderTime(newest) > intervalMs / 2) runSafely();
  // Check every 10 minutes so a sleeping laptop still backs up soon after it wakes.
  setInterval(() => {
    const latest = backupFolders()[0];
    if (!latest || Date.now() - folderTime(latest) >= intervalMs) runSafely();
  }, 10 * 60_000).unref();
}
