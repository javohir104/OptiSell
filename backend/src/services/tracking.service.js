/**
 * Real visitor tracking for the admin panel. The frontend sends one page view per route change
 * (POST /api/track/pageview) and a heartbeat while a tab stays open (POST /api/track/heartbeat).
 * No IP addresses are stored. Bots and admins are not recorded.
 */
import { env } from '../config/env.js';
import { insert, now } from '../db/store.js';

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|curl|wget|python-requests|httpclient|okhttp|postman|insomnia/i;

export const isBot = (userAgent) => !userAgent || BOT_UA.test(userAgent);

export function deviceType(userAgent = '') {
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(userAgent)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(userAgent)) return 'mobile';
  if (/windows|macintosh|linux|cros|x11/i.test(userAgent)) return 'desktop';
  return 'other';
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** External referrer host, or null for direct traffic and navigation inside the app. */
export function referrerHost(referrer) {
  if (!referrer) return null;
  const host = hostOf(referrer);
  const own = new Set(env.CORS_ORIGINS.map(hostOf).filter(Boolean));
  if (!host || own.has(host) || host === 'localhost') return null;
  return host.slice(0, 255);
}

/**
 * Who has a page open right now: visitor_id -> { user_id, path, last_seen_at }.
 * Kept in memory only (it is about "right now", so nothing is lost by a restart).
 */
export const presence = new Map();
const PRESENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function markPresent(visitorId, userId, path) {
  const previous = presence.get(visitorId);
  presence.set(visitorId, { user_id: userId ?? previous?.user_id ?? null, path, last_seen_at: now() });
  if (presence.size > 10_000) {
    const cutoff = Date.now() - PRESENCE_MAX_AGE_MS;
    for (const [id, p] of presence) if (Date.parse(p.last_seen_at) < cutoff) presence.delete(id);
  }
}

export async function recordPageView({ userId, userAgent, body }) {
  insert('page_views', {
    visitor_id: body.visitor_id,
    session_id: body.session_id,
    user_id: userId ?? null,
    path: body.path,
    referrer_host: referrerHost(body.referrer),
    device_type: deviceType(userAgent),
  });
  markPresent(body.visitor_id, userId, body.path);
}

export async function recordHeartbeat({ userId, body }) {
  markPresent(body.visitor_id, userId, body.path);
}
