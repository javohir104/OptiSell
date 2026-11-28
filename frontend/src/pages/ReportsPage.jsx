import { useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarRange, CheckCircle2, FileSpreadsheet, Download } from 'lucide-react';
import { salesApi } from '../api/sales.api';
import { analyticsApi } from '../api/analytics.api';
import { productsApi } from '../api/products.api';
import { customersApi } from '../api/customers.api';
import { expensesApi } from '../api/expenses.api';
import { getErrorMessage } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { Button, Card, CardHeader, Input, PageHeader } from '../components/common/ui';
import { downloadXlsx } from '../utils/xlsxWriter';
import { hasFeature } from '../utils/plans';
import { toDayKey } from '../utils/format';
import { cn } from '../utils/cn';

const monthRange = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
};
const thisMonth = () => toDayKey(Date.now()).slice(0, 7);
const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return toDayKey(d).slice(0, 7); };
const dt = (iso) => (iso ? new Date(iso).toLocaleString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

/** One Excel file with every report for a period, ready for the accountant. */
export default function ReportsPage() {
  const { t, td } = useI18n();
  const { user } = useAuth();
  const debts = hasFeature(user, 'debts');
  const expenses = hasFeature(user, 'expenses');
  const [mode, setMode] = useState('this');
  const [custom, setCustom] = useState(() => ({ from: `${thisMonth()}-01`, to: toDayKey(Date.now()) }));
  const [parts, setParts] = useState({ summary: true, sales: true, daily: true, stock: true, debts, expenses });
  const [busy, setBusy] = useState(false);

  const range = mode === 'this' ? monthRange(thisMonth()) : mode === 'last' ? monthRange(lastMonth()) : custom;
  const toggle = (k) => setParts((p) => ({ ...p, [k]: !p[k] }));
  const pay = (m) => t(`pay.${m}`);

  const build = async () => {
    setBusy(true);
    try {
      const { from, to } = range;
      const [sales, summary, series, products, customers, exp] = await Promise.all([
        parts.sales ? salesApi.listSales({ from, to }) : null,
        parts.summary ? analyticsApi.summary({ from, to }) : null,
        parts.daily ? analyticsApi.timeseries({ from, to }) : null,
        parts.stock ? productsApi.list() : null,
        parts.debts && debts ? customersApi.list() : null,
        parts.expenses && expenses ? expensesApi.list({ from, to }) : null,
      ]);
      const sheets = [];
      if (summary) {
        sheets.push({
          name: t('reports.summary'),
          columns: [{ header: t('reports.metric'), width: 34 }, { header: t('common.total'), width: 18 }],
          rows: [
            [t('reports.period'), `${from} — ${to}`],
            [t('kpi.revenue'), summary.revenue], [t('reports.cogs'), summary.cogs], [t('kpi.grossProfit'), summary.grossProfit],
            [t('nav.expenses'), summary.operatingExpenses], [t('kpi.netProfit'), summary.netProfit],
            [t('sales.orders'), summary.orders], [t('th.units'), summary.unitsSold], [t('sales.aov'), Math.round(summary.avgOrderValue)],
            [t('kpi.inventoryValue'), summary.inventoryValue],
          ],
        });
      }
      if (sales) {
        const rows = [];
        for (const s of sales) {
          for (const it of s.items) {
            rows.push([dt(s.createdAt), s.invoiceNo, it.productName, it.sku, it.quantity, it.unit, it.unitPrice, it.discount, it.total,
              it.unitCost === null ? '' : Math.round(it.unitCost * it.quantity), it.unitCost === null ? '' : Math.round(it.total - it.unitCost * it.quantity),
              pay(s.paymentMethod), td(s.customer), s.sellerName, t(`sales.status.${s.status}`)]);
          }
        }
        sheets.push({
          name: t('nav.sales'),
          columns: [
            { header: t('th.date'), width: 17 }, { header: t('th.invoice'), width: 13 }, { header: t('th.product'), width: 28 }, { header: 'SKU', width: 12 },
            { header: t('th.qty'), width: 8 }, { header: t('field.unit'), width: 7 }, { header: t('th.price'), width: 12 }, { header: t('cart.discount'), width: 11 },
            { header: t('th.total'), width: 13 }, { header: t('th.cost'), width: 12 }, { header: t('th.profit'), width: 12 }, { header: t('th.payment'), width: 13 },
            { header: t('th.customer'), width: 18 }, { header: t('sales.seller'), width: 16 }, { header: t('th.status'), width: 12 },
          ],
          rows,
        });
      }
      if (series) {
        sheets.push({
          name: t('reports.daily'),
          columns: [{ header: t('th.date'), width: 12 }, { header: t('kpi.revenue'), width: 14 }, { header: t('reports.cogsAndExp'), width: 16 }, { header: t('kpi.netProfit'), width: 14 }, { header: t('sales.orders'), width: 10 }, { header: t('th.units'), width: 10 }],
          rows: series.map((d) => [d.date, d.revenue, d.expenses, d.profit, d.orders, d.units]),
        });
      }
      if (products) {
        sheets.push({
          name: t('reports.stock'),
          columns: [{ header: t('th.product'), width: 28 }, { header: 'SKU', width: 12 }, { header: t('field.barcode'), width: 15 }, { header: t('th.category'), width: 16 }, { header: t('th.stock'), width: 10 }, { header: t('field.unit'), width: 7 }, { header: t('th.cost'), width: 12 }, { header: t('th.price'), width: 12 }, { header: t('kpi.inventoryValue'), width: 15 }],
          rows: products.map((p) => [p.name, p.sku, p.barcode, td(p.category), p.stock, p.unit, p.cost, p.price, Math.round(p.stock * p.cost)]),
        });
      }
      if (customers) {
        sheets.push({
          name: t('nav.customers'),
          columns: [{ header: t('cust.name'), width: 24 }, { header: t('field.phone'), width: 17 }, { header: t('cust.balance'), width: 14 }, { header: t('cust.overdue'), width: 14 }, { header: t('cust.due'), width: 12 }, { header: t('cust.totalDebt'), width: 14 }, { header: t('cust.payments'), width: 14 }],
          rows: customers.items.map((c) => [c.name, c.phone, c.balance, c.overdueAmount, c.nextDueDate || '', c.totalDebt, c.totalPaid]),
        });
      }
      if (exp) {
        sheets.push({
          name: t('nav.expenses'),
          columns: [{ header: t('th.date'), width: 12 }, { header: t('th.category'), width: 20 }, { header: t('billing.amount'), width: 14 }, { header: t('cart.note'), width: 30 }],
          rows: exp.map((e) => [String(e.date).slice(0, 10), td(e.category), e.amount, e.note]),
        });
      }
      if (!sheets.length) { toast.error(t('reports.chooseSome')); return; }
      downloadXlsx(`OptiSell-${t('reports.file')}-${from}_${to}.xlsx`, sheets);
      toast.success(t('reports.ready'));
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setBusy(false); }
  };

  const PARTS = [
    ['summary', t('reports.summary')], ['sales', t('nav.sales')], ['daily', t('reports.daily')], ['stock', t('reports.stock')],
    ...(debts ? [['debts', t('nav.customers')]] : []), ...(expenses ? [['expenses', t('nav.expenses')]] : []),
  ];

  return (
    <>
      <PageHeader title={t('reports.title')} description={t('reports.desc')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><CalendarRange className="h-4 w-4" /> {t('reports.period')}</span>} />
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-3 gap-2">
              {[['this', t('reports.thisMonth')], ['last', t('reports.lastMonth')], ['custom', t('reports.custom')]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setMode(k)} className={cn('rounded-lg border px-3 py-2 text-sm font-medium transition', mode === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800')}>{l}</button>
              ))}
            </div>
            {mode === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <Input type="date" label={t('reports.from')} value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
                <Input type="date" label={t('reports.to')} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
              </div>
            )}
            <p className="num text-sm text-zinc-500">{range.from} — {range.to}</p>
          </div>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> {t('reports.sheets')}</span>} />
          <div className="space-y-2 p-5">
            {PARTS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => toggle(k)} className={cn('flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition', parts[k] ? 'border-brand-300 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10' : 'border-zinc-200 dark:border-zinc-700')}>
                <span className="font-medium">{l}</span>
                <CheckCircle2 className={cn('h-4 w-4', parts[k] ? 'text-brand-600' : 'text-zinc-300 dark:text-zinc-600')} />
              </button>
            ))}
            <Button className="mt-3 h-11 w-full" icon={Download} loading={busy} onClick={build}>{t('reports.download')}</Button>
          </div>
        </Card>
      </div>
    </>
  );
}
