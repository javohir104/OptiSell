import axios from 'axios';
import { tr } from '../i18n';

// Locally /api goes through the Vite proxy to the backend on :5000 (see vite.config.js).
export const API_URL = import.meta.env.VITE_API_URL || '/api';

const TOKEN_KEY = 'optisell_token';

export const tokenStorage = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t) => {
    try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ }
  },
  clear: () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Fired when the backend says our JWT is invalid/expired. AuthContext listens to it.
export const UNAUTHORIZED_EVENT = 'optisell:unauthorized';

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const isAuthCall = error.config?.url?.startsWith('/auth/login') || error.config?.url?.startsWith('/auth/register') || error.config?.url?.startsWith('/auth/google');
    if (status === 401 && !isAuthCall) {
      tokenStorage.clear();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  }
);

/** Accepts both `{ data: ... }` envelopes and bare payloads. */
export const unwrap = (res) => (res?.data && Object.prototype.hasOwnProperty.call(res.data, 'data') ? res.data.data : res.data);

/** Human-readable error message from any axios error. */
export function getErrorMessage(error, fallback = tr('api.generic')) {
  if (!error) return fallback;
  if (error.code === 'ECONNABORTED') return tr('api.timeout');
  if (!error.response && error.request) return tr('api.unreachable', { url: API_URL });
  const status = error.response?.status;
  const d = error.response?.data;
  const serverMsg = typeof d === 'string' && d.length < 300 && !d.trim().startsWith('<') ? d
    : backendMessage(d?.error) || d?.message || (typeof d?.error === 'string' && d.error)
      || (Array.isArray(d?.errors) && (d.errors[0]?.msg || d.errors[0]?.message));
  if (serverMsg) return serverMsg;
  if (status && STATUS_CODES.includes(status)) return tr(`api.${status}`);
  if (status >= 500) return tr('api.500');
  return error.message || fallback;
}

/**
 * OptiSell backend / AI service error: { code, message, details? }. For validation errors the
 * first field problem is more useful than the generic "Validation failed".
 */
function backendMessage(err) {
  if (!err || typeof err !== 'object') return '';
  const first = Array.isArray(err.details) ? err.details.find((x) => x && typeof x.message === 'string') : null;
  if (err.code === 'VALIDATION_ERROR' && first) return first.field ? `${first.field}: ${first.message}` : first.message;
  return err.message || '';
}

const STATUS_CODES = [400, 401, 403, 404, 409, 413, 422, 429, 500, 502, 503];

export default api;
