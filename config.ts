// Separate tile width and height for tall masonry
export const TILE_SIZES = {
  mobile: { width: 600, height: 1500 }, // Reasonable width, tall height
  desktop: { width: 1000, height: 2500 }, // Reasonable width, much taller height
} as const;

// Get breakpoint for mobile detection
export const MOBILE_BREAKPOINT = 768;

// Static export for SSR compatibility
export const BASE_TILE_SIZE = TILE_SIZES.desktop;
// Responsive gaps - 1rem mobile, 2rem desktop
export const GAPS = {
  mobile: 16, // 1rem
  desktop: 32, // 2rem
} as const;
export const EDGE_PAD = GAPS.desktop / 2;
export const WORLD_TILES = 2000;
export const MID = Math.floor(WORLD_TILES / 2);
// Ultra-optimized virtualization for 60fps scrolling
export const OVERSCAN_TILES = 0; // Minimal overscan for maximum performance
export const CELL_OVERSCAN_PX = 200; // Reduced buffer for faster rendering

// Performance optimization constants
export const CACHE_SIZE_LIMIT = 500; // Smaller cache for faster access
export const PREFETCH_DISTANCE = 1; // Minimal prefetch for performance

// Column-based layout configuration
export const COLUMNS_PER_TILE = 4;

export const EMA_ALPHA = 0.18;
export const FRICTION_PER_SEC = 6.5;
export const MIN_SPEED = 0.05;

export const APSC_AR = 23.5 / 15.7;
