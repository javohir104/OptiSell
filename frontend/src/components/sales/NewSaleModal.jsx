import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Lock, Minus, Plus, ScanLine, Search, Trash2, WifiOff } from 'lucide-react';
import Modal from '../common/Modal';
import BarcodeScanner from '../common/BarcodeScanner';
import { Button, Input, Select } from '../common/ui';
import { productsApi } from '../../api/products.api';
import { salesApi } from '../../api/sales.api';
import { customersApi } from '../../api/customers.api';
import { getErrorMessage } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { hasFeature } from '../../utils/plans';
import { cacheProducts, cachedProducts, isNetworkError } from '../../utils/offline';
import { currencyLabel, formatMoney, toDayKey } from '../../utils/format';
import { haptic } from '../../telegram';
import { cn } from '../../utils/cn';
import { allowsFraction, cleanQty, validQty } from '../../utils/units';

const PAYMENTS = ['cash', 'card', 'transfer', 'debt'];
const EMPTY = { paymentMethod: 'cash', customerId: '', customerName: '', dueDate: '', discountType: 'percent', discountValue: '', note: '' };

const inTwoWeeks = () => toDayKey(Date.now() + 14 * 86400000);

/** Products for the till: live list, or the copy saved on this device when offline. */
function useTillProducts(open, userId) {
  const [state, setState] = useState({ list: [], loading: false, offline: false });
  const reload = async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const list = await productsApi.list();
      cacheProducts(userId, list);
      setState({ list, loading: false, offline: false });
    } catch (err) {
      const cached = isNetworkError(err) ? cachedProducts(userId) : null;
      setState({ list: cached || [], loading: false, offline: !!cached });
      if (!cached) toast.error(getErrorMessage(err));
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) reload(); }, [open]);
  return { ...state, reload };
}

export default function NewSaleModal({ open, onClose, onCreated, initialProductId }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const canDebt = hasFeature(user, 'debts');
  const products = useTillProducts(open, user?.id);
  const [cart, setCart] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [newCustomer, setNewCustomer] = useState(null); // { name, phone } while adding
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setCart([]); setForm(EMPTY); setQuery(''); setErr(''); setNewCustomer(null);
    if (canDebt) customersApi.list().then((r) => setCustomers(r.items)).catch(() => setCustomers([]));
    setTimeout(() => searchRef.current?.focus(), 150);
  }, [open, canDebt]);

  // Opened from a product ("sell this"): start with it in the cart.
  useEffect(() => {
    if (!open || !initialProductId || !products.list.length) return;
    const p = products.list.find((x) => String(x.id) === String(initialProductId));
    if (p) setCart((c) => (c.length ? c : [{ ...line(p) }]));
  }, [open, initialProductId, products.list]);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErr(''); };
  const line = (p) => ({ productId: p.id, name: p.name, unit: p.unit, stock: p.stock, listPrice: p.price, unitPrice: String(p.price), quantity: '1' });

  const addProduct = (p) => {
    if (!p) return;
    if (p.stock <= 0) { toast.error(t('cart.outOfStock', { name: p.name })); haptic('error'); return; }
    haptic('light');
    setCart((c) => {
      const i = c.findIndex((x) => x.productId === p.id);
      if (i === -1) return [...c, line(p)];
      const next = [...c];
      next[i] = { ...next[i], quantity: String(Math.round(Math.min(p.stock, (Number(next[i].quantity) || 0) + 1) * 1000) / 1000) };
      return next;
    });
    setQuery('');
    setErr('');
  };

  /** Scanner / Enter: exact barcode or SKU first (in the loaded list, then the server). */
  const findByCode = async (raw) => {
    const code = String(raw).trim();
    if (!code) return;
    const lower = code.toLowerCase();
    const local = products.list.find((p) => p.barcode === code) || products.list.find((p) => String(p.sku).toLowerCase() === lower);
    if (local) return addProduct(local);
    if (!products.offline) {
      try { return addProduct(await productsApi.lookup(code)); } catch { /* not found */ }
    }
    const byName = products.list.filter((p) => p.name.toLowerCase().includes(lower));
    if (byName.length === 1) return addProduct(byName[0]);
    if (!byName.length) { haptic('error'); toast.error(t('cart.notFound', { code })); }
    return undefined;
  };

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? products.list.filter((p) => p.name.toLowerCase().includes(q) || String(p.sku).toLowerCase().includes(q) || (p.barcode || '').includes(q))
      : products.list;
    return list.slice(0, q ? 8 : 6);
  }, [query, products.list]);

  const setLine = (i, k, v) => setCart((c) => c.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  // − / + change by 1 (by 0.1 for kg, l, m...).
  const step = (i, d) => setCart((c) => c.map((x, j) => {
    if (j !== i) return x;
    const by = allowsFraction(x.unit) ? 0.1 : 1;
    const next = Math.round(Math.max(by, Math.min(x.stock, (Number(x.quantity) || 0) + d * by)) * 1000) / 1000;
    return { ...x, quantity: String(next) };
  }));

  const subtotal = cart.reduce((s, x) => s + (Number(x.quantity) || 0) * (Number(x.unitPrice) || 0), 0);
  const dv = Number(form.discountValue) || 0;
  const discount = form.discountType === 'percent' ? Math.round((subtotal * Math.min(dv, 100)) / 100) : dv;
  const total = Math.max(0, subtotal - discount);

  const submit = async (e) => {
    e?.preventDefault();
    if (!cart.length) return setErr(t('err.chooseProduct'));
    for (const x of cart) {
      const q = Number(x.quantity);
      if (!validQty(q, x.unit)) return setErr(`${x.name}: ${t('err.qtyWhole')}`);
      if (q > x.stock) return setErr(`${x.name}: ${t('sales.onlyN', { n: x.stock, unit: x.unit })}`);
      if (x.unitPrice === '' || Number(x.unitPrice) < 0) return setErr(`${x.name}: ${t('err.price')}`);
    }
    if (discount > subtotal) return setErr(t('cart.discountTooBig'));
    let customerId = form.customerId;
    if (form.paymentMethod === 'debt' && !customerId && !newCustomer?.name?.trim()) return setErr(t('cart.debtNeedsCustomer'));

    setSaving(true);
    try {
      if (newCustomer?.name?.trim()) {
        const c = await customersApi.create(newCustomer);
        customerId = c.id;
        setCustomers((list) => [...list, c]);
      }
      const { sale, offline } = await salesApi.createSale({
        items: cart.map((x) => ({ productId: x.productId, quantity: x.quantity, name: x.name, unitPrice: Number(x.unitPrice) === x.listPrice ? undefined : x.unitPrice })),
        paymentMethod: form.paymentMethod,
        customerId: customerId || undefined,
        customerName: customerId ? undefined : form.customerName,
        dueDate: form.paymentMethod === 'debt' ? form.dueDate || inTwoWeeks() : undefined,
        discountType: dv > 0 ? form.discountType : undefined,
        discountValue: dv > 0 ? dv : undefined,
        note: form.note,
        expectedTotal: total,
      }, { userId: user?.id });
      haptic('success');
      if (offline) toast(t('cart.savedOffline'), { icon: '📴', duration: 5000 });
      else toast.success(t('sales.recorded', { inv: sale.invoiceNo }));
      onCreated?.(sale, { offline });
      onClose();
    } catch (e2) {
      haptic('error');
      setErr(getErrorMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  const cur = currencyLabel();
  const debt = form.paymentMethod === 'debt';

  return (
    <>
      <Modal open={open} onClose={onClose} title={t('sales.record')} size="lg"
        description={products.offline ? t('offline.cached') : undefined}
        footer={<>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="cart-form" loading={saving} disabled={!cart.length}>{t('cart.sell', { sum: formatMoney(total) })}</Button>
        </>}>
        <form id="cart-form" onSubmit={submit} noValidate className="space-y-4">
          {products.offline && <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><WifiOff className="h-4 w-4" /> {t('offline.banner')}</p>}

          {/* search / scan */}
          <div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input ref={searchRef} className="input pl-9" placeholder={t('cart.scanOrSearch')} value={query}
                  onChange={(e) => setQuery(e.target.value)} aria-label={t('cart.scanOrSearch')}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); findByCode(query); } }} />
              </div>
              <Button variant="secondary" icon={ScanLine} onClick={() => setScanOpen(true)} aria-label={t('scan.title')}><span className="hidden sm:inline">{t('cart.camera')}</span></Button>
            </div>
            {(query || !cart.length) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {products.loading ? <span className="text-xs text-zinc-500">{t('common.loading')}</span> : suggestions.map((p) => (
                  <button key={p.id} type="button" onClick={() => addProduct(p)} disabled={p.stock <= 0}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-left text-xs hover:border-brand-500 hover:bg-brand-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-brand-500/10">
                    <span className="block max-w-[180px] truncate font-medium text-zinc-900 dark:text-zinc-100">{p.name}</span>
                    <span className="num text-zinc-500">{formatMoney(p.price)} · {t('sales.left', { n: p.stock })}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* cart lines */}
          {!cart.length ? (
            <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">{t('cart.empty')}</p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
              {cart.map((x, i) => (
                <li key={x.productId} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{x.name}</p>
                    <p className="text-xs text-zinc-500">{t('sales.left', { n: x.stock })}</p>
                  </div>
                  <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <button type="button" className="grid h-8 w-8 place-items-center text-zinc-500" onClick={() => step(i, -1)} aria-label="−"><Minus className="h-3.5 w-3.5" /></button>
                    <input className="num h-8 w-14 border-0 bg-transparent text-center text-sm outline-none" inputMode={allowsFraction(x.unit) ? 'decimal' : 'numeric'} value={x.quantity}
                      onChange={(e) => setLine(i, 'quantity', cleanQty(e.target.value, x.unit))} aria-label={t('field.quantity')} />
                    {allowsFraction(x.unit) && <span className="pr-1 text-xs text-zinc-500">{x.unit}</span>}
                    <button type="button" className="grid h-8 w-8 place-items-center text-zinc-500" onClick={() => step(i, 1)} aria-label="+"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                  <input className="input num h-8 w-28 text-right text-sm" inputMode="decimal" value={x.unitPrice}
                    onChange={(e) => setLine(i, 'unitPrice', e.target.value.replace(/[^\d.]/g, ''))} aria-label={t('cart.priceEdit')} title={t('cart.priceEdit')} />
                  <span className="num w-28 text-right text-sm font-semibold">{formatMoney((Number(x.quantity) || 0) * (Number(x.unitPrice) || 0))}</span>
                  <button type="button" onClick={() => setCart((c) => c.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10" aria-label={t('cart.remove')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* payment, customer, discount */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pay">{t('field.payment')}</label>
              <div id="pay" className="grid grid-cols-2 gap-1.5">
                {PAYMENTS.map((m) => {
                  const locked = m === 'debt' && !canDebt;
                  return (
                    <button key={m} type="button" disabled={locked} title={locked ? t('cart.debtLocked') : undefined}
                      onClick={() => { setForm((f) => ({ ...f, paymentMethod: m, dueDate: m === 'debt' && !f.dueDate ? inTwoWeeks() : f.dueDate })); setErr(''); }}
                      className={cn('flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition disabled:opacity-50',
                        form.paymentMethod === m ? 'border-brand-600 bg-brand-600 text-white' : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800')}>
                      {locked && <Lock className="h-3 w-3" />}{t(`pay.${m}`)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="discount">{t('cart.discount')}</label>
              <div className="flex gap-1.5">
                <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
                  {['percent', 'amount'].map((k) => (
                    <button key={k} type="button" onClick={() => setForm((f) => ({ ...f, discountType: k }))}
                      className={cn('rounded-md px-2.5 text-xs font-medium', form.discountType === k ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-500')}>
                      {k === 'percent' ? '%' : cur}
                    </button>
                  ))}
                </div>
                <input id="discount" className="input num flex-1" inputMode="decimal" placeholder="0" value={form.discountValue}
                  onChange={(e) => { setForm((f) => ({ ...f, discountValue: e.target.value.replace(/[^\d.]/g, '') })); setErr(''); }} />
              </div>
            </div>

            {canDebt ? (
              <div className={cn(debt ? '' : 'sm:col-span-2')}>
                {newCustomer ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Input label={t('cust.name')} value={newCustomer.name} onChange={(e) => setNewCustomer((c) => ({ ...c, name: e.target.value }))} autoFocus />
                    <Input label={t('field.phone')} type="tel" placeholder="+998 90 123 45 67" value={newCustomer.phone} onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))} />
                    <button type="button" className="col-span-2 text-left text-xs text-zinc-500 hover:underline" onClick={() => setNewCustomer(null)}>{t('common.cancel')}</button>
                  </div>
                ) : (
                  <Select label={t('cart.customer')} value={form.customerId} onChange={(e) => {
                    if (e.target.value === '__new') { setNewCustomer({ name: '', phone: '' }); setForm((f) => ({ ...f, customerId: '' })); return; }
                    set('customerId')(e);
                  }}>
                    <option value="">{debt ? t('cart.chooseCustomer') : t('data.Walk-in')}</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}{c.balance > 0 ? ` · ${t('sup.debtShort', { sum: formatMoney(c.balance) })}` : ''}</option>)}
                    <option value="__new">{t('cart.newCustomer')}</option>
                  </Select>
                )}
              </div>
            ) : (
              <Input className="sm:col-span-2" label={t('field.customer')} placeholder={t('data.Walk-in')} value={form.customerName} onChange={set('customerName')} />
            )}
            {debt && <Input label={t('cart.dueDate')} type="date" min={toDayKey(Date.now())} value={form.dueDate} onChange={set('dueDate')} />}
          </div>

          {/* totals */}
          <div className="space-y-1 rounded-lg bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-800/50">
            <div className="flex justify-between text-zinc-500"><span>{t('cart.subtotal')} · {t('cart.items', { n: cart.length })}</span><span className="num">{formatMoney(subtotal)}</span></div>
            {discount > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>{t('cart.discount')}</span><span className="num">−{formatMoney(discount)}</span></div>}
            <div className="flex items-center justify-between"><span className="font-medium">{t('cart.total')}</span><span className="num text-lg font-semibold">{formatMoney(total)}</span></div>
          </div>
          {err && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{err}</p>}
        </form>
      </Modal>
      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={(code) => { setScanOpen(false); findByCode(code); }} />
    </>
  );
}
