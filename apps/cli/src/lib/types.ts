// ----------------------- Types -----------------------
interface ExifLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  address?: string | null;
}

interface ExifMetadata {
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

export interface ManifestEntry {
  blurhash: string;
  w: number;
  h: number;
  exif: ExifMetadata;
  description?: string;
}

export type Manifest = Record<string, ManifestEntry>;

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
