import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui';
import { useI18n } from '../../i18n';

/** Client-side pagination. Resets to page 1 whenever `resetKey` changes. */
export function usePagination(items, pageSize = 15, resetKey = '') {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const total = items?.length || 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  return {
    page: current, pages, total, pageSize, setPage,
    visible: (items || []).slice((current - 1) * pageSize, current * pageSize),
  };
}

export default function Pagination({ page, pages, total, pageSize, setPage }) {
  const { t } = useI18n();
  if (!total) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-4 py-2.5 text-xs text-zinc-500 dark:border-zinc-800">
      <span className="num">{t('pager.range', { start, end, total })}</span>
      {pages > 1 && (
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page === 1} onClick={() => setPage(page - 1)} aria-label={t('pager.prevA11y')}>{t('pager.prev')}</Button>
          <span className="num px-1.5">{t('pager.page', { page, pages })}</span>
          <Button variant="secondary" size="sm" disabled={page === pages} onClick={() => setPage(page + 1)} aria-label={t('pager.nextA11y')}>
            {t('pager.next')} <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
