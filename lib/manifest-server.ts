import fs from 'node:fs';
import path from 'node:path';

import type { Manifest } from '../types';

let manifestCache: Manifest | null = null;

// R2 configuration for manifest loading
const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_URL;
const R2_VARIANTS_PREFIX = process.env.R2_VARIANTS_PREFIX || 'variants';

async function loadManifestFromR2(): Promise<Manifest | null> {
  if (!R2_PUBLIC_URL) {
    return null;
  }

  try {
    const manifestUrl = `${R2_PUBLIC_URL.replace(/\/$/, '')}/${R2_VARIANTS_PREFIX}/r2-manifest.json`;
    console.log('Attempting to load manifest from R2:', manifestUrl);

    const response = await fetch(manifestUrl, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      console.warn(
        `R2 manifest fetch failed: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const manifestData = await response.json();
    console.log('Successfully loaded manifest from R2');
    return manifestData;
  } catch (error) {
    console.warn('Failed to load manifest from R2:', error);
    return null;
  }
}

async function loadManifestFromLocal(): Promise<Manifest | null> {
  try {
    const manifestPath = path.join(process.cwd(), 'public', 'r2-manifest.json');
    const manifestData = fs.readFileSync(manifestPath, 'utf-8');
    console.log('Loaded manifest from local filesystem');
    return JSON.parse(manifestData);
  } catch (error) {
    console.warn('Failed to load manifest from local filesystem:', error);
    return null;
  }
}

export async function loadManifest(): Promise<Manifest> {
  if (manifestCache) {
    return manifestCache;
  }

  // Try R2 first (production), then fallback to local (development)
  let manifest = await loadManifestFromR2();

  if (!manifest) {
    manifest = await loadManifestFromLocal();
  }

  if (!manifest) {
    console.error('Failed to load manifest from both R2 and local filesystem');
    return {};
  }

  manifestCache = manifest;
  return manifestCache;
}
