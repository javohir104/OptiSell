import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '../../i18n';
import { WELCOME_EVENT, WELCOME_MS } from '../../utils/welcome';
import { LogoMark } from './Splash';

/**
 * After signing in: a green wave sweeps over the screen, greets the user, then opens up onto the
 * dashboard (the route changes underneath while the wave covers it).
 */
export default function WelcomeOverlay() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const [name, setName] = useState(null);

  useEffect(() => {
    const on = (e) => setName(e.detail?.name ?? '');
    window.addEventListener(WELCOME_EVENT, on);
    return () => window.removeEventListener(WELCOME_EVENT, on);
  }, []);

  useEffect(() => {
    if (name === null) return undefined;
    const timer = setTimeout(() => setName(null), reduce ? 400 : WELCOME_MS);
    return () => clearTimeout(timer);
  }, [name, reduce]);

  return (
    <AnimatePresence>
      {name !== null && (
        <motion.div key="welcome" className="fixed inset-0 z-[90] grid place-items-center bg-gradient-to-br from-brand-600 via-emerald-600 to-teal-700"
          initial={{ clipPath: 'circle(0% at 50% 50%)' }}
          animate={{ clipPath: 'circle(150% at 50% 50%)' }}
          exit={{ clipPath: 'circle(0% at 50% 0%)', opacity: 0.6 }}
          transition={{ duration: reduce ? 0.01 : 0.6, ease: [0.65, 0, 0.35, 1] }}>
          <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
          <div className="relative flex flex-col items-center text-center text-white">
            <div className="rounded-3xl bg-white/15 p-3 backdrop-blur"><LogoMark size={64} delay={0.2} /></div>
            <motion.p className="mt-6 text-sm font-medium uppercase tracking-[0.25em] text-white/70"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
              OptiSell
            </motion.p>
            <motion.h2 className="mt-2 px-6 text-3xl font-semibold tracking-tight sm:text-4xl"
              initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.45, type: 'spring', stiffness: 200, damping: 18 }}>
              {name ? t('login.welcome', { name }) : t('login.welcomeAnon')}
            </motion.h2>
            <motion.div className="mt-6 flex gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="h-2 w-2 rounded-full bg-white"
                  animate={{ y: [0, -6, 0], opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }} />
              ))}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
