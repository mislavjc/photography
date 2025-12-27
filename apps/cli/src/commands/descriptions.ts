import { defineCommand } from 'citty';
import consola from 'consola';
import ora from 'ora';

import { generateDescription } from '../lib/ai.js';
import { loadConfig } from '../lib/config.js';
import {
  createS3Client,
  getVariantImage,
  loadManifest,
  saveManifest,
} from '../lib/r2.js';

export default defineCommand({
  meta: {
    name: 'descriptions',
    description: 'Generate AI descriptions for manifest entries missing them',
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
    concurrency: {
      type: 'string',
      description: 'Number of concurrent requests',
      default: '2',
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

    // Find entries without descriptions
    const missingDesc = Object.entries(manifest)
      .filter(([, entry]) => !entry.description)
      .slice(0, limit);

    consola.info(
      `Found ${missingDesc.length} entries without descriptions (out of ${totalEntries} total)`,
    );

    if (missingDesc.length === 0) {
      consola.success('All entries have descriptions!');
      return;
    }

    if (args.dryRun) {
      consola.box('DRY RUN - Would process:');
      missingDesc.slice(0, 10).forEach(([key]) => consola.log(`  - ${key}`));
      if (missingDesc.length > 10) {
        consola.log(`  ... and ${missingDesc.length - 10} more`);
      }
      return;
    }

    consola.info(`Processing with concurrency ${concurrency}...`);

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    // Process in batches
    for (let i = 0; i < missingDesc.length; i += concurrency) {
      const batch = missingDesc.slice(i, i + concurrency);

      await Promise.all(
        batch.map(async ([key, entry]) => {
          const spinner = ora(
            `[${processed + failed + skipped + 1}/${missingDesc.length}] ${key}`,
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

            const description = await generateDescription(imageBuf, entry);
            entry.description = description;
            processed++;

            spinner.succeed(`${key}`);
          } catch (err) {
            failed++;
            spinner.fail(
              `${key} - ${err instanceof Error ? err.message : err}`,
            );
          }
        }),
      );

      // Save manifest every 20 entries
      if ((i + concurrency) % 20 === 0 && processed > 0) {
        const saveSpinner = ora('Saving intermediate manifest...').start();
        await saveManifest(
          s3,
          config.r2.bucket,
          config.r2.variantsPrefix,
          manifest,
        );
        saveSpinner.succeed('Saved intermediate manifest');
      }

      // Small delay between batches
      if (i + concurrency < missingDesc.length) {
        await new Promise((r) => setTimeout(r, 500));
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
