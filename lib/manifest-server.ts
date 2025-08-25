import type { Manifest } from '../types';

let manifestCache: Manifest | null = null;

// R2 configuration for manifest loading
const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_URL;
const R2_VARIANTS_PREFIX = process.env.R2_VARIANTS_PREFIX || 'variants';

async function loadManifestFromR2(): Promise<Manifest> {
  if (!R2_PUBLIC_URL) {
    throw new Error(
      'R2_PUBLIC_URL environment variable is required for remote manifest loading',
    );
  }

  try {
    const manifestUrl = `${R2_PUBLIC_URL.replace(/\/$/, '')}/${R2_VARIANTS_PREFIX}/r2-manifest.json`;
    console.log('Loading manifest from R2:', manifestUrl);

    const response = await fetch(manifestUrl, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(
        `R2 manifest fetch failed: ${response.status} ${response.statusText}`,
      );
    }

    const manifestData = await response.json();
    console.log('Successfully loaded manifest from R2');
    return manifestData;
  } catch (error) {
    console.error('Failed to load manifest from R2:', error);
    throw error;
  }
}

export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) {
    return manifestCache;
  }

  try {
    // Load only from R2 (remote manifest)
    manifestCache = await loadManifestFromR2();
    return manifestCache;
  } catch (error) {
    console.error('Failed to load remote manifest:', error);
    return {};
  }
}
