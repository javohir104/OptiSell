import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, ClipboardCheck, ScanLine, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { productsApi } from '../api/products.api';
import { inventoryApi } from '../api/inventory.api';
import { getErrorMessage } from '../api/axios';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { Badge, Button, Card, ErrorState, Input, PageHeader, StatCard, TableSkeleton } from '../components/common/ui';
import Modal from '../components/common/Modal';
import BarcodeScanner from '../components/common/BarcodeScanner';
import { allowsFraction, cleanQty } from '../utils/units';
import { formatMoney, formatNumber } from '../utils/format';
import { cn } from '../utils/cn';
import { haptic } from '../telegram';

const draftKey = (uid) => `optisell_stockcount_${uid}`;

/** Inventarizatsiya: count every product (by hand or with the scanner), see the difference, save. */
export default function StockCountPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const products = useApi(() => productsApi.list(), []);
  const [counted, setCounted] = useState(() => { try { return JSON.parse(localStorage.getItem(draftKey(user?.id))) || {}; } catch { return {}; } });
  const [query, setQuery] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [scan, setScan] = useState(false);
  const [flash, setFlash] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const scanRef = useRef(null);

  useEffect(() => { try { localStorage.setItem(draftKey(user?.id), JSON.stringify(counted)); } catch { /* ignore */ } }, [counted, user?.id]);

  const list = products.data || [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.sku).toLowerCase().includes(q) || (p.barcode || '').includes(q))
      .map((p) => {
        const c = counted[p.id];
        const has = c !== undefined && c !== '';
        const diff = has ? Math.round((Number(c) - p.stock) * 1000) / 1000 : null;
        return { p, c: has ? c : '', diff };
      })
      .filter((r) => !onlyDiff || (r.diff !== null && r.diff !== 0));
  }, [list, counted, query, onlyDiff]);

  const stats = useMemo(() => {
    let done = 0; let short = 0; let surplus = 0;
    for (const p of list) {
      const c = counted[p.id];
      if (c === undefined || c === '') continue;
      done += 1;
      const v = (Number(c) - p.stock) * p.cost;
      if (v < 0) short += v; else surplus += v;
    }
    return { done, short, surplus };
  }, [list, counted]);

  /** Scanner (camera or USB): +1 for the product with this barcode / SKU. */
  const bump = (code) => {
    const c = String(code).trim();
    const p = list.find((x) => x.barcode === c) || list.find((x) => String(x.sku).toLowerCase() === c.toLowerCase());
    if (!p) { haptic('error'); toast.error(t('cart.notFound', { code: c })); return; }
    haptic('light');
    setCounted((m) => ({ ...m, [p.id]: String(Math.round(((Number(m[p.id]) || 0) + 1) * 1000) / 1000) }));
    setFlash(p.id);
    setTimeout(() => setFlash(null), 600);
  };

  const save = async () => {
    const items = list.filter((p) => counted[p.id] !== undefined && counted[p.id] !== '').map((p) => ({ productId: p.id, counted: counted[p.id] }));
    if (!items.length) { toast.error(t('count.nothing')); return; }
    setSaving(true);
    try {
      const r = await inventoryApi.count({ items, note });
      setResult(r);
      setCounted({});
      products.reload();
      haptic('success');
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader title={t('count.title')} description={t('count.desc')}
        actions={<>
          <Link to="/inventory" className="btn btn-secondary"><ArrowLeft className="h-4 w-4" /> {t('nav.inventory')}</Link>
          <Button icon={ClipboardCheck} loading={saving} onClick={save} disabled={!stats.done}>{t('count.save', { n: stats.done })}</Button>
        </>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t('count.counted')} icon={ClipboardCheck} tone="neutral" value={`${formatNumber(stats.done)} / ${formatNumber(list.length)}`} loading={products.loading} />
        <StatCard label={t('count.shortage')} icon={TrendingDown} tone="warning" value={formatMoney(stats.short)} loading={products.loading} />
        <StatCard label={t('count.surplus')} icon={TrendingUp} value={formatMoney(stats.surplus)} loading={products.loading} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-3 dark:border-zinc-800">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input ref={scanRef} className="input h-9 pl-9" placeholder={t('count.scanPh')} value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) { e.preventDefault(); bump(query); setQuery(''); } }} aria-label={t('count.scanPh')} />
          </div>
          <Button variant="secondary" size="sm" icon={ScanLine} onClick={() => setScan(true)}>{t('cart.camera')}</Button>
          <label className="flex items-center gap-2 px-1 text-sm text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" className="h-4 w-4 rounded border-zinc-300" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> {t('count.onlyDiff')}
          </label>
          <Input className="w-56" placeholder={t('count.notePh')} value={note} onChange={(e) => setNote(e.target.value)} aria-label={t('cart.note')} />
        </div>
        {products.loading ? <TableSkeleton rows={8} /> : products.error ? <ErrorState message={products.error} onRetry={products.reload} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('th.product')}</th><th className="text-right">{t('count.expected')}</th><th className="w-36 text-right">{t('count.actual')}</th><th className="text-right">{t('count.diff')}</th><th className="text-right">{t('count.value')}</th></tr></thead>
              <tbody>
                {rows.map(({ p, c, diff }) => (
                  <tr key={p.id} className={cn('transition-colors', flash === p.id && 'bg-brand-50 dark:bg-brand-500/10')}>
                    <td><p className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}</p><p className="text-xs text-zinc-500">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</p></td>
                    <td className="num text-right text-zinc-500">{formatNumber(p.stock)} {p.unit}</td>
                    <td className="text-right">
                      <input className="input num ml-auto h-8 w-28 text-right" inputMode={allowsFraction(p.unit) ? 'decimal' : 'numeric'} placeholder="—"
                        value={c} onChange={(e) => { const v = cleanQty(e.target.value, p.unit); setCounted((m) => ({ ...m, [p.id]: v })); }} aria-label={`${t('count.actual')}: ${p.name}`} />
                    </td>
                    <td className="num text-right">
                      {diff === null ? <span className="text-zinc-400">—</span> : diff === 0 ? <Badge tone="success">✓</Badge>
                        : <span className={cn('font-semibold', diff < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>{diff > 0 ? '+' : ''}{formatNumber(diff)}</span>}
                    </td>
                    <td className={cn('num text-right', diff < 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500')}>{diff ? formatMoney(diff * p.cost) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <BarcodeScanner open={scan} onClose={() => setScan(false)} onDetected={(code) => { setScan(false); bump(code); setTimeout(() => setScan(true), 400); }} />
      <Modal open={!!result} onClose={() => setResult(null)} title={t('count.doneTitle')} size="sm"
        footer={<Button onClick={() => setResult(null)}>{t('common.close')}</Button>}>
        {result && (
          <dl className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            <div className="flex justify-between py-2"><dt className="text-zinc-500">{t('count.counted')}</dt><dd className="num font-medium">{result.checked}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-zinc-500">{t('count.changed')}</dt><dd className="num font-medium">{result.changed}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-zinc-500">{t('count.shortage')} ({result.shortage_count})</dt><dd className="num font-medium text-red-600">{formatMoney(result.shortage_value)}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-zinc-500">{t('count.surplus')} ({result.surplus_count})</dt><dd className="num font-medium text-emerald-600">{formatMoney(result.surplus_value)}</dd></div>
          </dl>
        )}
      </Modal>
    </>
  );
}
