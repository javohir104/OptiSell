import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { translations } from './translations';
import { telegramLang } from '../telegram';

export const LANGUAGES = [
  { code: 'uz', label: "O'zbekcha", short: 'UZ' },
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'en', label: 'English', short: 'EN' },
];

const KEY = 'optisell_lang';

function initialLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && translations[saved]) return saved;
  } catch { /* ignore */ }
  return telegramLang() || 'uz';
}

// Module-level copy so non-React code (formatters, axios) can translate too.
let current = initialLang();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export const getLang = () => current;

/** Translate a key with optional {placeholders}. Falls back to English, then to the key itself. */
export function tr(key, vars) {
  const s = translations[current]?.[key] ?? translations.en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s;
}

/** Translate a known stored value (category, note, "Walk-in"…); unknown values pass through. */
export function td(value) {
  if (value == null || value === '') return value;
  return translations[current]?.[`data.${value}`] ?? value;
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(current);

  const setLang = useCallback((l) => {
    if (!translations[l]) return;
    current = l;
    document.documentElement.lang = l;
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
    setLangState(l);
  }, []);

  // New function identities per language so consumers re-render with fresh strings.
  const value = useMemo(() => ({
    lang,
    setLang,
    t: (k, v) => tr(k, v),
    td: (v) => td(v),
  }), [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
