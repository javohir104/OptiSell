import { useState } from 'react';
import { Printer, Share2 } from 'lucide-react';
import Modal from '../common/Modal';
import { Button } from '../common/ui';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { formatDate, formatMoney, formatNumber } from '../../utils/format';
import { cn } from '../../utils/cn';

const PAPER_KEY = 'optisell_receipt_paper';
const readPaper = () => { try { return localStorage.getItem(PAPER_KEY) === '58' ? '58' : '80'; } catch { return '80'; } };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dateTime = (iso) => new Date(iso).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Lines of the receipt as data, shared by the on-screen preview, the printout and "share". */
function receiptData(sale, user, t, td) {
  const payLabel = t(`pay.${sale.paymentMethod}`);
  return {
    shop: user?.businessName || user?.name || 'OptiSell',
    phone: user?.phone || '',
    invoice: sale.invoiceNo,
    date: dateTime(sale.createdAt),
    cashier: sale.sellerName || user?.name || '',
    customer: sale.customer && sale.customer !== 'Walk-in' ? td(sale.customer) : '',
    lines: sale.items.map((it) => ({
      name: it.productName,
      qty: `${formatNumber(it.quantity)} × ${formatMoney(it.unitPrice)}`,
      total: formatMoney(it.quantity * it.unitPrice),
    })),
    subtotal: formatMoney(sale.subtotal),
    discount: sale.discount > 0 ? `−${formatMoney(sale.discount)}` : '',
    total: formatMoney(sale.total),
    payment: payLabel,
    debt: sale.paymentMethod === 'debt' && sale.dueDate ? t('receipt.debt', { date: formatDate(sale.dueDate) }) : '',
  };
}

function printHtml(d, paper, t) {
  const width = paper === '58' ? '48mm' : '72mm';
  const font = paper === '58' ? '11px' : '12px';
  const row = (a, b, cls = '') => `<div class="row ${cls}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.invoice)}</title><style>
    @page { size: ${paper}mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font: ${font}/1.35 ui-monospace, Menlo, Consolas, monospace; color: #000; }
    .r { width: ${width}; margin: 0 auto; }
    .c { text-align: center; } .b { font-weight: 700; } .big { font-size: 1.35em; }
    .row { display: flex; justify-content: space-between; gap: 6px; } .row span:last-child { text-align: right; white-space: nowrap; }
    .hr { border-top: 1px dashed #000; margin: 6px 0; }
    .item { margin: 3px 0; } .muted { opacity: .8; }
  </style></head><body><div class="r">
    <div class="c b big">${esc(d.shop)}</div>
    ${d.phone ? `<div class="c">${esc(d.phone)}</div>` : ''}
    <div class="hr"></div>
    ${row(t('receipt.no'), d.invoice)}${row(t('receipt.date'), d.date)}
    ${d.cashier ? row(t('receipt.cashier'), d.cashier) : ''}${d.customer ? row(t('field.customer'), d.customer) : ''}
    <div class="hr"></div>
    ${d.lines.map((l) => `<div class="item"><div>${esc(l.name)}</div>${row(l.qty, l.total, 'muted')}</div>`).join('')}
    <div class="hr"></div>
    ${d.discount ? row(t('cart.subtotal'), d.subtotal) + row(t('cart.discount'), d.discount) : ''}
    ${row(t('common.total'), d.total, 'b big')}
    ${row(t('field.payment'), d.payment)}
    ${d.debt ? `<div class="c b">${esc(d.debt)}</div>` : ''}
    <div class="hr"></div>
    <div class="c">${esc(t('receipt.thanks'))}</div>
  </div></body></html>`;
}

/** Print through a hidden iframe (works in browsers, the Telegram desktop app and kiosk printers). */
function print(html) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  frame.onload = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
  };
}

function shareText(d, t) {
  return [
    d.shop, `${t('receipt.no')} ${d.invoice} · ${d.date}`, '',
    ...d.lines.map((l) => `${l.name}\n  ${l.qty} = ${l.total}`), '',
    ...(d.discount ? [`${t('cart.discount')}: ${d.discount}`] : []),
    `${t('common.total')}: ${d.total}`, `${t('field.payment')}: ${d.payment}`, ...(d.debt ? [d.debt] : []), '', t('receipt.thanks'),
  ].join('\n');
}

export default function ReceiptModal({ sale, open, onClose }) {
  const { t, td } = useI18n();
  const { user } = useAuth();
  const [paper, setPaper] = useState(readPaper);
  if (!sale) return null;
  const d = receiptData(sale, user, t, td);

  const choosePaper = (p) => { setPaper(p); try { localStorage.setItem(PAPER_KEY, p); } catch { /* ignore */ } };
  const share = async () => {
    const text = shareText(d, t);
    try {
      if (navigator.share) await navigator.share({ title: d.invoice, text });
      else await navigator.clipboard.writeText(text);
    } catch { /* cancelled */ }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('receipt.title')} description={d.invoice} size="sm"
      footer={<>
        <Button variant="secondary" icon={Share2} onClick={share}>{t('receipt.share')}</Button>
        <Button icon={Printer} onClick={() => print(printHtml(d, paper, t))}>{t('sales.print')}</Button>
      </>}>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-zinc-500">{t('receipt.paper')}:</span>
        {['58', '80'].map((p) => (
          <button key={p} type="button" onClick={() => choosePaper(p)} aria-pressed={paper === p}
            className={cn('rounded-md border px-2.5 py-1 text-xs font-medium', paper === p ? 'border-brand-600 bg-brand-600 text-white' : 'border-zinc-200 dark:border-zinc-700')}>
            {p} mm
          </button>
        ))}
      </div>
      <div className={cn('mx-auto rounded-lg border border-dashed border-zinc-300 bg-white p-3 font-mono text-[12px] leading-snug text-black dark:border-zinc-600', paper === '58' ? 'max-w-[220px]' : 'max-w-[300px]')}>
        <p className="text-center text-sm font-bold">{d.shop}</p>
        {d.phone && <p className="text-center">{d.phone}</p>}
        <hr className="my-1.5 border-dashed border-zinc-400" />
        <p className="flex justify-between"><span>{t('receipt.no')}</span><span>{d.invoice}</span></p>
        <p className="flex justify-between"><span>{t('receipt.date')}</span><span>{d.date}</span></p>
        {d.cashier && <p className="flex justify-between gap-2"><span>{t('receipt.cashier')}</span><span className="truncate">{d.cashier}</span></p>}
        {d.customer && <p className="flex justify-between gap-2"><span>{t('field.customer')}</span><span className="truncate">{d.customer}</span></p>}
        <hr className="my-1.5 border-dashed border-zinc-400" />
        {d.lines.map((l, i) => (
          <div key={i} className="my-1">
            <p>{l.name}</p>
            <p className="flex justify-between text-zinc-600"><span>{l.qty}</span><span>{l.total}</span></p>
          </div>
        ))}
        <hr className="my-1.5 border-dashed border-zinc-400" />
        {d.discount && <><p className="flex justify-between"><span>{t('cart.subtotal')}</span><span>{d.subtotal}</span></p><p className="flex justify-between"><span>{t('cart.discount')}</span><span>{d.discount}</span></p></>}
        <p className="flex justify-between text-sm font-bold"><span>{t('common.total')}</span><span>{d.total}</span></p>
        <p className="flex justify-between"><span>{t('field.payment')}</span><span>{d.payment}</span></p>
        {d.debt && <p className="text-center font-bold">{d.debt}</p>}
        <hr className="my-1.5 border-dashed border-zinc-400" />
        <p className="text-center">{t('receipt.thanks')}</p>
      </div>
    </Modal>
  );
}
