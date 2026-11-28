import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crown, Gift, Medal, Timer, Trophy, Users } from 'lucide-react';
import { bonusApi } from '../api/bonus.api';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '../components/common/ui';
import { PLAN_LABEL } from '../utils/plans';
import { currentLocale, formatNumber } from '../utils/format';
import { cn } from '../utils/cn';

const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });
};

function useCountdown(iso) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, Date.parse(iso || 0) - now);
  return { d: Math.floor(ms / 86400000), h: Math.floor(ms / 3600000) % 24, m: Math.floor(ms / 60000) % 60, s: Math.floor(ms / 1000) % 60 };
}

const PODIUM = {
  1: { h: 'h-36', ring: 'from-amber-300 to-yellow-500', text: 'text-amber-600', icon: Crown },
  2: { h: 'h-28', ring: 'from-zinc-200 to-zinc-400', text: 'text-zinc-500', icon: Medal },
  3: { h: 'h-24', ring: 'from-orange-300 to-amber-700', text: 'text-orange-700', icon: Medal },
};

function Podium({ top }) {
  const { t } = useI18n();
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className="flex items-end justify-center gap-3 px-4 pt-8 sm:gap-6">
      {order.map((r, i) => {
        const s = PODIUM[r.rank];
        const Icon = s.icon;
        return (
          <motion.div key={r.rank} className="flex w-28 flex-col items-center sm:w-36"
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.12, type: 'spring', stiffness: 160, damping: 16 }}>
            <motion.div className={cn('grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br text-white shadow-pop', s.ring, r.rank === 1 && 'h-16 w-16')}
              animate={r.rank === 1 ? { y: [0, -6, 0] } : undefined} transition={{ duration: 2.4, repeat: Infinity }}>
              <Icon className={r.rank === 1 ? 'h-7 w-7' : 'h-6 w-6'} />
            </motion.div>
            <p className={cn('mt-2 max-w-full truncate text-center text-sm font-semibold', r.isMe && 'text-brand-700 dark:text-brand-400')}>{r.name}{r.isMe && ` (${t('contest.you')})`}</p>
            <p className="num text-xs text-zinc-500">{t('bonus.points', { n: formatNumber(r.points) })}</p>
            <motion.div className={cn('mt-2 flex w-full items-start justify-center rounded-t-xl bg-gradient-to-b pt-2 text-2xl font-bold text-white', s.ring)}
              initial={{ height: 0 }} animate={{ height: r.rank === 1 ? 144 : r.rank === 2 ? 112 : 96 }} transition={{ delay: 0.3 + i * 0.12, duration: 0.6, ease: 'easeOut' }}>
              {r.rank}
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}

/** Monthly contest: whoever earns the most points this month gets a month of Pro. */
export default function ContestPage() {
  const { t } = useI18n();
  const { data, loading, error, reload } = useApi(() => bonusApi.contest(), []);
  const left = useCountdown(data?.endsAt);
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;
  const prize = data ? PLAN_LABEL[data.prize.plan] : 'Pro';
  const me = data?.me;

  return (
    <>
      <PageHeader title={t('contest.title')} description={data ? t('contest.desc', { month: monthLabel(data.month), plan: prize }) : ''}
        actions={<Link to="/bonus" className="btn btn-secondary"><Gift className="h-4 w-4" /> {t('nav.bonus')}</Link>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 p-5 text-white shadow-pop">
          <Trophy className="absolute -right-3 -top-3 h-24 w-24 rotate-12 opacity-20" />
          <p className="text-sm font-medium text-white/85">{t('contest.yourPlace')}</p>
          {loading ? <Skeleton className="mt-2 h-10 w-20 bg-white/30" /> : (
            <motion.p key={me.rank} className="num mt-1 text-4xl font-bold" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}>
              {me.rank ? `#${me.rank}` : '—'}
            </motion.p>
          )}
          <p className="mt-1 text-xs text-white/85">{loading ? '' : me.rank === 1 ? t('contest.leading') : me.rank ? t('contest.toFirst', { n: me.toFirst }) : t('contest.notYet')}</p>
        </div>
        <StatCard label={t('contest.yourPoints')} icon={Gift} loading={loading} value={formatNumber(me?.points ?? 0)} hint={me && !me.toTop ? t('contest.inTop') : me ? t('contest.toTop', { n: me.toTop }) : ''} />
        <StatCard label={t('contest.prize')} icon={Crown} tone="warning" loading={loading} value={`${prize} · ${t('bonus.month')}`} hint={t('contest.prizeHint')} />
        <StatCard label={t('contest.endsIn')} icon={Timer} tone="neutral" loading={loading} value={`${left.d}${t('contest.d')} ${String(left.h).padStart(2, '0')}:${String(left.m).padStart(2, '0')}:${String(left.s).padStart(2, '0')}`}
          hint={t('contest.participants', { n: formatNumber(data?.participants ?? 0) })} />
      </div>

      {me && !me.eligible && !loading && (
        <p className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">{t('contest.notEligible')}</p>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader title={<span className="flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> {t('contest.top')}</span>} subtitle={data ? monthLabel(data.month) : ''} />
          {loading ? <Skeleton className="m-5 h-64" /> : !data.top.length ? <EmptyState icon={Trophy} title={t('contest.empty')} message={t('contest.emptyMsg')} /> : (
            <>
              <Podium top={data.top} />
              <ul className="mt-2 divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
                {data.top.map((r) => (
                  <li key={r.rank} className={cn('flex items-center gap-3 px-5 py-3 text-sm', r.isMe && 'bg-brand-50 dark:bg-brand-500/10')}>
                    <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold', r.rank <= 3 ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300')}>{r.rank}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.name}{r.isMe && <Badge tone="success" className="ml-2">{t('contest.you')}</Badge>}</span>
                    <div className="hidden w-40 sm:block">
                      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <motion.div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-300" initial={{ width: 0 }} animate={{ width: `${(r.points / data.top[0].points) * 100}%` }} transition={{ duration: 0.8, delay: 0.2 + r.rank * 0.05 }} />
                      </div>
                    </div>
                    <span className="num w-20 text-right font-semibold">{formatNumber(r.points)}</span>
                  </li>
                ))}
                {me?.rank > data.top.length && (
                  <li className="flex items-center gap-3 bg-brand-50 px-5 py-3 text-sm dark:bg-brand-500/10">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">{me.rank}</span>
                    <span className="flex-1 font-medium">{t('contest.you')}</span>
                    <span className="num w-20 text-right font-semibold">{formatNumber(me.points)}</span>
                  </li>
                )}
              </ul>
            </>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title={t('contest.rules')} />
            <ul className="space-y-2 p-5 pt-3 text-sm text-zinc-600 dark:text-zinc-400">
              {[t('contest.r1', { plan: prize }), t('contest.r2'), t('contest.r3'), t('contest.r4')].map((x) => <li key={x} className="flex gap-2"><span className="text-brand-600">•</span>{x}</li>)}
            </ul>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title={<span className="flex items-center gap-2"><Users className="h-4 w-4" /> {t('contest.winners')}</span>} />
            {loading ? <Skeleton className="m-5 h-20" /> : !data.winners.length ? <EmptyState title={t('contest.noWinners')} /> : (
              <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.winners.map((w) => (
                  <li key={w.month} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <div><p className="font-medium">{w.name}{w.isMe && <Badge tone="success" className="ml-2">{t('contest.you')}</Badge>}</p><p className="text-xs capitalize text-zinc-500">{monthLabel(w.month)}</p></div>
                    <Badge tone="warning" icon={Crown}>{PLAN_LABEL[w.plan]} · {formatNumber(w.points)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
