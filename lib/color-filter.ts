import type { ColorRange, Manifest } from '../types';

// Define color ranges with their representative colors and ranges
const colorDefinitions: Record<
  string,
  {
    hex: string;
    rgb: { r: number; g: number; b: number };
    hueRange?: [number, number];
    saturationRange?: [number, number];
    brightnessRange?: [number, number];
  }
> = {
  red: { hex: '#FF0000', rgb: { r: 255, g: 0, b: 0 }, hueRange: [330, 30] },
  blue: { hex: '#0000FF', rgb: { r: 0, g: 0, b: 255 }, hueRange: [210, 270] },
  green: { hex: '#00FF00', rgb: { r: 0, g: 255, b: 0 }, hueRange: [90, 150] },
  yellow: { hex: '#FFFF00', rgb: { r: 255, g: 255, b: 0 }, hueRange: [45, 75] },
  purple: {
    hex: '#800080',
    rgb: { r: 128, g: 0, b: 128 },
    hueRange: [270, 330],
  },
  orange: { hex: '#FFA500', rgb: { r: 255, g: 165, b: 0 }, hueRange: [15, 45] },
  pink: {
    hex: '#FFC0CB',
    rgb: { r: 255, g: 192, b: 203 },
    hueRange: [300, 360],
  },
  cyan: { hex: '#00FFFF', rgb: { r: 0, g: 255, b: 255 }, hueRange: [165, 210] },
  brown: {
    hex: '#8B4513',
    rgb: { r: 139, g: 69, b: 19 },
    hueRange: [15, 45],
    saturationRange: [30, 80],
  },
  gray: {
    hex: '#808080',
    rgb: { r: 128, g: 128, b: 128 },
    saturationRange: [0, 20],
  },
  black: {
    hex: '#000000',
    rgb: { r: 0, g: 0, b: 0 },
    brightnessRange: [0, 30],
  },
  white: {
    hex: '#FFFFFF',
    rgb: { r: 255, g: 255, b: 255 },
    brightnessRange: [90, 100],
  },
};

// Convert RGB to HSL for better color matching
function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

// Check if a color matches a color range
function colorMatchesRange(
  rgb: { r: number; g: number; b: number },
  colorRange: ColorRange,
): boolean {
  if (colorRange === 'all') return true;

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const definition = colorDefinitions[colorRange];

  if (!definition) return false;

  // Special handling for gray, black, white based on saturation and brightness
  if (colorRange === 'gray' && definition.saturationRange) {
    return (
      hsl.s >= definition.saturationRange[0] &&
      hsl.s <= definition.saturationRange[1]
    );
  }

  if (colorRange === 'black' && definition.brightnessRange) {
    return (
      hsl.l >= definition.brightnessRange[0] &&
      hsl.l <= definition.brightnessRange[1]
    );
  }

  if (colorRange === 'white' && definition.brightnessRange) {
    return (
      hsl.l >= definition.brightnessRange[0] &&
      hsl.l <= definition.brightnessRange[1]
    );
  }

  // Brown has both hue and saturation constraints
  if (colorRange === 'brown' && definition.saturationRange) {
    const hueInRange = definition.hueRange
      ? hsl.h >= definition.hueRange[0] && hsl.h <= definition.hueRange[1]
      : true;
    const satInRange =
      hsl.s >= definition.saturationRange[0] &&
      hsl.s <= definition.saturationRange[1];
    return hueInRange && satInRange;
  }

  // Default hue-based matching
  if (!definition.hueRange) return false;

  const [minHue, maxHue] = definition.hueRange;
  if (minHue > maxHue) {
    // Handle wraparound (like red/pink)
    return hsl.h >= minHue || hsl.h <= maxHue;
  }
  return hsl.h >= minHue && hsl.h <= maxHue;
}

// Calculate color similarity using Euclidean distance in RGB space
function calculateColorSimilarity(
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number },
): number {
  const dr = color1.r - color2.r;
  const dg = color1.g - color2.g;
  const db = color1.b - color2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function filterManifestByColorRange(
  manifest: Manifest,
  colorRange: ColorRange,
): Manifest {
  if (colorRange === 'all') {
    return { ...manifest };
  }

  const filteredManifest: Manifest = {};

  for (const [filename, entry] of Object.entries(manifest)) {
    const dominantColors = entry.exif?.dominantColors;

    if (!dominantColors || dominantColors.length === 0) {
      continue; // Skip entries without dominant colors
    }

    // Check if any of the dominant colors match the selected color range
    const hasMatchingColor = dominantColors.some((color) =>
      colorMatchesRange(color.rgb, colorRange),
    );

    if (hasMatchingColor) {
      filteredManifest[filename] = entry;
    }
  }

  return filteredManifest;
}

// Get the most representative color for a color range
export function getRepresentativeColor(colorRange: ColorRange): string {
  if (colorRange === 'all') return '#808080';
  return colorDefinitions[colorRange].hex;
}

// Get all available color options for the UI
export function getColorOptions() {
  return Object.entries(colorDefinitions).map(([key, definition]) => ({
    value: key as ColorRange,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    hex: definition.hex,
    rgb: definition.rgb,
  }));
}
