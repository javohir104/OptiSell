import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarDays, Layers, Pencil, Plus, Receipt, Search, Trash2, Wallet } from 'lucide-react';
import { expensesApi } from '../api/expenses.api';
import { analyticsApi } from '../api/analytics.api';
import { getErrorMessage } from '../api/axios';
import { useApi } from '../hooks/useApi';
import { useDebounce } from '../hooks/useDebounce';
import { useI18n } from '../i18n';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton, StatCard, TableSkeleton } from '../components/common/ui';
import Modal, { ConfirmDialog } from '../components/common/Modal';
import Pagination, { usePagination } from '../components/common/Pagination';
import DateRangeFilter, { rangeFromPreset } from '../components/common/DateRangeFilter';
import { RankingBarChart } from '../components/charts/charts';
import { currencyLabel, formatDate, formatMoney, formatNumber, toDayKey } from '../utils/format';

export const DEFAULT_EXPENSE_CATEGORIES = ['Rent', 'Salaries', 'Utilities', 'Marketing', 'Supplies', 'Transport', 'Taxes', 'Maintenance', 'Other'];
const EMPTY = { category: '', amount: '', date: '', note: '' };

function ExpenseForm({ open, onClose, initial, categories, onSaved }) {
  const { t, td } = useI18n();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial
      ? { category: initial.category, amount: String(initial.amount), date: toDayKey(initial.date), note: initial.note || '' }
      : { ...EMPTY, date: toDayKey(new Date()) });
    setErrors({}); setServerError('');
  }, [open, initial]);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); setServerError(''); };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = {};
    if (!form.category.trim()) e.category = t('exp.errCategory');
    if (!(Number(form.amount) > 0)) e.amount = t('exp.errAmount');
    if (!form.date) e.date = t('exp.errDate');
    else if (form.date > toDayKey(new Date())) e.date = t('exp.errFuture');
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const payload = { category: form.category.trim(), amount: Number(form.amount), date: form.date, note: form.note.trim() };
      const saved = initial ? await expensesApi.update(initial.id, payload) : await expensesApi.create(payload);
      toast.success(initial ? t('exp.updated') : t('exp.added'));
      onSaved(saved, !!initial);
      onClose();
    } catch (err) { setServerError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? t('exp.edit') : t('exp.add')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="expense-form" loading={saving}>{initial ? t('common.saveChanges') : t('exp.add')}</Button></>}>
      <form id="expense-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div>
          <Input label={t('field.category')} name="category" list="expense-categories" value={form.category} onChange={set('category')} error={errors.category} autoFocus />
          <datalist id="expense-categories">{categories.map((c) => <option key={c} value={c} label={td(c)} />)}</datalist>
        </div>
        <Input label={`${t('field.amount')} (${currencyLabel()})`} name="amount" type="number" min="0" step="1" value={form.amount} onChange={set('amount')} error={errors.amount} />
        <Input label={t('field.date')} name="date" type="date" max={toDayKey(new Date())} value={form.date} onChange={set('date')} error={errors.date} />
        <Input label={t('field.note')} name="note" placeholder={t('exp.notePh')} value={form.note} onChange={set('note')} />
        {serverError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2 dark:bg-red-500/10 dark:text-red-400" role="alert">{serverError}</p>}
      </form>
    </Modal>
  );
}

export default function ExpensesPage() {
  const { t, td } = useI18n();
  const [range, setRange] = useState(rangeFromPreset('30d'));
  const params = { from: range.from, to: range.to };
  const { data, loading, error, reload, setData } = useApi(() => expensesApi.list(params), [range.from, range.to]);
  const summary = useApi(() => analyticsApi.summary(params), [range.from, range.to]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [form, setForm] = useState({ open: false, expense: null });
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const q = useDebounce(search).toLowerCase();

  const list = data || [];
  const categories = useMemo(() => [...new Set([...DEFAULT_EXPENSE_CATEGORIES, ...list.map((e) => e.category)])].sort(), [list]);
  const rows = useMemo(() => list.filter((e) => (!category || e.category === category)
    && (!q || e.category.toLowerCase().includes(q) || td(e.category).toLowerCase().includes(q)
      || (e.note || '').toLowerCase().includes(q) || (td(e.note) || '').toLowerCase().includes(q))), [list, category, q, td]);
  const pager = usePagination(rows, 12, `${q}|${category}|${range.from}|${range.to}`);

  const stats = useMemo(() => {
    const total = list.reduce((s, e) => s + e.amount, 0);
    const byCat = Object.values(list.reduce((m, e) => {
      m[e.category] = m[e.category] || { category: e.category, amount: 0, count: 0 };
      m[e.category].amount += e.amount; m[e.category].count += 1;
      return m;
    }, {})).sort((a, b) => b.amount - a.amount);
    const days = Math.max(1, Math.round((new Date(range.to) - new Date(range.from)) / 86400000) + 1);
    return { total, count: list.length, perDay: total / days, byCat, top: byCat[0] };
  }, [list, range.from, range.to]);

  const onSaved = (saved, isEdit) => {
    const inRange = toDayKey(saved.date) >= range.from && toDayKey(saved.date) <= range.to;
    setData((d) => {
      const rest = (d || []).filter((e) => e.id !== saved.id);
      return (inRange ? [saved, ...rest] : rest).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    });
    if (!inRange) toast(t('exp.outsideRange'), { icon: 'ℹ️' });
    if (isEdit || inRange) summary.reload();
  };

  const remove = async () => {
    setBusy(true);
    try {
      await expensesApi.remove(deleting.id);
      setData((d) => d.filter((e) => e.id !== deleting.id));
      toast.success(t('exp.deleted')); setDeleting(null); summary.reload();
    } catch (e) { toast.error(getErrorMessage(e)); } finally { setBusy(false); }
  };

  const s = summary.data;
  return (
    <>
      <PageHeader title={t('exp.title')} description={t('exp.desc')}
        actions={<><DateRangeFilter value={range} onChange={setRange} /><Button icon={Plus} onClick={() => setForm({ open: true, expense: null })}>{t('exp.add')}</Button></>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('exp.opex')} icon={Receipt} loading={loading} value={formatMoney(stats.total)}
          change={summary.loading ? null : s?.change?.operatingExpenses} invert hint={t('kpi.vsPrev')} />
        <StatCard label={t('exp.entries')} icon={Layers} tone="neutral" loading={loading} value={formatNumber(stats.count)} hint={t('exp.categoriesN', { n: stats.byCat.length })} />
        <StatCard label={t('exp.avgDay')} icon={CalendarDays} tone="neutral" loading={loading} value={formatMoney(stats.perDay)} />
        <StatCard label={t('exp.shareRevenue')} icon={Wallet} tone="neutral" loading={summary.loading}
          value={s?.revenue ? `${((stats.total / s.revenue) * 100).toFixed(1)}%` : '—'} hint={s ? t('exp.revenueV', { v: formatMoney(s.revenue) }) : ''} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-3 dark:border-zinc-800">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input className="input h-9 pl-9" placeholder={t('exp.searchPh')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('exp.searchA11y')} />
            </div>
            <Select className="w-44" value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('field.category')}>
              <option value="">{t('common.allCategories')}</option>{categories.map((c) => <option key={c} value={c}>{td(c)}</option>)}
            </Select>
          </div>
          {loading ? <TableSkeleton rows={8} cols={4} /> : error ? <ErrorState message={error} onRetry={reload} /> : !rows.length ? (
            <EmptyState icon={Receipt} title={list.length ? t('exp.noMatch') : t('exp.noneInPeriod')}
              message={list.length ? t('exp.noMatchMsg') : t('exp.noneMsg')}
              action={list.length
                ? <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setCategory(''); }}>{t('common.clearFilters')}</Button>
                : <Button icon={Plus} onClick={() => setForm({ open: true, expense: null })}>{t('exp.add')}</Button>} />
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('th.date')}</th><th>{t('th.category')}</th><th>{t('th.note')}</th><th className="text-right">{t('th.amount')}</th><th><span className="sr-only">{t('th.actions')}</span></th></tr></thead>
                  <tbody>
                    {pager.visible.map((e) => (
                      <tr key={e.id}>
                        <td className="text-zinc-500">{formatDate(e.date)}</td>
                        <td><Badge>{td(e.category)}</Badge></td>
                        <td className="max-w-[260px] truncate">{td(e.note) || <span className="text-zinc-400">—</span>}</td>
                        <td className="num text-right font-medium text-zinc-900 dark:text-zinc-100">{formatMoney(e.amount)}</td>
                        <td className="text-right">
                          <Button variant="ghost" size="icon" aria-label={t('exp.editA11y', { name: td(e.note) || td(e.category) })} onClick={() => setForm({ open: true, expense: e })}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" aria-label={t('exp.deleteA11y', { name: td(e.note) || td(e.category) })} className="hover:!text-red-600" onClick={() => setDeleting(e)}><Trash2 className="h-4 w-4" /></Button>
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

        <Card>
          <CardHeader title={t('exp.byCategory')} subtitle={stats.top ? t('exp.largest', { c: td(stats.top.category) }) : t('exp.selectedPeriod')} />
          <div className="px-2 pb-4 pt-2">
            {loading ? <Skeleton className="mx-3 h-56" /> : error ? null : !stats.byCat.length ? <EmptyState title={t('common.noData')} /> : (
              <>
                <RankingBarChart data={stats.byCat.map((c) => ({ ...c, label: td(c.category) }))} nameKey="label" valueKey="amount" colorKey="expenses" valueLabel={t('exp.spent')} />
                <ul className="mt-3 space-y-1.5 px-3 text-sm">
                  {stats.byCat.map((c) => (
                    <li key={c.category} className="flex items-center justify-between gap-2">
                      <button type="button" className="truncate text-left text-zinc-600 hover:text-brand-600 dark:text-zinc-400" onClick={() => setCategory(c.category === category ? '' : c.category)}>
                        {td(c.category)} <span className="text-xs text-zinc-400">· {c.count}</span>
                      </button>
                      <span className="num shrink-0 font-medium">{formatMoney(c.amount)} <span className="text-xs font-normal text-zinc-400">{stats.total ? `${Math.round((c.amount / stats.total) * 100)}%` : ''}</span></span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Card>
      </div>

      <ExpenseForm open={form.open} initial={form.expense} categories={categories} onClose={() => setForm({ open: false, expense: null })} onSaved={onSaved} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} loading={busy} title={t('exp.deleteTitle')}
        message={deleting ? t('exp.deleteMsg', { cat: td(deleting.category), amount: formatMoney(deleting.amount), date: formatDate(deleting.date) }) : ''} />
    </>
  );
}
