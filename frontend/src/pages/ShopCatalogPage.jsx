import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Navigation, Package, Search, Store } from 'lucide-react';
import { shopsApi } from '../api/shops.api';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '../components/common/ui';
import { googleMapsUrl, googleRouteUrl } from '../components/map/map';
import { formatMoney } from '../utils/format';
import { cn } from '../utils/cn';
import { openLink } from '../telegram';

const ALL = '__all__';

function ProductCard({ product }) {
  const { t, td } = useI18n();
  return (
    <li className={cn('card flex flex-col overflow-hidden', !product.inStock && 'opacity-60')}>
      <div className="grid aspect-square place-items-center bg-zinc-100 dark:bg-zinc-800">
        {product.imageUrl
          ? <img src={product.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          : <Package className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
        {product.category && <p className="truncate text-xs text-zinc-500">{td(product.category)}</p>}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-1 pt-2">
          <p className="num font-semibold text-brand-700 dark:text-brand-400">
            {formatMoney(product.price)}
            {product.unit && product.unit !== 'pcs' && <span className="text-xs font-normal text-zinc-500"> / {product.unit}</span>}
          </p>
          <Badge tone={product.inStock ? 'success' : 'neutral'}>{product.inStock ? t('catalog.inStock') : t('catalog.outOfStock')}</Badge>
        </div>
      </div>
    </li>
  );
}

/** What a shop on the map sells (view only: prices and whether it is in stock). */
export default function ShopCatalogPage() {
  const { id } = useParams();
  const { t, td } = useI18n();
  const { data, loading, error, reload } = useApi(() => shopsApi.catalog(id), [id]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);

  const products = useMemo(() => data?.products ?? [], [data]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(), [products]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => (category === ALL || p.category === category) && (!q || p.name.toLowerCase().includes(q)));
  }, [products, query, category]);

  if (error) {
    return (
      <>
        <Link to="/shops" className="btn btn-ghost mb-4"><ArrowLeft className="h-4 w-4" /> {t('catalog.back')}</Link>
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      </>
    );
  }

  const shop = data?.shop;
  return (
    <>
      <Link to="/shops" className="btn btn-ghost mb-4 -ml-2"><ArrowLeft className="h-4 w-4" /> {t('catalog.back')}</Link>

      <Card className="mb-6 p-5">
        {loading ? <Skeleton className="h-20" /> : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"><Store className="h-6 w-6" /></span>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight">{shop.name} {shop.isMine && <Badge tone="info">{t('shops.mine')}</Badge>}</h1>
                {shop.address && <p className="flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-300"><MapPin className="h-3.5 w-3.5" /> {shop.address}</p>}
                <p className="mt-0.5 text-xs text-zinc-500">{t('catalog.count', { n: products.length })}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button icon={Navigation} onClick={() => openLink(googleRouteUrl(shop))}>{t('shops.route')}</Button>
              <Button variant="secondary" icon={MapPin} onClick={() => openLink(googleMapsUrl(shop))}>{t('shops.openGoogle')}</Button>
            </div>
          </div>
        )}
      </Card>

      {!loading && products.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input className="input pl-9" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('catalog.search')} aria-label={t('catalog.search')} />
          </label>
          {categories.length > 1 && (
            <select className="input sm:w-56" value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('catalog.category')}>
              <option value={ALL}>{t('catalog.allCategories')}</option>
              {categories.map((c) => <option key={c} value={c}>{td(c)}</option>)}
            </select>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="aspect-[3/4]" />)}</div>
      ) : !shown.length ? (
        <Card><EmptyState icon={Package} title={products.length ? t('catalog.noMatch') : t('catalog.empty')} /></Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((p) => <ProductCard key={p.id} product={p} />)}
        </ul>
      )}
    </>
  );
}
