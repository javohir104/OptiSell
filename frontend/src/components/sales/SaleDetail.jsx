import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Printer, Undo2 } from 'lucide-react';
import Modal from '../common/Modal';
import { Badge, Button, Input } from '../common/ui';
import { salesApi } from '../../api/sales.api';
import { getErrorMessage } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { isStaff } from '../../utils/plans';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../../utils/format';
import { haptic } from '../../telegram';
import { cleanQty } from '../../utils/units';

export const STATUS_TONE = { completed: 'success', returned: 'danger', cancelled: 'danger' };

/** Return some or all goods of a sale. */
export function ReturnModal({ sale, open, onClose, onReturned }) {
  const { t } = useI18n();
  const [qty, setQty] = useState({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setQty({}); setReason(''); } }, [open]);
  if (!sale) return null;

  const all = () => setQty(Object.fromEntries(sale.items.map((it) => [it.productId, String(it.quantity)])));
  const amount = sale.items.reduce((s, it) => {
    const q = Math.min(Number(qty[it.productId]) || 0, it.quantity);
    return s + (it.quantity ? (it.total * q) / it.quantity : 0);
  }, 0);
  const chosen = sale.items.map((it) => ({ productId: it.productId, quantity: Math.min(Number(qty[it.productId]) || 0, it.quantity) })).filter((x) => x.quantity > 0);

  const submit = async () => {
    if (!chosen.length) { toast.error(t('sales.returnNothing')); return; }
    setSaving(true);
    try {
      const whole = chosen.length === sale.items.length && chosen.every((c) => c.quantity === sale.items.find((it) => it.productId === c.productId).quantity);
      const updated = await salesApi.returnSale(sale.id, { items: whole ? undefined : chosen, reason });
      haptic('success');
      toast.success(t('sales.returnDone', { sum: formatMoney(updated.returns.at(-1)?.amount ?? amount) }));
      onReturned(updated);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('sales.returnTitle', { inv: sale.invoiceNo })}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant="danger" icon={Undo2} loading={saving} onClick={submit}>{t('sales.returnBtn', { sum: formatMoney(amount) })}</Button></>}>
      <button type="button" className="mb-3 text-sm font-medium text-brand-700 hover:underline dark:text-brand-400" onClick={all}>{t('sales.returnAll')}</button>
      <ul className="mb-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
        {sale.items.map((it) => (
          <li key={it.productId} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{it.productName}</p>
              <p className="num text-xs text-zinc-500">{formatNumber(it.quantity)} × {formatMoney(it.unitPrice)}</p>
            </div>
            <input className="input num h-9 w-20 text-center" inputMode="numeric" placeholder="0" aria-label={t('sales.returnQty')}
              value={qty[it.productId] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [it.productId]: cleanQty(e.target.value, Number.isInteger(it.quantity) ? it.unit : 'kg') }))} />
            <span className="text-xs text-zinc-500">/ {it.quantity}</span>
          </li>
        ))}
      </ul>
      <Input label={t('sales.returnReason')} placeholder={t('sales.returnReasonPh')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
    </Modal>
  );
}

/** Sale details with lines, returns history and buttons for the receipt / a return. */
export default function SaleDetail({ sale, open, onClose, onReceipt, onReturn }) {
  const { t, td } = useI18n();
  const { user } = useAuth();
  if (!sale) return null;
  const owner = !isStaff(user);
  const row = (k, v) => <div key={k} className="flex justify-between gap-4 py-1.5"><dt className="text-zinc-500">{k}</dt><dd className="num text-right font-medium">{v}</dd></div>;

  return (
    <Modal open={open} onClose={onClose} title={sale.invoiceNo} description={formatDateTime(sale.createdAt)} size="md"
      footer={<>
        {owner && sale.status === 'completed' && <Button variant="secondary" icon={Undo2} onClick={onReturn}>{t('sales.return')}</Button>}
        <Button icon={Printer} onClick={onReceipt} disabled={!sale.items.length}>{t('sales.receipt')}</Button>
      </>}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge tone={STATUS_TONE[sale.status]}>{t(`sales.status.${sale.status}`)}</Badge>
        {sale.status === 'completed' && sale.returned > 0 && <Badge tone="warning">{t('sales.partlyReturned')}</Badge>}
        <Badge>{t(`pay.${sale.paymentMethod}`)}</Badge>
      </div>
      {sale.items.length > 0 && (
        <ul className="mb-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-700">
          {sale.items.map((it) => (
            <li key={it.productId} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{it.productName}</p>
                <p className="num text-xs text-zinc-500">{formatNumber(it.quantity)} × {formatMoney(it.unitPrice)}{it.discount > 0 ? ` · −${formatMoney(it.discount)}` : ''}</p>
              </div>
              <span className="num font-semibold">{formatMoney(it.total)}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
        {sale.discount > 0 && row(t('cart.subtotal'), formatMoney(sale.subtotal))}
        {sale.discount > 0 && row(t('cart.discount'), `−${formatMoney(sale.discount)}`)}
        {row(t('th.total'), formatMoney(sale.total))}
        {sale.profit !== null && row(t('kpi.grossProfit'), formatMoney(sale.profit))}
        {row(t('field.customer'), td(sale.customer))}
        {sale.customerPhone && row(t('field.phone'), sale.customerPhone)}
        {sale.dueDate && row(t('cart.dueDate'), formatDate(sale.dueDate))}
        {sale.sellerName && row(t('sales.seller'), sale.sellerName)}
        {sale.note && row(t('cart.note'), sale.note)}
      </dl>
      {sale.returns.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400">{t('sales.returnHistory')}</p>
          <ul className="space-y-1.5 text-sm">
            {sale.returns.map((r) => (
              <li key={r.id} className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-500/10">
                <div className="flex justify-between gap-3"><span className="text-zinc-600 dark:text-zinc-300">{formatDateTime(r.createdAt)}{r.byName ? ` · ${r.byName}` : ''}</span><span className="num font-medium text-red-700 dark:text-red-400">−{formatMoney(r.amount)}</span></div>
                <p className="text-xs text-zinc-500">{r.items.map((it) => `${it.productName} × ${it.quantity}`).join(', ')}{r.reason ? ` — ${r.reason}` : ''}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
