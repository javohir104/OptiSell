import { Link, Navigate, Outlet } from 'react-router-dom';
import { Lock, ShieldOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { PLAN_LABEL, hasFeature, isStaff, planFor } from '../../utils/plans';
import SupportCard from '../common/SupportCard';

/** Full-page "this is on Pro / Max" screen with an upgrade button. */
export function LockedPage({ feature }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const plan = PLAN_LABEL[planFor(feature)];
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"><Lock className="h-6 w-6" /></div>
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t('lock.title', { feature: t(`feature.${feature}`), plan })}</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{t('lock.text', { current: PLAN_LABEL[user?.subscription?.plan || 'free'], plan })}</p>
      <Link to="/billing" className="btn btn-primary mt-6">{t('lock.upgrade', { plan })}</Link>
      <SupportCard className="mt-8 text-left" />
    </div>
  );
}

function StaffBlocked() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800"><ShieldOff className="h-6 w-6" /></div>
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t('lock.staffOnly')}</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{t('lock.staffText')}</p>
      <Link to="/sales" className="btn btn-primary mt-6">{t('nav.sales')}</Link>
    </div>
  );
}

/**
 * Route guard: `feature` = plan feature the page needs; `ownerOnly` = not for seller accounts.
 * Only hides pages — the backend refuses the API calls anyway.
 */
export default function FeatureRoute({ feature, ownerOnly = false }) {
  const { user } = useAuth();
  if (ownerOnly && isStaff(user)) return <StaffBlocked />;
  if (feature && !hasFeature(user, feature)) return <LockedPage feature={feature} />;
  return <Outlet />;
}

/** Sellers start on the sales page (they have no dashboard). */
export function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={isStaff(user) ? '/sales' : '/dashboard'} replace />;
}
