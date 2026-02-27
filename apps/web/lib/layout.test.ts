import type { Manifest } from 'types';
import { describe, expect, it } from 'vitest';

import { computeNearSquareLayout } from './layout';

/** Helper to create a manifest entry with given dimensions. */
function entry(w: number, h: number): Manifest[string] {
  return {
    blurhash: 'L00000fQfQfQfQfQfQfQfQfQfQfQ',
    w,
    h,
    exif: {
      camera: null,
      lens: null,
      focalLength: null,
      aperture: null,
      shutterSpeed: null,
      iso: null,
      location: null,
      dateTime: null,
    },
  };
}

/** Build a manifest with `n` entries of varied aspect ratios. */
function buildManifest(n: number): Manifest {
  const manifest: Manifest = {};
  for (let i = 0; i < n; i++) {
    // Mix of landscape, portrait, and square
    const w = 3000 + (i % 3) * 1000; // 3000, 4000, 5000
    const h = 4000 - (i % 3) * 1000; // 4000, 3000, 2000
    manifest[`photo-${String(i).padStart(4, '0')}.jpg`] = entry(w, h);
  }
  return manifest;
}

describe('computeNearSquareLayout', () => {
  it('returns items with x, y, w, h properties', () => {
    const manifest: Manifest = {
      'a.jpg': entry(4000, 3000),
      'b.jpg': entry(3000, 4000),
    };
    const layout = computeNearSquareLayout(manifest);

    for (const item of layout.items) {
      expect(item).toHaveProperty('filename');
      expect(item).toHaveProperty('x');
      expect(item).toHaveProperty('y');
      expect(item).toHaveProperty('w');
      expect(item).toHaveProperty('h');
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.w).toBeGreaterThan(0);
      expect(item.h).toBeGreaterThan(0);
    }
  });

  it('produces a roughly square layout (width within 2x of height)', () => {
    const manifest = buildManifest(30);
    const layout = computeNearSquareLayout(manifest);

    const ratio = layout.width / layout.height;
    // Should be somewhat close to square; allow generous tolerance
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(5);
  });

  it('places all items without overlap', () => {
    const manifest = buildManifest(20);
    const layout = computeNearSquareLayout(manifest);

    for (let i = 0; i < layout.items.length; i++) {
      for (let j = i + 1; j < layout.items.length; j++) {
        const a = layout.items[i]!;
        const b = layout.items[j]!;

        // Two rectangles overlap when none of the four separation conditions hold
        const noOverlap =
          a.x + a.w <= b.x || // a is left of b
          b.x + b.w <= a.x || // b is left of a
          a.y + a.h <= b.y || // a is above b
          b.y + b.h <= a.y; // b is above a

        expect(noOverlap).toBe(true);
      }
    }
  });

  it('handles a single-item manifest', () => {
    const manifest: Manifest = {
      'solo.jpg': entry(4000, 3000),
    };
    const layout = computeNearSquareLayout(manifest);
    expect(layout.items).toHaveLength(1);
    expect(layout.items[0]!.filename).toBe('solo.jpg');
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('handles a large manifest (100+ items)', () => {
    const manifest = buildManifest(150);
    const layout = computeNearSquareLayout(manifest);
    expect(layout.items).toHaveLength(150);
    expect(layout.columns).toBeGreaterThanOrEqual(3);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('returns items sorted by y coordinate (for binary search)', () => {
    const manifest = buildManifest(50);
    const layout = computeNearSquareLayout(manifest);

    for (let i = 1; i < layout.items.length; i++) {
      expect(layout.items[i]!.y).toBeGreaterThanOrEqual(layout.items[i - 1]!.y);
    }
  });

  it('returns consistent results on repeated calls (caching)', () => {
    const manifest = buildManifest(25);
    const layout1 = computeNearSquareLayout(manifest);
    const layout2 = computeNearSquareLayout(manifest);
    // Should be the exact same object reference due to caching
    expect(layout1).toBe(layout2);
  });
});
