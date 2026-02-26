import { defineCommand } from 'citty';
import consola from 'consola';
import ora from 'ora';
import sharp from 'sharp';

import { loadConfig } from '../lib/config.js';
import {
  createS3Client,
  getVariantImage,
  loadManifest,
  saveManifest,
} from '../lib/r2.js';

interface ColorInfo {
  hex: string;
  rgb: { r: number; g: number; b: number };
  percentage: number;
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Simple color distance (Euclidean in RGB space)
function colorDistance(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
): number {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2),
  );
}

async function extractDominantColors(
  imageBuffer: Buffer,
  numColors: number = 5,
): Promise<ColorInfo[]> {
  // Resize to small size for faster processing
  const { data, info } = await sharp(imageBuffer)
    .resize(100, 100, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Count colors with some quantization (reduce to 32 levels per channel)
  const colorCounts = new Map<
    string,
    { r: number; g: number; b: number; count: number }
  >();
  const quantize = (v: number) => Math.min(255, Math.round(v / 8) * 8);

  for (let i = 0; i < data.length; i += 3) {
    const r = quantize(data[i]!);
    const g = quantize(data[i + 1]!);
    const b = quantize(data[i + 2]!);
    const key = `${r},${g},${b}`;

    const existing = colorCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      colorCounts.set(key, { r, g, b, count: 1 });
    }
  }

  // Sort by count
  const sorted = Array.from(colorCounts.values()).sort(
    (a, b) => b.count - a.count,
  );

  // Pick diverse colors (not too similar to already picked ones)
  const totalPixels = info.width * info.height;
  const picked: ColorInfo[] = [];
  const minDistance = 50; // Minimum color distance

  for (const color of sorted) {
    if (picked.length >= numColors) break;

    // Check if this color is different enough from already picked
    const isTooSimilar = picked.some(
      (p) => colorDistance(color, p.rgb) < minDistance,
    );

    if (!isTooSimilar) {
      picked.push({
        hex: rgbToHex(color.r, color.g, color.b),
        rgb: { r: color.r, g: color.g, b: color.b },
        percentage: Math.round((color.count / totalPixels) * 100),
      });
    }
  }

  return picked;
}

export default defineCommand({
  meta: {
    name: 'colors',
    description: 'Extract dominant colors for photos',
  },
  args: {
    dryRun: {
      type: 'boolean',
      description: 'Show what would be done without making changes',
      default: false,
    },
    limit: {
      type: 'string',
      description: 'Maximum number of entries to process',
    },
    force: {
      type: 'boolean',
      description: 'Re-extract colors even if already present',
      default: false,
    },
    concurrency: {
      type: 'string',
      description: 'Number of concurrent extractions',
      default: '5',
    },
  },
  async run({ args }) {
    const config = loadConfig();
    const s3 = createS3Client(config);
    const limit = args.limit ? parseInt(args.limit, 10) : Infinity;
    const concurrency = parseInt(args.concurrency, 10);

    consola.info('Loading manifest from R2...');
    const manifest = await loadManifest(
      s3,
      config.r2.bucket,
      config.r2.variantsPrefix,
    );
    const totalEntries = Object.keys(manifest).length;

    // Find entries without colors, with only 1 color, or all if force
    const toProcess = Object.entries(manifest)
      .filter(
        ([, entry]) =>
          args.force ||
          !entry.exif.dominantColors ||
          entry.exif.dominantColors.length < 2,
      )
      .slice(0, limit);

    consola.info(
      `Found ${toProcess.length} entries to process (out of ${totalEntries} total)`,
    );

    if (toProcess.length === 0) {
      consola.success('All entries have colors!');
      return;
    }

    if (args.dryRun) {
      consola.box('DRY RUN - Would process:');
      toProcess.slice(0, 10).forEach(([key]) => consola.log(`  - ${key}`));
      if (toProcess.length > 10) {
        consola.log(`  ... and ${toProcess.length - 10} more`);
      }
      return;
    }

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    // Process in batches
    for (let i = 0; i < toProcess.length; i += concurrency) {
      const batch = toProcess.slice(i, i + concurrency);

      await Promise.all(
        batch.map(async ([key, entry]) => {
          const spinner = ora(
            `[${processed + failed + skipped + 1}/${toProcess.length}] ${key}`,
          ).start();

          try {
            const uuid = key.replace(/\.[^.]+$/, '');
            const imageBuf = await getVariantImage(
              s3,
              config.r2.bucket,
              config.r2.variantsPrefix,
              uuid,
            );

            if (!imageBuf) {
              skipped++;
              spinner.warn(`${key} - skipped (no variant)`);
              return;
            }

            const colors = await extractDominantColors(imageBuf, 5);
            entry.exif.dominantColors = colors;
            processed++;

            const colorPreview = colors
              .slice(0, 3)
              .map((c) => c.hex)
              .join(' ');
            spinner.succeed(`${key} - ${colorPreview}`);
          } catch (err) {
            failed++;
            spinner.fail(
              `${key} - ${err instanceof Error ? err.message : err}`,
            );
          }
        }),
      );

      // Save manifest every 50 entries
      if ((i + concurrency) % 50 === 0 && processed > 0) {
        const saveSpinner = ora('Saving intermediate manifest...').start();
        await saveManifest(
          s3,
          config.r2.bucket,
          config.r2.variantsPrefix,
          manifest,
        );
        saveSpinner.succeed('Saved intermediate manifest');
      }
    }

    // Final save
    if (processed > 0) {
      const spinner = ora('Saving final manifest...').start();
      const result = await saveManifest(
        s3,
        config.r2.bucket,
        config.r2.variantsPrefix,
        manifest,
      );
      spinner.succeed(
        `Saved manifest: ${result.entries} entries, ${(result.compressedSize / 1024).toFixed(1)}KB`,
      );
    }

    consola.box({
      title: 'Done',
      message: `Processed: ${processed}\nSkipped: ${skipped}\nFailed: ${failed}`,
    });
  },
});
