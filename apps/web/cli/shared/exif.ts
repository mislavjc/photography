import { Effect } from 'effect';
import { exiftool, Tags } from 'exiftool-vendored';

import type { ExifMetadata } from './types';

// ----------------------- EXIF Formatting -----------------------
export const formatAperture = (f?: number | string | null) =>
  f != null
    ? `f/${typeof f === 'number' ? f.toFixed(1).replace(/\.0$/, '') : f}`
    : null;

export const formatShutter = (t?: string | number | null) => {
  if (t == null) return null;
  if (typeof t === 'string') return t;
  if (t === 0) return '0s';
  if (t < 1) return `1/${Math.round(1 / t)}s`;
  return `${t}s`;
};

export const formatFocal = (f?: number | string | null) => {
  if (f == null) return null;
  const str = String(f).trim();
  if (str.toLowerCase().includes('mm')) return str;
  return `${str} mm`;
};

export const toNumber = (v: unknown) =>
  typeof v === 'number' ? v : v == null ? undefined : Number(v);

// ----------------------- EXIF Reading -----------------------
export const readExif = (filePath: string) =>
  Effect.tryPromise<ExifMetadata, Error>({
    try: async () => {
      const t: Tags = await exiftool.read(filePath);
      const camera = [t.Make, t.Model].filter(Boolean).join(' ').trim() || null;

      const lens =
        (t.LensModel as string | undefined) ??
        (t.Lens as string | undefined) ??
        null;

      const focalLength = formatFocal(
        (t.FocalLength as number | string | undefined) ?? null,
      );

      const aperture = formatAperture(
        (t.FNumber as number | string | undefined) ?? null,
      );

      const shutterSpeed = formatShutter(
        (t.ShutterSpeed as string | undefined) ??
          (t.ExposureTime as number | undefined) ??
          null,
      );
      const iso = (t.ISO as number | string | undefined)?.toString() ?? null;

      const dateTime =
        t.DateTimeOriginal?.toString?.() ??
        t.CreateDate?.toString?.() ??
        t.ModifyDate?.toString?.() ??
        null;

      const lat = toNumber(t.GPSLatitude);
      const lon = toNumber(t.GPSLongitude);
      const alt = toNumber(t.GPSAltitude);

      const location =
        lat != null && lon != null
          ? { latitude: lat, longitude: lon, altitude: alt }
          : null;

      const exif: ExifMetadata = {
        camera,
        lens,
        focalLength,
        aperture,
        shutterSpeed,
        iso,
        location,
        dateTime,
      };

      return exif;
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });

// Read raw EXIF tags (for AI prompts)
export const readExifTags = (filePath: string) =>
  Effect.tryPromise<Tags, Error>({
    try: () => exiftool.read(filePath),
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });

// Ensure exiftool child exits when program ends
export const shutdownExiftool = Effect.tryPromise({
  try: async () => {
    await exiftool.end();
  },
  catch: () => undefined,
}).pipe(Effect.ignore);

// Empty EXIF metadata for fallback
export const emptyExifMetadata: ExifMetadata = {
  camera: null,
  lens: null,
  focalLength: null,
  aperture: null,
  shutterSpeed: null,
  iso: null,
  location: null,
  dateTime: null,
};
