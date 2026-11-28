import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { LocateFixed } from 'lucide-react';
import { useI18n } from '../../i18n';
import { Button, Input } from '../common/ui';
import { TASHKENT } from './map';
import { useMap } from './useMap';

const round = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Pick the shop's point: tap the map, drag the pin, or use the device location.
 * value / onChange: { lat, lng, address } | null
 */
export default function LocationPicker({ value, onChange, heightClass = 'h-72' }) {
  const { t } = useI18n();
  const el = useRef(null);
  const markerRef = useRef(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const [locating, setLocating] = useState(false);
  const map = useMap(el, { center: value ? [value.lat, value.lng] : TASHKENT, zoom: value ? 16 : 12 });

  const setPoint = (lat, lng) => {
    const { value: v, onChange: change } = latest.current;
    change({ address: v?.address || '', lat: round(lat), lng: round(lng) });
  };

  useEffect(() => {
    if (!map) return undefined;
    map.onClick(setPoint);
    // Often shown inside a modal that animates in: re-measure once it has its final size.
    const timer = setTimeout(() => map.invalidateSize(), 300);
    return () => { clearTimeout(timer); markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    if (!map) return;
    if (!value) { markerRef.current?.remove(); markerRef.current = null; return; }
    const at = [value.lat, value.lng];
    if (markerRef.current) { markerRef.current.setPosition(at); return; }
    markerRef.current = map.addMarker(at, { kind: 'active', draggable: true, onDragEnd: setPoint });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, value?.lat, value?.lng]);

  const locate = () => {
    if (!navigator.geolocation) { toast.error(t('shops.noGeo')); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPoint(pos.coords.latitude, pos.coords.longitude);
        map?.setView([pos.coords.latitude, pos.coords.longitude], 17);
      },
      () => { setLocating(false); toast.error(t('shops.geoDenied')); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('shops.pickHint')}</p>
        <Button type="button" variant="secondary" size="sm" icon={LocateFixed} loading={locating} onClick={locate}>{t('shops.myLocation')}</Button>
      </div>
      <div ref={el} className={`${heightClass} w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800`} />
      <Input
        label={t('shops.address')} name="shopAddress" placeholder={t('shops.addressPh')} maxLength={200}
        value={value?.address || ''} disabled={!value}
        onChange={(e) => value && onChange({ ...value, address: e.target.value })}
        hint={value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : t('shops.pickFirst')}
      />
    </div>
  );
}
