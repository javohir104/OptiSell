import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Bell, Camera, Crown, KeyRound, Lock, Save, Send, Trash2 } from 'lucide-react';
import { profileApi } from '../api/profile.api';
import ShopLocationCard from '../components/map/ShopLocationCard';
import { telegramApi } from '../api/telegram.api';
import { useApi } from '../hooks/useApi';
import SupportCard from '../components/common/SupportCard';
import { hasFeature, isStaff } from '../utils/plans';
import { openLink } from '../telegram';
import { getErrorMessage } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { Badge, Button, Card, CardHeader, Input, PageHeader } from '../components/common/ui';
import Avatar, { resizeImage } from '../components/common/Avatar';
import { PLAN_LABEL, daysLeft } from '../utils/plans';
import { formatDate } from '../utils/format';
import { haptic } from '../telegram';

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? 'bg-brand-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

/** Connect the shop's Telegram chat for the daily report and low-stock alerts (Max plan). */
function TelegramCard() {
  const { user, setUser, refreshUser } = useAuth();
  const { t } = useI18n();
  const allowed = hasFeature(user, 'telegram');
  const status = useApi(() => (allowed ? telegramApi.status() : Promise.resolve(null)), [allowed]);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState('');
  const st = status.data;
  const connected = st?.connected ?? user?.telegramConnected;

  const run = async (key, fn, ok) => {
    setBusy(key);
    try { await fn(); if (ok) toast.success(ok); } catch (err) { toast.error(getErrorMessage(err)); } finally { setBusy(''); }
  };
  const connect = () => run('link', async () => {
    const { url, configured } = await telegramApi.link();
    if (!configured || !url) { toast.error(t('tg.notConfigured')); return; }
    openLink(url);
    setWaiting(true);
  });
  const check = () => run('check', async () => { await status.reload(); await refreshUser(); setWaiting(false); });
  const disconnect = () => run('unlink', async () => { await telegramApi.unlink(); await status.reload(); await refreshUser(); }, t('tg.disconnected'));
  const setFlag = (k) => (v) => run(k, async () => { const { user: u } = await profileApi.update({ [k]: v }); setUser(u); });

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Bell className="h-4 w-4" /> {t('tg.title')}</span>}
        subtitle={t('tg.desc', { hour: st?.reportHour ?? 21 })}
        action={allowed ? <Badge tone={connected ? 'success' : 'neutral'}>{connected ? t('tg.connected') : t('tg.notConnected')}</Badge> : <Badge tone="warning" icon={Lock}>Max</Badge>} />
      <div className="space-y-3 p-5">
        {!allowed ? (
          <Link to="/billing" className="btn btn-primary w-full">{t('lock.upgrade', { plan: 'Max' })}</Link>
        ) : st && !st.configured ? (
          <p className="text-sm text-zinc-500">{t('tg.notConfigured')}</p>
        ) : connected ? (
          <>
            <Toggle label={t('tg.daily')} checked={user?.notifyDailyReport !== false} onChange={setFlag('notifyDailyReport')} disabled={!!busy} />
            <Toggle label={t('tg.lowStock')} checked={user?.notifyLowStock !== false} onChange={setFlag('notifyLowStock')} disabled={!!busy} />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="secondary" loading={busy === 'test'} onClick={() => run('test', telegramApi.test, t('tg.sent'))}>{t('tg.test')}</Button>
              <Button size="sm" variant="secondary" loading={busy === 'report'} onClick={() => run('report', telegramApi.report, t('tg.sent'))}>{t('tg.reportNow')}</Button>
              <Button size="sm" variant="ghost" loading={busy === 'unlink'} onClick={disconnect}>{t('tg.disconnect')}</Button>
            </div>
          </>
        ) : (
          <>
            <Button className="w-full" icon={Send} loading={busy === 'link'} onClick={connect}>{t('tg.connect')}</Button>
            {waiting && (
              <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">
                <p>{t('tg.openBot')}</p>
                <Button size="sm" className="mt-2" loading={busy === 'check'} onClick={check}>{t('tg.checkAgain')}</Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

const PHONE_RE = /^\+?[0-9 ()-]{7,30}$/;

function PersonalCard() {
  const { user, setUser } = useAuth();
  const { t } = useI18n();
  const fileRef = useRef(null);
  const fromUser = (u) => ({ firstName: u?.firstName || '', lastName: u?.lastName || '', phone: u?.phone || '', businessName: u?.businessName || '' });
  const [form, setForm] = useState(fromUser(user));
  const [avatar, setAvatar] = useState(user?.avatarUrl || '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(fromUser(user)); setAvatar(user?.avatarUrl || ''); }, [user]);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  const dirty = JSON.stringify(form) !== JSON.stringify(fromUser(user)) || avatar !== (user?.avatarUrl || '');

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast.error(t('profile.photoTooBig')); return; }
    try {
      setAvatar(await resizeImage(file));
    } catch {
      toast.error(t('profile.photoBad'));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.firstName.trim()) errs.firstName = t('profile.errFirstName');
    if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) errs.phone = t('profile.errPhone');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const { user: updated } = await profileApi.update({ ...form, avatarUrl: avatar });
      setUser(updated);
      haptic('success');
      toast.success(t('profile.saved'));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t('profile.personal')} subtitle={t('profile.personalSub')} />
      <form onSubmit={save} className="space-y-5 p-5" noValidate>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar user={user} src={avatar || null} className="h-20 w-20 text-xl" />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
            <Button variant="secondary" size="sm" icon={Camera} onClick={() => fileRef.current?.click()}>{avatar ? t('profile.changePhoto') : t('profile.uploadPhoto')}</Button>
            {avatar && <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setAvatar('')}>{t('profile.removePhoto')}</Button>}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('field.firstName')} name="firstName" autoComplete="given-name" value={form.firstName} onChange={set('firstName')} error={errors.firstName} />
          <Input label={t('field.lastName')} name="lastName" autoComplete="family-name" value={form.lastName} onChange={set('lastName')} />
          <Input label={t('field.phone')} name="phone" type="tel" autoComplete="tel" placeholder="+998 90 123 45 67" value={form.phone} onChange={set('phone')} error={errors.phone} />
          {!isStaff(user) && <Input label={t('field.businessName')} name="businessName" autoComplete="organization" value={form.businessName} onChange={set('businessName')} />}
          <Input label={t('field.email')} name="email" value={user?.email || ''} disabled hint={t('profile.emailHint')} className="sm:col-span-2" />
        </div>
        <div className="flex justify-end">
          <Button type="submit" icon={Save} loading={saving} disabled={!dirty}>{t('common.save')}</Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const { t } = useI18n();
  const empty = { current: '', next: '', confirm: '' };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.current) errs.current = t('profile.errCurrent');
    if (form.next.length < 8 || !/[A-Za-z]/.test(form.next) || !/\d/.test(form.next)) errs.next = t('reg.errPw');
    if (form.confirm !== form.next) errs.confirm = t('reg.errConfirm');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await profileApi.changePassword({ currentPassword: form.current, newPassword: form.next });
      setForm(empty);
      toast.success(t('profile.passwordChanged'));
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'WRONG_PASSWORD') setErrors({ current: t('profile.wrongPassword') });
      else toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t('profile.password')} subtitle={t('profile.passwordSub')} />
      <form onSubmit={submit} className="space-y-4 p-5" noValidate>
        <Input label={t('profile.currentPassword')} name="current" type="password" autoComplete="current-password" value={form.current} onChange={set('current')} error={errors.current} />
        <Input label={t('profile.newPassword')} name="next" type="password" autoComplete="new-password" value={form.next} onChange={set('next')} error={errors.next} />
        <Input label={t('field.confirmPassword')} name="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" icon={KeyRound} loading={saving}>{t('profile.changePassword')}</Button>
        </div>
      </form>
    </Card>
  );
}

function SubscriptionCard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const sub = user?.subscription;
  if (!sub) return null;
  const paid = sub.plan !== 'free';
  return (
    <Card className="card-pad">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <Crown className="h-4 w-4 text-brand-600 dark:text-brand-400" /> {t('billing.current')}
            <Badge tone={paid ? 'success' : 'neutral'}>{PLAN_LABEL[sub.plan]}</Badge>
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {sub.unlimited ? t('billing.adminUnlimited') : paid ? t('billing.activeUntil', { date: formatDate(sub.expiresAt), n: daysLeft(sub.expiresAt) }) : t('billing.freeDescNew')}
          </p>
        </div>
        <Link to="/billing" className="btn btn-primary">{paid ? t('billing.manage') : t('billing.upgrade')}</Link>
      </div>
    </Card>
  );
}

export default function ProfilePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const staff = isStaff(user);
  return (
    <>
      <PageHeader title={t('profile.title')} description={staff ? t('staff.youAreSeller', { shop: user?.businessName || 'OptiSell' }) : t('profile.desc')} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2"><PersonalCard />{!staff && <ShopLocationCard />}{!staff && <TelegramCard />}</div>
        <div className="space-y-6">{!staff && <SubscriptionCard />}<PasswordCard /><SupportCard /></div>
      </div>
    </>
  );
}
