import { Headphones, Phone, Send } from 'lucide-react';
import { useI18n } from '../../i18n';
import { SUPPORT } from '../../config/support';
import { cn } from '../../utils/cn';
import { openLink } from '../../telegram';

/** Support contacts. `compact` = small block for the sidebar. */
export default function SupportCard({ compact = false, className }) {
  const { t } = useI18n();
  const openTelegram = (e) => { e.preventDefault(); openLink(SUPPORT.telegramUrl); };

  if (compact) {
    return (
      <div className={cn('mx-3 mb-1 rounded-xl border border-zinc-200 p-3 text-xs dark:border-zinc-800', className)}>
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-200"><Headphones className="h-3.5 w-3.5" /> {t('support.title')}</p>
        <a href={SUPPORT.telegramUrl} onClick={openTelegram} className="flex items-center gap-1.5 py-0.5 text-sky-600 hover:underline dark:text-sky-400">
          <Send className="h-3.5 w-3.5" /> @{SUPPORT.telegram}
        </a>
        <a href={SUPPORT.phoneHref} className="flex items-center gap-1.5 py-0.5 text-zinc-600 hover:underline dark:text-zinc-400">
          <Phone className="h-3.5 w-3.5" /> <span className="num">{SUPPORT.phone}</span>
        </a>
      </div>
    );
  }

  return (
    <div className={cn('card card-pad', className)}>
      <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100"><Headphones className="h-4 w-4 text-brand-600 dark:text-brand-400" /> {t('support.title')}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('support.text')}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-zinc-500">{t('support.telegram')}</dt><dd><a href={SUPPORT.telegramUrl} onClick={openTelegram} className="font-medium text-sky-600 hover:underline dark:text-sky-400">@{SUPPORT.telegram}</a></dd></div>
        <div className="flex justify-between gap-3"><dt className="text-zinc-500">{t('support.phone')}</dt><dd><a href={SUPPORT.phoneHref} className="num font-medium hover:underline">{SUPPORT.phone}</a></dd></div>
      </dl>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={SUPPORT.telegramUrl} onClick={openTelegram} className="btn btn-primary btn-sm"><Send className="h-4 w-4" /> {t('support.write')}</a>
        <a href={SUPPORT.phoneHref} className="btn btn-secondary btn-sm"><Phone className="h-4 w-4" /> {t('support.call')}</a>
      </div>
    </div>
  );
}
