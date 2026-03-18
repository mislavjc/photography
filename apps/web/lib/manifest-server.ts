import { cacheLife, cacheTag } from 'next/cache';

import type { Manifest, ManifestEntry } from '../types';

import { env } from './env';
import { R2_URL } from './r2-url';

export async function loadManifest(): Promise<Manifest> {
  'use cache';
  cacheLife('days');
  cacheTag('manifest');

  const manifestUrl = `${R2_URL.replace(/\/$/, '')}/${env.R2_VARIANTS_PREFIX}/r2-manifest.json`;

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
