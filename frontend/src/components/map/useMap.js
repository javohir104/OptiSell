import { useEffect, useRef, useState } from 'react';
import { createMap } from './map';

/**
 * Create a map in the element behind `ref` once, on mount. Returns the map adapter (null while
 * Google Maps / Leaflet is still loading). Options are read only on the first render.
 *
 * Every map gets its own inner container: maps are created asynchronously, and React (StrictMode
 * in dev) can mount, unmount and mount again before the first one is ready. Sharing one element
 * would make Leaflet throw "already initialized" or let the old Google map wipe the new one.
 */
export function useMap(ref, options) {
  const [map, setMap] = useState(null);
  const first = useRef(options);
  useEffect(() => {
    let alive = true;
    let created = null;
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;inset:0;';
    const outer = ref.current;
    if (getComputedStyle(outer).position === 'static') outer.style.position = 'relative';
    outer.appendChild(host);
    createMap(host, first.current)
      .then((m) => {
        if (!alive) { m.remove(); return; }
        created = m;
        setMap(m);
      })
      .catch((err) => console.error(`Map failed to load: ${err.message}`));
    return () => {
      alive = false;
      created?.remove();
      host.remove();
      setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return map;
}
