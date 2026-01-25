import type { Manifest } from 'types';

// ---- Tunables ---------------------------------------------------------------
export const GAP = 16; // px gap between tiles
export const BASE_COL_WIDTH = 220; // target column width
export const MIN_COLS = 3;
export const MAX_COLS = 64;
export const SEARCH_BAND = 8; // try [est-8 .. est+8]
// Optional world width targeting (keeps the plane nice & square-ish visually)
export const TARGET_MIN_WORLD = 6000;
export const TARGET_MAX_WORLD = 11000;
// -----------------------------------------------------------------------------

export type PlacedItem = {
  filename: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Layout = {
  items: PlacedItem[];
  width: number;
  height: number;
  columns: number;
  columnWidth: number;
};

// Layout cache - keyed by manifest signature (count + first/last filenames)
const layoutCache = new Map<string, Layout>();
const MAX_CACHE_SIZE = 10;

function getManifestSignature(manifest: Manifest): string {
  const entries = Object.keys(manifest);
  const count = entries.length;
  if (count === 0) return 'empty';
  // Use count + first and last filenames as a quick signature
  const first = entries[0];
  const last = entries[count - 1];
  return `${count}:${first}:${last}`;
}

function estimateOptimalColumns(manifest: Manifest) {
  // est cols ≈ sqrt(sum(1/ar)) where ar = w/h
  let sumInvAR = 0;
  for (const [, m] of Object.entries(manifest)) {
    sumInvAR += m.h / m.w;
  }
  const est = Math.round(Math.sqrt(Math.max(1, sumInvAR)));
  return Math.min(MAX_COLS, Math.max(MIN_COLS, est));
}

export function computeNearSquareLayout(manifest: Manifest): Layout {
  // Check cache first
  const signature = getManifestSignature(manifest);
  const cached = layoutCache.get(signature);
  if (cached) return cached;

  const entries = Object.entries(manifest);
  const ars = entries.map(([filename, m]) => ({
    filename,
    ar: m.w / m.h, // width / height
  }));

  const estCols = estimateOptimalColumns(manifest);
  const candidates: number[] = [];
  for (let c = estCols - SEARCH_BAND; c <= estCols + SEARCH_BAND; c++) {
    if (c >= MIN_COLS && c <= MAX_COLS) candidates.push(c);
  }

  let best: Layout | null = null;

  for (const cols of candidates) {
    // Use consistent column width regardless of photo count
    const columnWidth = BASE_COL_WIDTH;

    const colHeights = new Array(cols).fill(0);
    const items: PlacedItem[] = [];

    for (const { filename, ar } of ars) {
      const w = columnWidth;
      const h = Math.max(1, Math.round(columnWidth / Math.max(0.0001, ar)));

      // place in shortest column
      let idx = 0;
      for (let i = 1; i < cols; i++)
        if (colHeights[i] < colHeights[idx]) idx = i;

      const x = idx * (columnWidth + GAP);
      const y = colHeights[idx];

      items.push({ filename, x, y, w, h });
      colHeights[idx] += h + GAP;
    }

    const totalWidth = cols * columnWidth + (cols - 1) * GAP;
    const totalHeight = Math.max(...colHeights) - GAP;
    const squareness = Math.abs(totalWidth - totalHeight);

    if (!best || squareness < Math.abs(best.width - best.height)) {
      best = {
        items,
        width: totalWidth,
        height: totalHeight,
        columns: cols,
        columnWidth,
      };
    }
  }

  // Cache the result (with LRU eviction)
  if (layoutCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry
    const firstKey = layoutCache.keys().next().value;
    if (firstKey) layoutCache.delete(firstKey);
  }
  layoutCache.set(signature, best!);

  return best!;
}
