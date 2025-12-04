import { Console, Effect, pipe } from 'effect';
import fg from 'fast-glob';
import mime from 'mime-types';
import fs from 'node:fs';
import path from 'node:path';

import type {
  CLIOptions,
  ConfigWithS3,
  ExifMetadata,
  Manifest,
  VariantNeed,
} from './shared';
import {
  analyzeWithAI,
  backupManifestLocally,
  batchHeadObjects,
  buildPromptFromManifest,
  buildVariantsParallel,
  compressManifest,
  createCheckpointManager,
  createEnhancedProgressTracker,
  emptyExifMetadata,
  extractDominantColors,
  fileTimestampMs,
  formatBytes,
  formatDuration,
  getConfig,
  getExt,
  getImageDimensions,
  getObject,
  headObject,
  makeBlurhash,
  makePreviewJpeg,
  manifestKeys,
  parseCLIOptions,
  putObject,
  putSentinel,
  readBuffer,
  readExif,
  readExifTags,
  reverseGeocodeNominatim,
  saveManifestToR2,
  sha256File,
  shutdownExiftool,
  sleep,
  statFile,
  toOrigKeyUsingUuid,
  toVariantKey,
  uploadLargeFile,
  uuidv7FromHash,
} from './shared';

// ----------------------- Discover Files -----------------------
const discoverFiles = (srcDir: string) =>
  Effect.gen(function* () {
    const exts = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff'];
    const patterns = exts.flatMap((e) => [
      `${srcDir}/**/*.${e}`,
      `${srcDir}/**/*.${e.toUpperCase()}`,
    ]);
    const allFiles = yield* Effect.tryPromise({
      try: () => fg(patterns, { dot: false }),
      catch: (e) => new Error(`glob failed: ${e}`),
    });
    if (!allFiles.length) {
      return yield* Effect.fail(
        new Error(`No images found. Supported: ${exts.join(', ')}`),
      );
    }
    return allFiles;
  });

// ----------------------- Main Pipeline -----------------------
const program = Effect.gen(function* () {
  const cfg = yield* getConfig;
  const opts = parseCLIOptions(process.argv);

  // Handle --reset flag
  if (opts.reset) {
    const checkpoint = createCheckpointManager();
    yield* Effect.promise(() => checkpoint.clear());
    yield* Console.log('🗑️  Checkpoint cleared');
  }

  // Location-only mode - update addresses in existing manifest
  if (opts.locationOnly) {
    yield* runLocationOnlyMode(cfg);
    return;
  }

  // Discover files
  const files = yield* discoverFiles(opts.srcDir.replace(/\/$/, ''));

  // Load checkpoint if resuming
  const checkpoint = createCheckpointManager();
  let filesToProcess = files;

  if (opts.resume) {
    const loaded = yield* Effect.promise(() => checkpoint.load());
    if (loaded) {
      yield* Console.log(
        `📋 Resuming from checkpoint (${loaded.processedFiles.length} already processed)`,
      );
      filesToProcess = files.filter((f) => !checkpoint.isProcessed(f));
      yield* Console.log(`   Remaining files: ${filesToProcess.length}`);
    }
  }

  checkpoint.setTotalFiles(files.length);

  // Apply --only-missing filter
  if (opts.onlyMissing && !opts.manifestOnly) {
    yield* Console.log('🔍 Checking for files with missing variants...');
    const filtered: string[] = [];

    for (const file of filesToProcess) {
      const exif = yield* readExif(file).pipe(
        Effect.catchAll(() => Effect.succeed(emptyExifMetadata)),
      );
      const st = yield* statFile(file);
      const hashHex = yield* sha256File(file);
      const hashBuf = Buffer.from(hashHex, 'hex');
      const tsMs = fileTimestampMs(st, exif.dateTime);
      const uuid = uuidv7FromHash(tsMs, hashBuf);

      // Check if any variants are missing
      const keysToCheck: string[] = [];
      for (const { name: profile, widths } of cfg.PROFILES) {
        // Apply profile filter
        if (opts.profile && profile !== opts.profile) continue;

        for (const w of widths) {
          // Apply width filter
          if (opts.width && w !== opts.width) continue;

          for (const fmt of cfg.FORMATS) {
            // Apply format filter
            if (opts.format && fmt !== opts.format) continue;

            keysToCheck.push(
              toVariantKey(
                uuid,
                cfg.R2_VARIANTS_PREFIX,
                profile,
                fmt,
                w,
                `.${fmt}`,
              ),
            );
          }
        }
      }

      const existsMap = yield* batchHeadObjects(
        cfg.s3,
        cfg.R2_BUCKET,
        keysToCheck,
      );
      const hasMissing = Array.from(existsMap.values()).some(
        (exists) => !exists,
      );

      if (hasMissing) {
        filtered.push(file);
      }
    }

    filesToProcess = filtered;
    yield* Console.log(
      `   Found ${filesToProcess.length} files with missing variants`,
    );
  }

  // Mode messages
  const modeMessage = opts.manifestOnly
    ? 'Manifest regeneration'
    : opts.dryRun
      ? 'Dry run'
      : 'Upload';

  yield* Console.log(
    `${modeMessage} from ${opts.srcDir} → s3://${cfg.R2_BUCKET}/{${cfg.R2_PREFIX}, ${cfg.R2_VARIANTS_PREFIX}}`,
  );
  yield* Console.log(
    `Found ${filesToProcess.length} files | concurrency ${cfg.CONCURRENCY}`,
  );

  if (opts.dryRun) {
    yield* Console.log('\n🔍 DRY RUN - No files will be uploaded\n');
  }

  if (opts.manifestOnly) {
    yield* Console.log(
      `📋 Manifest-only mode: will verify ALL originals AND variants exist in R2`,
    );
  }

  // Filter info
  if (opts.profile || opts.format || opts.width) {
    yield* Console.log(`🎯 Filters:`);
    if (opts.profile) yield* Console.log(`   Profile: ${opts.profile}`);
    if (opts.format) yield* Console.log(`   Format: ${opts.format}`);
    if (opts.width) yield* Console.log(`   Width: ${opts.width}px`);
  }

  if (cfg.VERBOSE) {
    yield* Console.log(`🔧 Config:`);
    yield* Console.log(`   Formats: ${cfg.FORMATS.join(', ')}`);
    yield* Console.log(
      `   Q (AVIF/WebP/JPEG): ${cfg.Q_AVIF}/${cfg.Q_WEBP}/${cfg.Q_JPEG}`,
    );
    yield* Console.log(
      `   Preserve metadata on variants: ${cfg.PRESERVE_METADATA ? 'yes' : 'no'}`,
    );
    yield* Console.log(
      `   BlurHash: ${cfg.GEN_BLURHASH ? 'enabled' : 'disabled'} (max ${cfg.BLURHASH_MAX})`,
    );
    yield* Console.log(
      `   AI Descriptions: ${cfg.GEN_AI_DESCRIPTIONS && !opts.skipAi ? 'enabled' : 'disabled'}`,
    );
  }

  const progress = createEnhancedProgressTracker(filesToProcess.length);
  const manifest: Manifest = { ...checkpoint.getManifestEntries() };
  const failedFiles: Array<{ file: string; error: string }> = [];
  const t0 = Date.now();

  // Process files
  yield* Effect.all(
    filesToProcess.map((file) =>
      Effect.gen(function* () {
        try {
          yield* processFile(file, manifest, cfg, opts, progress, checkpoint);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          failedFiles.push({ file, error: errMsg });
          checkpoint.markFailed(file, errMsg);
          progress.update({ failedFiles: 1 });

          if (cfg.VERBOSE) {
            yield* Console.log(
              `\n❌ Failed: ${path.basename(file)}: ${errMsg}`,
            );
          }
        }
      }),
    ),
    { concurrency: cfg.CONCURRENCY },
  );

  // Generate AI descriptions if enabled
  if (
    cfg.GEN_AI_DESCRIPTIONS &&
    !opts.skipAi &&
    cfg.GEN_BLURHASH &&
    !opts.dryRun
  ) {
    yield* generateAIDescriptions(filesToProcess, manifest, cfg);
  }

  // Upload manifest (unless skipped or dry-run)
  if (cfg.GEN_BLURHASH && !opts.skipManifest && !opts.dryRun) {
    const result = yield* saveManifestToR2(
      cfg.s3,
      cfg.R2_BUCKET,
      cfg.R2_VARIANTS_PREFIX,
      manifest,
    );

    const action = opts.manifestOnly ? 'regenerated' : 'uploaded';
    yield* Console.log(
      `\n📄 Manifest ${action}: s3://${cfg.R2_BUCKET}/${manifestKeys(cfg.R2_VARIANTS_PREFIX).compressed}`,
    );
    yield* Console.log(`   Entries: ${result.entries}`);
    yield* Console.log(
      `   Compression: ${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)} (${result.encoding}, ${((result.compressedSize / result.originalSize) * 100).toFixed(1)}%)`,
    );
  }

  // Print summary
  const dt = Date.now() - t0;
  progress.printSummary();

  if (failedFiles.length > 0) {
    yield* Console.log(`\n⚠️  Failed files (${failedFiles.length}):`);
    for (const { file, error } of failedFiles.slice(0, 10)) {
      yield* Console.log(`   ${path.basename(file)}: ${error}`);
    }
    if (failedFiles.length > 10) {
      yield* Console.log(`   ... and ${failedFiles.length - 10} more`);
    }
  }

  // Clear checkpoint on successful completion
  if (failedFiles.length === 0 && !opts.dryRun) {
    yield* Effect.promise(() => checkpoint.clear());
  } else if (!opts.dryRun) {
    yield* Effect.promise(() => checkpoint.save());
    yield* Console.log(`\n💾 Checkpoint saved. Run with --resume to continue.`);
  }

  const completionMode = opts.manifestOnly
    ? 'Manifest regeneration'
    : opts.dryRun
      ? 'Dry run'
      : 'Upload';
  yield* Console.log(`\n✅ ${completionMode} done in ${formatDuration(dt)}`);
}).pipe(Effect.ensuring(shutdownExiftool));

// ----------------------- Process Single File -----------------------
const processFile = (
  file: string,
  manifest: Manifest,
  cfg: ConfigWithS3,
  opts: CLIOptions,
  progress: ReturnType<typeof createEnhancedProgressTracker>,
  checkpoint: ReturnType<typeof createCheckpointManager>,
) =>
  Effect.gen(function* () {
    const ext = getExt(file);

    progress.update({ currentFile: file, currentOperation: 'Reading EXIF' });

    // Read EXIF early to get timestamp preference
    const exif = yield* readExif(file).pipe(
      Effect.catchAll(() => Effect.succeed(emptyExifMetadata)),
    );

    const st = yield* statFile(file);
    const hashHex = yield* sha256File(file);
    const hashBuf = Buffer.from(hashHex, 'hex');

    const tsMs = fileTimestampMs(st, exif.dateTime);
    const uuid = uuidv7FromHash(tsMs, hashBuf);
    const origKey = toOrigKeyUsingUuid(uuid, ext, cfg.R2_PREFIX);

    if (opts.dryRun) {
      // In dry-run mode, just report what would happen
      yield* Console.log(`\n📁 ${path.basename(file)} → ${uuid}${ext}`);

      const needed = yield* checkNeededVariants(uuid, cfg, opts);
      if (needed.length > 0) {
        yield* Console.log(`   Would create ${needed.length} variants`);
      }

      progress.update({ processedFiles: 1 });
      return;
    }

    if (opts.manifestOnly) {
      // In manifest-only mode, verify original exists in R2
      const head = yield* headObject(cfg.s3, cfg.R2_BUCKET, origKey);
      if (!head) {
        yield* Effect.fail(
          new Error(`Original image missing in R2: ${origKey} (file: ${file})`),
        );
      }
      if (cfg.VERBOSE) {
        yield* Console.log(`✓ verified: ${origKey}`);
      }
    } else {
      // Upload original if not present
      progress.update({ currentOperation: 'Uploading original' });
      yield* uploadOriginal(file, cfg, hashHex, origKey, st);
    }

    // Check and generate needed variants
    progress.update({ currentOperation: 'Checking variants' });
    const needed = yield* checkNeededVariants(uuid, cfg, opts);

    let bytesUploaded = 0;

    if (!opts.manifestOnly && needed.length > 0) {
      progress.update({ currentOperation: 'Generating variants' });

      // Get unique widths needed
      const uniqueWidths = Array.from(new Set(needed.map((n) => n.w))).sort(
        (a, b) => a - b,
      );

      // Build all variants at once (parallel for speed)
      const buffers = yield* buildVariantsParallel(
        file,
        uniqueWidths,
        cfg.FORMATS,
        { Q_AVIF: cfg.Q_AVIF, Q_WEBP: cfg.Q_WEBP, Q_JPEG: cfg.Q_JPEG },
        cfg.PRESERVE_METADATA,
      );

      // Upload variants
      progress.update({ currentOperation: 'Uploading variants' });
      for (const { fmt, w, key } of needed) {
        const buf = buffers[`${fmt}:${w}`];
        if (buf) {
          const ct = mime.lookup(key) || 'application/octet-stream';
          yield* putObject(cfg.s3, cfg.R2_BUCKET, key, buf, ct);
          bytesUploaded += buf.length;

          if (cfg.VERBOSE) {
            yield* Console.log(`  ↳ ${fmt}@${w}: ${key} (${buf.length} B)`);
          }
        }
      }
    } else if (opts.manifestOnly && needed.length > 0) {
      // In manifest-only mode, fail if any variants are missing
      const missingVariants = needed.map((n) => `${n.fmt}@${n.w}`).join(', ');
      yield* Effect.fail(
        new Error(
          `Missing variants for ${file}: ${missingVariants} (${needed.length} total missing)`,
        ),
      );
    }

    // Generate blurhash, dimensions, and manifest entry
    let blurhash = '';
    let dimensions: { w: number; h: number };
    let dominantColors: ExifMetadata['dominantColors'] = undefined;

    if (cfg.GEN_BLURHASH) {
      progress.update({ currentOperation: 'Generating blurhash' });
      const bh = yield* makeBlurhash(file, cfg.BLURHASH_MAX);
      blurhash = bh.blurhash;
      dimensions = { w: bh.w, h: bh.h };
      dominantColors = yield* extractDominantColors(file, 5);

      if (cfg.VERBOSE) {
        yield* Console.log(`  🎨 blurhash: ${bh.w}x${bh.h}`);
        if (dominantColors?.[0]) {
          yield* Console.log(`  🌈 color: ${dominantColors[0].hex}`);
        }
      }
    } else {
      // Still need dimensions for manifest even without blurhash
      progress.update({ currentOperation: 'Reading dimensions' });
      dimensions = yield* getImageDimensions(file);
    }

    // Reverse geocode if we have coordinates
    let address: string | null | undefined = undefined;
    if (exif.location?.latitude != null && exif.location?.longitude != null) {
      const rg = yield* reverseGeocodeNominatim(
        exif.location.latitude,
        exif.location.longitude,
        cfg.NOMINATIM_EMAIL || undefined,
      );
      address = rg.address ?? null;
    }

    const exifForManifest: ExifMetadata = {
      ...exif,
      location: exif.location
        ? {
            ...exif.location,
            address: address ?? exif.location.address ?? null,
          }
        : null,
      dominantColors,
    };

    manifest[`${uuid}${ext}`] = {
      blurhash,
      w: dimensions.w,
      h: dimensions.h,
      exif: exifForManifest,
    };

    // Update checkpoint
    checkpoint.markProcessed(file, {
      key: `${uuid}${ext}`,
      entry: manifest[`${uuid}${ext}`],
    });
    checkpoint.addVariants(needed.length, bytesUploaded);

    // Save checkpoint every 10 files
    if (checkpoint.getData().processedFiles.length % 10 === 0) {
      yield* Effect.promise(() => checkpoint.save());
    }

    progress.update({
      processedFiles: 1,
      variantsCreated: needed.length,
      bytesUploaded,
    });
  });

// ----------------------- Helper Functions -----------------------
const uploadOriginal = (
  file: string,
  cfg: ConfigWithS3,
  hashHex: string,
  origKey: string,
  st: fs.Stats,
) =>
  Effect.gen(function* () {
    // Check dedupe sentinel
    const sentinel = yield* headObject(
      cfg.s3,
      cfg.R2_BUCKET,
      `dedup/${hashHex}`,
    );

    if (!sentinel) {
      // Upload original if not present (or size differs)
      const head = yield* headObject(cfg.s3, cfg.R2_BUCKET, origKey);
      if (!head || Number(head?.ContentLength) !== st.size) {
        const ContentType = mime.lookup(file) || 'application/octet-stream';
        yield* uploadLargeFile(
          cfg.s3,
          cfg.R2_BUCKET,
          origKey,
          fs.createReadStream(file),
          ContentType,
          { sha256: hashHex },
        );
      }
      yield* putSentinel(cfg.s3, cfg.R2_BUCKET, hashHex, origKey);

      if (cfg.VERBOSE) {
        yield* Console.log(`+ original: ${origKey}`);
      }
    } else if (cfg.VERBOSE) {
      yield* Console.log(
        `= duplicate: ${file} (hash ${hashHex.slice(0, 8)}...)`,
      );
    }
  });

const checkNeededVariants = (
  uuid: string,
  cfg: ConfigWithS3,
  opts: CLIOptions,
) =>
  Effect.gen(function* () {
    const needed: VariantNeed[] = [];

    // Build list of all potential variant keys
    const keysToCheck: Array<{ key: string; need: VariantNeed }> = [];

    for (const { name: profile, widths } of cfg.PROFILES) {
      // Apply profile filter
      if (opts.profile && profile !== opts.profile) continue;

      for (const w of widths) {
        // Apply width filter
        if (opts.width && w !== opts.width) continue;

        for (const fmt of cfg.FORMATS) {
          // Apply format filter
          if (opts.format && fmt !== opts.format) continue;

          const key = toVariantKey(
            uuid,
            cfg.R2_VARIANTS_PREFIX,
            profile,
            fmt,
            w,
            `.${fmt}`,
          );
          keysToCheck.push({
            key,
            need: { profile, fmt, w, key },
          });
        }
      }
    }

    // Batch check all keys
    const existsMap = yield* batchHeadObjects(
      cfg.s3,
      cfg.R2_BUCKET,
      keysToCheck.map((k) => k.key),
    );

    // Collect missing ones
    for (const { key, need } of keysToCheck) {
      if (!existsMap.get(key)) {
        needed.push(need);
      }
    }

    return needed;
  });

const generateAIDescriptions = (
  files: string[],
  manifest: Manifest,
  cfg: ConfigWithS3,
) =>
  Effect.gen(function* () {
    yield* Console.log(`\n🤖 Generating AI descriptions...`);

    let aiProcessed = 0;

    yield* Effect.all(
      files.map((file) =>
        Effect.gen(function* () {
          const ext = getExt(file);
          const st = yield* statFile(file);
          const exif = yield* readExif(file).pipe(
            Effect.catchAll(() => Effect.succeed(emptyExifMetadata)),
          );
          const hashHex = yield* sha256File(file);
          const hashBuf = Buffer.from(hashHex, 'hex');
          const tsMs = fileTimestampMs(st, exif.dateTime);
          const uuid = uuidv7FromHash(tsMs, hashBuf);
          const key = `${uuid}${ext}`;

          const entry = manifest[key];
          if (!entry || entry.description) {
            return;
          }

          try {
            const tags = yield* readExifTags(file).pipe(
              Effect.catchAll(() => Effect.succeed({})),
            );
            const buf = yield* readBuffer(file);
            const preview = yield* makePreviewJpeg(buf);
            const prompt = buildPromptFromManifest(entry, tags);
            const { text } = yield* analyzeWithAI(preview, prompt);
            entry.description = text.trim();

            if (cfg.VERBOSE) {
              yield* Console.log(
                `\n— ${path.basename(file)} → ${key}\n${entry.description}\n`,
              );
            }
            aiProcessed++;
          } catch (error) {
            if (cfg.VERBOSE) {
              yield* Console.log(
                `⚠️  Failed to generate description for ${path.basename(file)}: ${error}`,
              );
            }
          }
        }),
      ),
      { concurrency: Math.min(cfg.CONCURRENCY, 2) },
    );

    yield* Console.log(`🤖 AI descriptions generated: ${aiProcessed} files`);
  });

const runLocationOnlyMode = (cfg: ConfigWithS3) =>
  Effect.gen(function* () {
    const keys = manifestKeys(cfg.R2_VARIANTS_PREFIX);

    // Load existing uncompressed manifest from R2
    const raw = yield* getObject(cfg.s3, cfg.R2_BUCKET, keys.uncompressed);

    // Backup locally before changes
    const backupPath = yield* backupManifestLocally(raw);
    yield* Console.log(`🧯 Backed up current manifest → ${backupPath}`);

    let existing: Record<
      string,
      {
        exif?: {
          location?: {
            latitude?: number;
            longitude?: number;
            address?: string | null;
          };
        };
      }
    >;
    try {
      existing = JSON.parse(raw.toString('utf8'));
    } catch {
      return yield* Effect.fail(
        new Error(`Failed to parse existing manifest JSON`),
      );
    }

    const entryKeys = Object.keys(existing);
    yield* Console.log(
      `🔎 Scanning ${entryKeys.length} manifest entries for missing addresses...`,
    );

    let updatedCount = 0;
    for (const k of entryKeys) {
      const entry = existing[k];
      const loc = entry?.exif?.location;
      if (!loc || loc.address) continue;

      const lat = typeof loc.latitude === 'number' ? loc.latitude : null;
      const lon = typeof loc.longitude === 'number' ? loc.longitude : null;
      if (lat == null || lon == null) continue;

      const rg = yield* reverseGeocodeNominatim(
        lat,
        lon,
        cfg.NOMINATIM_EMAIL || undefined,
      );
      if (rg.address && entry.exif?.location) {
        entry.exif.location.address = rg.address;
        updatedCount++;
      }
      // Be nice to Nominatim
      yield* Effect.promise(() => sleep(cfg.GEO_RATE_MS));
    }

    // Serialize updated manifest
    const newBuf = Buffer.from(JSON.stringify(existing, null, 2));

    // Compress
    const { compressed: compressedManifest, encoding } =
      yield* compressManifest(newBuf);

    // Upload both
    yield* putObject(
      cfg.s3,
      cfg.R2_BUCKET,
      keys.uncompressed,
      newBuf,
      'application/json',
      {
        note: 'uncompressed-reference',
        'original-size': String(newBuf.length),
      },
      { cacheControl: 'public, max-age=300, s-maxage=300' },
    );
    yield* putObject(
      cfg.s3,
      cfg.R2_BUCKET,
      keys.compressed,
      compressedManifest,
      'application/json',
      {
        'original-size': String(newBuf.length),
        'compressed-size': String(compressedManifest.length),
        'compression-encoding': encoding,
      },
      {
        contentEncoding: encoding,
        cacheControl: 'public, max-age=300, s-maxage=300',
      },
    );

    yield* Console.log(
      `✅ Location-only update complete. Entries updated: ${updatedCount}`,
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
