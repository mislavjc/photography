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

    const isDevelopment = process.env.NODE_ENV === 'development';
    const isBuild = process.env.NEXT_PHASE === 'phase-production-build';

    let response: Response;

    if (isDevelopment) {
      // In development, force fresh data for debugging
      const cacheBuster = Date.now();
      const fetchOptions = {
        cache: 'no-store' as const,
        next: { revalidate: 0 },
      };
      response = await fetch(`${manifestUrl}?v=${cacheBuster}`, fetchOptions);
    } else if (isBuild) {
      // During build, use cached version to enable static generation
      const fetchOptions = {
        cache: 'force-cache' as const,
        next: { revalidate: 3600 }, // Cache for 1 hour during build
      };
      response = await fetch(manifestUrl, fetchOptions);
    } else {
      // In production runtime, cache for performance
      const fetchOptions = {
        cache: 'force-cache' as const,
        next: { revalidate: 300 }, // Cache for 5 minutes in production
      };
      response = await fetch(manifestUrl, fetchOptions);
    }

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
  // Use cached manifest if available and not in development
  if (manifestCache && process.env.NODE_ENV !== 'development') {
    console.log('Using cached manifest');
    return manifestCache;
  }

  // Load fresh data
  try {
    console.log('Loading fresh manifest...');
    manifestCache = await loadManifestFromR2();
    console.log(
      `Loaded manifest with ${Object.keys(manifestCache).length} images`,
    );
    return manifestCache;
  } catch (error) {
    console.error('Failed to load remote manifest:', error);

    // In production build, return empty manifest to allow static generation
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      console.log('Build time: returning empty manifest for static generation');
      return {};
    }

    // In other cases, return cached version if available
    if (manifestCache) {
      console.log('Falling back to cached manifest');
      return manifestCache;
    }

    return {};
  }
}
