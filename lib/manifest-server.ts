import type { Manifest } from '../types';

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_URL;
const R2_VARIANTS_PREFIX = process.env.R2_VARIANTS_PREFIX || 'variants';

let manifestCache: { data: Manifest; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function loadManifest(): Promise<Manifest> {
  if (!R2_PUBLIC_URL) {
    return {};
  }

  if (manifestCache && Date.now() - manifestCache.timestamp < CACHE_DURATION) {
    console.log('Using cached manifest');
    return manifestCache.data;
  }

  const manifestUrl = `${R2_PUBLIC_URL.replace(/\/$/, '')}/${R2_VARIANTS_PREFIX}/r2-manifest.json`;

  try {
    const response = await fetch(manifestUrl, {
      // Cache manifest for 5 minutes at the fetch layer (ISR-like)
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      console.error(
        `Failed to fetch manifest: ${response.status} ${response.statusText}`,
      );
      return {};
    }

    const manifest = await response.json();

    manifestCache = { data: manifest, timestamp: Date.now() };
    console.log(`Loaded manifest with ${Object.keys(manifest).length} images`);

    return manifest;
  } catch (error) {
    console.error('Failed to load manifest:', error);
    return {};
  }
}
