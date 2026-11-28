/**
 * Sales forecast from past sales — plain statistics, no AI service:
 *   level   = average units per day over the last 14 days
 *   trend   = change between the last 14 days and the 14 days before (damped)
 *   weekday = how much each day of the week sells compared with an average day
 *   band    = ±1.28 × standard deviation of the daily history (≈ 80% range)
 *
 * Input rows: [{ date: 'YYYY-MM-DD', product: 'Name', quantity: Number, revenue?: Number }]
 */
const DAY = 86_400_000;

export const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDay = (key, n) => dayKey(new Date(`${key}T12:00:00`).getTime() + n * DAY);
const weekday = (key) => new Date(`${key}T12:00:00`).getDay();
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Units per day for `rows`, every day from `start` to `end` present (zero-filled). */
function dailySeries(rows, start, end) {
  const map = new Map();
  for (let d = start; d <= end; d = addDay(d, 1)) map.set(d, 0);
  for (const r of rows) if (map.has(r.date)) map.set(r.date, map.get(r.date) + r.quantity);
  return [...map].map(([date, units]) => ({ date, units }));
}

/** Forecast one daily series `horizon` days ahead. */
function forecastSeries(history, horizon) {
  const units = history.map((h) => h.units);
  const last14 = units.slice(-14);
  const prev14 = units.slice(-28, -14);
  const level = avg(last14);
  const trendPerDay = prev14.length >= 7 ? (level - avg(prev14)) / 14 : 0;

  // Weekday factors only when there are at least 4 weeks of history.
  const overall = avg(units);
  const factors = Array(7).fill(1);
  if (units.length >= 28 && overall > 0) {
    for (let w = 0; w < 7; w++) {
      const same = history.filter((h) => weekday(h.date) === w).map((h) => h.units);
      factors[w] = Math.max(0.2, Math.min(3, avg(same) / overall));
    }
  }

  const sd = Math.sqrt(avg(last14.map((u) => (u - level) ** 2)));
  const lastDate = history.at(-1).date;
  const forecast = [];
  for (let i = 1; i <= horizon; i++) {
    const date = addDay(lastDate, i);
    // Damped trend: it fades out so a short spike does not run away.
    const base = level + trendPerDay * Math.min(i, 14) * 0.5;
    const value = Math.max(0, base * factors[weekday(date)]);
    forecast.push({ date, units: value, lower: Math.max(0, value - 1.28 * sd), upper: value + 1.28 * sd });
  }
  const prevAvg = avg(prev14);
  return {
    forecast,
    perDay: level,
    trendPct: prevAvg > 0 ? ((level - prevAvg) / prevAvg) * 100 : null,
    factors,
  };
}

/**
 * Full report.
 *   rows     sales rows (see top of file)
 *   horizon  days to forecast (7 / 14 / 30)
 *   product  product name to focus on, or '' for all products
 *   stock    optional Map(productName -> current stock) for restock advice
 */
export function buildForecast(rows, { horizon = 14, product = '', stock = null, historyDays = 56 } = {}) {
  const clean = rows.filter((r) => r.date && r.product && r.quantity > 0);
  if (!clean.length) return null;

  const end = clean.reduce((m, r) => (r.date > m ? r.date : m), clean[0].date);
  const start = addDay(end, -(historyDays - 1));
  const recent = clean.filter((r) => r.date >= start);
  const products = [...new Set(recent.map((r) => r.product))].sort((a, b) => a.localeCompare(b));

  const perProduct = products.map((name) => {
    const own = recent.filter((r) => r.product === name);
    const result = forecastSeries(dailySeries(own, start, end), horizon);
    const units = own.reduce((s, r) => s + r.quantity, 0);
    const revenue = own.reduce((s, r) => s + (r.revenue || 0), 0);
    const total = result.forecast.reduce((s, f) => s + f.units, 0);
    const inStock = stock?.get(name);
    return {
      product: name,
      perDay: result.perDay,
      forecastUnits: total,
      trendPct: result.trendPct,
      avgPrice: units ? revenue / units : 0,
      expectedRevenue: units ? (revenue / units) * total : 0,
      stock: inStock ?? null,
      // Order enough for the forecast + 20% safety, minus what is already in stock.
      suggestedOrder: inStock == null ? null : Math.max(0, Math.ceil(total * 1.2 - inStock)),
      daysOfStock: inStock == null || result.perDay <= 0 ? null : inStock / result.perDay,
    };
  });

  const focusRows = product ? recent.filter((r) => r.product === product) : recent;
  const history = dailySeries(focusRows, start, end);
  const main = forecastSeries(history, horizon);
  const focus = product ? perProduct.filter((p) => p.product === product) : perProduct;
  const bestDay = main.factors.indexOf(Math.max(...main.factors));

  return {
    products,
    lastDate: end,
    history: history.slice(-30),
    forecast: main.forecast,
    totals: {
      units: main.forecast.reduce((s, f) => s + f.units, 0),
      revenue: focus.reduce((s, p) => s + p.expectedRevenue, 0),
      perDay: main.perDay,
      trendPct: main.trendPct,
      bestDay: main.factors.every((f) => f === 1) ? null : bestDay,
    },
    perProduct: perProduct.sort((a, b) => b.forecastUnits - a.forecastUnits),
  };
}

// --------------------------------------------------------------------------- Excel / CSV rows

const COLUMN_NAMES = {
  date: ['date', 'sana', 'kun', 'дата', 'день', 'sold_at', 'createdat'],
  product: ['product', 'name', 'mahsulot', 'tovar', 'товар', 'название', 'sku', 'productname'],
  quantity: ['quantity', 'qty', 'soni', 'miqdor', 'dona', 'количество', 'кол-во', 'units'],
  price: ['price', 'unitprice', 'narx', 'narxi', 'цена'],
  total: ['total', 'summa', 'jami', 'сумма', 'revenue', 'tushum'],
};

const norm = (h) => String(h).toLowerCase().replace(/[\s_]/g, '');

/** Find which spreadsheet header is the date / product / quantity / price / total column. */
export function detectColumns(headers) {
  const found = {};
  for (const [field, names] of Object.entries(COLUMN_NAMES)) {
    found[field] = headers.find((h) => names.includes(norm(h))) ?? null;
  }
  return found;
}

/** "2026-11-01", "01.11.2026", "1/11/2026" or an Excel serial number -> 'YYYY-MM-DD' or null. */
export function parseDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const serial = Number(s); // Excel: days since 1899-12-30
    if (serial > 20000 && serial < 80000) return dayKey(Date.UTC(1899, 11, 30) + Math.round(serial) * DAY + 12 * 3600_000);
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : dayKey(t);
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Spreadsheet { headers, rows } -> { rows, skipped, columns } for buildForecast. */
export function rowsFromSheet({ headers, rows }) {
  const col = detectColumns(headers);
  if (!col.date || !col.product || !col.quantity) return { rows: [], skipped: rows.length, columns: col };
  const out = [];
  let skipped = 0;
  for (const r of rows) {
    const date = parseDate(r[col.date]);
    const quantity = num(r[col.quantity]);
    const product = String(r[col.product] ?? '').trim();
    if (!date || !product || quantity <= 0) {
      skipped += 1;
      continue;
    }
    const revenue = col.total ? num(r[col.total]) : col.price ? num(r[col.price]) * quantity : 0;
    out.push({ date, product, quantity, revenue });
  }
  return { rows: out, skipped, columns: col };
}
