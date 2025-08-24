import { COLUMNS_PER_TILE } from '../config';
import type { Manifest, Rect } from '../types';
import { getCycledImageByOrientation } from './image-cycling';
import { getCachedPatterns } from './pattern-cache';
import { hash2, rng } from './utils';

export function buildTileRects(
  tileX: number,
  tileY: number,
  tileWidth: number,
  tileHeight: number,
  gap: number,
  manifest?: Manifest,
): Rect[] {
  // Detect if we're on mobile based on tile width
  const isMobile = tileWidth <= 700; // Mobile tiles are ~600px

  const seed = hash2(tileX, tileY);
  const rnd = rng(seed);

  const rects: Rect[] = [];

  // Use fixed tall tiles with perfect column combinations
  // NO edge spacing - tiles should be seamless at boundaries
  const edgeSpacing = 0; // Remove edge spacing for seamless tiles
  const availW = tileWidth; // Use actual tile width
  const availH = tileHeight; // Use actual tile height (much taller)

  // Calculate column width with gaps for seamless tiles
  const totalGapsWidth = gap * (COLUMNS_PER_TILE - 1);
  const totalEdgeSpacing = edgeSpacing * 2; // 0px now - no edge spacing
  const columnWidth =
    (availW - totalGapsWidth - totalEdgeSpacing) / COLUMNS_PER_TILE;

  // Use cached pattern generation for 60fps performance

  // Fill each column with images using perfect patterns
  for (let col = 0; col < COLUMNS_PER_TILE; col++) {
    // Calculate column position - no edge spacing, seamless tiles
    const colX = col * (columnWidth + gap);
    const actualColumnWidth = columnWidth; // All columns same width for consistency

    // Calculate perfect APSC heights for this column width
    const baseLandscapeHeight = actualColumnWidth * (15.7 / 23.5);
    const basePortraitHeight = actualColumnWidth * (23.5 / 15.7);

    // Get cached patterns with tile-specific randomness and mobile bias
    const perfectCombinations = getCachedPatterns(
      basePortraitHeight,
      baseLandscapeHeight,
      availH,
      gap,
      tileX + col, // Add column for more variety
      tileY,
      isMobile, // Apply mobile-specific portrait bias
    );

    // Select a random perfect combination with more variety
    const selectedPattern =
      perfectCombinations[Math.floor(rnd() * perfectCombinations.length)];

    // Use the pattern as-is - no flipping to preserve perfect height math
    const finalPattern = selectedPattern.pattern;

    // Performance: Debug logging removed for production

    // Generate images according to the randomized pattern
    let currentY = 0; // Start at tile top edge
    finalPattern.forEach((isPortrait, imageIndex) => {
      // Use perfect APSC heights - never scale these!
      const imageHeight = isPortrait ? basePortraitHeight : baseLandscapeHeight;
      // Generate much more random seed for this image
      const imgSeed = hash2(
        seed ^ (col * 7919 + imageIndex * 2971 + (isPortrait ? 5477 : 8191)),
        (tileX * 3571) ^ (tileY * 6151) ^ (currentY * 1009),
      );

      // Get image from cycling system to avoid repetition
      const imageId = manifest
        ? getCycledImageByOrientation(
            manifest,
            tileX,
            tileY,
            col,
            imageIndex,
            isPortrait,
          )
        : null;

      rects.push({
        x: colX,
        y: currentY,
        w: actualColumnWidth,
        h: imageHeight,
        seed: imgSeed,
        imageId: imageId || undefined,
      });

      // Move to next position with proper gaps
      currentY +=
        imageHeight + (imageIndex < finalPattern.length - 1 ? gap : 0);
    });
  }

  return rects;
}

// Available widths from the upload script
const AVAILABLE_WIDTHS = [160, 240, 320, 480, 640, 800, 960];

function selectOptimalWidth(requestedWidth: number): number {
  // Find the smallest width that's >= requested width
  const optimal = AVAILABLE_WIDTHS.find((w) => w >= requestedWidth);
  // If no width is large enough, use the largest available
  return optimal || AVAILABLE_WIDTHS[AVAILABLE_WIDTHS.length - 1];
}

function getImageBaseName(filename: string): string {
  // Remove file extension to get base name
  return filename.replace(/\.[^.]+$/, '');
}

export function imgUrl(
  seed: number,
  w: number,
  h: number,
  imageId?: string,
): string {
  // If we have an imageId from the manifest, build the R2 URL directly
  if (imageId) {
    const baseName = getImageBaseName(imageId);
    const optimalWidth = selectOptimalWidth(w);

    // Use WebP as default format for performance (good browser support, better than JPEG)
    const baseUrl = 'https://r2.photography.mislavjc.com';
    const variantPath = `variants/webp/${optimalWidth}/${baseName}.webp`;

    return `${baseUrl}/${variantPath}`;
  }
  // Fallback to Picsum for missing images or during development
  const W = Math.max(32, Math.round(w));
  const H = Math.max(32, Math.round(h));
  return `https://picsum.photos/seed/${seed}/${W}/${H}`;
}

export function getBlurhashForSeed(
  seed: number,
  imageId?: string,
  manifest?: Manifest,
): string | null {
  // If we have an imageId and manifest, get the real blurhash
  if (imageId && manifest) {
    const entry = manifest[imageId];
    return entry?.blurhash || null;
  }
  // No blurhash for Picsum fallback
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
