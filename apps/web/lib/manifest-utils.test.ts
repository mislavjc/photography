import { describe, expect, it } from 'vitest';

import type { Manifest } from '../types';

import { selectRandomPhoto, trimManifestForClient } from './manifest-utils';

/** Helper to create a full manifest entry with all EXIF fields. */
function fullEntry(
  w: number,
  h: number,
  colors?: Array<{
    hex: string;
    rgb: { r: number; g: number; b: number };
    percentage: number;
  }>,
): Manifest[string] {
  return {
    blurhash: 'L00000fQfQfQfQfQfQfQfQfQfQfQ',
    w,
    h,
    exif: {
      camera: 'Sony A7IV',
      lens: 'FE 24-70mm F2.8 GM',
      focalLength: '50mm',
      aperture: 'f/2.8',
      shutterSpeed: '1/250',
      iso: '100',
      location: { latitude: 48.8566, longitude: 2.3522 },
      dateTime: '2024:12:25 10:00:00',
      dominantColors: colors,
    },
  };
}

describe('trimManifestForClient', () => {
  it('preserves w and h dimensions', () => {
    const manifest: Manifest = {
      'photo.jpg': fullEntry(4000, 3000),
    };

    const trimmed = trimManifestForClient(manifest);

    expect(trimmed['photo.jpg']!.w).toBe(4000);
    expect(trimmed['photo.jpg']!.h).toBe(3000);
  });

  it('strips all EXIF fields except the first dominant color', () => {
    const colors = [
      { hex: '#ff0000', rgb: { r: 255, g: 0, b: 0 }, percentage: 40 },
      { hex: '#00ff00', rgb: { r: 0, g: 255, b: 0 }, percentage: 30 },
      { hex: '#0000ff', rgb: { r: 0, g: 0, b: 255 }, percentage: 20 },
    ];
    const manifest: Manifest = {
      'photo.jpg': fullEntry(4000, 3000, colors),
    };

    const trimmed = trimManifestForClient(manifest);
    const entry = trimmed['photo.jpg']!;

    // Should only have w, h, and exif with a single dominant color
    expect(entry.exif.dominantColors).toHaveLength(1);
    expect(entry.exif.dominantColors![0]!.hex).toBe('#ff0000');

    // Other EXIF fields should be stripped (not present or undefined)
    expect(entry.exif.camera).toBeUndefined();
    expect(entry.exif.lens).toBeUndefined();
    expect(entry.exif.dateTime).toBeUndefined();
    expect(entry.exif.location).toBeUndefined();
  });

  it('handles entries without dominant colors', () => {
    const manifest: Manifest = {
      'photo.jpg': fullEntry(4000, 3000, undefined),
    };

    const trimmed = trimManifestForClient(manifest);

    expect(trimmed['photo.jpg']!.exif.dominantColors).toBeUndefined();
  });

  it('handles entries with an empty dominant colors array', () => {
    const manifest: Manifest = {
      'photo.jpg': fullEntry(4000, 3000, []),
    };

    const trimmed = trimManifestForClient(manifest);

    expect(trimmed['photo.jpg']!.exif.dominantColors).toHaveLength(0);
  });

  it('preserves all manifest keys', () => {
    const manifest: Manifest = {
      'a.jpg': fullEntry(4000, 3000),
      'b.jpg': fullEntry(3000, 4000),
      'c.jpg': fullEntry(5000, 3000),
    };

    const trimmed = trimManifestForClient(manifest);

    expect(Object.keys(trimmed)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('does not mutate the original manifest', () => {
    const manifest: Manifest = {
      'photo.jpg': fullEntry(4000, 3000),
    };

    trimManifestForClient(manifest);

    // Original should still have all EXIF fields
    expect(manifest['photo.jpg']!.exif.camera).toBe('Sony A7IV');
    expect(manifest['photo.jpg']!.exif.dateTime).toBe('2024:12:25 10:00:00');
  });
});

describe('selectRandomPhoto', () => {
  it('returns a string from the input array', () => {
    const names = ['a.jpg', 'b.jpg', 'c.jpg'];
    const selected = selectRandomPhoto(names);
    expect(names).toContain(selected);
  });

  it('returns the only item from a single-element array', () => {
    const selected = selectRandomPhoto(['solo.jpg']);
    expect(selected).toBe('solo.jpg');
  });

  it('always returns a member of the array over many calls', () => {
    const names = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'];
    for (let i = 0; i < 50; i++) {
      expect(names).toContain(selectRandomPhoto(names));
    }
  });
});
