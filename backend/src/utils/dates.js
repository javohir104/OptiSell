import { env } from '../config/env.js';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: env.APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date (YYYY-MM-DD) of a timestamp in the business timezone. */
export function localDay(timestamp) {
  return dayFormat.format(new Date(timestamp));
}

/** Today's date (YYYY-MM-DD) in the business timezone. */
export const today = () => localDay(Date.now());

/** Add (or subtract) whole days to a YYYY-MM-DD string. */
export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add whole months to an ISO timestamp. */
export function addMonths(timestamp, months) {
  const d = new Date(timestamp);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
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

/** Is a YYYY-MM-DD day inside [from, to]? Missing bounds are open. */
export const dayInRange = (day, from, to) => (!from || day >= from) && (!to || day <= to);

/** Is a timestamp's local day inside [from, to]? */
export const inRange = (timestamp, from, to) => Boolean(timestamp) && dayInRange(localDay(timestamp), from, to);

/** First day of the day / week (Monday) / month that contains `day`. */
export function bucketStart(day, interval) {
  if (interval === 'month') return `${day.slice(0, 7)}-01`;
  if (interval === 'week') {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
    return addDays(day, -((weekday + 6) % 7));
  }
  return day;
}

/** Every bucket start from `from` to `to`, oldest first. */
export function bucketList(from, to, interval) {
  const list = [];
  let day = bucketStart(from, interval);
  while (day <= to) {
    list.push(day);
    if (interval === 'month') {
      const [y, m] = day.split('-').map(Number);
      day = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    } else {
      day = addDays(day, interval === 'week' ? 7 : 1);
    }
  }
  return list;
}

/**
 * 12:00 on a YYYY-MM-DD date in the business timezone, as an ISO timestamp.
 * Returns null for impossible dates such as 2026-02-31.
 */
export function localNoonIso(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 12));
  if (guess.getUTCFullYear() !== y || guess.getUTCMonth() !== m - 1 || guess.getUTCDate() !== d) {
    return null;
  }
  // Wall-clock time of `guess` in the business timezone gives the offset (DST-aware).
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: env.APP_TIMEZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(guess)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess.getTime() - (wall - guess.getTime())).toISOString();
}
