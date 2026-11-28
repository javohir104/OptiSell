import { useState } from 'react';
import { analyticsApi } from '../api/analytics.api';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '../components/common/ui';
import DateRangeFilter, { rangeFromPreset } from '../components/common/DateRangeFilter';
import { CountBarChart, Legend, MoneyTrendChart, RankingBarChart, useChartColors } from '../components/charts/charts';
import { formatMoney, formatNumber, formatPercent } from '../utils/format';

function ChartCard({ title, subtitle, action, state, children, h = 280, className }) {
  const { t } = useI18n();
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <div className="px-2 pb-4 pt-2">
        {state.loading ? <Skeleton className="mx-3" style={{ height: h }} /> : state.error ? <ErrorState message={state.error} onRetry={state.reload} />
          : !state.data?.length ? <EmptyState title={t('an.noData')} /> : children}
      </div>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { t, td } = useI18n();
  const c = useChartColors();
  const [range, setRange] = useState(rangeFromPreset('30d'));
  const p = { from: range.from, to: range.to };
  const deps = [range.from, range.to];
  const summary = useApi(() => analyticsApi.summary(p), deps);
  const ts = useApi(() => analyticsApi.timeseries(p), deps);
  const top = useApi(() => analyticsApi.topProducts({ ...p, limit: 8 }), deps);
  const worst = useApi(() => analyticsApi.topProducts({ ...p, limit: 5, sort: 'asc' }), deps);
  const cats = useApi(() => analyticsApi.categories(p), deps);
  const s = summary.data;
  const revenue = { key: 'revenue', label: t('chart.revenue'), colorKey: 'revenue' };

  return (
    <>
      <PageHeader title={t('an.title')} description={t('an.desc')} actions={<DateRangeFilter value={range} onChange={setRange} />} />
      {summary.error ? <Card className="mb-6"><ErrorState message={summary.error} onRetry={summary.reload} /></Card> : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t('kpi.revenue')} loading={summary.loading} value={formatMoney(s?.revenue)} change={s?.change?.revenue} hint={t('kpi.vsPrev')} />
          <StatCard label={t('kpi.grossProfit')} loading={summary.loading} value={formatMoney(s?.grossProfit)} change={s?.change?.grossProfit} hint={t('kpi.cogs', { v: formatMoney(s?.cogs) })} />
          <StatCard label={t('kpi.netProfit')} loading={summary.loading} value={formatMoney(s?.netProfit)} change={s?.change?.netProfit} hint={t('kpi.opex', { v: formatMoney(s?.operatingExpenses) })} />
          <StatCard label={t('kpi.netMargin')} tone="neutral" loading={summary.loading} value={formatPercent(s?.margin)} hint={t('kpi.unitsSold', { n: formatNumber(s?.unitsSold) })} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard className="xl:col-span-2" title={t('an.revenueTrend')} subtitle={t('an.dailyRevenue')} state={ts}>
          <MoneyTrendChart data={ts.data} series={[revenue]} />
        </ChartCard>
        <ChartCard title={t('an.profit')} subtitle={t('an.profitSub')} state={ts}>
          <MoneyTrendChart data={ts.data} series={[{ key: 'profit', label: t('chart.netProfit'), colorKey: 'profit' }]} area={false} height={240} />
        </ChartCard>
        <ChartCard title={t('an.salesTrend')} subtitle={t('an.unitsPerDay')} state={ts} h={240}>
          <CountBarChart data={ts.data} dataKey="units" label={t('chart.units')} height={240} colorKey="revenue" />
        </ChartCard>
        <ChartCard title={t('an.revVsExp')} state={ts} action={<Legend items={[{ label: t('chart.revenue'), color: c.revenue }, { label: t('chart.expenses'), color: c.expenses }]} />}>
          <MoneyTrendChart data={ts.data} area={false} height={240} series={[revenue, { key: 'expenses', label: t('chart.expenses'), colorKey: 'expenses' }]} />
        </ChartCard>
        <ChartCard title={t('an.byCategory')} state={cats} h={240}>
          <RankingBarChart data={(cats.data || []).map((x) => ({ ...x, category: td(x.category) }))} nameKey="category" valueKey="revenue" colorKey="profit" valueLabel={t('chart.revenue')} />
        </ChartCard>
        <ChartCard title={t('an.topProducts')} subtitle={t('an.byRevenue')} state={top}>
          <RankingBarChart data={top.data || []} nameKey="name" valueKey="revenue" valueLabel={t('chart.revenue')} />
        </ChartCard>
        <Card className="overflow-hidden">
          <CardHeader title={t('an.lowest')} subtitle={t('an.lowestSub')} />
          <div className="mt-3">
            {worst.loading ? <Skeleton className="m-5 h-40" /> : worst.error ? <ErrorState message={worst.error} onRetry={worst.reload} /> : (
              <table className="table">
                <thead><tr><th>{t('th.product')}</th><th className="text-right">{t('th.units')}</th><th className="text-right">{t('th.revenue')}</th><th className="text-right">{t('th.profit')}</th></tr></thead>
                <tbody>{(worst.data || []).map((x) => (
                  <tr key={x.productId}><td className="max-w-[200px] truncate">{x.name}</td><td className="num text-right">{x.units}</td><td className="num text-right">{formatMoney(x.revenue)}</td><td className="num text-right">{formatMoney(x.profit)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
