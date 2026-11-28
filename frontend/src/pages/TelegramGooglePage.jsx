/**
 * /tg-google?h=<id> — opened in the phone's real browser by the Telegram Mini App's Google button.
 * The user signs in with Google here; the session is handed back to the Mini App, not to this browser.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import AuthShell from '../components/layout/AuthShell';
import { GisButton } from '../components/auth/GoogleButton';
import { useI18n } from '../i18n';
import { getErrorMessage } from '../api/axios';

export default function TelegramGooglePage() {
  const { t, setLang } = useI18n();
  const [params] = useSearchParams();
  const id = params.get('h') || '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const l = params.get('lang');
    if (l) setLang(l);
  }, [params, setLang]);

  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    return <AuthShell title={t('tgGoogle.title')} subtitle={t('tgGoogle.badLink')} />;
  }

  if (done) {
    return (
      <AuthShell title={t('tgGoogle.doneTitle')} subtitle={t('tgGoogle.doneText')}>
        <CheckCircle2 className="h-12 w-12 text-brand-600" aria-hidden="true" />
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('tgGoogle.title')} subtitle={t('tgGoogle.subtitle')}>
      <GisButton handoff={id} onSuccess={() => setDone(true)}
        onError={(err) => setError(getErrorMessage(err, t('auth.googleFailed')))} />
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400" role="alert">{error}</p>}
    </AuthShell>
  );
}
