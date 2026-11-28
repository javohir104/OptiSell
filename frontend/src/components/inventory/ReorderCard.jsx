import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, Send, ShoppingBag } from 'lucide-react';
import { salesApi } from '../../api/sales.api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton } from '../common/ui';
import { allowsFraction } from '../../utils/units';
import { daysAgo, formatMoney, formatNumber } from '../../utils/format';
import { hasFeature } from '../../utils/plans';
import { openLink } from '../../telegram';
import { cn } from '../../utils/cn';

const WINDOW = 30; // days of sales history used for the daily rate

/**
 * "What to order": daily sales rate over the last 30 days -> days of stock left -> quantity to
 * buy so the shelf lasts `cover` days plus the minimum level (never above the max level).
 */
export function reorderPlan(products, saleRows, cover) {
  const sold = new Map();
  for (const r of saleRows) sold.set(r.productId, (sold.get(r.productId) || 0) + r.quantity);
  return products
    .map((p) => {
      const rate = (sold.get(p.id) || 0) / WINDOW;
      const daysLeft = rate > 0 ? p.stock / rate : Infinity;
      let need = rate * cover + p.minStock - p.stock;
      if (p.maxStock) need = Math.min(need, p.maxStock - p.stock);
      need = allowsFraction(p.unit) ? Math.round(need * 10) / 10 : Math.ceil(need);
      return { p, rate, daysLeft, need: Math.max(0, need) };
    })
    .filter((x) => x.need > 0 && (x.daysLeft <= cover || x.p.stock <= x.p.minStock))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export default function ReorderCard({ products }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [cover, setCover] = useState(14);
  const sales = useApi(() => salesApi.list({ from: daysAgo(WINDOW - 1) }), []);
  const plan = useMemo(() => reorderPlan(products || [], sales.data || [], cover), [products, sales.data, cover]);
  const total = plan.reduce((s, x) => s + x.need * x.p.cost, 0);

  const text = () => [
    `${t('reorder.listTitle')} — ${user?.businessName || 'OptiSell'}`,
    ...plan.map((x, i) => `${i + 1}. ${x.p.name} — ${formatNumber(x.need)} ${x.p.unit}`),
  ].join('\n');
  const copy = async () => { try { await navigator.clipboard.writeText(text()); toast.success(t('bonus.copied')); } catch { window.prompt('', text()); } };
  const share = () => openLink(`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text())}`);

  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader title={<span className="flex items-center gap-2"><ShoppingBag className="h-4 w-4" /> {t('reorder.title')}</span>}
        subtitle={t('reorder.subtitle', { days: cover })}
        action={<div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
            {[7, 14, 30].map((d) => (
              <button key={d} type="button" onClick={() => setCover(d)} className={cn('rounded-md px-2.5 py-1 font-medium', cover === d ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500')}>{t('reorder.days', { n: d })}</button>
            ))}
          </div>
          {plan.length > 0 && <><Button size="sm" variant="secondary" icon={Copy} onClick={copy}>{t('reorder.copy')}</Button><Button size="sm" variant="secondary" icon={Send} onClick={share}>Telegram</Button></>}
          {plan.length > 0 && hasFeature(user, 'suppliers') && <Link to="/suppliers" className="btn btn-primary btn-sm">{t('sup.newPurchase')}</Link>}
        </div>} />
      <div className="mt-3">
        {sales.loading || !products ? <Skeleton className="m-5 h-24" /> : !plan.length ? <EmptyState icon={ShoppingBag} title={t('reorder.none')} message={t('reorder.noneMsg')} /> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('th.product')}</th><th className="text-right">{t('th.stock')}</th><th className="text-right">{t('reorder.perDay')}</th><th className="text-right">{t('reorder.daysLeft')}</th><th className="text-right">{t('reorder.order')}</th><th className="text-right">{t('count.value')}</th></tr></thead>
                <tbody>
                  {plan.map(({ p, rate, daysLeft, need }) => (
                    <tr key={p.id}>
                      <td className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}</td>
                      <td className="num text-right">{formatNumber(p.stock)} {p.unit}</td>
                      <td className="num text-right text-zinc-500">{rate ? formatNumber(Math.round(rate * 10) / 10) : '—'}</td>
                      <td className="text-right">{daysLeft === Infinity ? '—' : <Badge tone={daysLeft < 3 ? 'danger' : daysLeft < 7 ? 'warning' : 'neutral'}>{t('reorder.days', { n: Math.floor(daysLeft) })}</Badge>}</td>
                      <td className="num text-right font-semibold text-brand-700 dark:text-brand-400">+{formatNumber(need)} {p.unit}</td>
                      <td className="num text-right text-zinc-500">{formatMoney(need * p.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-zinc-100 px-5 py-3 text-right text-sm dark:border-zinc-800">{t('reorder.total')}: <b className="num">{formatMoney(total)}</b></p>
          </>
        )}
      </div>
    </Card>
  );
}
