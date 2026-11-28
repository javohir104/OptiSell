/**
 * "Sign in with Google" (Google Identity Services). Google gives the browser an ID token; the backend
 * verifies it (POST /auth/google) and returns our normal session. Hidden when VITE_GOOGLE_CLIENT_ID
 * is not set.
 *
 * Inside Telegram Google blocks its sign-in (embedded webview), so there the button opens the phone's
 * real browser on /tg-google, the user signs in there and the Mini App picks the session up
 * (see backend/src/services/googleHandoff.service.js).
 */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { useTheme } from '../../context/ThemeContext';
import { authApi } from '../../api/auth.api';
import { isTelegram, tg } from '../../telegram';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/** Google sign-in is available (the real button in a browser, the browser hand-off in Telegram). */
export const googleEnabled = Boolean(CLIENT_ID);

let scriptPromise;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = () => { scriptPromise = null; reject(new Error('Google script failed to load')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** onSuccess(user, { created }) after sign-in; onError(err) on failure. */
export default function GoogleButton(props) {
  if (!googleEnabled) return null;
  return isTelegram ? <TelegramGoogleButton {...props} /> : <GisButton {...props} />;
}

/**
 * The real Google button (normal browsers). With `handoff` (the /tg-google page) the session goes
 * back to the Telegram Mini App instead of signing this browser in; onSuccess(null, { handoff: true }).
 */
export function GisButton({ text = 'signin_with', handoff, onSuccess, onError }) {
  const { loginWithGoogle } = useAuth();
  const { lang } = useI18n();
  const { isDark } = useTheme();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  // Latest callbacks without re-initialising Google on every render.
  const cb = useRef({ onSuccess, onError });
  cb.current = { onSuccess, onError };

  useEffect(() => {
    if (!CLIENT_ID) return undefined;
    let alive = true;
    loadGoogleScript()
      .then(() => {
        if (!alive || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          ux_mode: 'popup',
          callback: async ({ credential }) => {
            setBusy(true);
            try {
              if (handoff) {
                await authApi.googleHandoffSignIn(credential, handoff);
                cb.current.onSuccess?.(null, { handoff: true });
              } else {
                const res = await loginWithGoogle(credential);
                cb.current.onSuccess?.(res.user, { created: res.created });
              }
            } catch (err) {
              cb.current.onError?.(err);
            } finally {
              if (alive) setBusy(false);
            }
          },
        });
        ref.current.innerHTML = '';
        window.google.accounts.id.renderButton(ref.current, {
          type: 'standard',
          theme: isDark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'rectangular',
          text,
          locale: lang,
          width: Math.min(ref.current.offsetWidth || 400, 400),
        });
      })
      .catch((err) => alive && cb.current.onError?.(err));
    return () => { alive = false; };
  }, [isDark, lang, text, handoff, loginWithGoogle]);

  if (!CLIENT_ID) return null;
  return (
    <div className={busy ? 'pointer-events-none opacity-60' : undefined} aria-busy={busy}>
      <div ref={ref} className="flex min-h-[44px] w-full justify-center" />
    </div>
  );
}

/**
 * Where the external browser signs in. It must be an "Authorized JavaScript origin" in Google Console.
 * Local dev: the Mini App runs on a random *.trycloudflare.com tunnel that Google does not know, so
 * send the (laptop) browser to http://localhost:5173 — same Vite proxy, same backend.
 */
const HANDOFF_ORIGIN = (
  import.meta.env.VITE_GOOGLE_HANDOFF_ORIGIN
  || (import.meta.env.DEV ? 'http://localhost:5173' : window.location.origin)
).replace(/\/+$/, '');

const POLL_MS = 2500;
const WAIT_MS = 10 * 60 * 1000; // same lifetime as the backend hand-off

/** Telegram Mini App: continue with Google in the external browser, then pick the session up here. */
function TelegramGoogleButton({ text = 'signin_with', onSuccess, onError }) {
  const { acceptSession } = useAuth();
  const { t, lang } = useI18n();
  const [waiting, setWaiting] = useState(false);
  const [starting, setStarting] = useState(false);
  const flow = useRef(null); // { id, secret, until }
  const cb = useRef({ onSuccess, onError });
  cb.current = { onSuccess, onError };

  const stop = () => { flow.current = null; setWaiting(false); };

  useEffect(() => {
    if (!waiting) return undefined;
    let busy = false;
    const check = async () => {
      const f = flow.current;
      if (!f || busy) return;
      if (Date.now() > f.until) { stop(); return; }
      busy = true;
      try {
        const res = await authApi.googleHandoffClaim(f.id, f.secret);
        if (res && flow.current === f) {
          stop();
          const user = acceptSession(res);
          cb.current.onSuccess?.(user, { created: res.created });
        }
      } catch (err) {
        if (flow.current === f) { stop(); cb.current.onError?.(err); }
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(check, POLL_MS);
    // Timers sleep while Telegram is in the background: check as soon as the user comes back.
    const onBack = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    tg?.onEvent?.('activated', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
      tg?.offEvent?.('activated', check);
    };
  }, [waiting, acceptSession]);

  const begin = async () => {
    setStarting(true);
    try {
      const { id, secret } = await authApi.googleHandoffStart();
      flow.current = { id, secret, until: Date.now() + WAIT_MS };
      const url = `${HANDOFF_ORIGIN}/tg-google?h=${encodeURIComponent(id)}&lang=${lang}`;
      // Opens the phone's default browser (not Telegram's in-app one, which Google also blocks).
      if (tg?.openLink) tg.openLink(url, { try_instant_view: false });
      else window.open(url, '_blank', 'noopener');
      setWaiting(true);
    } catch (err) {
      cb.current.onError?.(err);
    } finally {
      setStarting(false);
    }
  };

  if (waiting) {
    return (
      <div className="rounded-lg border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800" role="status">
        <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-brand-600" aria-hidden="true" />
          {t('auth.tgGoogleWaiting')}
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t('auth.tgGoogleHint')}</p>
        <div className="mt-2 flex gap-4 text-xs font-semibold">
          <button type="button" className="text-brand-600 dark:text-brand-400" onClick={begin}>{t('auth.tgGoogleRetry')}</button>
          <button type="button" className="text-zinc-500" onClick={stop}>{t('auth.tgGoogleCancel')}</button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" onClick={begin} disabled={starting}
      className="flex h-11 w-full items-center justify-center gap-3 rounded-md border border-zinc-300 bg-white text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800">
      <GoogleLogo />
      {t(text === 'signup_with' ? 'auth.googleSignUp' : 'auth.googleSignIn')}
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** "or" divider between Google and the email form. */
export function OrDivider() {
  const { t } = useI18n();
  if (!googleEnabled) return null;
  return (
    <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-zinc-400">
      <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />{t('auth.or')}<span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
