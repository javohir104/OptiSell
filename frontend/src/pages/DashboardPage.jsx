import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Banknote, Boxes, Package, PackageX, Receipt, Wallet } from 'lucide-react';
import { analyticsApi } from '../api/analytics.api';
import { productsApi } from '../api/products.api';
import { salesApi } from '../api/sales.api';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, TableSkeleton } from '../components/common/ui';
import DateRangeFilter, { rangeFromPreset } from '../components/common/DateRangeFilter';
import StockBadge from '../components/common/StockBadge';
import { CountBarChart, Legend, MoneyTrendChart, useChartColors } from '../components/charts/charts';
import { formatDateTime, formatMoney, formatNumber } from '../utils/format';
import { stockStatus } from '../utils/stock';
import { welcomeDelay } from '../utils/welcome';

// Cards arrive in a wave: each section rises, fades in and un-blurs a little after the previous one.
const item = {
  hidden: { opacity: 0, y: 24, scale: 0.97, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 170, damping: 20 } },
};
// Nested grids only stagger their own cards (the page-level delay is applied once, above).
const group = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const M = motion.div;
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const c = useChartColors();
  const [range, setRange] = useState(rangeFromPreset('30d'));
  const params = { from: range.from, to: range.to };
  const summary = useApi(() => analyticsApi.summary(params), [range.from, range.to]);
  const series = useApi(() => analyticsApi.timeseries(params), [range.from, range.to]);
  const sales = useApi(() => salesApi.list(params), [range.from, range.to]);
  const products = useApi(() => productsApi.list(), []);

  const reduce = useReducedMotion();
  // After signing in, wait until the welcome overlay opens up, then play the wave.
  const [container] = useState(() => ({ hidden: {}, show: { transition: { delayChildren: welcomeDelay() + 0.05, staggerChildren: 0.07 } } }));
  const s = summary.data;
  const lowStock = (products.data || []).filter((p) => ['low', 'out'].includes(stockStatus(p))).sort((a, b) => a.stock - b.stock);
  const counts = (products.data || []).reduce((m, p) => ({ ...m, [stockStatus(p)]: (m[stockStatus(p)] || 0) + 1 }), {});
  const revExp = [
    { key: 'revenue', label: t('chart.revenue'), colorKey: 'revenue' },
    { key: 'expenses', label: t('chart.expenses'), colorKey: 'expenses' },
  ];

  return (
    <M variants={container} initial={reduce ? false : 'hidden'} animate="show">
      <M variants={item}><PageHeader title={t('dash.greeting', { name: user?.name?.split(' ')[0] || '' })} description={t('dash.desc')} actions={<DateRangeFilter value={range} onChange={setRange} />} /></M>

      {summary.error ? <Card className="mb-6"><ErrorState message={summary.error} onRetry={summary.reload} /></Card> : (
        <M variants={group} className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <M variants={item}><StatCard label={t('kpi.totalRevenue')} icon={Banknote} loading={summary.loading} value={formatMoney(s?.revenue)} change={s?.change?.revenue} hint={t('kpi.vsPrev')} /></M>
          <M variants={item}><StatCard label={t('kpi.totalExpenses')} icon={Receipt} tone="neutral" loading={summary.loading} value={formatMoney(s?.totalExpenses)} change={s?.change?.totalExpenses} invert hint={t('kpi.goodsOpex')} /></M>
          <M variants={item}><StatCard label={t('kpi.netProfit')} icon={Wallet} loading={summary.loading} value={formatMoney(s?.netProfit)} change={s?.change?.netProfit} hint={s ? t('kpi.margin', { n: s.margin }) : ''} /></M>
          <M variants={item}><StatCard label={t('kpi.totalProducts')} icon={Package} tone="neutral" loading={summary.loading} value={formatNumber(s?.totalProducts)} hint={s ? t('kpi.unitsSoldPeriod', { n: formatNumber(s.unitsSold) }) : ''} /></M>
          <M variants={item}><StatCard label={t('kpi.inventoryValue')} icon={Boxes} tone="neutral" loading={summary.loading} value={formatMoney(s?.inventoryValue)} hint={t('kpi.atUnitCost')} /></M>
          <M variants={item}><StatCard label={t('kpi.lowStock')} icon={PackageX} tone={s?.lowStockCount ? 'warning' : 'neutral'} loading={summary.loading} value={formatNumber(s?.lowStockCount)}
            hint={s ? t('kpi.outOfStock', { n: s.outOfStockCount }) : ''} /></M>
        </M>
      )}

      <M variants={group} className="mb-6 grid gap-4 xl:grid-cols-3">
        <M variants={item} className="xl:col-span-2"><Card className="h-full">
          <CardHeader title={t('an.revVsExp')} subtitle={t('dash.dailySelected')} action={<Legend items={[{ label: t('chart.revenue'), color: c.revenue }, { label: t('chart.expenses'), color: c.expenses }]} />} />
          <div className="px-2 pb-4 pt-2">
            {series.loading ? <Skeleton className="mx-3 h-[280px]" /> : series.error ? <ErrorState message={series.error} onRetry={series.reload} />
              : <MoneyTrendChart data={series.data} series={revExp} />}
          </div>
        </Card></M>
        <M variants={item}><Card className="h-full">
          <CardHeader title={t('dash.inventoryOverview')} subtitle={t('dash.productsTracked', { n: products.data?.length ?? '—' })} action={<Link to="/inventory" className="text-xs font-medium text-brand-600 dark:text-brand-400">{t('common.viewAll')}</Link>} />
          <div className="grid grid-cols-2 gap-3 p-5">
            {['ok', 'low', 'out', 'over'].map((k) => (
              <div key={k} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
                <p className="num text-xl font-semibold">{products.loading ? '—' : counts[k] || 0}</p>
                <div className="mt-1"><StockBadge status={k} /></div>
              </div>
            ))}
          </div>
          <div className="border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-500"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> {t('dash.needsAttention')}</p>
            {products.loading ? <Skeleton className="h-16" /> : lowStock.length === 0 ? <p className="text-sm text-zinc-500">{t('dash.allStocked')}</p> : (
              <ul className="space-y-1.5">
                {lowStock.slice(0, 4).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{p.name}</span>
                    <span className="num shrink-0 text-zinc-500">{t('dash.minLabel', { stock: p.stock, min: p.minStock })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card></M>
      </M>

      <M variants={item}><Card className="mb-6">
        <CardHeader title={t('kpi.netProfit')} subtitle={t('dash.netProfitSub')} action={<Legend items={[{ label: t('chart.netProfit'), color: c.profit }]} />} />
        <div className="px-2 pb-4 pt-2">
          {series.loading ? <Skeleton className="mx-3 h-[220px]" /> : series.error ? <ErrorState message={series.error} onRetry={series.reload} />
            : <MoneyTrendChart data={series.data} height={220} series={[{ key: 'profit', label: t('chart.netProfit'), colorKey: 'profit' }]} />}
        </div>
      </Card></M>

      <M variants={group} className="grid gap-4 xl:grid-cols-3">
        <M variants={item}><Card className="h-full">
          <CardHeader title={t('dash.salesPerf')} subtitle={s ? t('dash.ordersAvg', { n: formatNumber(s.orders), v: formatMoney(s.avgOrderValue) }) : t('dash.ordersPerDay')} />
          <div className="px-2 pb-4 pt-2">
            {series.loading ? <Skeleton className="mx-3 h-[220px]" /> : series.data && <CountBarChart data={series.data} dataKey="orders" label={t('chart.orders')} />}
          </div>
        </Card></M>
        <M variants={item} className="xl:col-span-2"><Card className="h-full overflow-hidden">
          <CardHeader title={t('dash.recentSales')} action={<Link to="/sales" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400">{t('dash.allSales')} <ArrowRight className="h-3 w-3" /></Link>} />
          <div className="mt-3">
            {sales.loading ? <TableSkeleton rows={5} cols={4} /> : sales.error ? <ErrorState message={sales.error} onRetry={sales.reload} /> : !sales.data?.length ? <EmptyState title={t('dash.noSales')} /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('th.invoice')}</th><th>{t('th.product')}</th><th className="text-right">{t('th.qty')}</th><th className="text-right">{t('th.total')}</th><th>{t('th.date')}</th></tr></thead>
                  <tbody>
                    {sales.data.slice(0, 6).map((x) => (
                      <tr key={x.id}>
                        <td className="font-medium text-zinc-900 dark:text-zinc-100">{x.invoiceNo}</td>
                        <td className="max-w-[220px] truncate">{x.productName}</td>
                        <td className="num text-right">{x.quantity}</td>
                        <td className="num text-right font-medium text-zinc-900 dark:text-zinc-100">{formatMoney(x.total)}</td>
                        <td className="text-zinc-500">{formatDateTime(x.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card></M>
      </M>
    </M>
  );
}
