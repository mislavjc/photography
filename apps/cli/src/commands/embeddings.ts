import { S3ServiceException } from '@aws-sdk/client-s3';
import { GoogleGenAI } from '@google/genai';
import { defineCommand } from 'citty';
import consola from 'consola';
import ora from 'ora';

import { loadConfig } from '../lib/config.js';
import {
  decode,
  EMBEDDINGS_KEY,
  encode,
  type EmbeddingsFile,
  recordSize,
} from '../lib/embeddings-file.js';
import {
  createS3Client,
  getObject,
  getVariantImage,
  loadManifest,
  putObject,
} from '../lib/r2.js';

const GEMINI_MODEL = 'gemini-embedding-2-preview';
const OUTPUT_DIMS = 3072;
const DEFAULT_CONCURRENCY = 8; // Retries handle paid-tier per-minute bursts; daily quota isn't a factor
const DEFAULT_FLUSH_EVERY = 100;
const MAX_RETRIES = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pull a retryDelay hint (e.g. "18.9s") out of a Gemini 429 error message. */
function parseRetryDelayMs(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/retry in ([\d.]+)s/i);
  if (!m) return null;
  const secs = parseFloat(m[1]!);
  return Number.isFinite(secs) ? Math.ceil(secs * 1000) : null;
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|quota|rate.?limit/i.test(msg);
}

async function embedImage(
  ai: GoogleGenAI,
  imageBuffer: Buffer,
): Promise<Float32Array> {
  let attempt = 0;
  while (true) {
    try {
      const response = await ai.models.embedContent({
        model: GEMINI_MODEL,
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: imageBuffer.toString('base64'),
                },
              },
            ],
          },
        ],
        config: { outputDimensionality: OUTPUT_DIMS },
      });

      const values = response.embeddings?.[0]?.values;
      if (!values || values.length !== OUTPUT_DIMS) {
        throw new Error(
          `Unexpected Gemini embedding shape: got ${values?.length ?? 'none'} dims`,
        );
      }
      return new Float32Array(values);
    } catch (err) {
      attempt++;
      if (attempt > MAX_RETRIES || !isRateLimitError(err)) throw err;
      // Prefer the server-suggested delay; otherwise exponential backoff.
      const hinted = parseRetryDelayMs(err);
      const backoff = hinted ?? Math.min(60_000, 1000 * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 500);
      await sleep(backoff + jitter);
    }
  }
}

async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<{ results: R[]; errors: { index: number; error: Error }[] }> {
  const results: R[] = [];
  const errors: { index: number; error: Error }[] = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      const item = items[idx];
      if (item === undefined) continue;
      try {
        results[idx] = await fn(item, idx);
      } catch (err) {
        errors.push({
          index: idx,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return { results: results.filter((r) => r !== undefined), errors };
}

async function loadExistingEmbeddings(
  s3: ReturnType<typeof createS3Client>,
  bucket: string,
): Promise<EmbeddingsFile> {
  try {
    return decode(await getObject(s3, bucket, EMBEDDINGS_KEY));
  } catch (err) {
    if (
      err instanceof S3ServiceException &&
      (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)
    ) {
      return { dims: OUTPUT_DIMS, byId: new Map() };
    }
    throw err;
  }
}

async function saveEmbeddings(
  s3: ReturnType<typeof createS3Client>,
  bucket: string,
  file: EmbeddingsFile,
): Promise<number> {
  const buf = encode(file);
  await putObject(s3, bucket, EMBEDDINGS_KEY, buf, 'application/octet-stream', {
    cacheControl: 'public, max-age=300, s-maxage=300',
  });
  return buf.length;
}

export default defineCommand({
  meta: {
    name: 'embeddings',
    description:
      'Generate Gemini Embedding 2 vectors and append them to variants/embeddings.bin in R2',
  },
  args: {
    dryRun: {
      type: 'boolean',
      description: 'Show what would be done without making changes',
      default: false,
    },
    limit: {
      type: 'string',
      description: 'Maximum number of images to process',
    },
    skip: {
      type: 'string',
      description: 'Number of images to skip (for resuming)',
      default: '0',
    },
    concurrency: {
      type: 'string',
      description: 'Number of concurrent Gemini requests',
      default: String(DEFAULT_CONCURRENCY),
    },
    flushEvery: {
      type: 'string',
      description: 'Flush partial embeddings to R2 every N images',
      default: String(DEFAULT_FLUSH_EVERY),
    },
    reembed: {
      type: 'boolean',
      description: 'Re-embed photos even if they already have a vector',
      default: false,
    },
  },
  async run({ args }) {
    const config = loadConfig();
    const s3 = createS3Client(config);

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      consola.error('GEMINI_API_KEY environment variable is required');
      consola.info('Get a key at: https://aistudio.google.com/apikey');
      process.exit(1);
    }
    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    const limit = args.limit ? parseInt(args.limit, 10) : Infinity;
    const skip = parseInt(args.skip, 10);
    const concurrency = parseInt(args.concurrency, 10);
    const flushEvery = parseInt(args.flushEvery, 10);

    consola.info('Loading manifest from R2...');
    const manifest = await loadManifest(
      s3,
      config.r2.bucket,
      config.r2.variantsPrefix,
    );

    consola.info('Loading existing embeddings.bin...');
    const embeddings = await loadExistingEmbeddings(s3, config.r2.bucket);
    if (embeddings.dims !== OUTPUT_DIMS) {
      consola.warn(
        `Existing embeddings.bin dims ${embeddings.dims} != ${OUTPUT_DIMS}; starting fresh.`,
      );
      embeddings.byId.clear();
      embeddings.dims = OUTPUT_DIMS;
    }
    consola.info(`Existing vectors: ${embeddings.byId.size}`);

    const allKeys = Object.keys(manifest);
    const pending: string[] = [];
    for (const key of allKeys.slice(skip)) {
      if (pending.length >= limit) break;
      const uuid = key.replace(/\.[^.]+$/, '');
      if (!args.reembed && embeddings.byId.has(uuid)) continue;
      pending.push(uuid);
    }

    consola.info(
      `To embed: ${pending.length} (skip: ${skip}, manifest total: ${allKeys.length})`,
    );
    consola.info(
      `Model: ${GEMINI_MODEL} → ${OUTPUT_DIMS}d, concurrency: ${concurrency}`,
    );
    consola.info(
      `Estimated cost: ~$${(pending.length * 0.0001).toFixed(2)} (Gemini image pricing)`,
    );

    if (args.dryRun) {
      consola.box('DRY RUN - Would embed:');
      pending.slice(0, 10).forEach((id) => consola.log(`  - ${id}`));
      if (pending.length > 10) {
        consola.log(`  ... and ${pending.length - 10} more`);
      }
      return;
    }

    if (pending.length === 0) {
      consola.success('Nothing to do — all manifest entries already embedded.');
      return;
    }

    const startTime = Date.now();
    let processed = 0;
    let failed = 0;
    let sinceFlush = 0;

    for (let i = 0; i < pending.length; i += flushEvery) {
      const chunk = pending.slice(i, i + flushEvery);
      const chunkSpinner = ora(
        `[${Math.floor(i / flushEvery) + 1}/${Math.ceil(pending.length / flushEvery)}] Loading ${chunk.length} images...`,
      ).start();

      try {
        const images: { id: string; buffer: Buffer }[] = [];
        await Promise.all(
          chunk.map(async (uuid) => {
            const buf = await getVariantImage(
              s3,
              config.r2.bucket,
              config.r2.variantsPrefix,
              uuid,
            );
            if (buf) images.push({ id: uuid, buffer: buf });
          }),
        );

        if (images.length === 0) {
          chunkSpinner.warn('no images fetched');
          continue;
        }

        chunkSpinner.text = `Embedding ${images.length} images via Gemini...`;
        const { results, errors } = await pMap(
          images,
          async (img) => ({
            id: img.id,
            vec: await embedImage(ai, img.buffer),
          }),
          concurrency,
        );

        for (const { index, error } of errors) {
          consola.warn(`Failed ${images[index]?.id}: ${error.message}`);
        }
        failed += errors.length;

        for (const { id, vec } of results) embeddings.byId.set(id, vec);

        sinceFlush += results.length;
        processed += results.length;

        if (sinceFlush >= flushEvery) {
          const projected =
            recordSize(embeddings.byId.size, embeddings.dims) / 1024 / 1024;
          chunkSpinner.text = `Flushing ${embeddings.byId.size} vectors to R2 (~${projected.toFixed(1)} MB)...`;
          const size = await saveEmbeddings(s3, config.r2.bucket, embeddings);
          sinceFlush = 0;
          const rate = (processed / ((Date.now() - startTime) / 1000)).toFixed(
            2,
          );
          chunkSpinner.succeed(
            `+${results.length} (total ${embeddings.byId.size} in ${(size / 1024 / 1024).toFixed(1)} MB, ${rate} img/s)`,
          );
        } else {
          chunkSpinner.succeed(
            `+${results.length} (total ${embeddings.byId.size}, not yet flushed)`,
          );
        }
      } catch (err) {
        failed += chunk.length;
        chunkSpinner.fail(
          `Chunk failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (sinceFlush > 0) {
      const size = await saveEmbeddings(s3, config.r2.bucket, embeddings);
      consola.info(
        `Final flush: ${embeddings.byId.size} vectors, ${(size / 1024 / 1024).toFixed(1)} MB`,
      );
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    consola.box({
      title: 'Done',
      message: `Embedded: ${processed}\nFailed: ${failed}\nTotal in file: ${embeddings.byId.size}\nTime: ${totalTime}s\nCost: ~$${(processed * 0.0001).toFixed(2)}`,
    });
  },
});
