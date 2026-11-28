import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDownLeft, ArrowUpRight, Boxes, PackagePlus, ShoppingCart, ClipboardCheck } from 'lucide-react';
import { productsApi } from '../api/products.api';
import { inventoryApi } from '../api/inventory.api';
import { getErrorMessage } from '../api/axios';
import { useApi } from '../hooks/useApi';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, Select, StatCard, TableSkeleton } from '../components/common/ui';
import Modal from '../components/common/Modal';
import StockBadge from '../components/common/StockBadge';
import { formatDateTime, formatMoney, formatNumber } from '../utils/format';
import { stockStatus } from '../utils/stock';
import { cn } from '../utils/cn';
import { allowsFraction, validQty } from '../utils/units';
import ReorderCard from '../components/inventory/ReorderCard';

const MOVE = {
  in: { label: 'inv.in', tone: 'success', icon: ArrowDownLeft },
  out: { label: 'inv.out', tone: 'danger', icon: ArrowUpRight },
  sale: { label: 'inv.sale', tone: 'neutral', icon: ShoppingCart },
};

/** Notes like "INV-10023 (import)" keep the invoice number and translate the suffix. */
function moveNote(note, td) {
  if (!note) return '';
  const m = /^(INV-\d+) \(import\)$/.exec(note);
  return m ? `${m[1]} (${td('import')})` : td(note);
}

function AdjustModal({ open, onClose, products, preset, onDone }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ productId: '', type: 'in', quantity: '', note: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const key = `${open}-${preset?.id}`;
  const [lastKey, setLastKey] = useState('');
  if (open && key !== lastKey) { setLastKey(key); setForm({ productId: preset?.id || '', type: 'in', quantity: '', note: '' }); setErr(''); }

  const submit = async (e) => {
    e.preventDefault();
    const q = Number(form.quantity);
    if (!form.productId) return setErr(t('err.chooseProduct'));
    const unit = (products || []).find((p) => String(p.id) === String(form.productId))?.unit;
    if (!validQty(q, unit)) return setErr(t('err.qtyWhole'));
    setSaving(true);
    try {
      const res = await inventoryApi.adjust({ ...form, quantity: q });
      toast.success(form.type === 'in' ? t('inv.added') : t('inv.removed'));
      onDone(res); onClose();
    } catch (e2) { setErr(getErrorMessage(e2)); } finally { setSaving(false); }
  };
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErr(''); };

  return (
    <Modal open={open} onClose={onClose} title={t('inv.adjust')} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="adjust-form" loading={saving}>{t('common.save')}</Button></>}>
      <form id="adjust-form" onSubmit={submit} className="space-y-4" noValidate>
        <Select label={t('field.product')} value={form.productId} onChange={set('productId')}>
          <option value="">{t('common.selectProduct')}</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} {p.unit})</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-2">
          {['in', 'out'].map((ty) => (
            <button key={ty} type="button" onClick={() => setForm((f) => ({ ...f, type: ty }))}
              className={cn('rounded-lg border px-3 py-2 text-sm font-medium', form.type === ty ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400' : 'border-zinc-200 dark:border-zinc-700')}>
              {ty === 'in' ? t('inv.addRestock') : t('inv.removeWriteoff')}
            </button>
          ))}
        </div>
        <Input label={t('field.quantity')} type="number" min="0" step={allowsFraction((products || []).find((p) => String(p.id) === String(form.productId))?.unit) ? '0.001' : '1'} value={form.quantity} onChange={set('quantity')} />
        <Input label={t('field.note')} placeholder={form.type === 'in' ? t('inv.notePhIn') : t('inv.notePhOut')} value={form.note} onChange={set('note')} />
        {err && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
      </form>
    </Modal>
  );
}

export default function InventoryPage() {
  const { t, td } = useI18n();
  const products = useApi(() => productsApi.list(), []);
  const moves = useApi(() => inventoryApi.movements({ limit: 100 }), []);
  const [filter, setFilter] = useState('attention');
  const [moveType, setMoveType] = useState('');
  const [adjust, setAdjust] = useState({ open: false, product: null });

  const list = products.data || [];
  const stats = useMemo(() => ({
    value: list.reduce((s, p) => s + p.stock * p.cost, 0),
    units: list.reduce((s, p) => s + p.stock, 0),
    low: list.filter((p) => ['low', 'out'].includes(stockStatus(p))).length,
    over: list.filter((p) => stockStatus(p) === 'over').length,
  }), [list]);

  const rows = list.filter((p) => {
    const s = stockStatus(p);
    return filter === 'all' || (filter === 'attention' ? s !== 'ok' : s === filter);
  }).sort((a, b) => a.stock / (a.minStock || 1) - b.stock / (b.minStock || 1));

  const onDone = ({ product, movement }) => {
    products.setData((d) => d.map((p) => (p.id === product.id ? product : p)));
    moves.setData((m) => [movement, ...(m || [])]);
  };

  const moveRows = (moves.data || []).filter((m) => !moveType || m.type === moveType);

  return (
    <>
      <PageHeader title={t('inv.title')} description={t('inv.desc')} actions={<>
        <Link to="/inventory/count" className="btn btn-secondary"><ClipboardCheck className="h-4 w-4" /> {t('count.title')}</Link>
        <Button icon={PackagePlus} onClick={() => setAdjust({ open: true, product: null })}>{t('inv.adjust')}</Button>
      </>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('kpi.inventoryValue')} icon={Boxes} loading={products.loading} value={formatMoney(stats.value)} hint={t('inv.atUnitCost')} />
        <StatCard label={t('inv.unitsOnHand')} tone="neutral" loading={products.loading} value={formatNumber(stats.units)} hint={t('inv.productsN', { n: list.length })} />
        <StatCard label={t('inv.lowOut')} tone="warning" loading={products.loading} value={formatNumber(stats.low)} hint={t('inv.needRestock')} />
        <StatCard label={t('inv.overstocked')} tone="neutral" loading={products.loading} value={formatNumber(stats.over)} hint={t('inv.aboveMax')} />
      </div>

      <ReorderCard products={products.data} />

      <Card className="mb-6 overflow-hidden">
        <CardHeader title={t('inv.levels')} action={
          <div className="inline-flex flex-wrap rounded-lg border border-zinc-200 p-0.5 text-xs dark:border-zinc-700" role="group">
            {[['attention', 'inv.fAttention'], ['low', 'inv.fLow'], ['out', 'inv.fOut'], ['over', 'stock.over'], ['all', 'inv.fAll']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
                className={cn('rounded-md px-2.5 py-1.5 font-medium', filter === k ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-600 dark:text-zinc-400')}>{t(l)}</button>
            ))}
          </div>} />
        <div className="mt-3">
          {products.loading ? <TableSkeleton /> : products.error ? <ErrorState message={products.error} onRetry={products.reload} /> : !rows.length ? <EmptyState title={t('inv.nothing')} message={t('inv.nothingMsg')} /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('th.product')}</th><th className="w-64">{t('th.level')}</th><th className="text-right">{t('th.stock')}</th><th className="text-right">{t('th.minMax')}</th><th>{t('th.status')}</th><th /></tr></thead>
                <tbody>
                  {rows.map((p) => {
                    const max = p.maxStock || Math.max(p.stock, p.minStock * 3, 1);
                    const pct = Math.min(100, (p.stock / max) * 100);
                    const s = stockStatus(p);
                    return (
                      <tr key={p.id}>
                        <td><p className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}</p><p className="text-xs text-zinc-500">{td(p.category)}</p></td>
                        <td>
                          <div className="relative h-2 w-56 rounded-full bg-zinc-100 dark:bg-zinc-800" title={t('inv.ofMax', { stock: p.stock, max })}>
                            <div className={cn('h-2 rounded-full', { out: 'bg-red-500', low: 'bg-amber-500', over: 'bg-sky-500', ok: 'bg-brand-500' }[s])} style={{ width: `${pct}%` }} />
                            <span className="absolute -top-0.5 h-3 w-0.5 bg-zinc-400" style={{ left: `${Math.min(100, (p.minStock / max) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="num text-right font-medium">{p.stock} <span className="text-xs font-normal text-zinc-500">{p.unit}</span></td>
                        <td className="num text-right text-zinc-500">{p.minStock} / {p.maxStock || '—'}</td>
                        <td><StockBadge status={s} /></td>
                        <td className="text-right"><Button variant="secondary" size="sm" onClick={() => setAdjust({ open: true, product: p })}>{t('inv.adjustBtn')}</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title={t('inv.history')} subtitle={t('inv.historySub')} action={
          <Select className="w-40" value={moveType} onChange={(e) => setMoveType(e.target.value)} aria-label={t('inv.moveType')}>
            <option value="">{t('inv.allMoves')}</option><option value="in">{t('inv.in')}</option><option value="out">{t('inv.out')}</option><option value="sale">{t('inv.sales')}</option>
          </Select>} />
        <div className="mt-3">
          {moves.loading ? <TableSkeleton rows={5} /> : moves.error ? <ErrorState message={moves.error} onRetry={moves.reload} /> : !moveRows.length ? <EmptyState title={t('inv.noMoves')} /> : (
            <div className="table-wrap max-h-[420px] overflow-y-auto">
              <table className="table">
                <thead className="sticky top-0"><tr><th>{t('th.date')}</th><th>{t('th.product')}</th><th>{t('th.type')}</th><th className="text-right">{t('th.change')}</th><th>{t('th.note')}</th></tr></thead>
                <tbody>
                  {moveRows.map((m) => {
                    const meta = MOVE[m.type] || MOVE.in;
                    return (
                      <tr key={m.id}>
                        <td className="text-zinc-500">{formatDateTime(m.createdAt)}</td>
                        <td className="max-w-[240px] truncate">{m.productName}</td>
                        <td><Badge tone={meta.tone} icon={meta.icon}>{t(meta.label)}</Badge></td>
                        <td className={cn('num text-right font-medium', m.quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-300')}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                        <td className="text-zinc-500">{moveNote(m.note, td)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <AdjustModal open={adjust.open} preset={adjust.product} products={list} onClose={() => setAdjust({ open: false, product: null })} onDone={onDone} />
    </>
  );
}
