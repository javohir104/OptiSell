import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Navigation, Package, Search, Store } from 'lucide-react';
import { shopsApi } from '../api/shops.api';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/common/ui';
import { googleMapsUrl, googleRouteUrl } from '../components/map/map';
import { useMap } from '../components/map/useMap';
import { isStaff } from '../utils/plans';
import { cn } from '../utils/cn';
import { haptic, openLink } from '../telegram';

const kindOf = (shop, selectedId) => (shop.id === selectedId ? 'active' : shop.isMine ? 'mine' : 'shop');

/** Map with one pin per shop; the selected shop is highlighted and centred. */
function ShopsMap({ shops, selectedId, onSelect }) {
  const el = useRef(null);
  const markers = useRef(new Map());
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const map = useMap(el);

  // (Re)build the pins when the list changes and fit them all in view.
  useEffect(() => {
    if (!map) return undefined;
    for (const shop of shops) {
      markers.current.set(shop.id, map.addMarker([shop.lat, shop.lng], {
        kind: shop.isMine ? 'mine' : 'shop', title: shop.name, onClick: () => selectRef.current(shop.id),
      }));
    }
    if (shops.length === 1) map.setView([shops[0].lat, shops[0].lng], 15);
    else if (shops.length > 1) map.fitBounds(shops.map((s) => [s.lat, s.lng]));
    const current = markers.current;
    return () => { current.forEach((m) => m.remove()); current.clear(); };
  }, [map, shops]);

  useEffect(() => {
    if (!map) return;
    for (const shop of shops) markers.current.get(shop.id)?.setKind(kindOf(shop, selectedId));
    const chosen = shops.find((s) => s.id === selectedId);
    if (chosen) map.flyTo([chosen.lat, chosen.lng], Math.max(map.getZoom(), 16));
  }, [map, selectedId, shops]);

  return <div ref={el} className="h-[55vh] min-h-[320px] w-full bg-zinc-100 lg:h-[calc(100vh-14rem)] dark:bg-zinc-800" />;
}

function SelectedShop({ shop }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3 border-t border-zinc-100 p-4 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"><Store className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="font-semibold">{shop.name} {shop.isMine && <Badge tone="info">{t('shops.mine')}</Badge>}</p>
          {shop.address && <p className="text-sm text-zinc-600 dark:text-zinc-300">{shop.address}</p>}
          <p className="num text-xs text-zinc-500">{shop.lat.toFixed(5)}, {shop.lng.toFixed(5)}</p>
        </div>
      </div>
      <Link to={`/shops/${shop.id}`} className="btn btn-primary w-full"><Package className="h-4 w-4" /> {t('catalog.open')}</Link>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={Navigation} onClick={() => openLink(googleRouteUrl(shop))}>{t('shops.route')}</Button>
        <Button variant="secondary" icon={MapPin} onClick={() => openLink(googleMapsUrl(shop))}>{t('shops.openGoogle')}</Button>
      </div>
    </div>
  );
}

export default function ShopsMapPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: shops, loading, error, reload } = useApi(() => shopsApi.list(), []);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const list = useMemo(() => shops ?? [], [shops]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((s) => s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)) : list;
  }, [list, query]);
  const selected = list.find((s) => s.id === selectedId) ?? null;
  const select = (id) => { haptic('select'); setSelectedId(id); };

  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>;

  return (
    <>
      <PageHeader title={t('shops.title')} description={t('shops.desc')}
        actions={!isStaff(user) && user?.role !== 'admin' ? <Link to="/profile" className="btn btn-secondary"><MapPin className="h-4 w-4" /> {t('shops.cardTitle')}</Link> : null} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:order-2 lg:col-span-2">
          {loading ? <Skeleton className="h-[55vh] min-h-[320px] rounded-none" /> : <ShopsMap shops={list} selectedId={selectedId} onSelect={select} />}
        </Card>
        <Card className="flex flex-col overflow-hidden lg:order-1 lg:max-h-[calc(100vh-14rem)]">
          <div className="border-b border-zinc-100 p-3 dark:border-zinc-800">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input className="input pl-9" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('shops.search')} aria-label={t('shops.search')} />
            </label>
            {!loading && <p className="mt-2 px-1 text-xs text-zinc-500">{t('shops.count', { n: shown.length })}</p>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? <Skeleton className="m-4 h-32" /> : !shown.length ? (
              <EmptyState icon={MapPin} title={t('shops.none')} message={t('shops.noneHint')} />
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {shown.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => select(s.id)}
                      className={cn('flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition-colors',
                        s.id === selectedId ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50')}>
                      <MapPin className={cn('mt-0.5 h-4 w-4 shrink-0', s.id === selectedId ? 'text-red-600' : s.isMine ? 'text-violet-600' : 'text-brand-600')} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{s.name}{s.isMine && <span className="text-violet-600"> · {t('shops.mine')}</span>}</span>
                        {s.address && <span className="block truncate text-xs text-zinc-500">{s.address}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selected && <SelectedShop shop={selected} />}
        </Card>
      </div>
    </>
  );
}
