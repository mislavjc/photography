import { defineCommand } from 'citty';
import consola from 'consola';
import ora from 'ora';

import { loadConfig } from '../lib/config.js';
import {
  createS3Client,
  listObjects,
  loadManifest,
  saveManifest,
} from '../lib/r2.js';

export default defineCommand({
  meta: {
    name: 'manifest',
    description: 'Manage the photo manifest',
  },
  subCommands: {
    info: defineCommand({
      meta: {
        name: 'info',
        description: 'Show manifest information',
      },
      async run() {
        const config = loadConfig();
        const s3 = createS3Client(config);

        const spinner = ora('Loading manifest...').start();
        const manifest = await loadManifest(
          s3,
          config.r2.bucket,
          config.r2.variantsPrefix,
        );
        spinner.stop();

        const entries = Object.entries(manifest);
        const withDesc = entries.filter(([, e]) => e.description).length;
        const withLocation = entries.filter(([, e]) => e.exif.location).length;
        const withBlurhash = entries.filter(([, e]) => e.blurhash).length;

        consola.box({
          title: 'Manifest Info',
          message: [
            `Total entries: ${entries.length}`,
            `With description: ${withDesc}`,
            `With location: ${withLocation}`,
            `With blurhash: ${withBlurhash}`,
          ].join('\n'),
        });
      },
    }),

    sync: defineCommand({
      meta: {
        name: 'sync',
        description: 'Sync manifest with R2 originals (find missing entries)',
      },
      args: {
        dryRun: {
          type: 'boolean',
          description: 'Show what would be done without making changes',
          default: false,
        },
      },
      async run({ args }) {
        const config = loadConfig();
        const s3 = createS3Client(config);

        // Load current manifest
        const manifestSpinner = ora('Loading manifest...').start();
        const manifest = await loadManifest(
          s3,
          config.r2.bucket,
          config.r2.variantsPrefix,
        );
        manifestSpinner.succeed(
          `Manifest: ${Object.keys(manifest).length} entries`,
        );

        // List originals in R2
        const originalsSpinner = ora('Listing originals in R2...').start();
        const originals = await listObjects(
          s3,
          config.r2.bucket,
          `${config.r2.prefix}/`,
        );
        originalsSpinner.succeed(`R2 originals: ${originals.length} files`);

        // Find missing
        const manifestKeys = new Set(Object.keys(manifest));
        const missing = originals
          .map((key) => key.split('/').pop() ?? '')
          .filter((filename) => filename && !manifestKeys.has(filename));

        if (missing.length === 0) {
          consola.success('Manifest is in sync with R2!');
          return;
        }

        consola.warn(`Found ${missing.length} originals not in manifest`);

        if (args.dryRun) {
          consola.box('DRY RUN - Missing files:');
          missing.slice(0, 10).forEach((f) => consola.log(`  - ${f}`));
          if (missing.length > 10) {
            consola.log(`  ... and ${missing.length - 10} more`);
          }
        } else {
          consola.info(
            'Run `pnpm cli upload --manifest-only` to regenerate manifest',
          );
        }
      },
    }),

    backup: defineCommand({
      meta: {
        name: 'backup',
        description: 'Create a local backup of the manifest',
      },
      async run() {
        const config = loadConfig();
        const s3 = createS3Client(config);
        const fs = await import('node:fs/promises');
        const path = await import('node:path');

        const spinner = ora('Downloading manifest...').start();
        const manifest = await loadManifest(
          s3,
          config.r2.bucket,
          config.r2.variantsPrefix,
        );

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `manifest-backup-${timestamp}.json`;
        const filepath = path.resolve(process.cwd(), filename);

        await fs.writeFile(filepath, JSON.stringify(manifest, null, 2));
        spinner.succeed(
          `Saved backup to ${filename} (${Object.keys(manifest).length} entries)`,
        );
      },
    }),

    restore: defineCommand({
      meta: {
        name: 'restore',
        description: 'Restore manifest from a backup file',
      },
      args: {
        file: {
          type: 'positional',
          description: 'Path to backup file',
          required: true,
        },
        merge: {
          type: 'boolean',
          description: 'Merge with existing manifest instead of replacing',
          default: true,
        },
      },
      async run({ args }) {
        const config = loadConfig();
        const s3 = createS3Client(config);
        const fs = await import('node:fs/promises');

        // Load backup
        const backupSpinner = ora('Loading backup file...').start();
        const filePath = String(args.file);
        const backupData = await fs.readFile(filePath, 'utf8');
        const backup = JSON.parse(backupData);
        backupSpinner.succeed(`Backup: ${Object.keys(backup).length} entries`);

        let manifest = backup;

        if (args.merge) {
          const currentSpinner = ora('Loading current manifest...').start();
          const current = await loadManifest(
            s3,
            config.r2.bucket,
            config.r2.variantsPrefix,
          );
          currentSpinner.succeed(
            `Current: ${Object.keys(current).length} entries`,
          );

          manifest = { ...backup, ...current };
          consola.info(`Merged: ${Object.keys(manifest).length} entries`);
        }

        const saveSpinner = ora('Saving manifest...').start();
        const result = await saveManifest(
          s3,
          config.r2.bucket,
          config.r2.variantsPrefix,
          manifest,
        );
        saveSpinner.succeed(
          `Saved: ${result.entries} entries, ${(result.compressedSize / 1024).toFixed(1)}KB`,
        );
      },
    }),
  },
});
