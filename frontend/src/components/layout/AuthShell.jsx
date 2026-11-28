import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BarChart3, Boxes, Sparkles, TrendingUp } from 'lucide-react';
import Logo from './Logo';
import LanguageSwitcher from '../common/LanguageSwitcher';
import { useI18n } from '../../i18n';
import { SUPPORT } from '../../config/support';
import { openLink } from '../../telegram';

const POINTS = [
  { icon: BarChart3, title: 'auth.p1Title', text: 'auth.p1Text' },
  { icon: Boxes, title: 'auth.p2Title', text: 'auth.p2Text' },
  { icon: Sparkles, title: 'auth.p3Title', text: 'auth.p3Text' },
];

const BARS = [38, 52, 44, 66, 58, 79, 72, 94];

// Splash plays first on the very first visit; the page starts animating as it fades out.
// Only the first screen waits for it — later login <-> register switches animate right away.
let START = (() => { try { return sessionStorage.getItem('optisell_splash_seen') ? 0.05 : 1.55; } catch { return 0.05; } })();

const rise = (i, base = START) => ({
  initial: { opacity: 0, y: 18, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.55, delay: base + i * 0.08, ease: [0.22, 1, 0.36, 1] },
});

function Blob({ className, x, y, duration }) {
  return (
    <motion.div className={`absolute rounded-full blur-3xl ${className}`}
      animate={{ x, y, scale: [1, 1.15, 1] }}
      transition={{ duration, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }} />
  );
}

/** Animated "live revenue" card on the dark panel: bars grow in, the total counts up. */
function LiveCard() {
  const { t } = useI18n();
  return (
    <motion.div className="mt-12 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-md"
      initial={{ opacity: 0, y: 30, rotateX: 12 }} animate={{ opacity: 1, y: [0, -8, 0], rotateX: 0 }}
      transition={{ opacity: { delay: START + 0.6, duration: 0.6 }, rotateX: { delay: START + 0.6, duration: 0.6 }, y: { delay: START + 1.2, duration: 5, repeat: Infinity, ease: 'easeInOut' } }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-400">{t('kpi.revenue')} · 7d</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-xs font-semibold text-brand-300"><TrendingUp className="h-3 w-3" /> +24%</span>
      </div>
      <motion.p className="mt-2 text-2xl font-semibold tracking-tight text-white"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: START + 0.9 }}>
        12 480 000 <span className="text-sm font-normal text-zinc-400">so'm</span>
      </motion.p>
      <div className="mt-4 flex h-24 items-end gap-2">
        {BARS.map((h, i) => (
          <motion.div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-brand-600 to-brand-300"
            initial={{ height: 0 }} animate={{ height: `${h}%` }}
            transition={{ delay: START + 0.9 + i * 0.07, type: 'spring', stiffness: 160, damping: 16 }} />
        ))}
      </div>
    </motion.div>
  );
}

export default function AuthShell({ title, subtitle, children, footer }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const r = (i) => (reduce ? {} : rise(i));
  useEffect(() => { START = 0.05; }, []);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-12 sm:py-8">
        <motion.div className="flex items-center justify-between gap-3" {...r(0)}>
          <Logo />
          <LanguageSwitcher />
        </motion.div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8 sm:py-10">
          <motion.div className="mb-6 flex items-center gap-2 lg:hidden" {...r(1)}>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">{t('auth.tagline')}</span>
          </motion.div>
          <motion.h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50" {...r(2)}>{title}</motion.h1>
          <motion.p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400" {...r(3)}>{subtitle}</motion.p>
          <motion.div className="mt-8" {...r(4)}>{children}</motion.div>
          {footer && <motion.div className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400" {...r(6)}>{footer}</motion.div>}
        </div>
        <motion.div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400" {...r(7)}>
          <p>© {new Date().getFullYear()} OptiSell</p>
          <p>
            {t('support.title')}:{' '}
            <a href={SUPPORT.telegramUrl} onClick={(e) => { e.preventDefault(); openLink(SUPPORT.telegramUrl); }} className="text-sky-600 hover:underline dark:text-sky-400">@{SUPPORT.telegram}</a>
            {' · '}
            <a href={SUPPORT.phoneHref} className="num hover:underline">{SUPPORT.phone}</a>
          </p>
        </motion.div>
      </div>

      <div className="relative hidden overflow-hidden bg-zinc-950 lg:block" style={{ perspective: 1000 }}>
        <motion.div className="absolute inset-0 opacity-[0.15]"
          style={{ backgroundImage: 'linear-gradient(#3f3f46 1px, transparent 1px), linear-gradient(90deg, #3f3f46 1px, transparent 1px)', backgroundSize: '40px 40px' }}
          animate={reduce ? undefined : { backgroundPosition: ['0px 0px', '40px 40px'] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }} />
        {!reduce && <>
          <Blob className="-right-24 -top-24 h-96 w-96 bg-brand-500/25" x={[0, -60]} y={[0, 50]} duration={9} />
          <Blob className="-bottom-32 -left-20 h-[28rem] w-[28rem] bg-teal-500/15" x={[0, 70]} y={[0, -40]} duration={11} />
          <Blob className="left-1/3 top-1/3 h-56 w-56 bg-emerald-400/10" x={[0, 40]} y={[0, 60]} duration={7} />
        </>}
        <div className="relative flex h-full flex-col justify-center px-14 xl:px-20">
          <motion.p className="text-sm font-medium text-brand-400" {...r(1)}>{t('auth.tagline')}</motion.p>
          <motion.h2 className="mt-3 max-w-md bg-gradient-to-r from-white via-white to-brand-300 bg-clip-text text-3xl font-semibold leading-tight tracking-tight text-transparent" {...r(2)}>
            {t('auth.headline')}
          </motion.h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map(({ icon: Icon, title: tk, text }, i) => (
              <motion.li key={tk} className="flex gap-4"
                initial={reduce ? false : { opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: START + 0.3 + i * 0.12, type: 'spring', stiffness: 140, damping: 18 }}>
                <motion.span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-brand-400"
                  whileHover={{ scale: 1.12, rotate: -6 }}>
                  <Icon className="h-5 w-5" />
                </motion.span>
                <div>
                  <p className="text-sm font-medium text-white">{t(tk)}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{t(text)}</p>
                </div>
              </motion.li>
            ))}
          </ul>
          {!reduce && <LiveCard />}
        </div>
      </div>
    </div>
  );
}
