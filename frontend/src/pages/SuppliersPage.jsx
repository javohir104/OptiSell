import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { HandCoins, PackagePlus, Pencil, Plus, Search, Trash2, Truck, Undo2, Wallet } from 'lucide-react';
import { suppliersApi } from '../api/suppliers.api';
import { productsApi } from '../api/products.api';
import { getErrorMessage } from '../api/axios';
import { useApi } from '../hooks/useApi';
import { useDebounce } from '../hooks/useDebounce';
import { useI18n } from '../i18n';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, StatCard, TableSkeleton } from '../components/common/ui';
import Modal, { ConfirmDialog } from '../components/common/Modal';
import { PaymentForm } from './CustomersPage';
import { currencyLabel, formatDate, formatMoney, formatNumber } from '../utils/format';
import { cn } from '../utils/cn';
import { haptic } from '../telegram';
import { allowsFraction, cleanQty, validQty } from '../utils/units';

function SupplierForm({ open, onClose, initial, onSaved }) {
  const { t } = useI18n();
  const blank = { name: '', phone: '', company: '', note: '' };
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setForm(initial ? { ...blank, ...initial } : blank); setErr(''); } }, [open, initial]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setErr(t('err.nameRequired'));
    setSaving(true);
    try {
      const saved = initial ? await suppliersApi.update(initial.id, form) : await suppliersApi.create(form);
      onSaved(saved);
      onClose();
    } catch (e2) { setErr(getErrorMessage(e2)); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? t('sup.edit') : t('sup.add')} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="supplier-form" loading={saving}>{t('common.save')}</Button></>}>
      <form id="supplier-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input label={t('cust.name')} value={form.name} onChange={set('name')} autoFocus />
        <Input label={t('sup.company')} value={form.company} onChange={set('company')} />
        <Input label={t('field.phone')} type="tel" placeholder="+998 90 123 45 67" value={form.phone} onChange={set('phone')} />
        <Input label={`${t('cart.note')} (${t('common.optional')})`} value={form.note} onChange={set('note')} />
        {err && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
      </form>
    </Modal>
  );
}

function PurchaseForm({ open, onClose, supplier, onSaved }) {
  const { t } = useI18n();
  const products = useApi(() => productsApi.list(), [open], { enabled: open });
  const [lines, setLines] = useState([]);
  const [paid, setPaid] = useState('');
  const [updateCost, setUpdateCost] = useState(true);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setLines([{ productId: '', quantity: '', unitCost: '' }]); setPaid(''); setNote(''); setErr(''); setUpdateCost(true); } }, [open]);

  const list = products.data || [];
  const setLine = (i, k, v) => setLines((ls) => ls.map((l, j) => {
    if (j !== i) return l;
    const next = { ...l, [k]: v };
    if (k === 'productId') { const p = list.find((x) => String(x.id) === String(v)); if (p && !l.unitCost) next.unitCost = String(p.cost); }
    return next;
  }));
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    const items = lines.filter((l) => l.productId);
    if (!items.length) return setErr(t('err.chooseProduct'));
    const unitOf = (l) => list.find((p) => String(p.id) === String(l.productId))?.unit;
    if (items.some((l) => !validQty(Number(l.quantity), unitOf(l)))) return setErr(t('err.qtyWhole'));
    if (items.some((l) => l.unitCost === '' || Number(l.unitCost) < 0)) return setErr(t('err.cost'));
    if (new Set(items.map((l) => l.productId)).size !== items.length) return setErr(t('err.chooseProduct'));
    if (paid !== '' && Number(paid) > total) return setErr(`≤ ${formatMoney(total)}`);
    setSaving(true);
    try {
      const purchase = await suppliersApi.purchase(supplier.id, { items, paid, updateCost, note });
      haptic('success');
      toast.success(t('sup.received', { n: formatNumber(purchase.units) }));
      onSaved(purchase);
      onClose();
    } catch (e2) { setErr(getErrorMessage(e2)); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={supplier ? t('sup.purchaseTitle', { name: supplier.name }) : ''} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="purchase-form" loading={saving}>{t('common.save')} · {formatMoney(total)}</Button></>}>
      <form id="purchase-form" onSubmit={submit} className="space-y-4" noValidate>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_90px_130px_auto]">
            <Select className="col-span-2 sm:col-span-1" aria-label={t('field.product')} value={l.productId} onChange={(e) => setLine(i, 'productId', e.target.value)} disabled={products.loading}>
              <option value="">{products.loading ? t('common.loading') : t('common.selectProduct')}</option>
              {list.map((p) => <option key={p.id} value={p.id}>{p.name} ({t('sales.left', { n: p.stock })})</option>)}
            </Select>
            {(() => { const unit = list.find((p) => String(p.id) === String(l.productId))?.unit; return (
              <input className="input num" inputMode={allowsFraction(unit) ? 'decimal' : 'numeric'} placeholder={allowsFraction(unit) ? `${t('field.quantity')} (${unit})` : t('field.quantity')} aria-label={t('field.quantity')} value={l.quantity} onChange={(e) => setLine(i, 'quantity', cleanQty(e.target.value, unit))} />
            ); })()}
            <input className="input num" inputMode="decimal" placeholder={t('sup.unitCost')} aria-label={t('sup.unitCost')} value={l.unitCost} onChange={(e) => setLine(i, 'unitCost', e.target.value.replace(/[^\d.]/g, ''))} />
            <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label={t('cart.remove')}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <button type="button" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400" onClick={() => setLines((ls) => [...ls, { productId: '', quantity: '', unitCost: '' }])}>{t('sup.addLine')}</button>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={`${t('sup.paidNow')} (${currencyLabel()})`} type="number" min="0" placeholder={formatMoney(total)} value={paid} onChange={(e) => setPaid(e.target.value)} hint={t('sup.paidNowHint')} />
          <Input label={`${t('cart.note')} (${t('common.optional')})`} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-zinc-300" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} /> {t('sup.updateCost')}</label>
        {err && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
      </form>
    </Modal>
  );
}

function SupplierDetail({ id, open, onClose, onChanged }) {
  const { t } = useI18n();
  const detail = useApi(() => (id ? suppliersApi.get(id) : Promise.resolve(null)), [id], { enabled: !!id });
  const [buying, setBuying] = useState(false);
  const [paying, setPaying] = useState(false);
  const s = detail.data;
  const changed = () => { detail.reload(); onChanged(); };
  const cancel = async (p) => {
    try { await suppliersApi.cancelPurchase(s.id, p.id); changed(); } catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <Modal open={open} onClose={onClose} title={s?.name || t('common.loading')} description={[s?.company, s?.phone].filter(Boolean).join(' · ')} size="lg">
      {detail.loading && !s ? <TableSkeleton rows={4} cols={3} /> : detail.error ? <ErrorState message={detail.error} onRetry={detail.reload} /> : s && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50"><p className="text-xs text-zinc-500">{t('sup.owed')}</p><p className={cn('num text-lg font-semibold', s.balance > 0 && 'text-red-600 dark:text-red-400')}>{formatMoney(s.balance)}</p></div>
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50"><p className="text-xs text-zinc-500">{t('sup.purchased')}</p><p className="num text-lg font-semibold">{formatMoney(s.totalPurchased)}</p></div>
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50"><p className="text-xs text-zinc-500">{t('cust.payments')}</p><p className="num text-lg font-semibold">{formatMoney(s.totalPaid)}</p></div>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button icon={PackagePlus} onClick={() => setBuying(true)}>{t('sup.newPurchase')}</Button>
            <Button variant="secondary" icon={HandCoins} onClick={() => setPaying(true)} disabled={s.balance <= 0}>{t('sup.pay')}</Button>
          </div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">{t('sup.purchases')}</p>
          {!s.purchases.length ? <EmptyState title={t('sup.noPurchases')} /> : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {s.purchases.map((p) => (
                <li key={p.id} className={cn('flex items-center justify-between gap-3 py-2.5', p.status === 'cancelled' && 'opacity-50')}>
                  <div className="min-w-0">
                    <p className="font-medium">{formatDate(p.purchasedAt)}{p.status === 'cancelled' && <Badge tone="danger" className="ml-2">{t('sup.cancelled')}</Badge>}{p.debt > 0 && p.status !== 'cancelled' && <Badge tone="warning" className="ml-2">{t('sup.debtShort', { sum: formatMoney(p.debt) })}</Badge>}</p>
                    <p className="truncate text-xs text-zinc-500">{p.items.map((it) => `${it.productName} × ${it.quantity}`).join(', ')}{p.note ? ` — ${p.note}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="num font-semibold">{formatMoney(p.total)}</span>
                    {p.status !== 'cancelled' && <Button variant="ghost" size="icon" onClick={() => cancel(p)} title={t('sup.cancelPurchase')} aria-label={t('sup.cancelPurchase')}><Undo2 className="h-4 w-4" /></Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {s.payments.length > 0 && (
            <>
              <p className="mb-1.5 mt-4 text-xs font-medium uppercase tracking-wider text-zinc-400">{t('cust.payments')}</p>
              <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                {s.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 py-2"><span>{formatDate(p.paidAt)} · {t(`pay.${p.method}`)}{p.note ? ` · ${p.note}` : ''}</span><span className="num font-medium">−{formatMoney(p.amount)}</span></li>
                ))}
              </ul>
            </>
          )}
          <PurchaseForm open={buying} onClose={() => setBuying(false)} supplier={s} onSaved={changed} />
          <PaymentForm open={paying} onClose={() => setPaying(false)} title={t('sup.payTitle', { name: s.name })} max={s.balance}
            onSubmit={async (p) => { await suppliersApi.pay(s.id, p); toast.success(t('cust.paid', { sum: formatMoney(p.amount) })); changed(); }} />
        </>
      )}
    </Modal>
  );
}

export default function SuppliersPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const { data, loading, error, reload } = useApi(() => suppliersApi.list({ search: q || undefined }), [q]);
  const [form, setForm] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => data?.items || [], [data]);

  const remove = async () => {
    setBusy(true);
    try { await suppliersApi.remove(deleting.id); setDeleting(null); reload(); } catch (err) { toast.error(getErrorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title={t('sup.title')} description={t('sup.desc')} actions={<Button icon={Plus} onClick={() => setForm({})}>{t('sup.add')}</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label={t('sup.totalOwed')} icon={Wallet} tone="warning" loading={loading} value={formatMoney(data?.summary.totalOwed ?? 0)} />
        <StatCard label={t('sup.title')} icon={Truck} tone="neutral" loading={loading} value={formatNumber(data?.summary.suppliers ?? 0)} />
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-zinc-100 p-3 dark:border-zinc-800">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input className="input h-9 pl-9" placeholder={t('cust.searchPh')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('cust.searchPh')} />
          </div>
        </div>
        {loading && !data ? <TableSkeleton rows={5} /> : error ? <ErrorState message={error} onRetry={reload} /> : !rows.length ? (
          <EmptyState icon={Truck} title={t('sup.none')} message={t('sup.noneMsg')} action={<Button size="sm" icon={Plus} onClick={() => setForm({})}>{t('sup.add')}</Button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('cust.name')}</th><th>{t('field.phone')}</th><th>{t('sup.purchases')}</th><th className="text-right">{t('sup.purchased')}</th><th className="text-right">{t('sup.owed')}</th><th /></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="row-click" onClick={() => setOpenId(s.id)}>
                    <td className="font-medium text-zinc-900 dark:text-zinc-100">{s.name}{s.company && <span className="block text-xs font-normal text-zinc-500">{s.company}</span>}</td>
                    <td className="num text-zinc-500">{s.phone || '—'}</td>
                    <td className="text-zinc-500">{formatNumber(s.purchasesCount)}{s.lastPurchaseAt ? ` · ${formatDate(s.lastPurchaseAt)}` : ''}</td>
                    <td className="num text-right">{formatMoney(s.totalPurchased)}</td>
                    <td className={cn('num text-right font-semibold', s.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500')}>{formatMoney(s.balance)}</td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => setForm(s)} aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(s)} aria-label={t('common.delete')}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <SupplierForm open={!!form} onClose={() => setForm(null)} initial={form?.id ? form : null} onSaved={() => reload()} />
      <SupplierDetail id={openId} open={!!openId} onClose={() => setOpenId(null)} onChanged={reload} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} loading={busy}
        title={t('sup.deleteTitle')} message={deleting?.name || ''} />
    </>
  );
}
