export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
  imageId?: string; // filename from manifest
}

export interface ManifestEntry {
  blurhash: string;
  w: number;
  h: number;
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
  onHover: (url: string | null) => void;
  manifest?: Manifest;
}

export interface ImageCellProps {
  rect: Rect;
  tileLeft: number;
  tileTop: number;
  tileSize: number;
  viewport: Viewport;
  onHover: (url: string | null) => void;
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
