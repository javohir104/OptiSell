import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, ArrowUpDown, ImageOff, Minus, Package, Pencil, Plus, Search, Trash2, Barcode } from 'lucide-react';
import { productsApi } from '../api/products.api';
import { salesApi } from '../api/sales.api';
import { inventoryApi } from '../api/inventory.api';
import { getErrorMessage } from '../api/axios';
import { useApi } from '../hooks/useApi';
import { useDebounce } from '../hooks/useDebounce';
import { useI18n } from '../i18n';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, Card, EmptyState, ErrorState, PageHeader, Select, TableSkeleton } from '../components/common/ui';
import Modal, { ConfirmDialog } from '../components/common/Modal';
import StockBadge from '../components/common/StockBadge';
import Pagination, { usePagination } from '../components/common/Pagination';
import ProductForm from '../components/products/ProductForm';
import { daysAgo, formatDate, formatMoney, formatNumber, formatPercent, toDayKey } from '../utils/format';
import { margin, stockStatus } from '../utils/stock';

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  category: (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  price: (a, b) => a.price - b.price,
  cost: (a, b) => a.cost - b.cost,
  margin: (a, b) => margin(a) - margin(b),
  stock: (a, b) => a.stock - b.stock,
};

const SORT_OPTIONS = [
  ['name:1', 'sort.nameAZ'], ['name:-1', 'sort.nameZA'], ['category:1', 'sort.category'],
  ['price:-1', 'sort.priceDesc'], ['price:1', 'sort.priceAsc'], ['cost:-1', 'sort.costDesc'], ['cost:1', 'sort.costAsc'],
  ['margin:-1', 'sort.marginDesc'], ['margin:1', 'sort.marginAsc'], ['stock:1', 'sort.stockAsc'], ['stock:-1', 'sort.stockDesc'],
];

/** Product image when the backend provides `imageUrl`; neutral placeholder otherwise. */
function ProductThumb({ product, size = 'h-9 w-9' }) {
  const [broken, setBroken] = useState(false);
  if (product.imageUrl && !broken) {
    return <img src={product.imageUrl} alt="" loading="lazy" onError={() => setBroken(true)} className={`${size} shrink-0 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700`} />;
  }
  return (
    <span className={`${size} grid shrink-0 place-items-center rounded-lg bg-zinc-100 text-xs font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400`} aria-hidden="true">
      {product.imageUrl ? <ImageOff className="h-4 w-4" /> : product.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Today's sold / added units for one product, with quick −1 (sale) and +1 (restock) buttons. */
function QuickStock({ product, onChanged }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const today = useApi(async () => {
    const day = toDayKey(Date.now());
    const [sales, movements] = await Promise.all([
      salesApi.list({ productId: product.id, from: day, to: day }),
      inventoryApi.movements({ productId: product.id, limit: 100 }),
    ]);
    const sold = sales.filter((s) => toDayKey(s.createdAt) === day).reduce((n, s) => n + s.quantity, 0);
    const added = movements.filter((m) => m.type === 'in' && toDayKey(m.createdAt) === day).reduce((n, m) => n + m.quantity, 0);
    return { sold, added };
  }, [product.id]);

  const change = async (delta) => {
    setBusy(true);
    try {
      let updated;
      if (delta < 0) {
        await salesApi.create({ productId: product.id, quantity: 1 });
        updated = await productsApi.get(product.id);
        toast.success(t('prod.soldOneToast', { unit: product.unit }));
      } else {
        ({ product: updated } = await inventoryApi.adjust({ productId: product.id, type: 'in', quantity: 1, note: 'Quick +1' }));
        toast.success(t('prod.addedOneToast', { unit: product.unit }));
      }
      onChanged(updated);
      today.setData((d) => (d ? { sold: d.sold + (delta < 0 ? 1 : 0), added: d.added + (delta > 0 ? 1 : 0) } : d));
    } catch (e) { toast.error(getErrorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="mb-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" size="icon" aria-label={t('prod.sellOne')} title={t('prod.sellOne')} disabled={busy || product.stock <= 0} onClick={() => change(-1)}><Minus className="h-4 w-4" /></Button>
        <div className="text-center">
          <p className="num text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{formatNumber(product.stock)} <span className="text-sm font-normal text-zinc-500">{product.unit}</span></p>
          <p className="text-xs text-zinc-500">{t('th.stock')}</p>
        </div>
        <Button variant="secondary" size="icon" aria-label={t('prod.addOne')} title={t('prod.addOne')} disabled={busy} onClick={() => change(1)}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-sm">
        <div className="rounded-md bg-red-50 py-2 text-red-700 dark:bg-red-500/10 dark:text-red-300">
          <p className="num text-lg font-semibold">{today.loading ? '…' : `−${formatNumber(today.data?.sold ?? 0)}`}</p>
          <p className="text-xs">{t('prod.soldToday')}</p>
        </div>
        <div className="rounded-md bg-emerald-50 py-2 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <p className="num text-lg font-semibold">{today.loading ? '…' : `+${formatNumber(today.data?.added ?? 0)}`}</p>
          <p className="text-xs">{t('prod.addedToday')}</p>
        </div>
      </div>
    </div>
  );
}

function ProductDetails({ product, onClose, onEdit, onChanged }) {
  const { t, td } = useI18n();
  const sales = useApi(() => (product ? salesApi.list({ productId: product.id, from: daysAgo(29) }) : Promise.resolve([])), [product?.id, product?.stock]);
  if (!product) return null;
  const units = (sales.data || []).reduce((s, x) => s + x.quantity, 0);
  const revenue = (sales.data || []).reduce((s, x) => s + x.total, 0);
  const rows = [
    ['field.sku', product.sku], ['field.category', td(product.category)], ['th.price', formatMoney(product.price)], ['field.unitCost', formatMoney(product.cost)],
    ['th.margin', formatPercent(margin(product))], ['th.stock', `${formatNumber(product.stock)} ${product.unit}`],
    ['prod.minMax', `${product.minStock} / ${product.maxStock || '—'}`], ['prod.stockValue', formatMoney(product.stock * product.cost)],
    ['prod.sold30', sales.loading ? '…' : `${units} ${product.unit}`], ['prod.revenue30', sales.loading ? '…' : formatMoney(revenue)],
    ['prod.updated', formatDate(product.updatedAt)],
  ];
  return (
    <Modal open onClose={onClose} title={product.name} description={<StockBadge product={product} />}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.close')}</Button><Button icon={Pencil} onClick={() => onEdit(product)}>{t('common.edit')}</Button></>}>
      {product.imageUrl && <div className="mb-4"><ProductThumb product={product} size="h-44 w-full" /></div>}
      <QuickStock product={product} onChanged={onChanged} />
      <dl className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between py-2"><dt className="text-zinc-500">{t(k)}</dt><dd className="num font-medium">{v}</dd></div>)}
      </dl>
      {product.description && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{product.description}</p>}
    </Modal>
  );
}

export default function ProductsPage() {
  const { t, td } = useI18n();
  const { data, loading, error, reload, setData } = useApi(() => productsApi.list(), []);
  const { user } = useAuth();
  const productLimit = user?.subscription?.limits?.products ?? null;
  const productCount = data?.length ?? 0;
  const atLimit = productLimit !== null && productCount >= productLimit;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const q = useDebounce(search).toLowerCase();

  const categories = useMemo(() => [...new Set((data || []).map((p) => p.category))].sort(), [data]);
  const rows = useMemo(() => {
    const list = (data || []).filter((p) => (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      && (!category || p.category === category) && (!status || stockStatus(p) === status));
    const cmp = SORTS[sort.key] || SORTS.name;
    return list.sort((a, b) => sort.dir * cmp(a, b));
  }, [data, q, category, status, sort]);
  const pager = usePagination(rows, 12, `${q}|${category}|${status}|${sort.key}|${sort.dir}`);
  const sortBy = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'name' || key === 'category' ? 1 : -1 }));
  // Plain render function (not a component) so header buttons keep focus across re-renders.
  const sortTh = (k, children, right) => {
    const Icon = sort.key !== k ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th className={right ? 'text-right' : undefined} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => sortBy(k)} className={`inline-flex items-center gap-1 uppercase hover:text-zinc-900 dark:hover:text-zinc-100 ${sort.key === k ? 'text-zinc-900 dark:text-zinc-100' : ''}`}>
          {children}<Icon className="h-3 w-3" />
        </button>
      </th>
    );
  };

  const save = async (payload) => {
    try {
      if (editing) {
        const updated = await productsApi.update(editing.id, payload);
        setData((d) => d.map((p) => (p.id === editing.id ? updated : p)));
        toast.success(t('prod.updatedToast'));
      } else {
        const created = await productsApi.create(payload);
        setData((d) => [...(d || []), created]);
        toast.success(t('prod.addedToast'));
      }
      setFormOpen(false); setEditing(null);
    } catch (e) { toast.error(getErrorMessage(e)); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await productsApi.remove(deleting.id);
      setData((d) => d.filter((p) => p.id !== deleting.id));
      toast.success(t('prod.deletedToast')); setDeleting(null);
    } catch (e) { toast.error(getErrorMessage(e)); } finally { setBusy(false); }
  };

  const openEdit = (p) => { setViewing(null); setEditing(p); setFormOpen(true); };
  const filtered = q || category || status;

  return (
    <>
      <PageHeader title={t('prod.title')}
        description={<>{t('prod.desc')} {data && <span className="num text-zinc-400">· {formatNumber(productCount)} / {productLimit === null ? '∞' : formatNumber(productLimit)}</span>}</>}
        actions={<>
          <Link to="/labels" className="btn btn-secondary"><Barcode className="h-4 w-4" /> {t('labels.title')}</Link>
          <Button icon={Plus} disabled={atLimit} onClick={() => { setEditing(null); setFormOpen(true); }}>{t('product.add')}</Button>
        </>} />
      {atLimit && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <span>{t('billing.limitReached', { n: formatNumber(productLimit) })}</span>
          <Link to="/billing" className="btn btn-primary btn-sm">{t('billing.upgrade')}</Link>
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-3 dark:border-zinc-800">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input className="input h-9 pl-9" placeholder={t('prod.searchPh')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('prod.searchA11y')} />
          </div>
          <Select className="w-40" value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('field.category')}><option value="">{t('common.allCategories')}</option>{categories.map((c) => <option key={c} value={c}>{td(c)}</option>)}</Select>
          <Select className="w-36" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('prod.stockStatus')}>
            <option value="">{t('prod.allStock')}</option>{['ok', 'low', 'out', 'over'].map((k) => <option key={k} value={k}>{t(`stock.${k}`)}</option>)}
          </Select>
          <Select className="w-48" value={`${sort.key}:${sort.dir}`} aria-label={t('prod.sort')}
            onChange={(e) => { const [key, dir] = e.target.value.split(':'); setSort({ key, dir: Number(dir) }); }}>
            {SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{t('prod.sortPrefix', { l: t(l) })}</option>)}
          </Select>
        </div>
        {loading ? <TableSkeleton /> : error ? <ErrorState message={error} onRetry={reload} /> : !rows.length ? (
          <EmptyState icon={Package} title={filtered ? t('prod.noMatch') : t('prod.none')}
            message={filtered ? t('prod.noMatchMsg') : t('prod.noneMsg')}
            action={filtered ? <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setCategory(''); setStatus(''); }}>{t('common.clearFilters')}</Button> : <Button icon={Plus} onClick={() => setFormOpen(true)}>{t('product.add')}</Button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>{sortTh('name', t('th.product'))}{sortTh('category', t('th.category'))}{sortTh('price', t('th.price'), true)}{sortTh('cost', t('th.cost'), true)}{sortTh('margin', t('th.margin'), true)}{sortTh('stock', t('th.stock'), true)}<th>{t('th.status')}</th><th><span className="sr-only">{t('th.actions')}</span></th></tr></thead>
              <tbody>
                {pager.visible.map((p) => (
                  <tr key={p.id} className="row-click" onClick={() => setViewing(p)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <ProductThumb product={p} />
                        <div className="min-w-0"><p className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}</p><p className="text-xs text-zinc-500">{p.sku}</p></div>
                      </div>
                    </td>
                    <td>{td(p.category)}</td>
                    <td className="num text-right">{formatMoney(p.price)}</td>
                    <td className="num text-right text-zinc-500">{formatMoney(p.cost)}</td>
                    <td className="num text-right">{formatPercent(margin(p))}</td>
                    <td className="num text-right font-medium">{formatNumber(p.stock)} <span className="text-xs font-normal text-zinc-500">{p.unit}</span></td>
                    <td><StockBadge product={p} /></td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" aria-label={t('prod.editA11y', { name: p.name })} onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={t('prod.deleteA11y', { name: p.name })} className="hover:!text-red-600" onClick={() => setDeleting(p)}><Trash2 className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && <Pagination {...pager} />}
      </Card>

      <ProductForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} onSubmit={save} initial={editing} categories={categories} />
      <ProductDetails product={viewing} onClose={() => setViewing(null)} onEdit={openEdit}
        onChanged={(u) => { setViewing(u); setData((d) => d.map((p) => (p.id === u.id ? u : p))); }} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} loading={busy} title={t('prod.deleteTitle')}
        message={t('prod.deleteMsg', { name: deleting?.name || '' })} />
    </>
  );
}
