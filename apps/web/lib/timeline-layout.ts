import type { PhotoWithMeta } from './timeline-utils';

interface MasonryPhoto {
  filename: string;
  width: number;
  height: number;
  originalW: number;
  originalH: number;
}

export interface MasonryColumn {
  photos: MasonryPhoto[];
  height: number;
}

// Shared layout constants used by both server (page.tsx) and client (timeline.tsx)
export const YEAR_HEADER_HEIGHT = 80;
export const MONTH_HEADER_HEIGHT = 56;
export const DAY_ROW_PADDING = 24;

// Layout tunables
const TARGET_COL_WIDTH = 160;
export const GAP = 4;

/**
 * Derive column count from container width, aiming for ~TARGET_COL_WIDTH per column.
 */
function getMasonryCols(containerWidth: number): number {
  return Math.max(
    2,
    Math.floor((containerWidth + GAP) / (TARGET_COL_WIDTH + GAP)),
  );
}

/**
 * Compute a masonry layout: fixed column widths, each photo placed in the
 * shortest column with its original aspect ratio preserved.
 */
export function computeMasonryLayout(
  photos: PhotoWithMeta[],
  containerWidth: number,
  numCols?: number,
  gap: number = GAP,
): { columns: MasonryColumn[]; height: number } {
  const cols = numCols ?? getMasonryCols(containerWidth);

  if (photos.length === 0 || containerWidth <= 0) {
    return { columns: [], height: 0 };
  }

  const totalGaps = (cols - 1) * gap;
  const cellWidth = Math.floor((containerWidth - totalGaps) / cols);

  const columns: MasonryColumn[] = Array.from({ length: cols }, () => ({
    photos: [],
    height: 0,
  }));

  for (const photo of photos) {
    // Find the shortest column
    let shortestIdx = 0;
    for (let i = 1; i < cols; i++) {
      if (columns[i]!.height < columns[shortestIdx]!.height) {
        shortestIdx = i;
      }
    }

    const photoHeight = Math.round(cellWidth * (photo.h / photo.w));
    columns[shortestIdx]!.photos.push({
      filename: photo.filename,
      width: cellWidth,
      height: photoHeight,
      originalW: photo.w,
      originalH: photo.h,
    });
    columns[shortestIdx]!.height += photoHeight + gap;
  }

  // Remove trailing gap
  for (const col of columns) {
    if (col.height > 0) col.height -= gap;
  }

  const height = Math.max(...columns.map((c) => c.height), 0);
  return { columns, height };
}
