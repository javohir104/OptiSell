import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { KeyRound, Lock, Plus, Power, Trash2, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { staffApi } from '../api/staff.api';
import { getErrorMessage } from '../api/axios';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, TableSkeleton } from '../components/common/ui';
import Modal, { ConfirmDialog } from '../components/common/Modal';
import DateRangeFilter, { rangeFromPreset } from '../components/common/DateRangeFilter';
import { hasFeature } from '../utils/plans';
import { formatDateTime, formatMoney, formatNumber } from '../utils/format';

const pwOk = (p) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

function StaffForm({ open, onClose, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setForm({ name: '', email: '', password: '', phone: '' }); setErrors({}); } }, [open]);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = t('err.nameRequired');
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = t('err.email');
    if (!pwOk(form.password)) errs.password = t('reg.errPw');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const s = await staffApi.create(form);
      toast.success(t('staff.created', { email: s.email }), { duration: 6000 });
      onSaved(s);
      onClose();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('staff.add')} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" form="staff-form" loading={saving}>{t('common.add')}</Button></>}>
      <form id="staff-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input label={t('cust.name')} value={form.name} onChange={set('name')} error={errors.name} autoFocus />
        <Input label={t('field.email')} type="email" autoComplete="off" value={form.email} onChange={set('email')} error={errors.email} />
        <Input label={t('field.password')} type="text" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint={t('reg.errPw')} />
        <Input label={`${t('field.phone')} (${t('common.optional')})`} type="tel" value={form.phone} onChange={set('phone')} />
      </form>
    </Modal>
  );
}

function PasswordModal({ seller, onClose }) {
  const { t } = useI18n();
  const [pw, setPw] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setPw(''), [seller]);
  const save = async () => {
    if (!pwOk(pw)) { toast.error(t('reg.errPw')); return; }
    setSaving(true);
    try { await staffApi.update(seller.id, { password: pw }); toast.success(t('staff.passwordSet')); onClose(); } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };
  return (
    <Modal open={!!seller} onClose={onClose} title={`${t('staff.resetPassword')} · ${seller?.name || ''}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={saving} onClick={save}>{t('common.save')}</Button></>}>
      <Input label={t('staff.resetPassword')} type="text" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint={t('reg.errPw')} autoFocus />
    </Modal>
  );
}

export default function StaffPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const allowed = hasFeature(user, 'staff');
  const { data, loading, error, reload, setData } = useApi(() => staffApi.list(), []);
  const [range, setRange] = useState(rangeFromPreset('30d'));
  const stats = useApi(() => staffApi.stats(range), [range.from, range.to]);
  const [adding, setAdding] = useState(false);
  const [pwFor, setPwFor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const items = data?.items || [];
  const limit = data?.limit ?? 0;

  const toggle = async (s) => {
    try {
      const u = await staffApi.update(s.id, { isActive: !s.isActive });
      setData((d) => ({ ...d, items: d.items.map((x) => (x.id === u.id ? u : x)) }));
    } catch (err) { toast.error(getErrorMessage(err)); }
  };
  const remove = async () => {
    setBusy(true);
    try { await staffApi.remove(deleting.id); setDeleting(null); reload(); stats.reload(); } catch (err) { toast.error(getErrorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title={t('staff.title')} description={t('staff.desc')}
        actions={allowed ? <Button icon={UserPlus} onClick={() => setAdding(true)} disabled={limit !== null && items.length >= limit}>{t('staff.add')}</Button> : null} />

      {!allowed && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="flex items-center gap-2"><Lock className="h-4 w-4 shrink-0" /> {t('staff.lockedText')}</p>
          <Link to="/billing" className="btn btn-primary btn-sm">{t('lock.upgrade', { plan: 'Max' })}</Link>
        </div>
      )}

      <Card className="mb-6 overflow-hidden">
        <CardHeader title={t('staff.title')} subtitle={allowed && limit !== null ? t('staff.limit', { n: items.length, limit }) : undefined} />
        <div className="mt-3">
          {loading ? <TableSkeleton rows={3} /> : error ? <ErrorState message={error} onRetry={reload} /> : !items.length ? (
            <EmptyState icon={Users} title={t('staff.none')} message={t('staff.noneMsg')} action={allowed ? <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>{t('staff.add')}</Button> : null} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('cust.name')}</th><th>{t('field.email')}</th><th>{t('th.status')}</th><th>{t('staff.lastActive')}</th><th /></tr></thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id}>
                      <td className="font-medium text-zinc-900 dark:text-zinc-100">{s.name}{s.phone && <span className="block text-xs font-normal text-zinc-500">{s.phone}</span>}</td>
                      <td className="text-zinc-500">{s.email}</td>
                      <td><Badge tone={s.isActive ? 'success' : 'neutral'}>{s.isActive ? t('staff.active') : t('staff.disabled')}</Badge></td>
                      <td className="text-zinc-500">{s.lastActiveAt ? formatDateTime(s.lastActiveAt) : '—'}</td>
                      <td className="whitespace-nowrap text-right">
                        <Button variant="ghost" size="icon" onClick={() => setPwFor(s)} title={t('staff.resetPassword')} aria-label={t('staff.resetPassword')}><KeyRound className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => toggle(s)} title={s.isActive ? t('staff.disable') : t('staff.enable')} aria-label={s.isActive ? t('staff.disable') : t('staff.enable')}><Power className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(s)} aria-label={t('common.delete')}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title={t('staff.stats')} action={<DateRangeFilter value={range} onChange={setRange} />} />
        <div className="mt-3">
          {stats.loading ? <TableSkeleton rows={3} /> : stats.error ? <ErrorState message={stats.error} onRetry={stats.reload} /> : !stats.data?.length ? <EmptyState title={t('common.noData')} /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('sales.seller')}</th><th className="text-right">{t('sales.orders')}</th><th className="text-right">{t('th.units')}</th><th className="text-right">{t('sales.aov')}</th><th className="text-right">{t('sales.discounts')}</th><th className="text-right">{t('th.revenue')}</th></tr></thead>
                <tbody>
                  {stats.data.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.name}{r.isOwner && <Badge className="ml-2">{t('staff.owner')}</Badge>}</td>
                      <td className="num text-right">{formatNumber(r.orders)}</td>
                      <td className="num text-right">{formatNumber(r.units)}</td>
                      <td className="num text-right">{formatMoney(r.aov)}</td>
                      <td className="num text-right text-zinc-500">{formatMoney(r.discounts)}</td>
                      <td className="num text-right font-semibold">{formatMoney(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <StaffForm open={adding} onClose={() => setAdding(false)} onSaved={() => { reload(); stats.reload(); }} />
      <PasswordModal seller={pwFor} onClose={() => setPwFor(null)} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} loading={busy}
        title={t('staff.deleteTitle')} message={deleting ? t('staff.deleteMsg', { name: deleting.name }) : ''} />
    </>
  );
}
