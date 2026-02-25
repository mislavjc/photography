import type { Manifest } from '../types';

/** Strips the manifest down to only the fields needed client-side (w, h, first dominant color). */
export function trimManifestForClient(manifest: Manifest): Manifest {
  const trimmed = {} as Manifest;
  for (const [key, value] of Object.entries(manifest)) {
    trimmed[key] = {
      w: value.w,
      h: value.h,
      exif: {
        dominantColors: value.exif?.dominantColors?.slice(0, 1),
      },
    } as Manifest[string];
  }
  return trimmed;
}

/**
 * Selects a random photo from an array of photo names.
 * Uses Math.random() so it should be called once per request in server components.
 */
export function selectRandomPhoto(photoNames: string[]): string {
  return photoNames[Math.floor(Math.random() * photoNames.length)];
}
