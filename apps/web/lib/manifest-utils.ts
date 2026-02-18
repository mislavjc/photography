import type { Manifest } from '../types';

function getManifestKeys(manifest: Manifest): string[] {
  return Object.keys(manifest);
}

/**
 * Selects a random photo from an array of photo names.
 * Uses Math.random() so it should be called once per request in server components.
 */
export function selectRandomPhoto(photoNames: string[]): string {
  return photoNames[Math.floor(Math.random() * photoNames.length)];
}

function getImageByIndex(
  manifest: Manifest,
  index: number,
): string | null {
  const keys = getManifestKeys(manifest);
  if (keys.length === 0) return null;

  // Use modulo to cycle through available images
  const actualIndex = index % keys.length;
  return keys[actualIndex];
}

function getRandomImageBySeed(
  manifest: Manifest,
  seed: number,
): string | null {
  const keys = getManifestKeys(manifest);
  if (keys.length === 0) return null;

  // Use seed to deterministically select an image
  const index = Math.abs(seed) % keys.length;
  return keys[index];
}

function getBlurhashForImage(
  manifest: Manifest,
  imageId: string,
): string | null {
  const entry = manifest[imageId];
  return entry?.blurhash || null;
}

function getImageDimensions(
  manifest: Manifest,
  imageId: string,
): { w: number; h: number } | null {
  const entry = manifest[imageId];
  if (!entry) return null;
  return { w: entry.w, h: entry.h };
}

function getRandomImageByOrientation(
  manifest: Manifest,
  seed: number,
  isPortrait: boolean,
): string | null {
  const keys = getManifestKeys(manifest);
  if (keys.length === 0) return null;

  // Filter images by orientation
  const orientedImages = keys.filter((key) => {
    const entry = manifest[key];
    if (!entry) return false;

    const imageIsPortrait = entry.h > entry.w;
    return imageIsPortrait === isPortrait;
  });

  if (orientedImages.length === 0) {
    // Fallback to any image if no images match the orientation
    return getRandomImageBySeed(manifest, seed);
  }

  // Use seed to deterministically select from oriented images
  const index = Math.abs(seed) % orientedImages.length;
  return orientedImages[index];
}
