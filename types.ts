export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
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
  tileSize: number;
  getRects: (tx: number, ty: number, size: number) => Rect[];
  viewport: Viewport;
  onHover: (url: string | null) => void;
}

export interface ImageCellProps {
  rect: Rect;
  tileLeft: number;
  tileTop: number;
  tileSize: number;
  viewport: Viewport;
  onHover: (url: string | null) => void;
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
