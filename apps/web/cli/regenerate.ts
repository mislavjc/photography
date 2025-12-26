/**
 * Regenerate variants from R2 originals
 *
 * Usage:
 *   pnpm tsx cli/regenerate.ts --width=360           # Add 360px variants for all images
 *   pnpm tsx cli/regenerate.ts --format=avif         # Regenerate all AVIF variants
 *   pnpm tsx cli/regenerate.ts --profile=grid        # Regenerate specific profile
 *   pnpm tsx cli/regenerate.ts --all                 # Regenerate everything
 *   pnpm tsx cli/regenerate.ts --width=360 --dry-run # Dry run
 *   pnpm tsx cli/regenerate.ts --update-manifest     # Update manifest from R2 originals
 */

import { Console, Effect, pipe } from 'effect';
import mime from 'mime-types';

import type { Formats, Manifest, ProfileName } from './shared';
import {
  batchHeadObjects,
  buildSingleVariant,
  cleanPrefix,
  type ConfigWithS3,
  createEnhancedProgressTracker,
  extractDominantColorsFromBuffer,
  extractExtFromKey,
  extractUuidFromKey,
  formatDuration,
  getConfig,
  getObject,
  listObjects,
  loadManifestFromR2,
  makeBlurhashFromBuffer,
  mergeManifests,
  putObject,
  saveManifestToR2,
  toVariantKey,
} from './shared';

// ----------------------- CLI Options -----------------------
interface RegenerateOptions {
  dryRun: boolean;
  all: boolean;
  profile?: ProfileName;
  format?: Formats;
  width?: number;
  updateManifest: boolean;
  concurrency: number;
  verbose: boolean;
}

function parseOptions(argv: string[]): RegenerateOptions {
  const args = argv.slice(2);

  return {
    dryRun: args.includes('--dry-run'),
    all: args.includes('--all'),
    profile: args.find((a) => a.startsWith('--profile='))?.split('=')[1] as
      | ProfileName
      | undefined,
    format: args.find((a) => a.startsWith('--format='))?.split('=')[1] as
      | Formats
      | undefined,
    width: (() => {
      const w = args.find((a) => a.startsWith('--width='))?.split('=')[1];
      return w ? parseInt(w, 10) : undefined;
    })(),
    updateManifest: args.includes('--update-manifest'),
    concurrency: (() => {
      const c = args.find((a) => a.startsWith('--concurrency='))?.split('=')[1];
      return c ? parseInt(c, 10) : 4;
    })(),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
}

function printUsage() {
  console.log(`
Regenerate variants from R2 originals

Usage:
  pnpm tsx cli/regenerate.ts [options]

Options:
  --width=<pixels>      Generate variants for specific width only (e.g., --width=360)
  --format=<fmt>        Generate variants for specific format only (avif, webp, jpeg)
  --profile=<name>      Generate variants for specific profile only (grid, large)
  --all                 Regenerate ALL variants (use with caution!)
  --update-manifest     Update manifest entries for originals (blurhash, colors)
  --dry-run             Show what would be done without making changes
  --concurrency=<n>     Number of concurrent operations (default: 4)
  --verbose, -v         Show detailed output

Examples:
  # Add 360px variants for all images
  pnpm tsx cli/regenerate.ts --width=360

  # Regenerate all AVIF variants (e.g., after quality change)
  pnpm tsx cli/regenerate.ts --format=avif

  # Regenerate grid profile only
  pnpm tsx cli/regenerate.ts --profile=grid

  # Preview what would happen
  pnpm tsx cli/regenerate.ts --width=360 --dry-run

  # Update manifest with blurhash for all originals
  pnpm tsx cli/regenerate.ts --update-manifest
`);
}

// ----------------------- Main Program -----------------------
const program = Effect.gen(function* () {
  const opts = parseOptions(process.argv);

  // Show usage if no actionable options provided
  if (
    !opts.width &&
    !opts.format &&
    !opts.profile &&
    !opts.all &&
    !opts.updateManifest
  ) {
    printUsage();
    return;
  }

  const cfg = yield* getConfig;

  yield* Console.log('🔄 Regenerate variants from R2 originals');
  yield* Console.log(`   Bucket: ${cfg.R2_BUCKET}`);
  yield* Console.log(`   Originals prefix: ${cfg.R2_PREFIX}`);
  yield* Console.log(`   Variants prefix: ${cfg.R2_VARIANTS_PREFIX}`);

  if (opts.dryRun) {
    yield* Console.log('\n🔍 DRY RUN - No files will be uploaded\n');
  }

  // Filter info
  if (opts.profile || opts.format || opts.width) {
    yield* Console.log(`🎯 Filters:`);
    if (opts.profile) yield* Console.log(`   Profile: ${opts.profile}`);
    if (opts.format) yield* Console.log(`   Format: ${opts.format}`);
    if (opts.width) yield* Console.log(`   Width: ${opts.width}px`);
  }

  if (opts.all) {
    yield* Console.log(
      '⚠️  Regenerating ALL variants - this may take a while!',
    );
  }

  // List all originals
  yield* Console.log('\n📂 Listing originals...');
  const originalsPrefix = cleanPrefix(cfg.R2_PREFIX);
  const originalKeys = yield* listObjects(
    cfg.s3,
    cfg.R2_BUCKET,
    originalsPrefix,
  );

  // Filter out non-image files and dedup folder
  const imageKeys = originalKeys.filter((key) => {
    if (key.includes('/dedup/')) return false;
    const ext = key.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff'].includes(
      ext || '',
    );
  });

  yield* Console.log(`   Found ${imageKeys.length} original images`);

  // Load existing manifest if we need to update it
  let existingManifest: Manifest = {};
  if (!opts.dryRun) {
    const loadResult = yield* loadManifestFromR2(
      cfg.s3,
      cfg.R2_BUCKET,
      cfg.R2_VARIANTS_PREFIX,
    ).pipe(
      Effect.map((m) => ({ ok: true as const, manifest: m })),
      Effect.catchAll((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        // Only treat "not found" style errors as acceptable
        if (msg.includes('getObject failed') || msg.includes('No body')) {
          return Effect.succeed({
            ok: false as const,
            manifest: {} as Manifest,
          });
        }
        // Re-throw actual errors (network issues, parse failures, etc.)
        return Effect.fail(e);
      }),
    );

    if (loadResult.ok) {
      existingManifest = loadResult.manifest;
      yield* Console.log(
        `   Loaded existing manifest with ${Object.keys(existingManifest).length} entries`,
      );
    } else {
      yield* Console.log('   No existing manifest found, will create new one');
    }
  }

  // If update-manifest only, just process manifest entries
  if (
    opts.updateManifest &&
    !opts.width &&
    !opts.format &&
    !opts.profile &&
    !opts.all
  ) {
    yield* updateManifestFromOriginals(imageKeys, existingManifest, cfg, opts);
    return;
  }

  // Determine which variants to generate
  const variantsToGenerate: Array<{
    originalKey: string;
    uuid: string;
    ext: string;
    profile: ProfileName;
    format: Formats;
    width: number;
    variantKey: string;
  }> = [];

  yield* Console.log('\n🔍 Checking which variants need generation...');

  for (const originalKey of imageKeys) {
    const uuid = extractUuidFromKey(originalKey);
    const ext = extractExtFromKey(originalKey);

    for (const { name: profile, widths } of cfg.PROFILES) {
      // Apply profile filter
      if (opts.profile && profile !== opts.profile) continue;

      for (const w of widths) {
        // Apply width filter
        if (opts.width && w !== opts.width) continue;

        for (const fmt of cfg.FORMATS) {
          // Apply format filter
          if (opts.format && fmt !== opts.format) continue;

          const variantKey = toVariantKey(
            uuid,
            cfg.R2_VARIANTS_PREFIX,
            profile,
            fmt,
            w,
            `.${fmt}`,
          );

          variantsToGenerate.push({
            originalKey,
            uuid,
            ext,
            profile,
            format: fmt,
            width: w,
            variantKey,
          });
        }
      }
    }
  }

  // Batch check which variants already exist
  yield* Console.log(
    `   Checking ${variantsToGenerate.length} potential variants...`,
  );

  const existsMap = yield* batchHeadObjects(
    cfg.s3,
    cfg.R2_BUCKET,
    variantsToGenerate.map((v) => v.variantKey),
  );

  // Filter to only missing variants (unless --all is specified)
  const missingVariants = opts.all
    ? variantsToGenerate
    : variantsToGenerate.filter((v) => !existsMap.get(v.variantKey));

  yield* Console.log(`   Found ${missingVariants.length} variants to generate`);

  if (missingVariants.length === 0) {
    yield* Console.log('\n✅ All variants already exist!');
    return;
  }

  if (opts.dryRun) {
    yield* Console.log('\n📋 Would generate:');

    // Group by original
    const byOriginal = new Map<string, typeof missingVariants>();
    for (const v of missingVariants) {
      const list = byOriginal.get(v.originalKey) || [];
      list.push(v);
      byOriginal.set(v.originalKey, list);
    }

    let shown = 0;
    for (const [original, variants] of byOriginal) {
      if (shown >= 10) {
        yield* Console.log(`   ... and ${byOriginal.size - 10} more originals`);
        break;
      }
      yield* Console.log(`   ${original}:`);
      for (const v of variants.slice(0, 3)) {
        yield* Console.log(`     → ${v.format}@${v.width} (${v.profile})`);
      }
      if (variants.length > 3) {
        yield* Console.log(`     ... and ${variants.length - 3} more`);
      }
      shown++;
    }

    return;
  }

  // Process variants
  const progress = createEnhancedProgressTracker(missingVariants.length);
  const t0 = Date.now();
  const newManifestEntries: Manifest = {};
  const failedVariants: Array<{ key: string; error: string }> = [];

  // Group variants by original to minimize downloads
  const byOriginal = new Map<string, typeof missingVariants>();
  for (const v of missingVariants) {
    const list = byOriginal.get(v.originalKey) || [];
    list.push(v);
    byOriginal.set(v.originalKey, list);
  }

  yield* Console.log(`\n⚙️  Processing ${byOriginal.size} originals...`);

  // Process each original
  for (const [originalKey, variants] of byOriginal) {
    try {
      // Download original once
      const originalBuffer = yield* getObject(
        cfg.s3,
        cfg.R2_BUCKET,
        originalKey,
      );

      const uuid = variants[0].uuid;
      const ext = variants[0].ext;
      const manifestKey = `${uuid}${ext}`;

      // Generate blurhash if not in manifest
      if (!existingManifest[manifestKey]) {
        const bh = yield* makeBlurhashFromBuffer(
          originalBuffer,
          cfg.BLURHASH_MAX,
        );
        const dominantColors = yield* extractDominantColorsFromBuffer(
          originalBuffer,
          5,
        );

        newManifestEntries[manifestKey] = {
          blurhash: bh.blurhash,
          w: bh.w,
          h: bh.h,
          exif: {
            camera: null,
            lens: null,
            focalLength: null,
            aperture: null,
            shutterSpeed: null,
            iso: null,
            location: null,
            dateTime: null,
            dominantColors,
          },
        };
      }

      // Generate and upload each variant
      for (const v of variants) {
        try {
          progress.update({
            currentFile: v.originalKey,
            currentOperation: `${v.format}@${v.width}`,
          });

          const quality =
            v.format === 'avif'
              ? cfg.Q_AVIF
              : v.format === 'webp'
                ? cfg.Q_WEBP
                : cfg.Q_JPEG;

          const variantBuffer = yield* buildSingleVariant(
            originalBuffer,
            v.width,
            v.format,
            quality,
            cfg.PRESERVE_METADATA,
          );

          const contentType =
            mime.lookup(v.variantKey) || 'application/octet-stream';
          yield* putObject(
            cfg.s3,
            cfg.R2_BUCKET,
            v.variantKey,
            variantBuffer,
            contentType,
          );

          progress.update({
            processedFiles: 1,
            variantsCreated: 1,
            bytesUploaded: variantBuffer.length,
          });

          if (opts.verbose) {
            yield* Console.log(`  ✓ ${v.variantKey}`);
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          failedVariants.push({ key: v.variantKey, error: errMsg });
          progress.update({ failedFiles: 1 });

          if (opts.verbose) {
            yield* Console.log(`  ✗ ${v.variantKey}: ${errMsg}`);
          }
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      yield* Console.log(`\n❌ Failed to process ${originalKey}: ${errMsg}`);

      // Mark all variants for this original as failed
      for (const v of variants) {
        failedVariants.push({ key: v.variantKey, error: errMsg });
        progress.update({ failedFiles: 1 });
      }
    }
  }

  // Merge and save manifest
  if (Object.keys(newManifestEntries).length > 0) {
    yield* Console.log('\n📄 Updating manifest...');
    const mergedManifest = mergeManifests(existingManifest, newManifestEntries);
    const result = yield* saveManifestToR2(
      cfg.s3,
      cfg.R2_BUCKET,
      cfg.R2_VARIANTS_PREFIX,
      mergedManifest,
    );
    yield* Console.log(`   Manifest saved (${result.entries} entries)`);
  }

  // Print summary
  const dt = Date.now() - t0;
  progress.printSummary();

  if (failedVariants.length > 0) {
    yield* Console.log(`\n⚠️  Failed variants (${failedVariants.length}):`);
    for (const { key, error } of failedVariants.slice(0, 10)) {
      yield* Console.log(`   ${key}: ${error}`);
    }
    if (failedVariants.length > 10) {
      yield* Console.log(`   ... and ${failedVariants.length - 10} more`);
    }
  }

  yield* Console.log(`\n✅ Regeneration complete in ${formatDuration(dt)}`);
});

// ----------------------- Update Manifest Only -----------------------
const updateManifestFromOriginals = (
  originalKeys: string[],
  existingManifest: Manifest,
  cfg: ConfigWithS3,
  opts: RegenerateOptions,
) =>
  Effect.gen(function* () {
    yield* Console.log('\n📄 Updating manifest from originals...');

    const progress = createEnhancedProgressTracker(originalKeys.length);
    const t0 = Date.now();
    const newEntries: Manifest = {};

    for (const originalKey of originalKeys) {
      const uuid = extractUuidFromKey(originalKey);
      const ext = extractExtFromKey(originalKey);
      const manifestKey = `${uuid}${ext}`;

      progress.update({
        currentFile: originalKey,
        currentOperation: 'Processing',
      });

      // Skip if already in manifest
      if (existingManifest[manifestKey]) {
        progress.update({ processedFiles: 1 });
        continue;
      }

      if (opts.dryRun) {
        yield* Console.log(`   Would add: ${manifestKey}`);
        progress.update({ processedFiles: 1 });
        continue;
      }

      try {
        const originalBuffer = yield* getObject(
          cfg.s3,
          cfg.R2_BUCKET,
          originalKey,
        );
        const bh = yield* makeBlurhashFromBuffer(
          originalBuffer,
          cfg.BLURHASH_MAX,
        );
        const dominantColors = yield* extractDominantColorsFromBuffer(
          originalBuffer,
          5,
        );

        newEntries[manifestKey] = {
          blurhash: bh.blurhash,
          w: bh.w,
          h: bh.h,
          exif: {
            camera: null,
            lens: null,
            focalLength: null,
            aperture: null,
            shutterSpeed: null,
            iso: null,
            location: null,
            dateTime: null,
            dominantColors,
          },
        };

        if (opts.verbose) {
          yield* Console.log(`   ✓ ${manifestKey}: ${bh.w}x${bh.h}`);
        }

        progress.update({ processedFiles: 1 });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        yield* Console.log(`   ✗ ${manifestKey}: ${errMsg}`);
        progress.update({ failedFiles: 1 });
      }
    }

    if (!opts.dryRun && Object.keys(newEntries).length > 0) {
      const mergedManifest = mergeManifests(existingManifest, newEntries);
      const result = yield* saveManifestToR2(
        cfg.s3,
        cfg.R2_BUCKET,
        cfg.R2_VARIANTS_PREFIX,
        mergedManifest,
      );
      yield* Console.log(
        `\n📄 Manifest updated (${result.entries} total entries)`,
      );
      yield* Console.log(
        `   New entries added: ${Object.keys(newEntries).length}`,
      );
    }

    const dt = Date.now() - t0;
    yield* Console.log(
      `\n✅ Manifest update complete in ${formatDuration(dt)}`,
    );
  });

// ----------------------- Run -----------------------
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
