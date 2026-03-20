import { Effect } from 'effect';

// ----------------------- Reverse Geocoding (Nominatim) -----------------------
type RevGeo = { address?: string | null };
const geoCache = new Map<string, string | null>();

export const reverseGeocodeNominatim = (
  lat: number,
  lon: number,
  contactEmail?: string,
): Effect.Effect<RevGeo, never> =>
  Effect.tryPromise<RevGeo, Error>({
    try: async () => {
      const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
      if (geoCache.has(key)) return { address: geoCache.get(key) ?? null };

      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lon));
      url.searchParams.set('zoom', '14'); // neighborhood/city-ish
      url.searchParams.set('addressdetails', '1');

      const headers: Record<string, string> = {
        'User-Agent': `photo-manifest-uploader/1.0`,
      };
      if (contactEmail) headers['From'] = contactEmail;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        // Rate limits or errors: just return null address
        geoCache.set(key, null);
        return { address: null };
      }
      const data = (await res.json()) as { display_name?: string };
      const display = data?.display_name || null;
      geoCache.set(key, display);
      return { address: display };
    },
    catch: (e) => new Error(`Reverse geocoding failed: ${e}`),
  }).pipe(
    // On any error, gracefully return null address instead of crashing
    Effect.catchAll(() => Effect.succeed({ address: null })),
  );
