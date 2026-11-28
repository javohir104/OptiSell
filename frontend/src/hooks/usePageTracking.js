/**
 * Reports real page views to the backend for the admin panel statistics
 * (POST /api/track/pageview on every route change, /api/track/heartbeat every 60 s while visible).
 * Off in demo/mock mode and on the admin panel itself. Stores only random ids, never personal data.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { API_URL, tokenStorage } from '../api/axios';

const SESSION_GAP_MS = 30 * 60_000;

function safe(fn, fallback = null) {
  try { return fn(); } catch { return fallback; }
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : null);

function visitorId() {
  return safe(() => {
    let v = localStorage.getItem('optisell_vid');
    if (!v) { v = uuid(); if (v) localStorage.setItem('optisell_vid', v); }
    return v;
  });
}

function sessionId() {
  return safe(() => {
    const now = Date.now();
    let s = sessionStorage.getItem('optisell_sid');
    if (!s || now - Number(sessionStorage.getItem('optisell_sid_at') || 0) > SESSION_GAP_MS) {
      s = uuid();
      if (s) sessionStorage.setItem('optisell_sid', s);
    }
    sessionStorage.setItem('optisell_sid_at', String(now));
    return s;
  });
}

function send(path, body) {
  const token = tokenStorage.get();
  fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

const tracked = (pathname) => !pathname.startsWith('/admin');

export function usePageTracking() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!tracked(pathname)) return;
    const vid = visitorId();
    const sid = sessionId();
    if (!vid || !sid) return;
    send('/track/pageview', { visitor_id: vid, session_id: sid, path: pathname, referrer: document.referrer || undefined });
  }, [pathname]);

  useEffect(() => {
    if (!tracked(pathname)) return undefined;
    const id = setInterval(() => {
      const vid = visitorId();
      if (vid && document.visibilityState === 'visible') send('/track/heartbeat', { visitor_id: vid, path: window.location.pathname });
    }, 60_000);
    return () => clearInterval(id);
  }, [pathname]);
}
