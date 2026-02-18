// ----------------------- Types -----------------------
interface ExifLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  /** Human-readable address from reverse geocoding */
  address?: string | null;
}

export interface ExifMetadata {
  camera: string | null;
  lens: string | null;
  focalLength: string | null;
  aperture: string | null;
  shutterSpeed: string | null;
  iso: string | null;
  location: ExifLocation | null;
  dateTime: string | null;
  dominantColors?: Array<{
    hex: string;
    rgb: { r: number; g: number; b: number };
    percentage: number;
  }>;
}

export type Formats = 'avif' | 'webp' | 'jpeg';
export type ProfileName = 'grid' | 'large';

export interface VariantProfile {
  name: ProfileName;
  widths: readonly number[];
}

export interface ManifestEntry {
  blurhash: string;
  w: number;
  h: number;
  exif: ExifMetadata;
  description?: string;
}

export type Manifest = Record<string, ManifestEntry>;

export interface UploadConfig {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_PREFIX: string;
  R2_VARIANTS_PREFIX: string;
  CONCURRENCY: number;
  FORMATS: Formats[];
  Q_AVIF: number;
  Q_WEBP: number;
  Q_JPEG: number;
  PRESERVE_METADATA: boolean;
  GEN_BLURHASH: boolean;
  BLURHASH_MAX: number;
  GEN_AI_DESCRIPTIONS: boolean;
  VERBOSE: boolean;
  NOMINATIM_EMAIL: string;
  GEO_RATE_MS: number;
  PROFILES: VariantProfile[];
}

export interface VariantNeed {
  profile: ProfileName;
  fmt: Formats;
  w: number;
  key: string;
}

export interface CheckpointData {
  version: number;
  startedAt: string;
  lastUpdatedAt: string;
  processedFiles: string[];
  failedFiles: Array<{ file: string; error: string }>;
  manifestEntries: Manifest;
  stats: {
    totalFiles: number;
    processedCount: number;
    failedCount: number;
    variantsCreated: number;
    bytesUploaded: number;
  };
}

export interface ProgressStats {
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  variantsCreated: number;
  bytesUploaded: number;
  startTime: number;
  currentFile?: string;
  currentOperation?: string;
}
