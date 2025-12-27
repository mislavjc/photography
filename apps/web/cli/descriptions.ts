/**
 * Regenerate AI descriptions for manifest entries missing them.
 * Uses existing variants from R2 (not originals) to save bandwidth.
 *
 * Usage:
 *   npx tsx cli/descriptions.ts [--dry-run] [--limit N] [--concurrency N]
 */

import { groq } from '@ai-sdk/groq';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { generateText } from 'ai';
import { config } from 'dotenv';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import sharp from 'sharp';

config({ path: '.env.local' });

const brotliCompress = promisify(zlib.brotliCompress);

// ----------------------- Types -----------------------
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
    address?: string | null;
  } | null;
  dateTime: string | null;
  dominantColors?: Array<{
    hex: string;
    rgb: { r: number; g: number; b: number };
    percentage: number;
  }>;
}

interface ManifestEntry {
  blurhash: string;
  w: number;
  h: number;
  exif: ExifMetadata;
  description?: string;
}

type Manifest = Record<string, ManifestEntry>;

// ----------------------- Config -----------------------
function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${getEnvOrThrow('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: getEnvOrThrow('R2_ACCESS_KEY_ID'),
    secretAccessKey: getEnvOrThrow('R2_SECRET_ACCESS_KEY'),
  },
});

const BUCKET = getEnvOrThrow('R2_BUCKET');
const VARIANTS_PREFIX = process.env.R2_VARIANTS_PREFIX || 'variants';

// ----------------------- CLI Args -----------------------
function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let limit = Infinity;
  let concurrency = 2;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      concurrency = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { dryRun, limit, concurrency };
}

// ----------------------- R2 Helpers -----------------------
async function getManifest(): Promise<Manifest> {
  const resp = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: `${VARIANTS_PREFIX}/r2-manifest-original.json`,
    }),
  );
  const body = await resp.Body?.transformToString();
  if (!body) throw new Error('Empty manifest');
  return JSON.parse(body);
}

async function saveManifest(manifest: Manifest): Promise<void> {
  const uncompressedBuf = Buffer.from(JSON.stringify(manifest, null, 2));

  // Upload uncompressed
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${VARIANTS_PREFIX}/r2-manifest-original.json`,
      Body: uncompressedBuf,
      ContentType: 'application/json',
      CacheControl: 'public, max-age=300, s-maxage=300',
    }),
  );

  // Compress and upload
  const compressed = await brotliCompress(uncompressedBuf, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
    },
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${VARIANTS_PREFIX}/r2-manifest.json`,
      Body: compressed,
      ContentType: 'application/json',
      ContentEncoding: 'br',
      CacheControl: 'public, max-age=300, s-maxage=300',
    }),
  );
}

async function getVariantImage(key: string): Promise<Buffer | null> {
  // Extract UUID from key (e.g., "00000000-0000-7c95-8ca8-8141bf39f940.jpg")
  const uuid = key.replace(/\.[^.]+$/, '');

  // Try to get a large jpeg variant (1920px is a good size for AI analysis)
  const variantKey = `${VARIANTS_PREFIX}/large/jpeg/1920/${uuid}.jpeg`;

  try {
    const resp = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: variantKey,
      }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of resp.Body as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch {
    // Try smaller variant if 1920 doesn't exist
    try {
      const fallbackKey = `${VARIANTS_PREFIX}/large/jpeg/1280/${uuid}.jpeg`;
      const resp = await s3.send(
        new GetObjectCommand({
          Bucket: BUCKET,
          Key: fallbackKey,
        }),
      );
      const chunks: Buffer[] = [];
      for await (const chunk of resp.Body as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch {
      console.warn(`  Could not fetch variant for ${key}`);
      return null;
    }
  }
}

// ----------------------- AI Description -----------------------
function buildPrompt(entry: ManifestEntry): string {
  const exif = entry.exif;

  return `
You are a professional photographer and photo critic. Write a rich, detailed description of this photograph as if you're describing it for a gallery exhibition or photography portfolio.

Focus on:
- What you see in the image (subjects, setting, composition)
- The mood and atmosphere
- Lighting and technical qualities
- Your artistic interpretation

Write 2-4 sentences that paint a vivid picture. Start with "A photo of..." and make it evocative and descriptive.

${
  exif.location?.address
    ? `Location: ${exif.location.address}`
    : exif.location?.latitude && exif.location?.longitude
      ? `Location: Approximate coordinates available.`
      : 'Location: Unknown.'
}
Technical: ${JSON.stringify(
    {
      Camera: exif.camera,
      Lens: exif.lens,
      FNumber: exif.aperture,
      ISO: exif.iso,
      Shutter: exif.shutterSpeed,
      DateTime: exif.dateTime,
    },
    null,
    2,
  )}`;
}

async function generateDescription(
  imageBuf: Buffer,
  entry: ManifestEntry,
): Promise<string> {
  // Resize to reasonable size for AI (max 1920x1080)
  const resized = await sharp(imageBuf)
    .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const prompt = buildPrompt(entry);

  const result = await generateText({
    model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', image: resized, mimeType: 'image/jpeg' },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  return result.text.trim();
}

// ----------------------- Main -----------------------
async function main() {
  const { dryRun, limit, concurrency } = parseArgs();

  console.log('Loading manifest from R2...');
  const manifest = await getManifest();
  const totalEntries = Object.keys(manifest).length;

  // Find entries without descriptions
  const missingDesc = Object.entries(manifest)
    .filter(([, entry]) => !entry.description)
    .slice(0, limit);

  console.log(
    `Found ${missingDesc.length} entries without descriptions (out of ${totalEntries} total)`,
  );

  if (missingDesc.length === 0) {
    console.log('Nothing to do!');
    return;
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would process:');
    missingDesc.slice(0, 10).forEach(([key]) => console.log(`  - ${key}`));
    if (missingDesc.length > 10) {
      console.log(`  ... and ${missingDesc.length - 10} more`);
    }
    return;
  }

  console.log(`\nProcessing with concurrency ${concurrency}...`);

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  // Process in batches
  for (let i = 0; i < missingDesc.length; i += concurrency) {
    const batch = missingDesc.slice(i, i + concurrency);

    await Promise.all(
      batch.map(async ([key, entry]) => {
        try {
          process.stdout.write(
            `[${processed + failed + skipped + 1}/${missingDesc.length}] ${key}...`,
          );

          const imageBuf = await getVariantImage(key);
          if (!imageBuf) {
            skipped++;
            console.log(' skipped (no variant)');
            return;
          }

          const description = await generateDescription(imageBuf, entry);
          entry.description = description;
          processed++;

          console.log(' done');
          if (process.env.VERBOSE) {
            console.log(`    "${description.slice(0, 100)}..."`);
          }
        } catch (err) {
          failed++;
          console.log(` failed: ${err instanceof Error ? err.message : err}`);
        }
      }),
    );

    // Save manifest every 20 entries to avoid losing progress
    if ((i + concurrency) % 20 === 0 && processed > 0) {
      console.log('\n  Saving intermediate manifest...');
      await saveManifest(manifest);
    }

    // Small delay between batches to avoid rate limiting
    if (i + concurrency < missingDesc.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Final save
  if (processed > 0) {
    console.log('\nSaving final manifest...');
    await saveManifest(manifest);
  }

  console.log(`\nDone!`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed: ${failed}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
