import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Globe } from 'lucide-react';
import { LANGUAGES, useI18n } from '../../i18n';
import { cn } from '../../utils/cn';

export default function LanguageSwitcher({ className }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  useEffect(() => {
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label={t('lang.label')}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
        <Globe className="h-[18px] w-[18px]" />
        <span>{active.short}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
            className="absolute right-0 z-40 mt-2 w-44 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-pop dark:border-zinc-800 dark:bg-zinc-900">
            {LANGUAGES.map((l) => (
              <button key={l.code} type="button" role="menuitemradio" aria-checked={l.code === lang}
                onClick={() => { setLang(l.code); setOpen(false); }}
                className={cn('flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800',
                  l.code === lang ? 'font-medium text-brand-700 dark:text-brand-400' : 'text-zinc-700 dark:text-zinc-300')}>
                <span className="flex items-center gap-2"><span className="w-6 text-xs text-zinc-400">{l.short}</span>{l.label}</span>
                {l.code === lang && <Check className="h-4 w-4" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
