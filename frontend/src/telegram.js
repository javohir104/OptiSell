/**
 * Telegram Mini App integration. Everything here is a no-op in a normal browser,
 * so the same build works on the web and inside Telegram.
 * Docs: https://core.telegram.org/bots/webapps
 */
const wa = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

/** True only when the page was actually opened from a Telegram bot. */
export const isTelegram = Boolean(wa && wa.initData);
export const tg = isTelegram ? wa : null;

/** Light/dark scheme Telegram is using, or null outside Telegram. */
export const telegramColorScheme = () => (tg ? tg.colorScheme : null);

/** Telegram user's language mapped to the app's languages (uz/ru/en), or null. */
export function telegramLang() {
  const code = tg?.initDataUnsafe?.user?.language_code;
  if (!code) return null;
  if (code.startsWith('ru')) return 'ru';
  if (code.startsWith('uz')) return 'uz';
  if (code.startsWith('en')) return 'en';
  return null;
}

/** Call once at startup. */
export function initTelegram() {
  if (!tg) return;
  document.documentElement.classList.add('tg');
  try {
    tg.ready();
    tg.expand();
    // Stop the swipe-down gesture from closing the app while scrolling lists.
    if (tg.isVersionAtLeast?.('7.7')) tg.disableVerticalSwipes();
    if (tg.isVersionAtLeast?.('6.2')) tg.enableClosingConfirmation?.();
  } catch { /* older clients */ }

  // Telegram's stable viewport height (excludes the keyboard animation jitter).
  const setVh = () => {
    const h = tg.viewportStableHeight || window.innerHeight;
    document.documentElement.style.setProperty('--tg-vh', `${h}px`);
  };
  setVh();
  tg.onEvent?.('viewportChanged', setVh);
}

/** Match Telegram's header / background / bottom bar to the app theme. */
export function syncTelegramTheme(isDark) {
  if (!tg) return;
  const bg = isDark ? '#09090b' : '#fafafa';
  const header = isDark ? '#09090b' : '#ffffff';
  try {
    if (tg.isVersionAtLeast?.('6.1')) {
      tg.setHeaderColor(header);
      tg.setBackgroundColor(bg);
    }
    if (tg.isVersionAtLeast?.('7.10')) tg.setBottomBarColor?.(header);
  } catch { /* ignore */ }
}

/** Light haptic tap; silently ignored outside Telegram. */
export function haptic(kind = 'light') {
  try {
    const h = tg?.HapticFeedback;
    if (!h) return;
    if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
    else if (kind === 'select') h.selectionChanged();
    else h.impactOccurred(kind);
  } catch { /* ignore */ }
}

/** Show Telegram's native back button while `visible`, calling `onBack` on press. */
export function setBackButton(visible, onBack) {
  const b = tg?.BackButton;
  if (!b || !tg.isVersionAtLeast?.('6.1')) return () => {};
  if (!visible) { b.hide(); return () => {}; }
  b.onClick(onBack);
  b.show();
  return () => { b.offClick(onBack); };
}

/**
 * Open an external link. Inside Telegram, t.me links open in Telegram itself and other links in
 * the in-app browser (a plain window.open is blocked or replaces the Mini App).
 */
export function openLink(url) {
  if (tg) {
    try {
      if (/^https:\/\/t\.me\//.test(url) && tg.openTelegramLink) return tg.openTelegramLink(url);
      if (tg.openLink) return tg.openLink(url);
    } catch { /* fall through */ }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return undefined;
}
