// Re-export shared types
export type {
  ExifLocation,
  ExifMetadata,
  ManifestEntry,
  Manifest,
} from '@repo/shared-types';

type Formats = 'avif' | 'webp' | 'jpeg';
type ProfileName = 'grid' | 'large';

interface VariantProfile {
  name: ProfileName;
  widths: readonly number[];
}

export interface CLIConfig {
  r2: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    prefix: string;
    variantsPrefix: string;
    publicUrl: string;
  };
  processing: {
    concurrency: number;
    formats: Formats[];
    quality: {
      avif: number;
      webp: number;
      jpeg: number;
    };
    profiles: VariantProfile[];
  };
  ai: {
    enabled: boolean;
    groqApiKey?: string;
  };
  geocoding: {
    nominatimEmail?: string;
    rateMs: number;
  };
}
