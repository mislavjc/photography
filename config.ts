// Default sizes for different screen sizes
export const TILE_SIZES = {
  mobile: 600,
  desktop: 1400,
} as const;

// Get breakpoint for mobile detection
export const MOBILE_BREAKPOINT = 768;

// Static export for SSR compatibility
export const BASE_TILE_SIZE = TILE_SIZES.desktop;
export const GAP = 16;
export const EDGE_PAD = GAP / 2;
export const WORLD_TILES = 2000;
export const MID = Math.floor(WORLD_TILES / 2);
export const OVERSCAN_TILES = 2;
export const CELL_OVERSCAN_PX = 500;

export const ROWS_PER_TILE = 3;

export const EMA_ALPHA = 0.18;
export const FRICTION_PER_SEC = 6.5;
export const MIN_SPEED = 0.05;

export const APSC_AR = 23.5 / 15.7;
