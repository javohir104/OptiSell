/**
 * Sales forecast ("AI" section). No AI service: the numbers come from simple statistics on past
 * sales (src/utils/forecast.js). Data comes from the shop's own sales or an uploaded Excel / CSV.
 */
import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CalendarDays, Database, Download, FileSpreadsheet, LineChart, Package, Sparkles, TrendingUp, UploadCloud, Wallet, X,
} from 'lucide-react';
import { productsApi } from '../api/products.api';
import { salesApi } from '../api/sales.api';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Select, Skeleton, StatCard } from '../components/common/ui';
import { ForecastChart, Legend, useChartColors } from '../components/charts/charts';
import { buildForecast, dayKey, rowsFromSheet } from '../utils/forecast';
import { parseSpreadsheet } from '../utils/xlsx';
import { downloadText, toCsv } from '../utils/csv';
import { formatMoney, formatNumber } from '../utils/format';
import { cn } from '../utils/cn';

const HORIZONS = [7, 14, 30];
const HISTORY_DAYS = 90;

function SourceButton({ active, icon: Icon, title, text, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('press flex flex-1 items-start gap-3 rounded-xl border p-4 text-left transition',
        active ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500 dark:bg-brand-500/10'
          : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60')}>
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg',
        active ? 'bg-brand-600 text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300')}>
        <Icon className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</span>
        <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{text}</span>
      </span>
    </button>
  );
}

function TrendBadge({ pct }) {
  const { t } = useI18n();
  if (pct == null) return <Badge>{t('fc.trendNew')}</Badge>;
  if (Math.abs(pct) < 5) return <Badge>{t('fc.trendFlat')}</Badge>;
  return pct > 0
    ? <Badge tone="success">▲ {pct.toFixed(0)}%</Badge>
    : <Badge tone="danger">▼ {Math.abs(pct).toFixed(0)}%</Badge>;
}

export default function ForecastPage() {
  const { t } = useI18n();
  const c = useChartColors();
  const fileRef = useRef(null);
  const [source, setSource] = useState('shop');
  const [horizon, setHorizon] = useState(14);
  const [product, setProduct] = useState('');
  const [sheet, setSheet] = useState(null); // { name, rows, skipped }
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);

  const from = useMemo(() => dayKey(Date.now() - (HISTORY_DAYS - 1) * 86_400_000), []);
  const sales = useApi(() => salesApi.list({ from }), [from], { enabled: source === 'shop' });
  const products = useApi(() => productsApi.list(), [], { enabled: source === 'shop' });

  const rows = useMemo(() => {
    if (source === 'file') return sheet?.rows ?? [];
    return (sales.data ?? []).map((s) => ({
      date: dayKey(s.createdAt),
      product: s.productName,
      quantity: s.quantity,
      revenue: s.total,
    }));
  }, [source, sheet, sales.data]);

  const stock = useMemo(() => {
    if (source !== 'shop' || !products.data) return null;
    return new Map(products.data.map((p) => [p.name, p.stock]));
  }, [source, products.data]);

  const report = useMemo(
    () => buildForecast(rows, { horizon, product, stock }),
    [rows, horizon, product, stock],
  );

  async function readFile(file) {
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      toast.error(t('fc.badType'));
      return;
    }
    setReading(true);
    try {
      const parsed = rowsFromSheet(await parseSpreadsheet(file));
      if (!parsed.rows.length) {
        toast.error(t('fc.noColumns'));
        return;
      }
      setSheet({ name: file.name, rows: parsed.rows, skipped: parsed.skipped });
      setProduct('');
      toast.success(t('fc.loaded', { n: formatNumber(parsed.rows.length) }));
    } catch (err) {
      toast.error(err.message || t('fc.badType'));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function downloadSample() {
    const names = ['Coca-Cola 1L', 'Non', "Ko'k choy"];
    const sample = [];
    for (let d = 41; d >= 0; d--) {
      const date = dayKey(Date.now() - d * 86_400_000);
      names.forEach((name, i) => sample.push({ date, product: name, quantity: 3 + ((d * (i + 2)) % 7), price: [11000, 4000, 88500][i] }));
    }
    downloadText('savdo-namuna.csv', toCsv(['date', 'product', 'quantity', 'price'], sample));
  }

  const loading = source === 'shop' && (sales.loading || products.loading);
  const error = source === 'shop' && (sales.error || products.error);
  const tot = report?.totals;
  const dayNames = [0, 1, 2, 3, 4, 5, 6].map((d) => t(`fc.day${d}`));

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">{t('fc.title')} <Sparkles className="h-5 w-5 text-brand-600 dark:text-brand-400" /></span>}
        description={t('fc.desc')}
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <SourceButton active={source === 'shop'} icon={Database} title={t('fc.srcShop')} text={t('fc.srcShopText')} onClick={() => { setSource('shop'); setProduct(''); }} />
        <SourceButton active={source === 'file'} icon={FileSpreadsheet} title={t('fc.srcFile')} text={t('fc.srcFileText')} onClick={() => { setSource('file'); setProduct(''); }} />
      </div>

      {source === 'file' && (
        <Card className="mb-6">
          <div className="p-5">
            {sheet ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"><FileSpreadsheet className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{sheet.name}</p>
                  <p className="text-xs text-zinc-500">
                    {t('fc.fileRows', { n: formatNumber(sheet.rows.length) })}
                    {sheet.skipped > 0 && ` · ${t('fc.fileSkipped', { n: formatNumber(sheet.skipped) })}`}
                  </p>
                </div>
                <button type="button" className="press rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800" onClick={() => fileRef.current?.click()}>{t('fc.otherFile')}</button>
                <button type="button" aria-label={t('fc.removeFile')} className="press grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => setSheet(null)}><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div
                role="button" tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); readFile(e.dataTransfer.files?.[0]); }}
                className={cn('flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition',
                  dragging ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-500/10' : 'border-zinc-200 hover:border-brand-400 dark:border-zinc-700')}>
                <UploadCloud className={cn('mb-3 h-9 w-9', dragging ? 'text-brand-600' : 'text-zinc-400')} />
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{reading ? t('fc.reading') : t('fc.drop')}</p>
                <p className="mt-1 text-xs text-zinc-500">{t('fc.dropHint')}</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
              <span>{t('fc.columns')} <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">date</code>, <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">product</code>, <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">quantity</code>, <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">price</code> ({t('fc.optional')})</span>
              <button type="button" onClick={downloadSample} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline dark:text-brand-400"><Download className="h-3.5 w-3.5" /> {t('fc.sample')}</button>
            </div>
          </div>
        </Card>
      )}

      {error ? <Card><ErrorState message={sales.error || products.error} onRetry={() => { sales.reload(); products.reload(); }} /></Card>
        : loading ? (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
            <Skeleton className="h-80" />
          </>
        ) : !report ? (
          <Card>
            <EmptyState icon={LineChart} title={t('fc.emptyTitle')}
              message={source === 'shop' ? t('fc.emptyShop') : t('fc.emptyFile')} />
          </Card>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <Select label={t('fc.product')} value={product} onChange={(e) => setProduct(e.target.value)} className="w-full sm:w-64">
                <option value="">{t('fc.allProducts')}</option>
                {report.products.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
              <div>
                <span className="label">{t('fc.horizon')}</span>
                <div className="flex gap-1.5">
                  {HORIZONS.map((h) => (
                    <button key={h} type="button" onClick={() => setHorizon(h)} aria-pressed={horizon === h}
                      className={cn('rounded-lg border px-3 py-2 text-sm font-medium transition',
                        horizon === h ? 'border-brand-600 bg-brand-600 text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300')}>
                      {t('fc.days', { n: h })}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label={t('fc.kUnits', { n: horizon })} icon={Package} value={formatNumber(Math.round(tot.units))} hint={t('fc.perDay', { n: tot.perDay.toFixed(1) })} />
              <StatCard label={t('fc.kRevenue')} icon={Wallet} value={tot.revenue ? formatMoney(tot.revenue) : '—'} hint={tot.revenue ? t('fc.kRevenueHint') : t('fc.noPrice')} />
              <StatCard label={t('fc.kTrend')} icon={TrendingUp} value={tot.trendPct == null ? '—' : `${tot.trendPct > 0 ? '+' : ''}${tot.trendPct.toFixed(1)}%`} hint={t('fc.kTrendHint')} tone="neutral" />
              <StatCard label={t('fc.kBestDay')} icon={CalendarDays} value={tot.bestDay == null ? '—' : dayNames[tot.bestDay]} hint={tot.bestDay == null ? t('fc.needWeeks') : t('fc.kBestDayHint')} tone="neutral" />
            </div>

            <Card className="mb-6">
              <CardHeader title={product || t('fc.chartAll')} subtitle={t('fc.chartSub', { n: horizon })}
                action={<Legend items={[{ label: t('chart.actual'), color: c.revenue }, { label: t('chart.forecast'), color: c.profit, dashed: true }]} />} />
              <div className="px-2 pb-4 pt-2">
                <ForecastChart history={report.history} forecast={report.forecast} height={300} />
              </div>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title={t('fc.tableTitle')} subtitle={stock ? t('fc.tableSubStock') : t('fc.tableSub')} />
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60">
                    <tr>
                      <th className="px-5 py-2.5">{t('fc.colProduct')}</th>
                      <th className="px-3 py-2.5 text-right">{t('fc.colPerDay')}</th>
                      <th className="px-3 py-2.5 text-right">{t('fc.colForecast', { n: horizon })}</th>
                      <th className="px-3 py-2.5">{t('fc.colTrend')}</th>
                      {stock && <th className="px-3 py-2.5 text-right">{t('fc.colStock')}</th>}
                      {stock && <th className="px-5 py-2.5 text-right">{t('fc.colOrder')}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {report.perProduct.map((p) => (
                      <tr key={p.product} className={cn('cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40', product === p.product && 'bg-brand-50/50 dark:bg-brand-500/5')}
                        onClick={() => setProduct(product === p.product ? '' : p.product)}>
                        <td className="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">{p.product}</td>
                        <td className="num px-3 py-3 text-right">{p.perDay.toFixed(1)}</td>
                        <td className="num px-3 py-3 text-right font-semibold">{formatNumber(Math.round(p.forecastUnits))}</td>
                        <td className="px-3 py-3"><TrendBadge pct={p.trendPct} /></td>
                        {stock && (
                          <td className="num px-3 py-3 text-right">
                            {p.stock == null ? '—' : formatNumber(p.stock)}
                            {p.daysOfStock != null && p.daysOfStock < horizon && <span className="ml-1 text-xs text-amber-600">({t('fc.daysLeft', { n: Math.floor(p.daysOfStock) })})</span>}
                          </td>
                        )}
                        {stock && (
                          <td className="num px-5 py-3 text-right">
                            {p.suggestedOrder ? <Badge tone="warning">+{formatNumber(p.suggestedOrder)}</Badge> : <span className="text-xs text-emerald-600">{t('fc.enough')}</span>}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-800">{t('fc.method')}</p>
            </Card>
          </>
        )}
    </>
  );
}
