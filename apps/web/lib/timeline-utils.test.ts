import { describe, expect, it } from 'vitest';

import type { Manifest } from 'types';

import { groupPhotosForTimeline } from './timeline-utils';

/** Helper to create a minimal manifest entry. */
function entry(
  dateTime: string | null,
  w = 4000,
  h = 3000,
): Manifest[string] {
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
      dateTime,
    },
  };
}

describe('groupPhotosForTimeline', () => {
  describe('date parsing (via resulting groups)', () => {
    it('parses ISO 8601 dates', () => {
      const manifest: Manifest = {
        'iso.jpg': entry('2025-03-03T14:12:23Z'),
      };
      const result = groupPhotosForTimeline(manifest);
      expect(result.years).toHaveLength(1);
      expect(result.years[0]!.key).toBe('2025');
    });

    it('parses EXIF format dates', () => {
      const manifest: Manifest = {
        'exif.jpg': entry('2024:08:15 14:30:00'),
      };
      const result = groupPhotosForTimeline(manifest);
      expect(result.years).toHaveLength(1);
      expect(result.years[0]!.key).toBe('2024');
      expect(result.years[0]!.months[0]!.label).toBe('August');
      expect(result.years[0]!.months[0]!.days[0]!.label).toBe(
        'Aug 15, 2024',
      );
    });

    it('handles null dates by grouping into "Unknown Date"', () => {
      const manifest: Manifest = {
        'no-date.jpg': entry(null),
      };
      const result = groupPhotosForTimeline(manifest);
      expect(result.years).toHaveLength(1);
      expect(result.years[0]!.key).toBe('unknown');
      expect(result.years[0]!.label).toBe('Unknown Date');
    });

    it('handles invalid date strings by grouping into "Unknown Date"', () => {
      const manifest: Manifest = {
        'bad-date.jpg': entry('not-a-date'),
      };
      const result = groupPhotosForTimeline(manifest);
      expect(result.years).toHaveLength(1);
      expect(result.years[0]!.key).toBe('unknown');
    });
  });

  describe('grouping structure', () => {
    it('groups photos by year, month, and day', () => {
      const manifest: Manifest = {
        'a.jpg': entry('2024:12:25 10:00:00'),
        'b.jpg': entry('2024:12:25 15:00:00'),
        'c.jpg': entry('2024:12:26 09:00:00'),
        'd.jpg': entry('2024:11:01 12:00:00'),
        'e.jpg': entry('2023:06:15 08:00:00'),
      };

      const result = groupPhotosForTimeline(manifest);

      // Two year groups
      expect(result.years).toHaveLength(2);

      // 2024 year
      const year2024 = result.years.find((y) => y.key === '2024');
      expect(year2024).toBeDefined();
      expect(year2024!.months).toHaveLength(2); // December and November

      // December 2024
      const dec = year2024!.months.find((m) => m.label === 'December');
      expect(dec).toBeDefined();
      expect(dec!.days).toHaveLength(2); // 25th and 26th
      // Dec 25 should have 2 photos
      const dec25 = dec!.days.find((d) => d.key === '2024-12-25');
      expect(dec25).toBeDefined();
      expect(dec25!.photos).toHaveLength(2);

      // 2023 year
      const year2023 = result.years.find((y) => y.key === '2023');
      expect(year2023).toBeDefined();
      expect(year2023!.months).toHaveLength(1); // June
    });

    it('handles empty manifest', () => {
      const result = groupPhotosForTimeline({});
      expect(result.years).toHaveLength(0);
      expect(result.allYears).toHaveLength(0);
    });
  });

  describe('sorting', () => {
    it('sorts years descending (newest first)', () => {
      const manifest: Manifest = {
        'a.jpg': entry('2020:01:01 12:00:00'),
        'b.jpg': entry('2025:01:01 12:00:00'),
        'c.jpg': entry('2023:01:01 12:00:00'),
      };
      const result = groupPhotosForTimeline(manifest);
      expect(result.years.map((y) => y.key)).toEqual([
        '2025',
        '2023',
        '2020',
      ]);
      expect(result.allYears).toEqual([2025, 2023, 2020]);
    });

    it('sorts months descending within a year', () => {
      const manifest: Manifest = {
        'a.jpg': entry('2024:03:01 12:00:00'),
        'b.jpg': entry('2024:11:01 12:00:00'),
        'c.jpg': entry('2024:07:01 12:00:00'),
      };
      const result = groupPhotosForTimeline(manifest);
      const months = result.years[0]!.months.map((m) => m.label);
      expect(months).toEqual(['November', 'July', 'March']);
    });

    it('sorts days descending within a month', () => {
      const manifest: Manifest = {
        'a.jpg': entry('2024:06:05 12:00:00'),
        'b.jpg': entry('2024:06:20 12:00:00'),
        'c.jpg': entry('2024:06:12 12:00:00'),
      };
      const result = groupPhotosForTimeline(manifest);
      const days = result.years[0]!.months[0]!.days.map((d) => d.key);
      expect(days).toEqual(['2024-06-20', '2024-06-12', '2024-06-05']);
    });
  });

  describe('mixed dated and undated photos', () => {
    it('places undated photos in "Unknown Date" group at the end', () => {
      const manifest: Manifest = {
        'dated.jpg': entry('2024:06:01 12:00:00'),
        'undated.jpg': entry(null),
      };
      const result = groupPhotosForTimeline(manifest);
      expect(result.years).toHaveLength(2);
      expect(result.years[0]!.key).toBe('2024');
      expect(result.years[1]!.key).toBe('unknown');
      expect(result.years[1]!.months[0]!.days[0]!.photos).toHaveLength(1);
      expect(result.years[1]!.months[0]!.days[0]!.photos[0]!.filename).toBe(
        'undated.jpg',
      );
    });
  });

  describe('day labels', () => {
    it('formats day labels as "Mon DD, YYYY"', () => {
      const manifest: Manifest = {
        'a.jpg': entry('2024:01:09 12:00:00'),
      };
      const result = groupPhotosForTimeline(manifest);
      expect(result.years[0]!.months[0]!.days[0]!.label).toBe('Jan 9, 2024');
    });
  });
});
