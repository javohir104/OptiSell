import { db, storageKind } from '../db/store.js';

export function getHealth(req, res) {
  res.json({
    success: true,
    data: {
      status: 'ok',
      storage: storageKind(),
      users: db.users.length,
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
}
