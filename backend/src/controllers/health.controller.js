import { checkDatabase } from '../config/db.js';

export async function getHealth(req, res) {
  let database = 'up';
  try {
    await checkDatabase();
  } catch {
    database = 'down';
  }

  const healthy = database === 'up';
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status: healthy ? 'ok' : 'degraded',
      database,
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
}
