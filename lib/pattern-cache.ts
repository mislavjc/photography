import { hash2, rng } from './utils';

// Cached pattern generation for performance with proper randomness
const patternCache = new Map<string, { pattern: boolean[]; name: string }[]>();

export function getCachedPatterns(
  portraitHeight: number,
  landscapeHeight: number,
  targetHeight: number,
  gap: number,
  tileX: number,
  tileY: number,
  isMobile: boolean = false,
): { pattern: boolean[]; name: string }[] {
  // Create cache key for mathematical combinations (include mobile flag for different patterns)
  const key = `${Math.round(portraitHeight)}_${Math.round(landscapeHeight)}_${Math.round(targetHeight)}_${gap}_${isMobile}`;

  let cached = patternCache.get(key);
  if (!cached) {
    // Generate base mathematical combinations once with mobile bias
    cached = generateBaseCombinations(
      portraitHeight,
      landscapeHeight,
      targetHeight,
      gap,
      isMobile,
    );

    // Cache with size limit
    if (patternCache.size > 50) {
      const firstKey = patternCache.keys().next().value;
      if (firstKey) patternCache.delete(firstKey);
    }

    patternCache.set(key, cached);
  }

  // Apply randomness based on tile coordinates for variety
  const tileSeed = hash2(tileX * 7919, tileY * 6151);
  const tileRng = rng(tileSeed);

  // Shuffle the cached combinations for this specific tile
  const shuffledCombinations = [...cached];
  for (let i = shuffledCombinations.length - 1; i > 0; i--) {
    const j = Math.floor(tileRng() * (i + 1));
    [shuffledCombinations[i], shuffledCombinations[j]] = [
      shuffledCombinations[j],
      shuffledCombinations[i],
    ];
  }

  return shuffledCombinations;
}

function generateBaseCombinations(
  portraitHeight: number,
  landscapeHeight: number,
  targetHeight: number,
  gap: number,
  isMobile: boolean = false,
): { pattern: boolean[]; name: string }[] {
  const combinations: { pattern: boolean[]; name: string }[] = [];

  // Restore proper search range for tall tiles
  for (let numPortraits = 0; numPortraits <= 25; numPortraits++) {
    for (let numLandscapes = 0; numLandscapes <= 30; numLandscapes++) {
      const totalImages = numPortraits + numLandscapes;
      if (totalImages === 0 || totalImages > 20) continue; // Restored max for tall tiles

      const contentHeight =
        numPortraits * portraitHeight + numLandscapes * landscapeHeight;
      const gapsHeight = gap * (totalImages - 1);
      const totalHeight = contentHeight + gapsHeight;

      // Tight tolerance for perfect fits
      if (Math.abs(totalHeight - targetHeight) <= 5) {
        // Mobile-specific bias: prefer more portraits to balance the layout
        const portraitRatio = numPortraits / totalImages;
        const isPortraitHeavy = portraitRatio >= 0.4; // At least 40% portraits

        // On mobile, heavily favor portrait-heavy combinations
        if (isMobile && !isPortraitHeavy && combinations.length > 5) {
          continue; // Skip landscape-heavy patterns if we have enough portrait-heavy ones
        }

        // On desktop, prefer more balanced or slightly landscape-heavy patterns
        if (!isMobile && portraitRatio > 0.7 && combinations.length > 3) {
          continue; // Skip overly portrait-heavy patterns on desktop
        }

        // Generate 3 shuffled variants for variety
        for (let variant = 0; variant < 3; variant++) {
          const orientationPool: boolean[] = [];
          for (let p = 0; p < numPortraits; p++) orientationPool.push(true);
          for (let l = 0; l < numLandscapes; l++) orientationPool.push(false);

          // Proper random shuffle with unique seed
          const shuffleSeed =
            numPortraits * 1000 + numLandscapes * 100 + variant;
          const shuffleRng = rng(shuffleSeed);

          for (let i = orientationPool.length - 1; i > 0; i--) {
            const j = Math.floor(shuffleRng() * (i + 1));
            [orientationPool[i], orientationPool[j]] = [
              orientationPool[j],
              orientationPool[i],
            ];
          }

          combinations.push({
            pattern: orientationPool,
            name: `${numPortraits}P+${numLandscapes}L-v${variant}`,
          });
        }
      }
    }
  }

  // Mobile-specific fallback patterns with portrait bias
  const fallbackPatterns = isMobile
    ? [
        // Mobile: Portrait-heavy patterns
        {
          pattern: [
            true,
            true,
            false,
            true,
            true,
            true,
            false,
            true,
            true,
            false,
            true,
            true,
            true,
            false,
            true,
            true,
          ],
          name: 'Mobile-Portrait-Heavy-Fallback',
        },
        {
          pattern: [
            true,
            false,
            true,
            true,
            false,
            true,
            true,
            false,
            true,
            true,
            false,
            true,
            true,
            false,
            true,
          ],
          name: 'Mobile-Balanced-Fallback',
        },
      ]
    : [
        // Desktop: More landscape-friendly patterns
        {
          pattern: [
            true,
            false,
            true,
            false,
            true,
            false,
            true,
            false,
            true,
            false,
            true,
            false,
            true,
            false,
            true,
            false,
            true,
            false,
          ],
          name: 'Desktop-Mixed-Fallback',
        },
        {
          pattern: [
            false,
            true,
            false,
            true,
            false,
            true,
            false,
            true,
            false,
            true,
            false,
            true,
            false,
            true,
            false,
            true,
            false,
          ],
          name: 'Desktop-Landscape-Heavy-Fallback',
        },
      ];

  return combinations.length > 0 ? combinations : fallbackPatterns;
}
