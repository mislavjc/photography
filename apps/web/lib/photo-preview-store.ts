import type { Manifest, ManifestEntry } from 'types';

/**
 * Client-side cache of the lightweight per-photo data (dimensions, thumbhash,
 * dominant color) the grids already hold. It lets the intercepted photo modal's
 * loading shell paint the right image — blurred placeholder + full-res — the
 * instant a tile is clicked, without waiting for the server to render the modal.
 *
 * It's a module singleton on purpose: the grid that owns the data and the modal
 * shell that reads it live in separate route segments, so plain props/context
 * can't bridge them. Whichever grid is mounted populates it before any tile can
 * be clicked.
 */
const previews = new Map<string, ManifestEntry>();

export function registerPhotoPreviews(manifest: Manifest): void {
  for (const key in manifest) {
    const entry = manifest[key];
    if (entry) previews.set(key, entry);
  }
}

/** Looks up a preview by id, tolerating the extension-less form the router may carry. */
export function getPhotoPreview(id: string): ManifestEntry | undefined {
  return previews.get(id) ?? previews.get(`${id}.jpg`);
}
