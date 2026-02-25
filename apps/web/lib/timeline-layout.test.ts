import { describe, expect, it } from 'vitest';

import type { PhotoWithMeta } from './timeline-utils';
import { computeMasonryLayout, GAP } from './timeline-layout';

/** Helper to build a PhotoWithMeta for testing. */
function photo(
  filename: string,
  w: number,
  h: number,
): PhotoWithMeta {
  return {
    filename,
    w,
    h,
    ar: w / h,
    dateTime: null,
  };
}

describe('computeMasonryLayout', () => {
  it('distributes photos across columns', () => {
    const photos = [
      photo('a.jpg', 4000, 3000),
      photo('b.jpg', 3000, 4000),
      photo('c.jpg', 4000, 4000),
      photo('d.jpg', 5000, 3000),
      photo('e.jpg', 3000, 5000),
    ];

    const { columns } = computeMasonryLayout(photos, 600, 3);

    // All 5 photos should be distributed across 3 columns
    const totalPhotos = columns.reduce((sum, col) => sum + col.photos.length, 0);
    expect(totalPhotos).toBe(5);
    expect(columns).toHaveLength(3);
    // Each column should have at least 1 photo
    for (const col of columns) {
      expect(col.photos.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('respects container width', () => {
    const photos = [
      photo('a.jpg', 4000, 3000),
      photo('b.jpg', 3000, 4000),
    ];

    const containerWidth = 800;
    const numCols = 4;
    const { columns } = computeMasonryLayout(photos, containerWidth, numCols);

    // Each photo's width should fit within the allocated column width
    const expectedColWidth = Math.floor(
      (containerWidth - (numCols - 1) * GAP) / numCols,
    );
    for (const col of columns) {
      for (const p of col.photos) {
        expect(p.width).toBe(expectedColWidth);
      }
    }
  });

  it('returns correct total height', () => {
    const photos = [
      photo('a.jpg', 4000, 3000),
      photo('b.jpg', 3000, 4000),
      photo('c.jpg', 4000, 4000),
    ];

    const { columns, height } = computeMasonryLayout(photos, 600, 2);

    // Height should equal the tallest column
    const maxColHeight = Math.max(...columns.map((c) => c.height));
    expect(height).toBe(maxColHeight);
    expect(height).toBeGreaterThan(0);
  });

  it('handles a single photo', () => {
    const photos = [photo('solo.jpg', 4000, 3000)];

    const { columns, height } = computeMasonryLayout(photos, 600, 3);

    expect(columns).toHaveLength(3);
    const totalPhotos = columns.reduce((sum, col) => sum + col.photos.length, 0);
    expect(totalPhotos).toBe(1);
    expect(height).toBeGreaterThan(0);
  });

  it('handles empty array', () => {
    const { columns, height } = computeMasonryLayout([], 600, 3);

    expect(columns).toHaveLength(0);
    expect(height).toBe(0);
  });

  it('preserves aspect ratio of photos', () => {
    const photos = [photo('wide.jpg', 6000, 3000)];

    const { columns } = computeMasonryLayout(photos, 600, 3);

    const placed = columns.find((c) => c.photos.length > 0)!.photos[0]!;
    // Original AR is 2:1, so height should be roughly half the width
    const expectedHeight = Math.round(placed.width * (3000 / 6000));
    expect(placed.height).toBe(expectedHeight);
  });

  it('derives column count from container width when numCols is not specified', () => {
    const photos = [
      photo('a.jpg', 4000, 3000),
      photo('b.jpg', 3000, 4000),
      photo('c.jpg', 4000, 4000),
    ];

    // Wide container should produce more columns than narrow one
    const narrow = computeMasonryLayout(photos, 400);
    const wide = computeMasonryLayout(photos, 1200);

    expect(wide.columns.length).toBeGreaterThanOrEqual(narrow.columns.length);
  });
});
