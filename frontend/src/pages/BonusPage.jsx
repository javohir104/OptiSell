import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Copy, Crown, Gift, Send, Store, TrendingUp, Trophy, UserPlus, Users } from 'lucide-react';
import { bonusApi } from '../api/bonus.api';
import { getErrorMessage } from '../api/axios';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/common/ui';
import Modal from '../components/common/Modal';
import { PLAN_LABEL } from '../utils/plans';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../utils/format';
import { cn } from '../utils/cn';
import { haptic, openLink } from '../telegram';

function PlanGoal({ plan, price, balance, onRedeem, busy }) {
  const { t } = useI18n();
  const pct = Math.min(100, (balance / price) * 100);
  const ready = balance >= price;
  return (
    <div className={cn('rounded-xl border p-4', plan === 'max' ? 'border-violet-200 dark:border-violet-500/30' : 'border-brand-200 dark:border-brand-500/30')}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-semibold"><Crown className={cn('h-4 w-4', plan === 'max' ? 'text-violet-500' : 'text-brand-600')} /> {PLAN_LABEL[plan]} · {t('bonus.month')}</p>
        <span className="num text-sm font-semibold">{price}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <motion.div className={cn('h-full rounded-full', plan === 'max' ? 'bg-gradient-to-r from-violet-500 to-fuchsia-400' : 'bg-gradient-to-r from-brand-600 to-emerald-300')}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }} />
      </div>
      <p className="mt-2 text-xs text-zinc-500">{ready ? t('bonus.ready', { plan: PLAN_LABEL[plan] }) : t('bonus.toPlan', { n: price - balance, plan: PLAN_LABEL[plan] })}</p>
      <Button className="mt-3 w-full" size="sm" variant={ready ? 'primary' : 'secondary'} disabled={!ready} loading={busy} onClick={onRedeem}>
        {t('bonus.get', { plan: PLAN_LABEL[plan], n: price })}
      </Button>
    </div>
  );
}

export default function BonusPage() {
  const { t } = useI18n();
  const { refreshUser } = useAuth();
  const { data, loading, error, reload } = useApi(() => bonusApi.overview(), []);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  const r = data?.rules;
  const link = data ? `${window.location.origin}/register?ref=${data.code}` : '';
  const goal = r?.DAILY_REVENUE_THRESHOLD ?? 1500000;

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.success(t('bonus.copied')); haptic('success'); } catch { window.prompt('', link); }
  };
  const shareTg = () => openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t('bonus.shareMsg'))}`);
  const redeem = async () => {
    setBusy(true);
    try {
      await bonusApi.redeem(confirm);
      haptic('success');
      toast.success(t('bonus.redeemed', { plan: PLAN_LABEL[confirm] }));
      setConfirm(null);
      await Promise.all([reload(), refreshUser()]);
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setBusy(false); }
  };

  const rules = r ? [
    { icon: Store, pts: r.REFERRAL_ACTIVE, title: t('bonus.ruleActive'), hint: t('bonus.ruleActiveHint', { p: r.ACTIVE_SHOP.products, s: r.ACTIVE_SHOP.sales }) },
    { icon: Crown, pts: r.REFERRAL_PRO, title: t('bonus.rulePro') },
    { icon: Trophy, pts: r.REFERRAL_MAX, title: t('bonus.ruleMax') },
    { icon: Crown, pts: r.SELF_PRO, title: t('bonus.ruleSelfPro'), hint: t('bonus.ruleSelfHint') },
    { icon: Crown, pts: r.SELF_MAX, title: t('bonus.ruleSelfMax'), hint: t('bonus.ruleSelfHint') },
    { icon: TrendingUp, pts: r.DAILY_REVENUE, title: t('bonus.ruleDaily', { sum: formatMoney(goal) }), hint: t('bonus.ruleDailyHint') },
  ] : [];

  return (
    <>
      <PageHeader title={t('bonus.title')} description={t('bonus.desc')}
        actions={<Link to="/contest" className="btn btn-secondary"><Trophy className="h-4 w-4" /> {t('nav.contest')}</Link>} />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {/* balance */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-emerald-600 to-teal-700 p-6 text-white shadow-pop">
          <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
          <motion.div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-2xl" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 4, repeat: Infinity }} />
          <p className="relative flex items-center gap-2 text-sm font-medium text-white/80"><Gift className="h-4 w-4" /> {t('bonus.balance')}</p>
          {loading ? <Skeleton className="relative mt-3 h-12 w-32 bg-white/20" /> : (
            <motion.p key={data.balance} className="num relative mt-2 text-5xl font-bold tracking-tight"
              initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}>
              {formatNumber(data.balance)}
            </motion.p>
          )}
          {!loading && (
            <div className="relative mt-5">
              <p className="mb-1 text-xs text-white/80">{t('bonus.today', { sum: formatMoney(data.todayRevenue), goal: formatMoney(goal) })}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                <motion.div className="h-full rounded-full bg-white" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (data.todayRevenue / goal) * 100)}%` }} transition={{ duration: 1, delay: 0.4 }} />
              </div>
            </div>
          )}
        </div>
        {loading ? <><Skeleton className="h-44" /><Skeleton className="h-44" /></> : (
          <>
            <PlanGoal plan="pro" price={r.PRICE.pro} balance={data.balance} busy={busy && confirm === 'pro'} onRedeem={() => setConfirm('pro')} />
            <PlanGoal plan="max" price={r.PRICE.max} balance={data.balance} busy={busy && confirm === 'max'} onRedeem={() => setConfirm('max')} />
          </>
        )}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> {t('bonus.invite')}</span>} subtitle={t('bonus.inviteText')} />
          <div className="space-y-3 p-5">
            {loading ? <Skeleton className="h-20" /> : (
              <>
                <div className="flex items-center justify-between rounded-lg border border-dashed border-brand-300 bg-brand-50/60 px-4 py-3 dark:border-brand-500/30 dark:bg-brand-500/5">
                  <span className="text-xs text-zinc-500">{t('bonus.code')}</span>
                  <span className="font-mono text-xl font-bold tracking-[0.2em] text-brand-700 dark:text-brand-400">{data.code}</span>
                </div>
                <p className="truncate rounded-lg bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400">{link}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" icon={Copy} onClick={copy}>{t('bonus.copy')}</Button>
                  <Button icon={Send} onClick={shareTg}>{t('bonus.shareTg')}</Button>
                </div>
              </>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={t('bonus.how')} />
          <ul className="divide-y divide-zinc-100 px-5 pb-2 dark:divide-zinc-800">
            {rules.map(({ icon: Icon, pts, title, hint }) => (
              <li key={title} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{title}</p>
                  {hint && <p className="text-xs text-zinc-500">{hint}</p>}
                </div>
                <Badge tone="success">+{pts}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title={<span className="flex items-center gap-2"><Users className="h-4 w-4" /> {t('bonus.friends')}</span>} />
          <div className="mt-2">
            {loading ? <Skeleton className="m-5 h-24" /> : !data.referrals.length ? <EmptyState icon={Users} title={t('bonus.noFriends')} message={t('bonus.inviteText')} /> : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.referrals.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{f.name}{f.business && <span className="text-zinc-500"> · {f.business}</span>}</p>
                      <p className="text-xs text-zinc-500">{formatDate(f.joinedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {f.plan !== 'free' && <Badge tone="info">{PLAN_LABEL[f.plan]}</Badge>}
                      <Badge tone={f.active ? 'success' : 'neutral'}>{f.active ? t('bonus.statusActive') : t('bonus.statusJoined')}</Badge>
                      <span className="num w-12 text-right font-semibold text-brand-700 dark:text-brand-400">+{f.points}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title={t('bonus.history')} />
          <div className="mt-2">
            {loading ? <Skeleton className="m-5 h-24" /> : !data.history.length ? <EmptyState icon={Gift} title={t('bonus.noHistory')} /> : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium">{t(`bonus.t.${h.type}`)}{h.friend ? ` · ${h.friend}` : ''}</p>
                      <p className="text-xs text-zinc-500">{h.day ? formatDate(h.day) : formatDateTime(h.createdAt)}</p>
                    </div>
                    <span className={cn('num font-semibold', h.points > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{h.points > 0 ? '+' : ''}{h.points}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} size="sm"
        title={confirm && r ? t('bonus.confirmTitle', { n: r.PRICE[confirm] }) : ''}
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button><Button loading={busy} onClick={redeem}>{t('common.yes')}</Button></>}>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{confirm && t('bonus.confirmText', { plan: PLAN_LABEL[confirm] })}</p>
        {confirm === 'max' && <p className="mt-2 text-xs text-zinc-500">{t('bonus.maxOverPro')}</p>}
      </Modal>
    </>
  );
}
