import { Crown, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { PLAN_LABEL, daysLeft } from '../../utils/plans';
import { cn } from '../../utils/cn';

/** Small card in the sidebar: current plan, days left, link to billing. */
export default function PlanCard({ onNavigate }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const sub = user?.subscription;
  if (!sub || user?.role === 'staff') return null;
  const left = daysLeft(sub.expiresAt);
  const paid = sub.plan !== 'free';

  return (
    <Link to="/billing" onClick={onNavigate}
      className={cn('m-3 block rounded-xl border p-3 text-xs transition-colors',
        paid ? 'border-brand-200 bg-brand-50 hover:bg-brand-100/70 dark:border-brand-500/20 dark:bg-brand-500/10'
          : 'border-amber-200 bg-amber-50 hover:bg-amber-100/70 dark:border-amber-500/20 dark:bg-amber-500/10')}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {paid ? <Crown className="h-4 w-4 text-brand-600 dark:text-brand-400" /> : <Sparkles className="h-4 w-4 text-amber-600" />}
        {t('billing.planName', { plan: PLAN_LABEL[sub.plan] })}
      </p>
      <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">
        {sub.unlimited ? t('billing.adminUnlimited') : paid ? t('billing.daysLeft', { n: left }) : t('billing.upgradeHintNew')}
      </p>
    </Link>
  );
}
