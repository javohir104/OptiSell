import api, { unwrap } from './axios';
import { clean, daysInclusive, shiftDay, toCategory, toSummary, toTimeseries, toTopProduct, withChange } from './backend';

// The backend's reports live under /dashboard (exact SQL aggregates in the business timezone).
const overview = (from, to) => api.get('/dashboard/overview', { params: clean({ from, to }) }).then(unwrap);

const real = {
  summary: async ({ from, to } = {}) => {
    const cur = await overview(from, to);
    // Previous period of the same length, ending the day before this one starts.
    const { from: f, to: t } = cur.period;
    const len = daysInclusive(f, t);
    const prev = await overview(shiftDay(f, -len), shiftDay(f, -1));
    return withChange(toSummary(cur), toSummary(prev));
  },
  timeseries: async ({ from, to } = {}) => {
    const params = clean({ from, to, interval: 'day' });
    const [profit, sales] = await Promise.all([
      api.get('/dashboard/profit', { params }).then(unwrap),
      api.get('/dashboard/sales', { params }).then(unwrap),
    ]);
    return toTimeseries(profit.series, sales.series);
  },
  topProducts: async ({ from, to, limit, sort } = {}) => {
    const params = clean({ from, to, limit, by: 'revenue', order: sort === 'asc' ? 'asc' : 'desc' });
    return unwrap(await api.get('/dashboard/top-products', { params })).items.map(toTopProduct);
  },
  categories: async ({ from, to } = {}) =>
    unwrap(await api.get('/dashboard/categories', { params: clean({ from, to }) })).items.map(toCategory),
};

export const analyticsApi = real;
