import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AuthShell from '../components/layout/AuthShell';
import { Button, Input } from '../components/common/ui';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { getErrorMessage } from '../api/axios';
import GoogleButton, { OrDivider } from '../components/auth/GoogleButton';
import { playWelcome } from '../utils/welcome';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

export default function RegisterPage() {
  const { register } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', lastName: '', businessName: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = t('profile.errFirstName');
    if ((`${form.name} ${form.lastName}`).trim().length < 2) e.name = t('reg.errName');
    if (!form.businessName.trim()) e.businessName = t('reg.errBusiness');
    if (!EMAIL_RE.test(form.email)) e.email = t('err.email');
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) e.password = t('reg.errPw');
    if (form.confirm !== form.password) e.confirm = t('reg.errConfirm');
    setErrors(e);
    return !Object.keys(e).length;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      const fullName = [form.name.trim(), form.lastName.trim()].filter(Boolean).join(' ');
      await register({ name: fullName, firstName: form.name.trim(), lastName: form.lastName.trim(), businessName: form.businessName.trim(), email: form.email.trim(), password: form.password });
      playWelcome(form.name.trim());
      toast.success(t('reg.created'));
      navigate('/', { replace: true });
    } catch (err) {
      setServerError(getErrorMessage(err, t('reg.failed')));
    } finally {
      setSubmitting(false);
    }
  };

  const s = strength(form.password);
  const sColor = ['bg-zinc-200', 'bg-red-500', 'bg-amber-500', 'bg-brand-500', 'bg-brand-600'][s];

  return (
    <AuthShell
      title={t('reg.title')}
      subtitle={t('reg.subtitle')}
      footer={<>{t('reg.have')} <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">{t('login.submit')}</Link></>}
    >
      <GoogleButton text="signup_with"
        onSuccess={(user, { created }) => { playWelcome(user?.name?.split(' ')[0] || ''); if (created) toast.success(t('reg.created')); navigate('/', { replace: true }); }}
        onError={(err) => setServerError(getErrorMessage(err, t('auth.googleFailed')))} />
      <OrDivider />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('field.firstName')} name="name" autoComplete="given-name" value={form.name} onChange={set('name')} error={errors.name} />
          <Input label={t('field.lastName')} name="lastName" autoComplete="family-name" value={form.lastName} onChange={set('lastName')} />
        </div>
        <Input label={t('field.businessName')} name="businessName" autoComplete="organization" value={form.businessName} onChange={set('businessName')} error={errors.businessName} />
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-300">🎁 {t('reg.trialNote')}</p>
        <Input label={t('field.workEmail')} name="email" type="email" autoComplete="email" placeholder="you@company.com" value={form.email} onChange={set('email')} error={errors.email} />
        <div>
          <Input label={t('field.password')} name="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} />
          {form.password && (
            <div className="mt-2 flex gap-1" aria-hidden="true">
              {[1, 2, 3, 4].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= s ? sColor : 'bg-zinc-200 dark:bg-zinc-800'}`} />)}
            </div>
          )}
        </div>
        <Input label={t('field.confirmPassword')} name="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
        {serverError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400" role="alert">{serverError}</p>}
        <Button type="submit" className="h-10 w-full" loading={submitting}>{t('reg.submit')}</Button>
      </form>
    </AuthShell>
  );
}
