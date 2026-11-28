import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock, Crown, FlaskConical, Loader2, Package, XCircle } from 'lucide-react';
import { billingApi } from '../api/billing.api';
import { getErrorMessage } from '../api/axios';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/common/ui';
import { DURATIONS, PLAN_LABEL, daysLeft } from '../utils/plans';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../utils/format';
import { cn } from '../utils/cn';
import { haptic } from '../telegram';
import SupportCard from '../components/common/SupportCard';

const STATUS_TONE = { paid: 'success', pending: 'warning', cancelled: 'danger' };
const PROVIDER_LABEL = { click: 'Click', payme: 'Payme', test: 'Test', points: 'Bonus', contest: 'Konkurs' };

/** After returning from Click / Payme: poll the payment until it is paid (max ~2 min). */
function PaymentReturn({ id, onPaid }) {
  const { t } = useI18n();
  const [status, setStatus] = useState('pending');
  const paidRef = useRef(onPaid);
  paidRef.current = onPaid;
  useEffect(() => {
    let alive = true;
    let tries = 0;
    const tick = async () => {
      try {
        const p = await billingApi.payment(id);
        if (!alive) return;
        setStatus(p.status);
        if (p.status === 'paid') { haptic('success'); paidRef.current(); return; }
        if (p.status === 'cancelled') return;
      } catch { /* keep trying */ }
      if (alive && ++tries < 40) setTimeout(tick, 3000);
      else if (alive) setStatus('timeout');
    };
    tick();
    return () => { alive = false; };
  }, [id]);

  const view = {
    pending: { icon: Loader2, cls: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200', text: t('billing.waiting'), spin: true },
    timeout: { icon: Clock, cls: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200', text: t('billing.timeout') },
    paid: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200', text: t('billing.paidOk') },
    cancelled: { icon: XCircle, cls: 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200', text: t('billing.cancelled') },
  }[status];
  return (
    <div className={cn('mb-6 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm', view.cls)} role="status">
      <view.icon className={cn('h-5 w-5 shrink-0', view.spin && 'animate-spin')} /> {view.text}
    </div>
  );
}

function ProviderButton({ provider, enabled, loading, onClick }) {
  const { t } = useI18n();
  const styles = {
    click: 'bg-[#0073ff] text-white hover:bg-[#0062d9]',
    payme: 'bg-[#00c4c8] text-white hover:bg-[#00acb0]',
    test: 'border border-dashed border-zinc-400 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200',
  };
  return (
    <div className="flex-1">
      <button type="button" disabled={!enabled || loading} onClick={onClick}
        className={cn('flex h-12 w-full items-center justify-center gap-2 rounded-lg text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-40', styles[provider])}>
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : provider === 'test' ? <FlaskConical className="h-5 w-5" /> : null}
        {provider === 'test' ? t('billing.testPay') : t('billing.payWith', { provider: PROVIDER_LABEL[provider] })}
      </button>
      {!enabled && provider !== 'test' && <p className="mt-1 text-center text-xs text-zinc-500">{t('billing.notConfigured')}</p>}
      {provider === 'test' && <p className="mt-1 text-center text-xs text-zinc-500">{t('billing.testHint')}</p>}
    </div>
  );
}

const limitText = (t, v, unit) => (v === null ? t('billing.unlimited') : `${formatNumber(v)} ${unit}`);

export default function BillingPage() {
  const { t } = useI18n();
  const { user, refreshUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const returnedPayment = params.get('payment');

  const plans = useApi(() => billingApi.plans(), []);
  const sub = useApi(() => billingApi.subscription(), []);
  const history = useApi(() => billingApi.payments(), []);
  const [months, setMonths] = useState(1);
  const [selected, setSelected] = useState('pro');
  const [paying, setPaying] = useState('');

  const reloadAll = () => { refreshUser().catch(() => {}); sub.reload(); history.reload(); };

  const pay = async (provider) => {
    setPaying(provider);
    try {
      const { payment, checkoutUrl } = await billingApi.checkout({ plan: selected, months, provider });
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      if (payment.status === 'paid') {
        haptic('success');
        toast.success(t('billing.activated', { plan: PLAN_LABEL[selected] }));
        reloadAll();
      }
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPaying('');
    }
  };

  const current = user?.subscription;
  const providers = plans.data?.providers || {};
  // Payments not integrated yet (backend PAYMENTS_ENABLED=false): plans are shown, buying is closed.
  const purchasingEnabled = plans.data?.purchasingEnabled === true;
  const planList = plans.data?.plans || [];
  const chosen = planList.find((p) => p.id === selected);
  const price = chosen?.prices?.[months];

  return (
    <>
      <PageHeader title={t('billing.title')} description={t('billing.desc')} />

      {returnedPayment && (
        <PaymentReturn id={returnedPayment} onPaid={() => { reloadAll(); setTimeout(() => setParams({}, { replace: true }), 4000); }} />
      )}

      {/* current plan + usage */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="card card-pad">
          <p className="flex items-center gap-2 text-xs font-medium text-zinc-500"><Crown className="h-4 w-4 text-brand-600 dark:text-brand-400" /> {t('billing.current')}</p>
          <p className="mt-2 text-xl font-semibold">{PLAN_LABEL[current?.plan || 'free']}</p>
          <p className="text-xs text-zinc-500">
            {current?.unlimited ? t('billing.adminUnlimited') : current?.expiresAt ? t('billing.activeUntil', { date: formatDate(current.expiresAt), n: daysLeft(current.expiresAt) }) : t('billing.freeDescNew')}
          </p>
        </div>
        <div className="card card-pad">
          <p className="flex items-center gap-2 text-xs font-medium text-zinc-500"><Package className="h-4 w-4" /> {t('billing.productsUsed')}</p>
          <p className="num mt-2 text-xl font-semibold">
            {sub.loading ? '…' : formatNumber(sub.data?.usage?.products ?? 0)}
            <span className="text-sm font-normal text-zinc-500"> / {current?.limits?.products == null ? '∞' : formatNumber(current.limits.products)}</span>
          </p>
          {current?.limits?.products != null && sub.data?.usage && (
            <div className="mt-2 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${Math.min(100, (sub.data.usage.products / current.limits.products) * 100)}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* duration */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('billing.period')}:</span>
        {(plans.data?.durations || [1, 3, 6, 12]).map((m) => (
          <button key={m} type="button" onClick={() => setMonths(m)} aria-pressed={months === m}
            className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium transition',
              months === m ? 'border-brand-600 bg-brand-600 text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300')}>
            {t('billing.months', { n: m })}
            {DURATIONS[m] > 0 && <span className={cn('ml-1 text-xs', months === m ? 'text-white/80' : 'text-emerald-600')}>−{Math.round(DURATIONS[m] * 100)}%</span>}
          </button>
        ))}
      </div>

      {/* plans */}
      {plans.loading ? <div className="mb-6 grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}</div>
        : plans.error ? <Card className="mb-6"><ErrorState message={plans.error} onRetry={plans.reload} /></Card> : (
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            {planList.map((p) => {
              const isCurrent = current?.plan === p.id;
              const isSelected = selected === p.id;
              const paidPlan = p.id !== 'free';
              const has = (f) => (p.features || []).includes(f);
              const features = [
                [true, t('billing.fProducts', { n: limitText(t, p.limits.products, '') })],
                [true, t('billing.fSalesInventory')],
                ...['expenses', 'analytics', 'debts', 'suppliers'].map((f) => [has(f), t(`feature.${f}`)]),
                [has('staff'), has('staff') ? t('billing.fStaff', { n: p.limits.staff ?? '∞' }) : t('feature.staff')],
                [has('telegram'), t('feature.telegram')],
              ];
              return (
                <button key={p.id} type="button" disabled={!paidPlan} onClick={() => setSelected(p.id)}
                  className={cn('card card-pad flex flex-col text-left transition', paidPlan && 'hover:shadow-pop',
                    isSelected && paidPlan && 'ring-2 ring-brand-500', !paidPlan && 'cursor-default')}>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold">{PLAN_LABEL[p.id]}</p>
                    {isCurrent && <Badge tone="success">{t('billing.yourPlan')}</Badge>}
                    {p.id === 'pro' && !isCurrent && <Badge tone="info">{t('billing.popular')}</Badge>}
                  </div>
                  <p className="mt-3">
                    <span className="num text-2xl font-bold">{paidPlan ? formatMoney(p.prices?.[months]) : formatMoney(0)}</span>
                    {paidPlan && <span className="text-sm text-zinc-500"> / {t('billing.months', { n: months })}</span>}
                  </p>
                  {paidPlan && months > 1 && <p className="text-xs text-zinc-500">{t('billing.perMonth', { price: formatMoney(Math.round(p.prices[months] / months)) })}</p>}
                  <ul className="mt-4 space-y-2 text-sm">
                    {features.map(([ok, text], i) => (
                      <li key={i} className={cn('flex items-start gap-2', !ok && 'text-zinc-400 line-through')}>
                        {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />} {text}
                      </li>
                    ))}
                  </ul>
                  {paidPlan && <span className={cn('btn mt-5 w-full', isSelected ? 'btn-primary' : 'btn-secondary')}>{isSelected ? t('billing.selected') : t('billing.choose')}</span>}
                </button>
              );
            })}
          </div>
        )}

      {/* pay */}
      {chosen && (
        <Card className="mb-6">
          <CardHeader title={t('billing.payTitle', { plan: PLAN_LABEL[selected], n: months })}
            subtitle={<>{t('billing.total')}: <b className="num text-zinc-900 dark:text-zinc-100">{formatMoney(price)}</b>{current?.plan === selected && current.expiresAt ? ` · ${t('billing.extends')}` : ''}</>} />
          {purchasingEnabled ? (
            <div className="flex flex-col gap-3 p-5 sm:flex-row">
              <ProviderButton provider="click" enabled={providers.click} loading={paying === 'click'} onClick={() => pay('click')} />
              <ProviderButton provider="payme" enabled={providers.payme} loading={paying === 'payme'} onClick={() => pay('payme')} />
              {providers.test && <ProviderButton provider="test" enabled loading={paying === 'test'} onClick={() => pay('test')} />}
            </div>
          ) : (
            <div className="p-5">
              <button type="button" disabled className="flex h-12 w-full cursor-not-allowed items-center justify-center rounded-lg bg-zinc-200 text-base font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                {t('billing.buy')}
              </button>
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200" role="status">
                <p className="font-medium">{t('billing.notIntegratedTitle')}</p>
                <p className="mt-0.5 text-xs opacity-90">{t('billing.notIntegratedText')}</p>
              </div>
            </div>
          )}
        </Card>
      )}

      <SupportCard className="mb-6" />

      {/* history */}
      <Card className="overflow-hidden">
        <CardHeader title={t('billing.history')} />
        <div className="mt-3">
          {history.loading ? <Skeleton className="m-5 h-24" /> : history.error ? <ErrorState message={history.error} onRetry={history.reload} />
            : !history.data?.length ? <EmptyState title={t('billing.noPayments')} /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>#</th><th>{t('billing.date')}</th><th>{t('billing.plan')}</th><th>{t('billing.method')}</th><th className="text-right">{t('billing.amount')}</th><th>{t('billing.status')}</th></tr></thead>
                  <tbody>
                    {history.data.map((p) => (
                      <tr key={p.id}>
                        <td className="num text-zinc-500">{p.orderNo}</td>
                        <td>{formatDateTime(p.createdAt)}</td>
                        <td>{PLAN_LABEL[p.plan]} · {t('billing.months', { n: p.months })}</td>
                        <td>{PROVIDER_LABEL[p.provider]}</td>
                        <td className="num text-right">{formatMoney(p.amount)}</td>
                        <td><Badge tone={STATUS_TONE[p.status]}>{t(`billing.st.${p.status}`)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </Card>
    </>
  );
}
