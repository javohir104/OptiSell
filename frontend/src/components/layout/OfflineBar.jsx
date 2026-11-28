import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CloudUpload, WifiOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { salesApi } from '../../api/sales.api';
import { getErrorMessage } from '../../api/axios';
import { QUEUE_EVENT, flushQueue, pendingSales } from '../../utils/offline';

/**
 * Thin bar under the header: "no internet" and/or "N sales waiting". Sends the queued offline
 * sales as soon as the connection is back (and every 30 s while some are waiting).
 */
export default function OfflineBar() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(() => pendingSales(user?.id).length);

  const refresh = useCallback(() => setPending(pendingSales(user?.id).length), [user?.id]);

  const send = useCallback(async () => {
    if (!user?.id || !pendingSales(user.id).length) return;
    const { sent, failed } = await flushQueue(user.id, salesApi.postQueued);
    if (sent) toast.success(t('sales.offlineSent', { n: sent }));
    for (const f of failed) toast.error(t('sales.offlineFailed', { label: f.label, error: getErrorMessage(f.error) }), { duration: 8000 });
    refresh();
  }, [user?.id, t, refresh]);

  useEffect(() => {
    const on = () => { setOnline(true); send(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener(QUEUE_EVENT, refresh);
    send();
    const timer = setInterval(() => { if (navigator.onLine) send(); }, 30_000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener(QUEUE_EVENT, refresh);
      clearInterval(timer);
    };
  }, [send, refresh]);

  if (online && !pending) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200" role="status">
      {!online && <span className="flex items-center gap-1.5"><WifiOff className="h-3.5 w-3.5" /> {t('offline.banner')}</span>}
      {pending > 0 && (
        <span className="flex items-center gap-1.5">
          <CloudUpload className="h-3.5 w-3.5" /> {t('offline.pending', { n: pending })}
          {online && <button type="button" className="underline" onClick={send}>{t('offline.sendNow')}</button>}
        </span>
      )}
    </div>
  );
}
