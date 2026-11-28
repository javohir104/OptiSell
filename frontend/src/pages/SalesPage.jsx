import { useMemo, useState } from 'react';
import { Banknote, BadgePercent, Plus, Receipt, Search, ShoppingCart, TrendingUp, Undo2 } from 'lucide-react';
import { salesApi } from '../api/sales.api';
import { productsApi } from '../api/products.api';
import { useApi } from '../hooks/useApi';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Select, StatCard, TableSkeleton } from '../components/common/ui';
import DateRangeFilter, { rangeFromPreset } from '../components/common/DateRangeFilter';
import Pagination, { usePagination } from '../components/common/Pagination';
import NewSaleModal from '../components/sales/NewSaleModal';
import SaleDetail, { ReturnModal, STATUS_TONE } from '../components/sales/SaleDetail';
import ReceiptModal from '../components/sales/Receipt';
import { isStaff } from '../utils/plans';
import { formatDateTime, formatMoney, formatNumber } from '../utils/format';

const PAYMENTS = ['cash', 'card', 'transfer', 'debt'];

export default function SalesPage() {
  const { t, td } = useI18n();
  const { user } = useAuth();
  const owner = !isStaff(user);
  const [range, setRange] = useState(rangeFromPreset('30d'));
  const [productId, setProductId] = useState('');
  const [showReturned, setShowReturned] = useState(false);
  const { data, loading, error, reload, setData } = useApi(
    () => salesApi.listSales({ from: range.from, to: range.to }),
    [range.from, range.to],
  );
  const stats = useApi(() => (owner ? salesApi.statistics(range) : Promise.resolve(null)), [range.from, range.to, owner]);
  const products = useApi(() => productsApi.list(), []);
  const [search, setSearch] = useState('');
  const [payment, setPayment] = useState('');
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [returning, setReturning] = useState(null);
  const q = useDebounce(search).toLowerCase();

  const rows = useMemo(() => (data || []).filter((s) => (showReturned || s.status === 'completed')
    && (!payment || s.paymentMethod === payment)
    && (!productId || s.items.some((it) => String(it.productId) === String(productId)) || s.returns.some((r) => r.items.some((it) => String(it.productId) === String(productId))))
    && (!q || s.invoiceNo.toLowerCase().includes(q) || s.items.some((it) => String(it.productName).toLowerCase().includes(q))
      || s.customer.toLowerCase().includes(q) || td(s.customer).toLowerCase().includes(q) || s.sellerName.toLowerCase().includes(q))), [data, q, payment, productId, showReturned, td]);

  const totals = useMemo(() => {
    const done = rows.filter((s) => s.status === 'completed');
    const revenue = done.reduce((s, x) => s + x.total, 0);
    const profit = done.reduce((s, x) => s + (x.profit ?? 0), 0);
    return { revenue, profit, orders: done.length, units: done.reduce((s, x) => s + x.units, 0), aov: done.length ? revenue / done.length : 0 };
  }, [rows]);
  const pager = usePagination(rows, 15, `${q}|${payment}|${productId}|${range.from}|${range.to}|${showReturned}`);
  const filtered = q || payment || productId;

  const replace = (sale) => {
    setData((d) => (d || []).map((s) => (s.id === sale.id ? sale : s)));
    setDetail(sale);
    stats.reload();
    products.reload();
  };

  return (
    <>
      <PageHeader title={t('sales.title')} description={t('sales.desc')}
        actions={<><DateRangeFilter value={range} onChange={setRange} /><Button icon={Plus} onClick={() => setOpen(true)}>{t('sales.recordBtn')}</Button></>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('kpi.revenue')} icon={Banknote} loading={loading} value={formatMoney(totals.revenue)} hint={t('sales.unitsN', { n: formatNumber(totals.units) })} />
        {owner
          ? <StatCard label={t('kpi.grossProfit')} icon={TrendingUp} loading={loading} value={formatMoney(totals.profit)} hint={totals.revenue ? t('kpi.margin', { n: ((totals.profit / totals.revenue) * 100).toFixed(1) }) : ''} />
          : <StatCard label={t('sales.orders')} icon={ShoppingCart} tone="neutral" loading={loading} value={formatNumber(totals.orders)} />}
        {owner
          ? <StatCard label={t('sales.discounts')} icon={BadgePercent} tone="warning" loading={stats.loading} value={formatMoney(stats.data?.discounts ?? 0)} hint={t('sales.discountsHint', { n: stats.data?.discountedSales ?? 0 })} />
          : <StatCard label={t('sales.aov')} icon={Receipt} tone="neutral" loading={loading} value={formatMoney(totals.aov)} />}
        {owner
          ? <StatCard label={t('sales.returns')} icon={Undo2} tone="neutral" loading={stats.loading} value={formatMoney(stats.data?.returnsAmount ?? 0)} hint={t('sales.returnsHint', { n: stats.data?.returnsCount ?? 0 })} />
          : null}
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-zinc-100 p-3 dark:border-zinc-800">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input className="input h-9 pl-9" placeholder={t('sales.searchPh')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('sales.searchA11y')} />
          </div>
          <Select className="w-52" value={productId} onChange={(e) => setProductId(e.target.value)} aria-label={t('field.product')} disabled={products.loading}>
            <option value="">{t('common.allProducts')}</option>
            {(products.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select className="w-44" value={payment} onChange={(e) => setPayment(e.target.value)} aria-label={t('sales.payMethod')}>
            <option value="">{t('sales.allPayments')}</option>{PAYMENTS.map((m) => <option key={m} value={m}>{t(`pay.${m}`)}</option>)}
          </Select>
          <label className="flex items-center gap-2 px-1 text-sm text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" className="h-4 w-4 rounded border-zinc-300" checked={showReturned} onChange={(e) => setShowReturned(e.target.checked)} />
            {t('sales.showReturned')}
          </label>
        </div>
        {loading ? <TableSkeleton rows={8} /> : error ? <ErrorState message={error} onRetry={reload} /> : !rows.length ? <EmptyState icon={ShoppingCart} title={t('sales.noneFound')} message={t('sales.noneMsg')}
          action={filtered ? <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setPayment(''); setProductId(''); }}>{t('common.clearFilters')}</Button> : null} /> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('th.invoice')}</th><th>{t('th.date')}</th><th>{t('sales.items')}</th><th>{t('th.customer')}</th><th>{t('th.payment')}</th>{owner && <th>{t('sales.seller')}</th>}<th className="text-right">{t('th.total')}</th></tr></thead>
                <tbody>
                  {pager.visible.map((s) => (
                    <tr key={s.id} className="row-click" onClick={() => setDetail(s)}>
                      <td className="font-medium text-zinc-900 dark:text-zinc-100">
                        {s.invoiceNo}
                        {s.status !== 'completed' && <Badge tone={STATUS_TONE[s.status]} className="ml-2">{t(`sales.status.${s.status}`)}</Badge>}
                        {s.status === 'completed' && s.returned > 0 && <Badge tone="warning" className="ml-2">{t('sales.partlyReturned')}</Badge>}
                      </td>
                      <td className="text-zinc-500">{formatDateTime(s.createdAt)}</td>
                      <td className="max-w-[240px] truncate">
                        {s.items.length ? s.items.map((it) => it.productName).join(', ') : s.returns.flatMap((r) => r.items.map((it) => it.productName)).join(', ')}
                      </td>
                      <td>{td(s.customer)}</td>
                      <td><Badge tone={s.paymentMethod === 'debt' ? 'warning' : 'neutral'}>{t(`pay.${s.paymentMethod}`)}</Badge></td>
                      {owner && <td className="text-zinc-500">{s.sellerName || '—'}</td>}
                      <td className="num text-right font-medium text-zinc-900 dark:text-zinc-100">
                        {formatMoney(s.total)}
                        {s.discount > 0 && <span className="block text-xs font-normal text-emerald-600">−{formatMoney(s.discount)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pager} />
          </>
        )}
      </Card>

      <NewSaleModal open={open} onClose={() => setOpen(false)} onCreated={(sale, { offline }) => {
        if (sale) { setData((d) => [sale, ...(d || [])]); setReceipt(sale); }
        if (!offline) stats.reload();
        products.reload();
      }} />
      <SaleDetail sale={detail} open={!!detail} onClose={() => setDetail(null)}
        onReceipt={() => setReceipt(detail)} onReturn={() => setReturning(detail)} />
      <ReturnModal sale={returning} open={!!returning} onClose={() => setReturning(null)} onReturned={replace} />
      <ReceiptModal sale={receipt} open={!!receipt} onClose={() => setReceipt(null)} />
    </>
  );
}
