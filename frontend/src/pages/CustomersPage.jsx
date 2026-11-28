import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, HandCoins, MessageSquareText, Pencil, Phone, Plus, Search, Trash2, Users, Wallet } from 'lucide-react';
import { customersApi } from '../api/customers.api';
import { getErrorMessage } from '../api/axios';
import { useApi } from '../hooks/useApi';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, StatCard, TableSkeleton } from '../components/common/ui';
import Modal, { ConfirmDialog } from '../components/common/Modal';
import Pagination, { usePagination } from '../components/common/Pagination';
import { isStaff } from '../utils/plans';
import { currencyLabel, formatDate, formatDateTime, formatMoney, formatNumber } from '../utils/format';
import { cn } from '../utils/cn';
import { haptic } from '../telegram';

const PHONE_RE = /^\+?[0-9 ()-]{7,30}$/;

function CustomerForm({ open, onClose, initial, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', phone: '', note: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setForm(initial ? { name: initial.name, phone: initial.phone, note: initial.note } : { name: '', phone: '', note: '' }); setErrors({}); } }, [open, initial]);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = t('err.nameRequired');
    if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) errs.phone = t('profile.errPhone');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const saved = initial ? await customersApi.update(initial.id, form) : await customersApi.create(form);
      toast.success(t('cust.saved'));
      onSaved(saved);
      onClose();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? t('cust.edit') : t('cust.add')} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="customer-form" loading={saving}>{t('common.save')}</Button></>}>
      <form id="customer-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input label={t('cust.name')} name="name" value={form.name} onChange={set('name')} error={errors.name} autoFocus />
        <Input label={t('field.phone')} name="phone" type="tel" placeholder="+998 90 123 45 67" value={form.phone} onChange={set('phone')} error={errors.phone} />
        <Input label={`${t('cart.note')} (${t('common.optional')})`} name="note" value={form.note} onChange={set('note')} />
      </form>
    </Modal>
  );
}

/** Take a debt payment (seller accounts can do this too). */
export function PaymentForm({ open, onClose, title, max, onSubmit }) {
  const { t } = useI18n();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setAmount(''); setMethod('cash'); setNote(''); setErr(''); } }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0)) return setErr(t('err.price'));
    if (max != null && n > max) return setErr(`≤ ${formatMoney(max)}`);
    setSaving(true);
    try { await onSubmit({ amount: n, method, note }); onClose(); } catch (e2) { setErr(getErrorMessage(e2)); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="pay-form" loading={saving}>{t('common.save')}</Button></>}>
      <form id="pay-form" onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Input label={`${t('billing.amount')} (${currencyLabel()})`} type="number" min="0" value={amount} onChange={(e) => { setAmount(e.target.value); setErr(''); }} autoFocus />
          {max != null && max > 0 && <button type="button" className="mt-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-400" onClick={() => setAmount(String(max))}>{t('cust.payAll')}: {formatMoney(max)}</button>}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {['cash', 'card', 'transfer'].map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)}
              className={cn('rounded-lg border px-2 py-2 text-xs font-medium', method === m ? 'border-brand-600 bg-brand-600 text-white' : 'border-zinc-200 dark:border-zinc-700')}>{t(`pay.${m}`)}</button>
          ))}
        </div>
        <Input label={`${t('cart.note')} (${t('common.optional')})`} value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
      </form>
    </Modal>
  );
}

function CustomerDetail({ id, open, onClose, onChanged }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const owner = !isStaff(user);
  const detail = useApi(() => (id ? customersApi.get(id) : Promise.resolve(null)), [id], { enabled: !!id });
  const [paying, setPaying] = useState(false);
  const [tab, setTab] = useState('sales');
  const c = detail.data;

  const remind = () => {
    const text = t('cust.remindText', { name: c.name, shop: user?.businessName || 'OptiSell', sum: formatMoney(c.balance) });
    window.location.href = `sms:${c.phone.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(text)}`;
  };
  const undo = async (p) => {
    try { await customersApi.removePayment(c.id, p.id); detail.reload(); onChanged(); } catch (err) { toast.error(getErrorMessage(err)); }
  };

  return (
    <Modal open={open} onClose={onClose} title={c?.name || t('common.loading')} description={c?.phone} size="lg">
      {detail.loading && !c ? <TableSkeleton rows={4} cols={3} /> : detail.error ? <ErrorState message={detail.error} onRetry={detail.reload} /> : c && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50"><p className="text-xs text-zinc-500">{c.balance >= 0 ? t('cust.balance') : t('cust.advance')}</p><p className={cn('num text-lg font-semibold', c.balance > 0 && 'text-red-600 dark:text-red-400')}>{formatMoney(Math.abs(c.balance))}</p></div>
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50"><p className="text-xs text-zinc-500">{t('cust.totalDebt')}</p><p className="num text-lg font-semibold">{formatMoney(c.totalDebt)}</p></div>
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50"><p className="text-xs text-zinc-500">{t('cust.due')}</p><p className={cn('text-lg font-semibold', c.isOverdue && 'text-red-600 dark:text-red-400')}>{c.nextDueDate ? formatDate(c.nextDueDate) : '—'}</p></div>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button icon={HandCoins} onClick={() => setPaying(true)} disabled={c.balance <= 0}>{t('cust.pay')}</Button>
            {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="btn btn-secondary"><Phone className="h-4 w-4" /> {t('support.call')}</a>}
            {c.phone && c.balance > 0 && <Button variant="secondary" icon={MessageSquareText} onClick={remind}>{t('cust.remind')}</Button>}
          </div>
          <div className="mb-3 flex gap-1 border-b border-zinc-100 dark:border-zinc-800">
            {[['sales', t('cust.purchases'), c.sales.length], ['payments', t('cust.payments'), c.payments.length]].map(([k, label, n]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === k ? 'border-brand-600 text-brand-700 dark:text-brand-400' : 'border-transparent text-zinc-500')}>{label} <span className="text-zinc-400">{n}</span></button>
            ))}
          </div>
          {tab === 'sales' ? (!c.sales.length ? <EmptyState title={t('cust.noSales')} /> : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {c.sales.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium">{s.invoiceNo} <Badge tone={s.paymentMethod === 'debt' ? 'warning' : 'neutral'} className="ml-1">{t(`pay.${s.paymentMethod}`)}</Badge>{s.status !== 'completed' && <Badge tone="danger" className="ml-1">{t(`sales.status.${s.status}`)}</Badge>}</p>
                    <p className="truncate text-xs text-zinc-500">{formatDateTime(s.createdAt)} · {s.items.map((it) => `${it.productName} × ${it.quantity}`).join(', ')}</p>
                    {s.paymentMethod === 'debt' && s.dueDate && <p className="text-xs text-zinc-500">{t('cart.dueDate')}: {formatDate(s.dueDate)}</p>}
                  </div>
                  <div className="text-right">
                    <p className="num font-semibold">{formatMoney(s.total)}</p>
                    {s.debtRemaining > 0 && <p className="num text-xs text-red-600 dark:text-red-400">{t('sales.debtLeft')}: {formatMoney(s.debtRemaining)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )) : (!c.payments.length ? <EmptyState title={t('cust.noPayments')} /> : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {c.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div><p className="font-medium">{formatDateTime(p.paidAt)} · {t(`pay.${p.method}`)}</p><p className="text-xs text-zinc-500">{[p.receivedBy, p.note].filter(Boolean).join(' · ')}</p></div>
                  <div className="flex items-center gap-2">
                    <span className="num font-semibold text-emerald-700 dark:text-emerald-400">+{formatMoney(p.amount)}</span>
                    {owner && <Button variant="ghost" size="icon" onClick={() => undo(p)} aria-label={t('cust.deletePayment')} title={t('cust.deletePayment')}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </li>
              ))}
            </ul>
          ))}
          <PaymentForm open={paying} onClose={() => setPaying(false)} title={t('cust.payTitle', { name: c.name })} max={c.balance}
            onSubmit={async (p) => { await customersApi.pay(c.id, p); haptic('success'); toast.success(t('cust.paid', { sum: formatMoney(p.amount) })); detail.reload(); onChanged(); }} />
        </>
      )}
    </Modal>
  );
}

export default function CustomersPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const owner = !isStaff(user);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const { data, loading, error, reload } = useApi(() => customersApi.list({ search: q || undefined, status }), [q, status]);
  const [form, setForm] = useState(null); // null | {} (new) | customer
  const [openId, setOpenId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => data?.items || [], [data]);
  const pager = usePagination(rows, 20, `${q}|${status}`);
  const s = data?.summary;

  const remove = async () => {
    setBusy(true);
    try { await customersApi.remove(deleting.id); setDeleting(null); reload(); } catch (err) { toast.error(getErrorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title={t('cust.title')} description={t('cust.desc')} actions={<Button icon={Plus} onClick={() => setForm({})}>{t('cust.add')}</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('cust.totalDebt')} icon={Wallet} loading={loading} value={formatMoney(s?.totalDebt ?? 0)} hint={t('cust.overdueN', { n: formatNumber(s?.debtors ?? 0) })} />
        <StatCard label={t('cust.overdue')} icon={AlertTriangle} tone="warning" loading={loading} value={formatMoney(s?.overdueAmount ?? 0)} hint={t('cust.overdueN', { n: formatNumber(s?.overdue ?? 0) })} />
        <StatCard label={t('cust.customers')} icon={Users} tone="neutral" loading={loading} value={formatNumber(s?.customers ?? 0)} />
        <StatCard label={t('cust.debtors')} icon={HandCoins} tone="neutral" loading={loading} value={formatNumber(s?.debtors ?? 0)} />
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-zinc-100 p-3 dark:border-zinc-800">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input className="input h-9 pl-9" placeholder={t('cust.searchPh')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('cust.searchPh')} />
          </div>
          <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
            {[['all', t('cust.all')], ['debtors', t('cust.debtors')], ['overdue', t('cust.overdue')]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setStatus(k)} className={cn('rounded-md px-3 py-1.5 text-xs font-medium', status === k ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500')}>{label}</button>
            ))}
          </div>
        </div>
        {loading && !data ? <TableSkeleton rows={6} /> : error ? <ErrorState message={error} onRetry={reload} /> : !rows.length ? (
          <EmptyState icon={Users} title={t('cust.none')} message={t('cust.noneMsg')} action={<Button size="sm" icon={Plus} onClick={() => setForm({})}>{t('cust.add')}</Button>} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('cust.name')}</th><th>{t('field.phone')}</th><th>{t('cust.due')}</th><th>{t('cust.lastSale')}</th><th className="text-right">{t('cust.balance')}</th>{owner && <th />}</tr></thead>
                <tbody>
                  {pager.visible.map((c) => (
                    <tr key={c.id} className="row-click" onClick={() => setOpenId(c.id)}>
                      <td className="font-medium text-zinc-900 dark:text-zinc-100">{c.name}{c.isOverdue && <Badge tone="danger" className="ml-2">{t('cust.overdueBadge')}</Badge>}</td>
                      <td className="num text-zinc-500">{c.phone || '—'}</td>
                      <td className={cn(c.isOverdue ? 'text-red-600 dark:text-red-400' : 'text-zinc-500')}>{c.nextDueDate ? formatDate(c.nextDueDate) : '—'}</td>
                      <td className="text-zinc-500">{c.lastSaleAt ? formatDate(c.lastSaleAt) : '—'}</td>
                      <td className={cn('num text-right font-semibold', c.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500')}>{formatMoney(c.balance)}</td>
                      {owner && (
                        <td className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" onClick={() => setForm(c)} aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleting(c)} aria-label={t('common.delete')}><Trash2 className="h-4 w-4" /></Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pager} />
          </>
        )}
      </Card>

      <CustomerForm open={!!form} onClose={() => setForm(null)} initial={form?.id ? form : null} onSaved={() => reload()} />
      <CustomerDetail id={openId} open={!!openId} onClose={() => setOpenId(null)} onChanged={reload} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} loading={busy}
        title={t('cust.deleteTitle')} message={deleting ? t('cust.deleteMsg', { name: deleting.name }) : ''} />
    </>
  );
}
