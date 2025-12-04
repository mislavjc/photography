import { Effect } from 'effect';
import sharp from 'sharp';

import { cleanPrefix } from './r2-client';
import type { Formats, ProfileName } from './types';

// ----------------------- Variant Generation -----------------------
export interface VariantQuality {
  Q_AVIF: number;
  Q_WEBP: number;
  Q_JPEG: number;
}

export const buildVariants = (
  file: string,
  widths: number[],
  fmts: Formats[],
  q: VariantQuality,
  preserveMetadata: boolean,
) =>
  Effect.tryPromise<Record<string, Buffer>, Error>({
    try: async () => {
      const res: Record<string, Buffer> = {};
      const base = sharp(file).rotate();

      for (const w of widths) {
        const resized = base
          .clone()
          .resize({ width: w, withoutEnlargement: true });
        if (preserveMetadata) resized.withMetadata();

        for (const f of fmts) {
          if (f === 'avif')
            res[`avif:${w}`] = await resized
              .clone()
              .avif({ quality: q.Q_AVIF })
              .toBuffer();
          else if (f === 'webp')
            res[`webp:${w}`] = await resized
              .clone()
              .webp({ quality: q.Q_WEBP })
              .toBuffer();
          else
            res[`jpeg:${w}`] = await resized
              .clone()
              .jpeg({ quality: q.Q_JPEG, mozjpeg: true })
              .toBuffer();
        }
      }
      return res;
    },
    catch: (e) => new Error(`buildVariants failed for ${file}: ${e}`),
  });

// Optimized parallel variant generation - generates all formats for each width concurrently
export const buildVariantsParallel = (
  file: string,
  widths: number[],
  fmts: Formats[],
  q: VariantQuality,
  preserveMetadata: boolean,
) =>
  Effect.tryPromise<Record<string, Buffer>, Error>({
    try: async () => {
      const res: Record<string, Buffer> = {};
      const base = sharp(file).rotate();

      // Process all width/format combinations in parallel
      const tasks: Promise<{ key: string; buffer: Buffer }>[] = [];

      for (const w of widths) {
        for (const f of fmts) {
          const task = (async () => {
            let pipeline = base
              .clone()
              .resize({ width: w, withoutEnlargement: true });

            if (preserveMetadata) pipeline = pipeline.withMetadata();

            let buffer: Buffer;
            if (f === 'avif') {
              buffer = await pipeline.avif({ quality: q.Q_AVIF }).toBuffer();
            } else if (f === 'webp') {
              buffer = await pipeline.webp({ quality: q.Q_WEBP }).toBuffer();
            } else {
              buffer = await pipeline
                .jpeg({ quality: q.Q_JPEG, mozjpeg: true })
                .toBuffer();
            }

            return { key: `${f}:${w}`, buffer };
          })();

          tasks.push(task);
        }
      }

      // Wait for all tasks to complete
      const results = await Promise.all(tasks);
      for (const { key, buffer } of results) {
        res[key] = buffer;
      }

      return res;
    },
    catch: (e) => new Error(`buildVariantsParallel failed for ${file}: ${e}`),
  });

// Build variants from buffer (for regeneration from R2)
export const buildVariantsFromBuffer = (
  buffer: Buffer,
  widths: number[],
  fmts: Formats[],
  q: VariantQuality,
  preserveMetadata: boolean,
) =>
  Effect.tryPromise<Record<string, Buffer>, Error>({
    try: async () => {
      const res: Record<string, Buffer> = {};
      const base = sharp(buffer).rotate();

      for (const w of widths) {
        const resized = base
          .clone()
          .resize({ width: w, withoutEnlargement: true });
        if (preserveMetadata) resized.withMetadata();

        for (const f of fmts) {
          if (f === 'avif')
            res[`avif:${w}`] = await resized
              .clone()
              .avif({ quality: q.Q_AVIF })
              .toBuffer();
          else if (f === 'webp')
            res[`webp:${w}`] = await resized
              .clone()
              .webp({ quality: q.Q_WEBP })
              .toBuffer();
          else
            res[`jpeg:${w}`] = await resized
              .clone()
              .jpeg({ quality: q.Q_JPEG, mozjpeg: true })
              .toBuffer();
        }
      }
      return res;
    },
    catch: (e) => new Error(`buildVariantsFromBuffer failed: ${e}`),
  });

// Parallel version for buffer input
export const buildVariantsFromBufferParallel = (
  buffer: Buffer,
  widths: number[],
  fmts: Formats[],
  q: VariantQuality,
  preserveMetadata: boolean,
) =>
  Effect.tryPromise<Record<string, Buffer>, Error>({
    try: async () => {
      const res: Record<string, Buffer> = {};
      const base = sharp(buffer).rotate();

      const tasks: Promise<{ key: string; buffer: Buffer }>[] = [];

      for (const w of widths) {
        for (const f of fmts) {
          const task = (async () => {
            let pipeline = base
              .clone()
              .resize({ width: w, withoutEnlargement: true });

            if (preserveMetadata) pipeline = pipeline.withMetadata();

            let buf: Buffer;
            if (f === 'avif') {
              buf = await pipeline.avif({ quality: q.Q_AVIF }).toBuffer();
            } else if (f === 'webp') {
              buf = await pipeline.webp({ quality: q.Q_WEBP }).toBuffer();
            } else {
              buf = await pipeline
                .jpeg({ quality: q.Q_JPEG, mozjpeg: true })
                .toBuffer();
            }

            return { key: `${f}:${w}`, buffer: buf };
          })();

          tasks.push(task);
        }
      }

      const results = await Promise.all(tasks);
      for (const { key, buffer: buf } of results) {
        res[key] = buf;
      }

      return res;
    },
    catch: (e) => new Error(`buildVariantsFromBufferParallel failed: ${e}`),
  });

// Build single variant (for selective regeneration)
export const buildSingleVariant = (
  buffer: Buffer,
  width: number,
  fmt: Formats,
  quality: number,
  preserveMetadata: boolean,
) =>
  Effect.tryPromise<Buffer, Error>({
    try: async () => {
      let pipeline = sharp(buffer)
        .rotate()
        .resize({ width, withoutEnlargement: true });

      if (preserveMetadata) pipeline = pipeline.withMetadata();

      if (fmt === 'avif') {
        return await pipeline.avif({ quality }).toBuffer();
      } else if (fmt === 'webp') {
        return await pipeline.webp({ quality }).toBuffer();
      } else {
        return await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
      }
    },
    catch: (e) => new Error(`buildSingleVariant failed: ${e}`),
  });

// ----------------------- Key Generation -----------------------
export const toOrigKeyUsingUuid = (
  uuid: string,
  ext: string,
  prefix: string,
) => {
  const pr = cleanPrefix(prefix);
  const name = `${uuid}${ext}`;
  return pr ? `${pr}/${name}` : name;
};

export const toVariantKey = (
  uuidBase: string,
  variantsPrefix: string,
  profile: ProfileName,
  fmt: string,
  w: number,
  extForFmt: string,
) => {
  const pr = cleanPrefix(variantsPrefix);
  return `${pr}/${profile}/${fmt}/${w}/${uuidBase}${extForFmt}`;
};

// Get file extension
export const getExt = (file: string) => {
  const ext = file.split('.').pop()?.toLowerCase() || 'jpg';
  return `.${ext}`;
};

// Extract UUID from R2 key (e.g., "originals/uuid.jpg" -> "uuid")
export const extractUuidFromKey = (key: string) => {
  const filename = key.split('/').pop() || '';
  return filename.replace(/\.[^.]+$/, '');
};

// Extract extension from R2 key
export const extractExtFromKey = (key: string) => {
  const filename = key.split('/').pop() || '';
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0] : '.jpg';
};
