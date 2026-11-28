import { getLang } from '../i18n';

// All money in OptiSell is Uzbek so'm (UZS), shown without decimals.
const LOCALES = { uz: 'uz-Latn-UZ', ru: 'ru-RU', en: 'en-US' };
const CURRENCY_LABEL = { uz: "so'm", ru: 'сум', en: "so'm" };

const cache = new Map();
function nf(opts) {
  const lang = getLang();
  const key = `${lang}|${JSON.stringify(opts)}`;
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat(LOCALES[lang] || 'en-US', opts));
  return cache.get(key);
}

const bad = (v) => v == null || v === '' || Number.isNaN(Number(v));

export const currentLocale = () => LOCALES[getLang()] || 'en-US';
export const currencyLabel = () => CURRENCY_LABEL[getLang()] || "so'm";

/** 1 234 500 so'm */
export const formatMoney = (v) => (bad(v) ? '—' : `${nf({ maximumFractionDigits: 0 }).format(Math.round(Number(v)))} ${currencyLabel()}`);
/** 1,2 mln so'm */
export const formatMoneyCompact = (v) => (bad(v) ? '—' : `${nf({ notation: 'compact', maximumFractionDigits: 1 }).format(Number(v))} ${currencyLabel()}`);
/** 1,2 mln — chart axes, where the currency is obvious and space is tight */
export const formatMoneyAxis = (v) => (bad(v) ? '' : nf({ notation: 'compact', maximumFractionDigits: 1 }).format(Number(v)));
export const formatNumber = (v) => (bad(v) ? '—' : nf({}).format(Number(v)));
export const formatNumberCompact = (v) => (bad(v) ? '—' : nf({ notation: 'compact', maximumFractionDigits: 1 }).format(Number(v)));
export const formatPercent = (v, digits = 1) => (bad(v) ? '—' : `${Number(v).toFixed(digits)}%`);

const parse = (iso) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
export const formatDate = (iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  iso ? parse(iso).toLocaleDateString(currentLocale(), opts) : '—';
export const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString(currentLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const formatShortDate = (iso) => formatDate(iso, { month: 'short', day: 'numeric' });

/** local YYYY-MM-DD */
export const toDayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const daysAgo = (n) => toDayKey(Date.now() - n * 86400000);
