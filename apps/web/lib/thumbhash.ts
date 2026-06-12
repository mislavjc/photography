import { thumbHashToDataURL } from 'thumbhash';

// Decoded placeholders are ~1KB PNGs; cache them since the same hash is
// decoded on every grid re-render. Capped so a long session browsing
// thousands of photos doesn't grow memory without bound.
const cache = new Map<string, string>();
const CACHE_MAX = 500;

/** Decodes a base64-encoded ThumbHash into a PNG data URL. Returns undefined for missing/invalid hashes. */
export function thumbhashToDataURL(hash?: string): string | undefined {
  if (!hash) return undefined;
  const cached = cache.get(hash);
  if (cached) return cached;
  try {
    const bytes = Uint8Array.from(atob(hash), (c) => c.charCodeAt(0));
    const url = thumbHashToDataURL(bytes);
    if (cache.size >= CACHE_MAX) {
      cache.delete(cache.keys().next().value!);
    }
    cache.set(hash, url);
    return url;
  } catch {
    return undefined;
  }
}
