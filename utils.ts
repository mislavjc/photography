export const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n));

export function rng(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export const hash2 = (x: number, y: number): number => {
  const a = (x | 0) * 73856093;
  const b = (y | 0) * 19349663;
  let h = (a ^ b) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  return h >>> 0;
};
