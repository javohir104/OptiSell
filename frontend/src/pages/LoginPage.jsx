import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import AuthShell from '../components/layout/AuthShell';
import { Button, Input } from '../components/common/ui';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { getErrorMessage } from '../api/axios';
import GoogleButton, { OrDivider } from '../components/auth/GoogleButton';
import { playWelcome } from '../utils/welcome';

const EMAIL_RE =/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [show, setShow] = useState(false);
  const [serverError, setServerError] = useState('');

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  const validate = () => {
    const e = {};
    if (!EMAIL_RE.test(form.email)) e.email = t('err.email');
    if (!form.password) e.password = t('err.passwordRequired');
    setErrors(e);
    return !Object.keys(e).length;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      const user = await login(form.email.trim(), form.password);
      playWelcome(user?.name?.split(' ')[0] || '');
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setServerError(getErrorMessage(err, t('login.failed')));
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = (user) => {
    playWelcome(user?.name?.split(' ')[0] || '');
    navigate(location.state?.from || '/', { replace: true });
  };

  return (
    <AuthShell
      title={t('login.title')}
      subtitle={t('login.subtitle')}
      footer={<>{t('login.new')} <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">{t('login.create')}</Link></>}
    >
      <GoogleButton onSuccess={onGoogle} onError={(err) => setServerError(getErrorMessage(err, t('auth.googleFailed')))} />
      <OrDivider />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input label={t('field.email')} name="email" type="email" autoComplete="email" placeholder="you@company.com" value={form.email} onChange={set('email')} error={errors.email} />
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="label">{t('field.password')}</label>
            <Link to="/forgot-password" className="mb-1.5 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">{t('forgot.link')}</Link>
          </div>
          <div className="relative">
            <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password"
              className={`input pr-10 ${errors.password ? 'input-error' : ''}`} value={form.password} onChange={set('password')} aria-invalid={!!errors.password} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-zinc-400 hover:text-zinc-600" aria-label={show ? t('login.hidePw') : t('login.showPw')}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password}</p>}
        </div>
        {serverError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400" role="alert">{serverError}</p>}
        <Button type="submit" className="w-full h-10" loading={submitting}>{t('login.submit')}</Button>
      </form>
    </AuthShell>
  );
}
