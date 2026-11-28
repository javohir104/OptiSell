/** Google Maps implementation of the map adapter (see ./map.js). Needs VITE_GOOGLE_MAPS_API_KEY. */
import { getLang } from '../../i18n';

let loading = null;

function loadGoogleMaps(key) {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const cb = '__optisellGoogleMaps';
      window[cb] = () => { delete window[cb]; resolve(window.google.maps); };
      // Google calls this when the key is wrong / the API is not enabled.
      window.gm_authFailure = () => console.error('Google Maps: API key rejected (check VITE_GOOGLE_MAPS_API_KEY and its allowed sites).');
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${cb}&language=${getLang()}&region=UZ`;
      s.async = true;
      s.onerror = () => { loading = null; s.remove(); reject(new Error('Google Maps failed to load')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const COLORS = { shop: '#059669', mine: '#7c3aed', active: '#dc2626' };
const PIN = 'M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0zm0 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z';

const iconOf = (g, kind) => ({
  path: PIN,
  fillColor: COLORS[kind] ?? COLORS.shop,
  fillOpacity: 1,
  strokeColor: '#ffffff',
  strokeWeight: 2,
  scale: kind === 'active' ? 1.3 : 1,
  anchor: new g.Point(12, 36),
});

export async function createGoogleMap(el, { center, zoom }, key) {
  const g = await loadGoogleMaps(key);
  // With loading=async the libraries are fetched on demand: make sure Map and Marker are there.
  if (g.importLibrary) await Promise.all([g.importLibrary('maps'), g.importLibrary('marker')]);
  const pos = ([lat, lng]) => ({ lat, lng });
  const map = new g.Map(el, {
    center: pos(center),
    zoom,
    mapTypeControl: true,
    mapTypeControlOptions: { style: g.MapTypeControlStyle.DROPDOWN_MENU },
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: false,
    gestureHandling: 'greedy',
  });

  return {
    provider: 'google',
    onClick: (cb) => map.addListener('click', (e) => cb(e.latLng.lat(), e.latLng.lng())),
    setView: (p, z) => { map.setCenter(pos(p)); if (z) map.setZoom(z); },
    flyTo: (p, z) => { map.panTo(pos(p)); if (z) map.setZoom(z); },
    getZoom: () => map.getZoom(),
    fitBounds: (points, maxZoom = 15) => {
      const b = new g.LatLngBounds();
      points.forEach((p) => b.extend(pos(p)));
      map.fitBounds(b, 40);
      g.event.addListenerOnce(map, 'idle', () => { if (map.getZoom() > maxZoom) map.setZoom(maxZoom); });
    },
    addMarker: (p, { kind = 'shop', title, draggable, onClick, onDragEnd } = {}) => {
      // `title` is shown as a native tooltip (plain text, safe for user-entered names).
      const m = new g.Marker({ map, position: pos(p), title, draggable: !!draggable, icon: iconOf(g, kind) });
      if (onClick) m.addListener('click', onClick);
      if (onDragEnd) m.addListener('dragend', (e) => onDragEnd(e.latLng.lat(), e.latLng.lng()));
      return {
        setPosition: (q) => m.setPosition(pos(q)),
        setKind: (k) => { m.setIcon(iconOf(g, k)); m.setZIndex(k === 'active' ? 1000 : 0); },
        remove: () => m.setMap(null),
      };
    },
    invalidateSize: () => {}, // Google Maps follows the container size itself
    remove: () => { g.event.clearInstanceListeners(map); el.innerHTML = ''; },
  };
}
