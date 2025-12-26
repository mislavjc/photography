import type { S3Client } from '@aws-sdk/client-s3';
import { Effect } from 'effect';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'zlib';

import { getObject, manifestKeys, putObject } from './r2-client';
import type { Manifest } from './types';

// ----------------------- Compression -----------------------
export const compressManifest = (buf: Buffer) =>
  Effect.tryPromise<{ compressed: Buffer; encoding: 'br' | 'gzip' }, Error>({
    try: async () => {
      const tryBr = () =>
        new Promise<Buffer>((res, rej) =>
          zlib.brotliCompress(
            buf,
            {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
                [zlib.constants.BROTLI_PARAM_MODE]:
                  zlib.constants.BROTLI_MODE_TEXT,
              },
            },
            (e, out) => (e ? rej(e) : res(out)),
          ),
        );

      const doGzip = () =>
        new Promise<Buffer>((res, rej) =>
          zlib.gzip(
            buf,
            { level: zlib.constants.Z_BEST_COMPRESSION },
            (e, out) => (e ? rej(e) : res(out)),
          ),
        );

      // Prefer brotli, fallback to gzip
      try {
        return { compressed: await tryBr(), encoding: 'br' as const };
      } catch {
        return { compressed: await doGzip(), encoding: 'gzip' as const };
      }
    },
    catch: (e) => new Error(`Compression failed: ${e}`),
  });

// ----------------------- Local Backup -----------------------
export const backupManifestLocally = (content: Buffer) =>
  Effect.tryPromise<string, Error>({
    try: async () => {
      const dir = path.resolve('./manifest-backups');
      await fsp.mkdir(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(dir, `r2-manifest-backup-${ts}.json`);
      await fsp.writeFile(file, content);
      return file;
    },
    catch: (e) => new Error(`Backup manifest failed: ${e}`),
  });

// ----------------------- Load from R2 -----------------------
export const loadManifestFromR2 = (
  s3: S3Client,
  bucket: string,
  variantsPrefix: string,
) =>
  Effect.gen(function* () {
    const { uncompressed } = manifestKeys(variantsPrefix);
    const raw = yield* getObject(s3, bucket, uncompressed);

    try {
      return JSON.parse(raw.toString('utf8')) as Manifest;
    } catch {
      return yield* Effect.fail(
        new Error('Failed to parse existing manifest JSON'),
      );
    }
  });

// ----------------------- Save to R2 -----------------------
export const saveManifestToR2 = (
  s3: S3Client,
  bucket: string,
  variantsPrefix: string,
  manifest: Manifest,
) =>
  Effect.gen(function* () {
    const manifestContent = JSON.stringify(manifest, null, 2);
    const manifestBuffer = Buffer.from(manifestContent);
    const keys = manifestKeys(variantsPrefix);

    // Compress manifest
    const { compressed: compressedManifest, encoding } =
      yield* compressManifest(manifestBuffer);

    // Upload compressed manifest
    yield* putObject(
      s3,
      bucket,
      keys.compressed,
      compressedManifest,
      'application/json',
      {
        'original-size': manifestBuffer.length.toString(),
        'compressed-size': compressedManifest.length.toString(),
        'compression-encoding': encoding,
      },
      {
        contentEncoding: encoding,
        cacheControl: 'public, max-age=300, s-maxage=300',
      },
    );

    // Also upload uncompressed version for reference
    yield* putObject(
      s3,
      bucket,
      keys.uncompressed,
      manifestBuffer,
      'application/json',
      {
        'original-size': manifestBuffer.length.toString(),
        note: 'uncompressed-reference',
      },
      {
        cacheControl: 'public, max-age=300, s-maxage=300',
      },
    );

    return {
      entries: Object.keys(manifest).length,
      originalSize: manifestBuffer.length,
      compressedSize: compressedManifest.length,
      encoding,
    };
  });

// ----------------------- Merge Manifests -----------------------
export const mergeManifests = (
  existing: Manifest,
  updates: Manifest,
): Manifest => {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    merged[key] = value;
  }
  return merged;
};
