import { defineCommand } from 'citty';
import consola from 'consola';
import ora from 'ora';
import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Replicate from 'replicate';

import { loadConfig } from '../lib/config.js';
import { createS3Client, loadManifest, getVariantImage } from '../lib/r2.js';

const VECTORIZE_INDEX = 'photography-search';
const IMAGEBIND_MODEL =
  'daanelson/imagebind:0383f62e173dc821ec52663ed22a076d9c970549c209666ac3db181618b7a304';
const BATCH_SIZE = 5; // Process 5 images in parallel
const CONCURRENCY = 10; // Max concurrent Replicate requests

interface ImageBindOutput {
  embedding: number[];
}

async function getImageEmbedding(
  replicate: Replicate,
  imageBuffer: Buffer,
): Promise<number[]> {
  const output = await replicate.run(IMAGEBIND_MODEL, {
    input: {
      input: imageBuffer,
      modality: 'vision',
    },
  });

  // Debug: log output structure
  if (process.env.DEBUG) {
    console.log('ImageBind output type:', typeof output);
    console.log(
      'ImageBind output:',
      Array.isArray(output) ? `array[${output.length}]` : output,
    );
    if (Array.isArray(output) && output.length > 0) {
      console.log('First element type:', typeof output[0]);
      if (typeof output[0] === 'number') {
        console.log('First 5 values:', output.slice(0, 5));
      }
    }
  }

  // Handle different output formats
  if (Array.isArray(output)) {
    return output as number[];
  }
  if (output && typeof output === 'object' && 'embedding' in output) {
    return (output as ImageBindOutput).embedding;
  }

  throw new Error(
    `Unexpected ImageBind output format: ${JSON.stringify(output).slice(0, 200)}`,
  );
}

async function insertWithWrangler(
  vectors: { id: string; values: number[] }[],
): Promise<void> {
  // Write vectors to temp NDJSON file
  const tmpFile = join(tmpdir(), `vectorize-${Date.now()}.ndjson`);
  const ndjson = vectors
    .map((v) => JSON.stringify({ id: v.id, values: v.values }))
    .join('\n');

  await writeFile(tmpFile, ndjson);

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        'wrangler',
        ['vectorize', 'insert', VECTORIZE_INDEX, '--file', tmpFile],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`wrangler exited with code ${code}: ${stderr}`));
        }
      });
    });
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

// Helper to limit concurrency with error handling
async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<{ results: R[]; errors: { index: number; error: Error }[] }> {
  const results: R[] = [];
  const errors: { index: number; error: Error }[] = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const idx = i;
    const item = items[i];
    if (item === undefined) {
      continue;
    }

    const promise = fn(item, i)
      .then((result) => {
        results[idx] = result;
      })
      .catch((err) => {
        errors.push({ index: idx, error: err });
      });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove completed promises
      const completed = executing.filter(
        (p) => (p as Promise<void> & { settled?: boolean }).settled,
      );
      for (const c of completed) {
        const idx = executing.indexOf(c);
        if (idx !== -1) executing.splice(idx, 1);
      }
    }
  }

  await Promise.all(executing);
  return { results: results.filter((r) => r !== undefined), errors };
}

export default defineCommand({
  meta: {
    name: 'embeddings',
    description: 'Generate image embeddings and index them in Vectorize',
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
    batchSize: {
      type: 'string',
      description: 'Number of images per Vectorize insert batch',
      default: String(BATCH_SIZE),
    },
    concurrency: {
      type: 'string',
      description: 'Number of concurrent Replicate requests',
      default: String(CONCURRENCY),
    },
  },
  async run({ args }) {
    const config = loadConfig();
    const s3 = createS3Client(config);

    const replicateApiToken = process.env.REPLICATE_API_TOKEN;

    if (!replicateApiToken) {
      consola.error('REPLICATE_API_TOKEN environment variable is required');
      consola.info('Get a token at: https://replicate.com/account/api-tokens');
      process.exit(1);
    }

    const replicate = new Replicate({ auth: replicateApiToken });

    const limit = args.limit ? parseInt(args.limit, 10) : Infinity;
    const skip = parseInt(args.skip, 10);
    const batchSize = parseInt(args.batchSize, 10);
    const concurrency = parseInt(args.concurrency, 10);

    consola.info('Loading manifest from R2...');
    const manifest = await loadManifest(
      s3,
      config.r2.bucket,
      config.r2.variantsPrefix,
    );

    const allKeys = Object.keys(manifest);
    const toProcess = allKeys.slice(skip, skip + limit);

    consola.info(
      `Processing ${toProcess.length} images (skip: ${skip}, total: ${allKeys.length})`,
    );
    consola.info(
      `Using Replicate ImageBind (concurrency: ${concurrency}, batch size: ${batchSize})`,
    );
    consola.info(
      `Estimated cost: ~$${(toProcess.length * 0.00046).toFixed(2)}`,
    );

    if (args.dryRun) {
      consola.box('DRY RUN - Would process:');
      toProcess.slice(0, 10).forEach((key) => consola.log(`  - ${key}`));
      if (toProcess.length > 10) {
        consola.log(`  ... and ${toProcess.length - 10} more`);
      }
      return;
    }

    let processed = 0;
    let failed = 0;
    const startTime = Date.now();

    // Process in batches for Vectorize inserts
    for (let i = 0; i < toProcess.length; i += batchSize) {
      const batchKeys = toProcess.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(toProcess.length / batchSize);
      const batchSpinner = ora(
        `[${batchNum}/${totalBatches}] Loading ${batchKeys.length} images...`,
      ).start();

      try {
        // Load images in parallel
        const images: { id: string; buffer: Buffer }[] = [];

        await Promise.all(
          batchKeys.map(async (key) => {
            const uuid = key.replace(/\.[^.]+$/, '');
            const imageBuf = await getVariantImage(
              s3,
              config.r2.bucket,
              config.r2.variantsPrefix,
              uuid,
            );

            if (imageBuf) {
              images.push({
                id: uuid,
                buffer: imageBuf,
              });
            }
          }),
        );

        if (images.length === 0) {
          batchSpinner.warn(`[${batchNum}/${totalBatches}] No images in batch`);
          continue;
        }

        batchSpinner.text = `[${batchNum}/${totalBatches}] Generating embeddings for ${images.length} images (Replicate)...`;

        // Get embeddings from Replicate with concurrency control
        const { results: embeddings, errors } = await pMap(
          images,
          async (img) => {
            const embedding = await getImageEmbedding(replicate, img.buffer);
            return { id: img.id, embedding };
          },
          concurrency,
        );

        // Log any embedding errors
        if (errors.length > 0) {
          for (const { index, error } of errors) {
            consola.warn(
              `Failed to embed ${images[index]?.id}: ${error.message}`,
            );
          }
          failed += errors.length;
        }

        if (embeddings.length === 0) {
          batchSpinner.warn(
            `[${batchNum}/${totalBatches}] No embeddings generated`,
          );
          continue;
        }

        batchSpinner.text = `[${batchNum}/${totalBatches}] Indexing ${embeddings.length} vectors...`;

        // Insert via wrangler
        const vectors = embeddings.map((e) => ({
          id: e.id,
          values: e.embedding,
        }));

        await insertWithWrangler(vectors);

        processed += embeddings.length;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (processed / parseFloat(elapsed)).toFixed(2);
        batchSpinner.succeed(
          `[${batchNum}/${totalBatches}] Indexed ${embeddings.length} vectors (total: ${processed}, ${rate} img/s)`,
        );
      } catch (err) {
        failed += batchKeys.length;
        batchSpinner.fail(
          `[${batchNum}/${totalBatches}] Failed: ${err instanceof Error ? err.message : err}`,
        );

        // Continue on error, just log it
        consola.error(err);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    consola.box({
      title: 'Done',
      message: `Indexed: ${processed}\nFailed: ${failed}\nTime: ${totalTime}s\nEstimated cost: ~$${(processed * 0.00046).toFixed(2)}`,
    });

    if (processed > 0) {
      consola.info('\nTest search:');
      consola.info(
        `  curl "https://photos-search-api.mislavjc.workers.dev/search?q=sunset"`,
      );
    }
  },
});
