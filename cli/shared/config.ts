import { S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { config as dotenvConfig } from 'dotenv';
import { Effect } from 'effect';
import https from 'node:https';

import type {
  Formats,
  ProfileName,
  UploadConfig,
  VariantProfile,
} from './types';

dotenvConfig({ path: '.env.local' });

// Create a custom HTTP agent with higher connection limits for batch operations
const httpsAgent = new https.Agent({
  maxSockets: 200, // Increase from default 50
  keepAlive: true,
  keepAliveMsecs: 1000,
});

// Variant profiles - configurable widths for each profile
export const GRID_WIDTHS = [160, 240, 320, 360, 480, 640, 800, 960] as const;
export const LARGE_WIDTHS = [
  256, 384, 512, 768, 1024, 1280, 1536, 1920, 2560,
] as const;

export const DEFAULT_PROFILES: VariantProfile[] = [
  { name: 'grid', widths: GRID_WIDTHS },
  { name: 'large', widths: LARGE_WIDTHS },
];

export const DEFAULT_FORMATS: Formats[] = ['avif', 'webp', 'jpeg'];

export interface ConfigWithS3 extends UploadConfig {
  s3: S3Client;
}

export const getConfig = Effect.gen(function* () {
  const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
  const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
  const R2_BUCKET = process.env.R2_BUCKET;
  const R2_PREFIX = process.env.R2_PREFIX || 'originals';
  const R2_VARIANTS_PREFIX = process.env.R2_VARIANTS_PREFIX || 'variants';
  const CONCURRENCY = parseInt(process.env.CONCURRENCY || '4', 10);
  const FORMATS = (process.env.FORMATS || 'avif,webp,jpeg')
    .split(',')
    .map((s) => s.trim().toLowerCase() as Formats);
  const Q_AVIF = parseInt(process.env.Q_AVIF || '50', 10);
  const Q_WEBP = parseInt(process.env.Q_WEBP || '78', 10);
  const Q_JPEG = parseInt(process.env.Q_JPEG || '78', 10);
  const PRESERVE_METADATA =
    (process.env.PRESERVE_METADATA || 'true') === 'true';
  const GEN_BLURHASH = (process.env.GEN_BLURHASH || 'true') === 'true';
  const BLURHASH_MAX = parseInt(process.env.BLURHASH_MAX || '64', 10);
  const GEN_AI_DESCRIPTIONS =
    (process.env.GEN_AI_DESCRIPTIONS || 'false') === 'true';
  const VERBOSE = (process.env.VERBOSE || 'false') === 'true';
  const NOMINATIM_EMAIL = process.env.NOMINATIM_EMAIL || '';
  const GEO_RATE_MS = parseInt(process.env.GEO_RATE_MS || '1100', 10);

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

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    requestHandler: new NodeHttpHandler({
      httpsAgent,
      socketAcquisitionWarningTimeout: 30000, // 30 seconds before warning
    }),
  });

  // Parse custom profiles from env if provided
  let PROFILES = DEFAULT_PROFILES;
  if (process.env.GRID_WIDTHS) {
    const customGrid = process.env.GRID_WIDTHS.split(',').map((s) =>
      parseInt(s.trim(), 10),
    );
    PROFILES = PROFILES.map((p) =>
      p.name === 'grid' ? { ...p, widths: customGrid } : p,
    );
  }
  if (process.env.LARGE_WIDTHS) {
    const customLarge = process.env.LARGE_WIDTHS.split(',').map((s) =>
      parseInt(s.trim(), 10),
    );
    PROFILES = PROFILES.map((p) =>
      p.name === 'large' ? { ...p, widths: customLarge } : p,
    );
  }

  return {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PREFIX,
    R2_VARIANTS_PREFIX,
    CONCURRENCY,
    FORMATS,
    Q_AVIF,
    Q_WEBP,
    Q_JPEG,
    PRESERVE_METADATA,
    GEN_BLURHASH,
    BLURHASH_MAX,
    GEN_AI_DESCRIPTIONS,
    VERBOSE,
    NOMINATIM_EMAIL,
    GEO_RATE_MS,
    s3,
    PROFILES,
  } satisfies ConfigWithS3;
});

// Parse CLI arguments
export interface CLIOptions {
  srcDir: string;
  manifestOnly: boolean;
  locationOnly: boolean;
  dryRun: boolean;
  onlyMissing: boolean;
  profile?: ProfileName;
  format?: Formats;
  width?: number;
  skipManifest: boolean;
  skipAi: boolean;
  resume: boolean;
  reset: boolean;
}

export function parseCLIOptions(argv: string[]): CLIOptions {
  const args = argv.slice(2);

  return {
    srcDir: args.find((a) => !a.startsWith('--')) || './images',
    manifestOnly:
      args.includes('--manifest-only') ||
      args.includes('--regenerate-manifest'),
    locationOnly: args.includes('--location-only'),
    dryRun: args.includes('--dry-run'),
    onlyMissing: args.includes('--only-missing'),
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
    skipManifest: args.includes('--skip-manifest'),
    skipAi: args.includes('--skip-ai'),
    resume: args.includes('--resume'),
    reset: args.includes('--reset'),
  };
}
