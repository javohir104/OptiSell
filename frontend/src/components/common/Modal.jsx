import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './ui';
import { useI18n } from '../../i18n';

export default function Modal({ open, onClose, title, description, children, footer, size = 'md', dismissable = true }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && dismissable && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose, dismissable]);

  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size];

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={dismissable ? onClose : undefined} />
          <motion.div
            className={cn('pb-safe relative flex max-h-[90vh] w-full flex-col rounded-t-3xl sm:pb-0 border border-zinc-200 bg-white shadow-pop sm:rounded-2xl dark:border-zinc-800 dark:bg-zinc-900', width)}
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          >
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700" aria-hidden="true" />
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
              </div>
              {dismissable && <Button variant="ghost" size="icon" className="-mr-2 -mt-1" onClick={onClose} aria-label={t('common.close')}><X className="h-4 w-4" /></Button>}
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t [&>*]:flex-1 sm:[&>*]:flex-none border-zinc-100 px-5 py-3.5 dark:border-zinc-800">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, loading }) {
  const { t } = useI18n();
  return (
    <Modal
      open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel || t('common.delete')}</Button>
      </>}
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
    </Modal>
  );
}
