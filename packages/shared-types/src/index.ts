export interface ExifLocation {
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

export interface ManifestEntry {
  blurhash: string;
  w: number;
  h: number;
  exif: ExifMetadata;
  description?: string;
}

export type Manifest = Record<string, ManifestEntry>;
