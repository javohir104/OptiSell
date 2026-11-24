import { env } from '../config/env.js';

/** Today's date (YYYY-MM-DD) in the business timezone. */
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Add (or subtract) whole days to a YYYY-MM-DD string. */
export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Fill missing from/to: defaults to the last 30 days including today. */
export function resolveRange({ from, to }, defaultDays = 30) {
  const end = to ?? today();
  const start = from ?? addDays(end, -(defaultDays - 1));
  return { from: start, to: end };
}

/**
 * Add a timestamptz range filter (inclusive local dates) to a SqlParams builder.
 * Comparison is done on the raw column so indexes are used.
 */
export function whereTimestampInRange(sql, column, from, to) {
  if (!from && !to) return;
  const tz = sql.add(env.APP_TIMEZONE);
  if (from) sql.where(`${column} >= (${sql.add(from)}::date)::timestamp AT TIME ZONE ${tz}`);
  if (to) sql.where(`${column} < (${sql.add(to)}::date + 1)::timestamp AT TIME ZONE ${tz}`);
}
