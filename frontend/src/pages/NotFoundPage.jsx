import { Link } from 'react-router-dom';
import Logo from '../components/layout/Logo';
import { useI18n } from '../i18n';

export default function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <Logo className="justify-center" />
        <p className="mt-8 text-sm font-semibold text-brand-600">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t('nf.title')}</h1>
        <p className="mt-2 text-sm text-zinc-500">{t('nf.text')}</p>
        <Link to="/" className="btn btn-primary mt-6">{t('nf.back')}</Link>
      </div>
    </div>
  );
}
