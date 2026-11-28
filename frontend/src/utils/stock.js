/** Stock status derived from product thresholds. Backend values win if provided. */
export function stockStatus(p) {
  if (p.status) return p.status;
  const stock = Number(p.stock) || 0;
  if (stock <= 0) return 'out';
  if (p.minStock != null && stock <= Number(p.minStock)) return 'low';
  if (p.maxStock && stock > Number(p.maxStock)) return 'over';
  return 'ok';
}

export const STOCK_META = {
  out: { label: 'stock.out', tone: 'danger' },
  low: { label: 'stock.low', tone: 'warning' },
  over: { label: 'stock.over', tone: 'info' },
  ok: { label: 'stock.ok', tone: 'success' },
};

export const margin = (p) => (p.price ? ((p.price - p.cost) / p.price) * 100 : 0);
