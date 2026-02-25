import { describe, expect, it } from 'vitest';

import r2ImageLoader from './imageLoader';

describe('r2ImageLoader', () => {
  describe('width selection', () => {
    it('snaps up to the nearest available width', () => {
      const url = r2ImageLoader({ src: 'photo.jpg', width: 200 });
      expect(url).toContain('/240/');
    });

    it('uses exact width when it matches an available width', () => {
      const url = r2ImageLoader({ src: 'photo.jpg', width: 480 });
      expect(url).toContain('/480/');
    });

    it('uses the largest width when requested width exceeds all options', () => {
      const url = r2ImageLoader({ src: 'photo.jpg', width: 2000 });
      expect(url).toContain('/960/');
    });

    it('snaps up from very small widths', () => {
      const url = r2ImageLoader({ src: 'photo.jpg', width: 1 });
      expect(url).toContain('/160/');
    });
  });

  describe('URL construction', () => {
    it('strips file extension from src', () => {
      const url = r2ImageLoader({ src: 'abc-123.jpg', width: 320 });
      expect(url).toContain('/abc-123.');
      expect(url).not.toContain('.jpg');
    });

    it('handles src with multiple dots', () => {
      const url = r2ImageLoader({ src: 'my.photo.name.png', width: 320 });
      expect(url).toContain('/my.photo.name.');
      expect(url).not.toContain('.png');
    });

    it('uses webp format on server (no window)', () => {
      const url = r2ImageLoader({ src: 'photo.jpg', width: 320 });
      expect(url).toContain('/webp/');
      expect(url).toMatch(/\.webp$/);
    });

    it('builds correct path structure', () => {
      const url = r2ImageLoader({ src: 'photo.jpg', width: 320 });
      expect(url).toMatch(/\/variants\/webp\/320\/photo\.webp$/);
    });
  });
});
