/** OpenStreetMap (Leaflet) implementation of the map adapter — used when there is no Google key. */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** Drop-shaped pin drawn with CSS (no image files to bundle). kind: 'shop' | 'mine' | 'active' */
const pinIcon = (kind = 'shop') => L.divIcon({
  className: '',
  html: `<span class="shop-pin${kind === 'shop' ? '' : ` shop-pin--${kind}`}"></span>`,
  iconSize: kind === 'active' ? [32, 32] : [26, 26],
  iconAnchor: kind === 'active' ? [16, 38] : [13, 31],
  popupAnchor: [0, -32],
});

export function createLeafletMap(el, { center, zoom }) {
  const map = L.map(el, { center, zoom });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
  }).addTo(map);

  return {
    provider: 'osm',
    onClick: (cb) => map.on('click', (e) => cb(e.latlng.lat, e.latlng.lng)),
    setView: (p, z) => map.setView(p, z ?? map.getZoom()),
    flyTo: (p, z) => map.flyTo(p, z ?? map.getZoom(), { duration: 0.6 }),
    getZoom: () => map.getZoom(),
    fitBounds: (points, maxZoom = 15) => map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom }),
    addMarker: (p, { kind = 'shop', title, draggable, onClick, onDragEnd } = {}) => {
      const m = L.marker(p, { icon: pinIcon(kind), title, draggable: !!draggable }).addTo(map);
      if (onClick) m.on('click', onClick);
      if (onDragEnd) m.on('dragend', (e) => { const q = e.target.getLatLng(); onDragEnd(q.lat, q.lng); });
      return {
        setPosition: (q) => m.setLatLng(q),
        setKind: (k) => { m.setIcon(pinIcon(k)); m.setZIndexOffset(k === 'active' ? 1000 : 0); },
        remove: () => m.remove(),
      };
    },
    invalidateSize: () => map.invalidateSize(),
    remove: () => map.remove(),
  };
}
