import type { PhotoWithMeta } from './timeline-utils';

export interface JustifiedPhoto {
  filename: string;
  width: number; // scaled width for this row
  height: number; // row height
  originalW: number;
  originalH: number;
}

export interface JustifiedRow {
  photos: JustifiedPhoto[];
  height: number;
  width: number; // actual row width (may be less than container for last row)
}

// Layout tunables
export const TARGET_ROW_HEIGHT = 160;
export const MIN_ROW_HEIGHT = 120;
export const MAX_ROW_HEIGHT = 200;
export const GAP = 8;

/**
 * Compute justified rows for a set of photos.
 * Uses a greedy algorithm to fill rows while maintaining aspect ratios.
 *
 * @param photos - Photos with dimensions
 * @param containerWidth - Available width for photos
 * @param targetRowHeight - Desired row height
 * @param gap - Gap between photos
 * @returns Array of rows with positioned photos
 */
export function computeJustifiedRows(
  photos: PhotoWithMeta[],
  containerWidth: number,
  targetRowHeight: number = TARGET_ROW_HEIGHT,
  gap: number = GAP,
): JustifiedRow[] {
  if (photos.length === 0 || containerWidth <= 0) {
    return [];
  }

  const rows: JustifiedRow[] = [];
  let currentRow: PhotoWithMeta[] = [];
  let currentRowWidth = 0;

  for (const photo of photos) {
    // Calculate photo width at target row height
    const aspectRatio = photo.w / photo.h;
    const photoWidth = targetRowHeight * aspectRatio;

    // Add to current row
    currentRow.push(photo);
    const gapWidth = currentRow.length > 1 ? gap : 0;
    currentRowWidth += photoWidth + gapWidth;

    // Check if row is full
    if (currentRowWidth >= containerWidth) {
      // Finalize this row - scale photos to exactly fill container width
      const row = finalizeRow(currentRow, containerWidth, gap);
      rows.push(row);

      // Start new row
      currentRow = [];
      currentRowWidth = 0;
    }
  }

  // Handle remaining photos (last row)
  if (currentRow.length > 0) {
    // For last row, don't stretch to fill - use target height
    const row = finalizeLastRow(currentRow, targetRowHeight, gap);
    rows.push(row);
  }

  return rows;
}

/**
 * Finalize a complete row by scaling photos to exactly fill the container width.
 */
function finalizeRow(
  photos: PhotoWithMeta[],
  containerWidth: number,
  gap: number,
): JustifiedRow {
  // Calculate the total gaps
  const totalGaps = (photos.length - 1) * gap;
  const availableWidth = containerWidth - totalGaps;

  // Calculate sum of aspect ratios
  const totalAspectRatio = photos.reduce((sum, p) => sum + p.w / p.h, 0);

  // Calculate the row height that makes all photos fit exactly
  const rowHeight = availableWidth / totalAspectRatio;

  // Clamp row height to reasonable bounds
  const clampedHeight = Math.max(
    MIN_ROW_HEIGHT,
    Math.min(MAX_ROW_HEIGHT, rowHeight),
  );

  // Calculate individual photo widths at this height
  const justifiedPhotos: JustifiedPhoto[] = photos.map((photo) => {
    const aspectRatio = photo.w / photo.h;
    return {
      filename: photo.filename,
      width: Math.round(clampedHeight * aspectRatio),
      height: Math.round(clampedHeight),
      originalW: photo.w,
      originalH: photo.h,
    };
  });

  // Calculate actual row width (may differ slightly due to rounding)
  const actualWidth =
    justifiedPhotos.reduce((sum, p) => sum + p.width, 0) + totalGaps;

  return {
    photos: justifiedPhotos,
    height: Math.round(clampedHeight),
    width: actualWidth,
  };
}

/**
 * Finalize the last row without stretching - use target height.
 */
function finalizeLastRow(
  photos: PhotoWithMeta[],
  targetHeight: number,
  gap: number,
): JustifiedRow {
  const justifiedPhotos: JustifiedPhoto[] = photos.map((photo) => {
    const aspectRatio = photo.w / photo.h;
    return {
      filename: photo.filename,
      width: Math.round(targetHeight * aspectRatio),
      height: targetHeight,
      originalW: photo.w,
      originalH: photo.h,
    };
  });

  const totalGaps = (photos.length - 1) * gap;
  const actualWidth =
    justifiedPhotos.reduce((sum, p) => sum + p.width, 0) + totalGaps;

  return {
    photos: justifiedPhotos,
    height: targetHeight,
    width: actualWidth,
  };
}

/**
 * Calculate the total height of all rows including gaps between rows.
 */
export function calculateTotalHeight(
  rows: JustifiedRow[],
  rowGap: number = GAP,
): number {
  if (rows.length === 0) return 0;

  const totalRowHeights = rows.reduce((sum, row) => sum + row.height, 0);
  const totalGaps = (rows.length - 1) * rowGap;

  return totalRowHeights + totalGaps;
}
