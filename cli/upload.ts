#!/usr/bin/env ts-node
// upload-r2-dedupe+variants.ts
// -----------------------------------------------------------------------------
// Upload originals from ./images (or provided dir) to Cloudflare R2 with
// content-hash (SHA-256) deduplication, and PRE-GENERATE fixed-size variants
// (AVIF/WebP/JPEG) for budget-friendly delivery. Optional BlurHash manifest.
//
// Usage
//   pnpm add -D @aws-sdk/client-s3 @aws-sdk/lib-storage fast-glob mime-types dotenv sharp blurhash effect ts-node typescript
//   # put env in .env (see template below)
//   node --env-file=.env upload-r2-dedupe+variants.ts ./images
//
// .env template
//   R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxxxxxx
//   R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
//   R2_BUCKET=my-bucket
//   R2_PREFIX=originals             # originals key prefix (default 'originals')
//   R2_VARIANTS_PREFIX=variants     # variants key prefix (default 'variants')
//   CONCURRENCY=6                   # files processed in parallel (default 4)
//   WIDTHS=160,240,320,480,640,800,960
//   FORMATS=avif,webp,jpeg
//   Q_AVIF=50
//   Q_WEBP=78
//   Q_JPEG=78
//   GEN_BLURHASH=true               # also generate /public/r2-manifest.json
//   BLURHASH_MAX=64                 # max sample size for hash (default 64)
//   PRESERVE_METADATA=true          # preserve EXIF metadata including GPS (default true)
//   VERBOSE=false                   # show detailed logs (default false)

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { config } from 'dotenv';
import { Console, Effect, pipe } from 'effect';
import fg from 'fast-glob';
import mime from 'mime-types';
import sharp from 'sharp';

import { makeBlurhash } from '../lib/blurhash-utils';

// Type for EXIF metadata
interface ExifMetadata {
  camera: string | null;
  lens: string | null;
  focalLength: string | null;
  aperture: string | null;
  shutterSpeed: string | null;
  iso: string | null;
  location: {
    latitude: number;
    longitude: number;
    altitude?: number;
  } | null;
  dateTime: string | null;
}

// Load environment variables from .env.local (common in Next.js projects)
config({ path: '.env.local' });

// ----------------------- Config & Env -----------------------
const getConfig = Effect.gen(function* () {
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
  const R2_BUCKET = process.env.R2_BUCKET;
  const R2_PREFIX = process.env.R2_PREFIX || 'originals';
  const R2_VARIANTS_PREFIX = process.env.R2_VARIANTS_PREFIX || 'variants';
  const CONCURRENCY = parseInt(process.env.CONCURRENCY || '4', 10);

  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET
  ) {
    return yield* Effect.fail(
      new Error(
        'Missing env vars. Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET',
      ),
    );
  }

  const WIDTHS = (process.env.WIDTHS || '160,240,320,480,640,800,960')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter(Boolean);
  const FORMATS = (process.env.FORMATS || 'avif,webp,jpeg')
    .split(',')
    .map((s) => s.trim().toLowerCase() as 'avif' | 'webp' | 'jpeg');

  const Q_AVIF = parseInt(process.env.Q_AVIF || '50', 10);
  const Q_WEBP = parseInt(process.env.Q_WEBP || '78', 10);
  const Q_JPEG = parseInt(process.env.Q_JPEG || '78', 10);

  const GEN_BLURHASH = (process.env.GEN_BLURHASH || 'true') === 'true';
  const BLURHASH_MAX = parseInt(process.env.BLURHASH_MAX || '64', 10);
  const PRESERVE_METADATA =
    (process.env.PRESERVE_METADATA || 'true') === 'true';
  const VERBOSE = (process.env.VERBOSE || 'false') === 'true';

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  return {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PREFIX,
    R2_VARIANTS_PREFIX,
    CONCURRENCY,
    WIDTHS,
    FORMATS,
    Q_AVIF,
    Q_WEBP,
    Q_JPEG,
    GEN_BLURHASH,
    BLURHASH_MAX,
    PRESERVE_METADATA,
    VERBOSE,
    s3,
  };
});

// ----------------------- Helpers -----------------------
const cleanPrefix = (p: string) => p.replace(/^\/+|\/+$/g, '');
const toOrigKey = (file: string, srcDir: string, prefix: string) => {
  const rel = path.relative(srcDir, file).split(path.sep).join('/');
  const pr = cleanPrefix(prefix);
  return pr ? `${pr}/${rel}` : rel;
};
const toVariantKey = (
  rel: string,
  variantsPrefix: string,
  fmt: string,
  w: number,
) => {
  const pr = cleanPrefix(variantsPrefix);
  const base = rel.replace(/\.[^.]+$/, '');
  return `${pr}/${fmt}/${w}/${base.split('/').join('/')}.${fmt}`;
};

const sha256File = (file: string) =>
  Effect.tryPromise({
    try: () =>
      new Promise<string>((resolve, reject) => {
        const h = crypto.createHash('sha256');
        fs.createReadStream(file)
          .on('data', (d) => h.update(d))
          .on('end', () => resolve(h.digest('hex')))
          .on('error', reject);
      }),
    catch: (e) => new Error(`SHA256 failed for ${file}: ${e}`),
  });

const statFile = (file: string) =>
  Effect.tryPromise({
    try: () => fs.promises.stat(file),
    catch: (e) => new Error(`stat failed for ${file}: ${e}`),
  });

const headObject = (s3: S3Client, Bucket: string, Key: string) =>
  Effect.tryPromise({
    try: () => s3.send(new HeadObjectCommand({ Bucket, Key })),
    catch: () => new Error('notfound'),
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));

const putObject = (
  s3: S3Client,
  Bucket: string,
  Key: string,
  Body: Buffer | fs.ReadStream,
  ContentType: string,
  Metadata?: Record<string, string>,
) =>
  Effect.tryPromise({
    try: () =>
      s3.send(
        new PutObjectCommand({
          Bucket,
          Key,
          Body,
          ContentType,
          CacheControl: 'public, max-age=31536000, immutable',
          Metadata,
        }),
      ),
    catch: (e) => new Error(`putObject failed for ${Key}: ${e}`),
  });

const putSentinel = (s3: S3Client, Bucket: string, hash: string, key: string) =>
  putObject(s3, Bucket, `dedup/${hash}`, Buffer.from(''), 'text/plain', {
    sha256: hash,
    key,
  });

// ----------------------- BlurHash -----------------------
// Note: makeBlurhash is now imported from shared utility

// ----------------------- Variants -----------------------
const buildVariants = (
  file: string,
  widths: number[],
  fmts: ('avif' | 'webp' | 'jpeg')[],
  q: { Q_AVIF: number; Q_WEBP: number; Q_JPEG: number },
  preserveMetadata: boolean = true,
) =>
  Effect.tryPromise({
    try: async () => {
      const res: Record<string, Buffer> = {};
      const base = sharp(file).rotate();

      for (const w of widths) {
        const resized = base
          .clone()
          .resize({ width: w, withoutEnlargement: true });

        // Only preserve metadata if requested (default: true)
        if (preserveMetadata) {
          resized.withMetadata(); // Preserve EXIF metadata including GPS
        }

        for (const f of fmts) {
          if (f === 'avif')
            res[`avif:${w}`] = await resized
              .clone()
              .avif({
                quality: q.Q_AVIF,
                // AVIF supports EXIF metadata
              })
              .toBuffer();
          else if (f === 'webp')
            res[`webp:${w}`] = await resized
              .clone()
              .webp({
                quality: q.Q_WEBP,
                // WebP supports EXIF metadata
              })
              .toBuffer();
          else
            res[`jpeg:${w}`] = await resized
              .clone()
              .jpeg({
                quality: q.Q_JPEG,
                mozjpeg: true,
                // JPEG naturally supports EXIF metadata
              })
              .toBuffer();
        }
      }
      return res;
    },
    catch: (e) => new Error(`buildVariants failed for ${file}: ${e}`),
  });

// ----------------------- Pipeline per file -----------------------
const processOne =
  (
    s3: S3Client,
    cfg: ReturnType<typeof Object>,
    bucket: string,
    srcDir: string,
    originalsPrefix: string,
    variantsPrefix: string,
    widths: number[],
    fmts: ('avif' | 'webp' | 'jpeg')[],
    q: { Q_AVIF: number; Q_WEBP: number; Q_JPEG: number },
    genBlur: boolean,
    blurMax: number,
    manifest: Record<
      string,
      { blurhash: string; w: number; h: number; exif: ExifMetadata }
    >,
    progress?: { update: () => void; getCompleted: () => number },
    metadataConfig?: { PRESERVE_METADATA?: boolean }, // Config object for metadata settings
    verbose?: boolean,
  ) =>
  (file: string) =>
    Effect.gen(function* () {
      const rel = path.relative(srcDir, file).split(path.sep).join('/');
      const origKey = toOrigKey(file, srcDir, originalsPrefix);

      // Content hash & duplicate check
      const hash = yield* sha256File(file);
      const sentinel = yield* headObject(s3, bucket, `dedup/${hash}`);
      if (sentinel) {
        // Log duplicates only in verbose mode
        if (verbose && !progress) {
          yield* Console.log(
            `= duplicate: ${rel} (hash: ${hash.substring(0, 8)}...)`,
          );
        }
      } else {
        // Skip if key exists with same size
        const st = yield* statFile(file);
        const head = yield* headObject(s3, bucket, origKey);
        if (head && Number(head?.ContentLength) === st.size) {
          // Log exists only in verbose mode
          if (verbose && !progress) {
            yield* Console.log(`. exists: ${rel} (${st.size} bytes)`);
          }
          yield* putSentinel(s3, bucket, hash, origKey);
        } else {
          // Upload original (streaming)
          const ContentType = mime.lookup(file) || 'application/octet-stream';
          yield* Effect.tryPromise({
            try: () => {
              const up = new Upload({
                client: s3,
                params: {
                  Bucket: bucket,
                  Key: origKey,
                  Body: fs.createReadStream(file),
                  ContentType,
                  CacheControl: 'public, max-age=31536000, immutable',
                  Metadata: { sha256: hash },
                },
                queueSize: 4,
                partSize: 8 * 1024 * 1024,
                leavePartsOnError: false,
              });
              return up.done();
            },
            catch: (e) => new Error(`upload failed for ${rel}: ${e}`),
          });
          yield* putSentinel(s3, bucket, hash, origKey);
          // Log uploads with more details in verbose mode
          if (!progress) {
            if (verbose) {
              yield* Console.log(
                `+ uploaded: ${rel} → ${origKey} (${st.size} bytes, hash: ${hash.substring(0, 8)}...)`,
              );
            } else {
              yield* Console.log(`+ uploaded: ${rel}`);
            }
          }
        }
      }

      // Variants — HEAD first; generate only missing ones
      // Build a set of keys we need
      const keysNeeded: {
        fmt: 'avif' | 'webp' | 'jpeg';
        w: number;
        key: string;
      }[] = [];
      for (const w of widths)
        for (const fmt of fmts) {
          const key = toVariantKey(rel, variantsPrefix, fmt, w);
          const exists = yield* headObject(s3, bucket, key);
          if (!exists) keysNeeded.push({ fmt, w, key });
        }

      if (keysNeeded.length) {
        const buffers = yield* buildVariants(
          file,
          Array.from(new Set(keysNeeded.map((k) => k.w))),
          fmts,
          q,
          metadataConfig?.PRESERVE_METADATA ?? true,
        );
        for (const { fmt, w, key } of keysNeeded) {
          const buf = buffers[`${fmt}:${w}`];
          const ct = mime.lookup(key) || 'application/octet-stream';
          yield* putObject(s3, bucket, key, buf, ct);
          // Log variants with more details in verbose mode
          if (!progress) {
            if (verbose) {
              yield* Console.log(
                `  ↳ variant ${fmt}@${w}: ${key} (${buf.length} bytes)`,
              );
            } else {
              yield* Console.log(`  ↳ variant ${fmt}@${w}: ${key}`);
            }
          }
        }
      }

      // BlurHash manifest entry
      if (genBlur) {
        const bh = yield* makeBlurhash(file, blurMax);
        if (bh.blurhash) {
          manifest[rel] = {
            blurhash: bh.blurhash,
            w: bh.w,
            h: bh.h,
            exif: bh.exif,
          };
          if (verbose && !progress) {
            yield* Console.log(`  🎨 blurhash: ${rel} (${bh.w}x${bh.h})`);
          }
        }
      }

      // Update progress counter
      if (progress) {
        progress.update();
      }
    });

// ----------------------- Discover & Run -----------------------
const discoverFiles = Effect.gen(function* () {
  const SRC_DIR = (process.argv[2] || './images').replace(/\/$/, '');
  const exts = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff'];
  const patterns = exts.flatMap((e) => [
    `${SRC_DIR}/**/*.${e}`,
    `${SRC_DIR}/**/*.${e.toUpperCase()}`,
  ]);
  const files = yield* Effect.tryPromise({
    try: () => fg(patterns, { dot: false }),
    catch: (e) => new Error(`glob failed: ${e}`),
  });
  if (!files.length)
    return yield* Effect.fail(
      new Error(
        `No images found under ${SRC_DIR}. Supported: ${exts.join(', ')}`,
      ),
    );
  return { SRC_DIR, files };
});

// Progress tracking utilities
const createProgressTracker = (total: number) => {
  let completed = 0;

  const update = () => {
    completed++;
    const percentage = Math.round((completed / total) * 100);
    const progressBar =
      '█'.repeat(Math.floor(percentage / 2)) +
      '░'.repeat(50 - Math.floor(percentage / 2));

    // Clear line and write progress
    process.stdout.write('\r');
    process.stdout.write(
      `Progress: [${progressBar}] ${completed}/${total} (${percentage}%) files processed`,
    );

    if (completed === total) {
      process.stdout.write('\n');
    }
  };

  return { update, getCompleted: () => completed };
};

const program = Effect.gen(function* () {
  const cfg = yield* getConfig;
  const { SRC_DIR, files } = yield* discoverFiles;

  yield* Console.log(
    `Uploading from ${SRC_DIR} → s3://${cfg.R2_BUCKET}/{${cfg.R2_PREFIX}, ${cfg.R2_VARIANTS_PREFIX}}`,
  );
  yield* Console.log(
    `Found ${files.length} files to process with concurrency ${cfg.CONCURRENCY}`,
  );

  if (cfg.VERBOSE) {
    yield* Console.log(`📋 Verbose mode enabled - showing detailed logs`);
    yield* Console.log(`🔧 Configuration:`);
    yield* Console.log(`   Formats: ${cfg.FORMATS.join(', ')}`);
    yield* Console.log(`   Widths: ${cfg.WIDTHS.join(', ')}`);
    yield* Console.log(
      `   Quality AVIF/WebP/JPEG: ${cfg.Q_AVIF}/${cfg.Q_WEBP}/${cfg.Q_JPEG}`,
    );
    yield* Console.log(
      `   BlurHash: ${cfg.GEN_BLURHASH ? 'enabled' : 'disabled'}`,
    );
    yield* Console.log(
      `   Preserve metadata: ${cfg.PRESERVE_METADATA ? 'yes' : 'no'}`,
    );
  }

  const manifest: Record<
    string,
    { blurhash: string; w: number; h: number; exif: ExifMetadata }
  > = {};

  // Initialize progress tracker
  const progress = createProgressTracker(files.length);

  const t0 = Date.now();
  yield* Effect.all(
    files.map((f) =>
      processOne(
        cfg.s3,
        cfg,
        cfg.R2_BUCKET,
        SRC_DIR,
        cfg.R2_PREFIX,
        cfg.R2_VARIANTS_PREFIX,
        cfg.WIDTHS,
        cfg.FORMATS,
        { Q_AVIF: cfg.Q_AVIF, Q_WEBP: cfg.Q_WEBP, Q_JPEG: cfg.Q_JPEG },
        cfg.GEN_BLURHASH,
        cfg.BLURHASH_MAX,
        manifest,
        progress, // Pass progress tracker
        cfg, // Pass full config for metadata settings
        cfg.VERBOSE, // Pass verbose flag
      )(f),
    ),
    { concurrency: cfg.CONCURRENCY },
  );
  const dt = Date.now() - t0;

  // Upload manifest to R2 (remote only)
  if (cfg.GEN_BLURHASH) {
    const manifestContent = JSON.stringify(manifest, null, 2);

    // Upload manifest to R2 for production use
    const manifestKey = `${cleanPrefix(cfg.R2_VARIANTS_PREFIX)}/r2-manifest.json`;
    yield* putObject(
      cfg.s3,
      cfg.R2_BUCKET,
      manifestKey,
      Buffer.from(manifestContent),
      'application/json',
    );

    yield* Console.log(
      `Manifest: uploaded to R2: ${manifestKey} (${Object.keys(manifest).length} entries)`,
    );
  }

  yield* Console.log('');
  yield* Console.log(`✅ Upload complete!`);
  yield* Console.log(`⏱️  Total time: ${(dt / 1000).toFixed(2)}s`);
  yield* Console.log(`📁 Files processed: ${files.length}`);
  yield* Console.log(
    `📊 Average time per file: ${(dt / files.length / 1000).toFixed(2)}s`,
  );

  if (cfg.GEN_BLURHASH) {
    yield* Console.log(`🖼️  Manifest entries: ${Object.keys(manifest).length}`);
  }
});

pipe(
  program,
  Effect.catchAll((e) =>
    Effect.gen(function* () {
      const msg = e instanceof Error ? e.message : String(e);
      yield* Console.error(`Error: ${msg}`);
      yield* Effect.sync(() => process.exit(1));
    }),
  ),
).pipe(Effect.runPromise);
