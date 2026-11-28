/**
 * One small map API for the app, backed by Google Maps when VITE_GOOGLE_MAPS_API_KEY is set,
 * otherwise (or if Google fails to load) by OpenStreetMap via Leaflet.
 * Points are [lat, lng] arrays.
 */
const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

/** Map starts here when nothing better is known. */
export const TASHKENT = [41.3111, 69.2797];

export async function createMap(el, { center = TASHKENT, zoom = 12 } = {}) {
  if (GOOGLE_KEY) {
    try {
      const { createGoogleMap } = await import('./googleMap');
      return await createGoogleMap(el, { center, zoom }, GOOGLE_KEY);
    } catch (err) {
      console.error(`${err.message}; showing OpenStreetMap instead.`);
    }
  }
  const { createLeafletMap } = await import('./leaflet');
  return createLeafletMap(el, { center, zoom });
}

/** Open the point in Google Maps (app on phones, site on computers). Works without a key. */
export const googleMapsUrl = ({ lat, lng }) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export const googleRouteUrl = ({ lat, lng }) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
