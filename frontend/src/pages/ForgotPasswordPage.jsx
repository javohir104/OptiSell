import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, Send } from 'lucide-react';
import AuthShell from '../components/layout/AuthShell';
import { Button, Input } from '../components/common/ui';
import { authApi } from '../api/auth.api';
import { getErrorMessage } from '../api/axios';
import { useI18n } from '../i18n';
import { SUPPORT } from '../config/support';
import { openLink } from '../telegram';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pwOk = (p) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

function SupportHint() {
  const { t } = useI18n();
  return (
    <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400">
      {t('forgot.noTelegram')}{' '}
      <a href={SUPPORT.telegramUrl} onClick={(e) => { e.preventDefault(); openLink(SUPPORT.telegramUrl); }} className="font-medium text-sky-600 hover:underline">@{SUPPORT.telegram}</a>
      {' · '}<a href={SUPPORT.phoneHref} className="num font-medium hover:underline">{SUPPORT.phone}</a>
    </p>
  );
}

/** /forgot-password: email -> code from the Telegram bot -> new password. */
export function ForgotPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setErr(t('err.email'));
    setBusy(true); setErr('');
    try { await authApi.forgotPassword(email.trim()); setStep('code'); } catch (e2) { setErr(getErrorMessage(e2)); } finally { setBusy(false); }
  };
  const reset = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setErr(t('forgot.codeBad'));
    if (!pwOk(pw)) return setErr(t('reg.errPw'));
    setBusy(true); setErr('');
    try {
      await authApi.resetPassword({ email: email.trim(), code: code.trim(), password: pw });
      toast.success(t('forgot.done'));
      navigate('/login', { replace: true });
    } catch (e2) { setErr(getErrorMessage(e2)); } finally { setBusy(false); }
  };

  return (
    <AuthShell title={t('forgot.title')} subtitle={step === 'email' ? t('forgot.subtitle') : t('forgot.codeSent')}
      footer={<Link to="/login" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">{t('forgot.back')}</Link>}>
      {step === 'email' ? (
        <form onSubmit={send} className="space-y-4" noValidate>
          <Input label={t('field.email')} type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} autoFocus />
          {err && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
          <Button type="submit" className="h-10 w-full" icon={Send} loading={busy}>{t('forgot.send')}</Button>
          <SupportHint />
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-4" noValidate>
          <Input label={t('forgot.code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="[&_input]:text-center [&_input]:font-mono [&_input]:text-lg [&_input]:tracking-[0.5em]"
            value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setErr(''); }} autoFocus />
          <Input label={t('profile.newPassword')} type="password" autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }} hint={t('reg.errPw')} />
          {err && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
          <Button type="submit" className="h-10 w-full" loading={busy}>{t('forgot.save')}</Button>
          <button type="button" className="w-full text-center text-xs text-zinc-500 hover:underline" onClick={() => { setStep('email'); setCode(''); }}>{t('forgot.again')}</button>
          <SupportHint />
        </form>
      )}
    </AuthShell>
  );
}

/** /reset-password?token=...: one-time link from support / the admin panel. */
export function ResetPasswordPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!pwOk(pw)) return setErr(t('reg.errPw'));
    setBusy(true); setErr('');
    try { const r = await authApi.resetPasswordLink({ token, password: pw }); setDone(r.email); } catch (e2) { setErr(getErrorMessage(e2)); } finally { setBusy(false); }
  };

  return (
    <AuthShell title={t('forgot.title')} subtitle={done ? '' : t('forgot.linkSubtitle')}
      footer={<Link to="/login" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">{t('forgot.back')}</Link>}>
      {done ? (
        <div className="rounded-xl bg-emerald-50 p-5 text-center dark:bg-emerald-500/10">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-2 font-medium">{t('forgot.done')}</p>
          <p className="text-sm text-zinc-500">{done}</p>
          <Link to="/login" className="btn btn-primary mt-4">{t('login.submit')}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input label={t('profile.newPassword')} type="password" autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }} hint={t('reg.errPw')} autoFocus />
          {err && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
          <Button type="submit" className="h-10 w-full" loading={busy} disabled={!token}>{t('forgot.save')}</Button>
        </form>
      )}
    </AuthShell>
  );
}
