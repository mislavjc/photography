export const SITE_CONFIG = {
  domain: 'photos.mislavjc.com',
} as const;

/** Strips the file extension from a filename, e.g. "photo.jpg" → "photo" */
export const EXT_RE = /\.[^.]+$/;
