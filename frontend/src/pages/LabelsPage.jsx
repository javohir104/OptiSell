import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Barcode, Printer, Search } from 'lucide-react';
import { productsApi } from '../api/products.api';
import { inventoryApi } from '../api/inventory.api';
import { getErrorMessage } from '../api/axios';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { Button, Card, EmptyState, ErrorState, PageHeader, TableSkeleton } from '../components/common/ui';
import { ean13Svg, isEan13 } from '../utils/ean13';
import { formatMoney } from '../utils/format';
import { cn } from '../utils/cn';

const SIZES = { '58x40': { w: 58, h: 40 }, '40x30': { w: 40, h: 30 }, 'a4': { w: 63.5, h: 38.1 } };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function labelHtml(p, shop, showPrice) {
  const svg = ean13Svg(p.barcode, { module: 2, height: 46 });
  return `<div class="lab"><div class="shop">${esc(shop)}</div><div class="name">${esc(p.name)}</div>`
    + (showPrice ? `<div class="price">${esc(formatMoney(p.price))}${p.unit && p.unit !== 'pcs' ? ` / ${esc(p.unit)}` : ''}</div>` : '')
    + `<div class="code">${svg || `<span class="raw">${esc(p.barcode || p.sku)}</span>`}</div></div>`;
}

function printLabels(items, size, shop, showPrice) {
  const s = SIZES[size];
  const a4 = size === 'a4';
  const css = `@page { ${a4 ? 'size: A4; margin: 10mm 8mm;' : `size: ${s.w}mm ${s.h}mm; margin: 0;`} }
    * { box-sizing: border-box; } body { margin: 0; font-family: Arial, sans-serif; color: #000; }
    .sheet { ${a4 ? 'display: grid; grid-template-columns: repeat(3, 63.5mm); gap: 0 2.5mm;' : ''} }
    .lab { width: ${s.w}mm; height: ${s.h}mm; padding: 1.5mm 2mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; ${a4 ? '' : 'page-break-after: always;'} }
    .shop { font-size: 7px; opacity: .7; } .name { font-size: ${s.w < 50 ? 9 : 10}px; font-weight: 700; text-align: center; line-height: 1.15; max-height: 2.4em; overflow: hidden; }
    .price { font-size: ${s.w < 50 ? 13 : 16}px; font-weight: 800; } .code svg { width: ${s.w - 8}mm; height: auto; display: block; } .raw { font: 700 12px monospace; }`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>${css}</style></head><body><div class="sheet">${items.map((x) => labelHtml(x, shop, showPrice)).join('')}</div></body></html>`;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  frame.contentWindow.document.open();
  frame.contentWindow.document.write(html);
  frame.contentWindow.document.close();
  frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 1500); };
}

/** Print price / barcode labels; products without a barcode get an in-store EAN-13 first. */
export default function LabelsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const products = useApi(() => productsApi.list(), []);
  const [copies, setCopies] = useState({});
  const [query, setQuery] = useState('');
  const [size, setSize] = useState('58x40');
  const [showPrice, setShowPrice] = useState(true);
  const [busy, setBusy] = useState(false);

  const list = products.data || [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.sku).toLowerCase().includes(q));
  }, [list, query]);
  const chosen = list.filter((p) => Number(copies[p.id]) > 0);
  const total = chosen.reduce((s, p) => s + Number(copies[p.id]), 0);
  const missing = list.filter((p) => !p.barcode).length;

  const generate = async () => {
    setBusy(true);
    try {
      const r = await inventoryApi.generateBarcodes();
      toast.success(t('labels.generated', { n: r.generated }));
      products.reload();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setBusy(false); }
  };
  const print = () => {
    const items = chosen.flatMap((p) => Array.from({ length: Math.min(500, Number(copies[p.id])) }, () => p));
    if (!items.length) { toast.error(t('labels.chooseSome')); return; }
    printLabels(items, size, user?.businessName || 'OptiSell', showPrice);
  };

  return (
    <>
      <PageHeader title={t('labels.title')} description={t('labels.desc')}
        actions={<>
          <Link to="/products" className="btn btn-secondary"><ArrowLeft className="h-4 w-4" /> {t('nav.products')}</Link>
          <Button icon={Printer} onClick={print} disabled={!total}>{t('labels.print', { n: total })}</Button>
        </>} />

      {missing > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <p>{t('labels.missing', { n: missing })}</p>
          <Button size="sm" icon={Barcode} loading={busy} onClick={generate}>{t('labels.generate')}</Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-3 dark:border-zinc-800">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input className="input h-9 pl-9" placeholder={t('cart.scanOrSearch')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('cart.scanOrSearch')} />
          </div>
          <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
            {Object.keys(SIZES).map((k) => (
              <button key={k} type="button" onClick={() => setSize(k)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium', size === k ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500')}>
                {k === 'a4' ? t('labels.a4') : `${k} mm`}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 px-1 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-zinc-300" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> {t('labels.withPrice')}</label>
          <Button variant="ghost" size="sm" onClick={() => setCopies(Object.fromEntries(rows.map((p) => [p.id, '1'])))}>{t('labels.allOne')}</Button>
        </div>
        {products.loading ? <TableSkeleton rows={6} /> : products.error ? <ErrorState message={products.error} onRetry={products.reload} /> : !rows.length ? <EmptyState title={t('common.noData')} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('th.product')}</th><th>{t('field.barcode')}</th><th className="text-right">{t('th.price')}</th><th className="w-32 text-right">{t('labels.copies')}</th></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const svg = p.barcode && isEan13(p.barcode) ? ean13Svg(p.barcode, { module: 1, height: 22 }) : null;
                  return (
                    <tr key={p.id}>
                      <td className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}<span className="block text-xs font-normal text-zinc-500">{p.sku}</span></td>
                      <td>{svg ? <span className="inline-block rounded bg-white p-1" dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="font-mono text-xs text-zinc-500">{p.barcode || '—'}</span>}</td>
                      <td className="num text-right">{formatMoney(p.price)}</td>
                      <td className="text-right">
                        <input className="input num ml-auto h-8 w-20 text-right" inputMode="numeric" placeholder="0" value={copies[p.id] ?? ''}
                          onChange={(e) => setCopies((c) => ({ ...c, [p.id]: e.target.value.replace(/\D/g, '').slice(0, 3) }))} aria-label={`${t('labels.copies')}: ${p.name}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
