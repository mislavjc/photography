import { APSC_AR, EDGE_PAD, GAP, ROWS_PER_TILE } from '../config';
import type { Rect } from '../types';
import { hash2, rng } from './utils';

export function buildTileRects(
  tileX: number,
  tileY: number,
  tileSize: number,
): Rect[] {
  const seed = hash2(tileX, tileY);
  const rnd = rng(seed);

  const rects: Rect[] = [];
  const availW = tileSize - EDGE_PAD * 2;
  const availH = tileSize - EDGE_PAD * 2;
  const rowH = (availH - GAP * (ROWS_PER_TILE - 1)) / ROWS_PER_TILE;

  for (let r = 0; r < ROWS_PER_TILE; r++) {
    const y = EDGE_PAD + r * (rowH + GAP);

    const m = 4 + Math.floor(rnd() * 2);
    const k = Math.floor(rnd() * (m + 1));

    const denom = (m - k) * APSC_AR + k / APSC_AR;
    const baseW = (availW - GAP * (m - 1)) / denom;

    const portrait = new Array(m).fill(false);
    let portraitsToPick = k;
    for (let i = 0; i < m; i++) {
      const remain = m - i;
      const p = portraitsToPick / remain;
      if (rnd() < p) {
        portrait[i] = true;
        portraitsToPick--;
      }
    }

    let x = EDGE_PAD;
    for (let i = 0; i < m; i++) {
      const isPortrait = portrait[i];
      const w = isPortrait ? baseW / APSC_AR : baseW * APSC_AR;
      const imgSeed = hash2(seed ^ (r * 4099 + i * 131), tileX ^ tileY);
      rects.push({ x, y, w, h: rowH, seed: imgSeed });
      x += w + (i < m - 1 ? GAP : 0);
    }
  }

  return rects;
}

export function imgUrl(seed: number, w: number, h: number): string {
  const W = Math.max(32, Math.round(w));
  const H = Math.max(32, Math.round(h));
  return `https://picsum.photos/seed/${seed}/${W}/${H}`;
}

export function getBlurhashForSeed(seed: number): string | null {
  return null;
}

export async function blurhashToDataURL(
  hash: string,
  w: number,
  h: number,
): Promise<string> {
  const { decode } = await import('blurhash');
  const pixels = decode(
    hash,
    Math.max(1, Math.round(w)),
    Math.max(1, Math.round(h)),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  imageData.data.set(pixels);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
