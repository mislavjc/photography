export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
  imageId?: string; // filename from manifest
}

export interface ExifMetadata {
  camera: string | null;
  lens: string | null;
  focalLength: string | null;
  aperture: string | null;
  shutterSpeed: string | null;
  iso: string | null;
  location: {
    latitude: number;
    longitude: number;
    altitude?: number;
  } | null;
  dateTime: string | null;
}

export interface ManifestEntry {
  blurhash: string;
  w: number;
  h: number;
  exif: ExifMetadata;
}

export interface ImageMetadata {
  filename: string;
  dimensions: { w: number; h: number };
  orientation: 'portrait' | 'landscape';
  url: string;
  exif: ExifMetadata;
}

export interface Manifest {
  [filename: string]: ManifestEntry;
}

export interface Viewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TileProps {
  tx: number;
  ty: number;
  left: number;
  top: number;
  tileWidth: number;
  tileHeight: number;
  getRects: (tx: number, ty: number, manifest?: Manifest) => Rect[];
  viewport: Viewport;
  onHover?: (metadata: ImageMetadata | null) => void;
  manifest?: Manifest;
}

export interface ImageCellProps {
  rect: Rect;
  tileLeft: number;
  tileTop: number;
  tileSize: number;
  viewport: Viewport;
  onHover?: (metadata: ImageMetadata | null) => void;
  manifest?: Manifest;
}

export interface Velocity {
  vx: number;
  vy: number;
}

export interface Position {
  x: number;
  y: number;
  t: number;
}

export interface AccumulatedDelta {
  dx: number;
  dy: number;
}

export type TimeRange = 'all' | 'morning' | 'afternoon' | 'evening' | 'night';
