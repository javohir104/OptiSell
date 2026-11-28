import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const KEY = 'optisell_splash_seen';

/** Animated OptiSell mark: the box pops in, the trend line draws itself, then the arrow head. */
export function LogoMark({ size = 72, delay = 0 }) {
  return (
    <motion.svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true"
      initial={{ scale: 0.4, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18, delay }}>
      <rect width="32" height="32" rx="8" fill="#059669" />
      <motion.path d="M9 19.5l5-5 3.5 3.5L23 12.5" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: 'easeInOut', delay: delay + 0.25 }} />
      <motion.path d="M18.5 12.5H23V17" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.3, delay: delay + 0.8 }} />
    </motion.svg>
  );
}

/** Full-screen intro shown once per browser session when the site is opened. */
export default function Splash() {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(() => {
    try { return !sessionStorage.getItem(KEY); } catch { return false; }
  });

  useEffect(() => {
    if (!show) return undefined;
    try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    const timer = setTimeout(() => setShow(false), reduce ? 300 : 1700);
    return () => clearTimeout(timer);
  }, [show, reduce]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div key="splash" className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-zinc-950"
          exit={{ opacity: 0, scale: 1.08, filter: 'blur(6px)' }} transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}>
          {/* glowing rings */}
          {[0, 1, 2].map((i) => (
            <motion.span key={i} className="absolute rounded-full border border-brand-500/30"
              style={{ width: 160, height: 160 }}
              initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: [0.6, 3.2], opacity: [0.6, 0] }}
              transition={{ duration: 1.8, delay: 0.2 + i * 0.35, ease: 'easeOut', repeat: Infinity, repeatDelay: 0.2 }} />
          ))}
          <motion.div className="absolute h-72 w-72 rounded-full bg-brand-500/25 blur-3xl"
            initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1 }} />
          <div className="relative flex flex-col items-center">
            <LogoMark size={84} />
            <motion.p className="mt-5 text-3xl font-semibold tracking-tight text-white"
              initial={{ opacity: 0, y: 14, letterSpacing: '0.3em' }} animate={{ opacity: 1, y: 0, letterSpacing: '-0.01em' }}
              transition={{ duration: 0.7, delay: 0.5, ease: 'easeOut' }}>
              Opti<span className="text-brand-400">Sell</span>
            </motion.p>
            <motion.div className="mt-6 h-1 w-40 overflow-hidden rounded-full bg-white/10"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
              <motion.div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-emerald-200"
                initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 0.9, delay: 0.75, ease: 'easeInOut' }} />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
