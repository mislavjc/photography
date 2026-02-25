import { cacheLife, cacheTag } from 'next/cache';

import type { Manifest, ManifestEntry } from '../types';

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_URL;
const R2_VARIANTS_PREFIX = process.env.R2_VARIANTS_PREFIX || 'variants';

export async function loadManifest(): Promise<Manifest> {
  'use cache';
  cacheLife('days');
  cacheTag('manifest');

  if (!R2_PUBLIC_URL) {
    return {};
  }

  const manifestUrl = `${R2_PUBLIC_URL.replace(/\/$/, '')}/${R2_VARIANTS_PREFIX}/r2-manifest.json`;

  try {
    const response = await fetch(manifestUrl);

    if (!response.ok) {
      console.error(
        `Failed to fetch manifest: ${response.status} ${response.statusText}`,
      );
      return {};
    }

    const manifest = await response.json();

    return manifest;
  } catch (error) {
    console.error('Failed to load manifest:', error);
    return {};
  }
}

/** Fetches a single photo's manifest entry by ID (with or without extension). */
export async function getPhotoData(
  photoId: string,
): Promise<ManifestEntry | null> {
  'use cache';
  cacheLife('days');

  const manifest = await loadManifest();
  const key = manifest[photoId] ? photoId : `${photoId}.jpg`;
  return manifest[key] ?? null;
}
