import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CLIConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(__dirname, '../..');

// Load .env from CLI app directory (quiet mode)
config({ path: resolve(cliDir, '.env'), quiet: true });

function getEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (!value && fallback === undefined) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value ?? (fallback as string);
}

function getEnvOptional(key: string): string | undefined {
  return process.env[key];
}

function getEnvNumber(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const num = parseInt(value, 10);
  return Number.isNaN(num) ? fallback : num;
}

function getEnvBoolean(key: string, fallback: boolean): boolean {
  const value = process.env[key]?.toLowerCase();
  if (!value) return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

export function loadConfig(): CLIConfig {
  return {
    r2: {
      accountId: getEnv('R2_ACCOUNT_ID'),
      accessKeyId: getEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: getEnv('R2_SECRET_ACCESS_KEY'),
      bucket: getEnv('R2_BUCKET'),
      prefix: getEnv('R2_PREFIX', 'originals'),
      variantsPrefix: getEnv('R2_VARIANTS_PREFIX', 'variants'),
      publicUrl: getEnv('R2_PUBLIC_URL'),
    },
    processing: {
      concurrency: getEnvNumber('CONCURRENCY', 4),
      formats: ['avif', 'webp', 'jpeg'],
      quality: {
        avif: getEnvNumber('Q_AVIF', 65),
        webp: getEnvNumber('Q_WEBP', 75),
        jpeg: getEnvNumber('Q_JPEG', 80),
      },
      profiles: [
        { name: 'grid', widths: [400, 800] as const },
        { name: 'large', widths: [1280, 1920, 2560] as const },
      ],
    },
    ai: {
      enabled: getEnvBoolean('GEN_AI_DESCRIPTIONS', false),
      groqApiKey: getEnvOptional('GROQ_API_KEY'),
    },
    geocoding: {
      nominatimEmail: getEnvOptional('NOMINATIM_EMAIL'),
      rateMs: getEnvNumber('GEO_RATE_MS', 1100),
    },
  };
}
