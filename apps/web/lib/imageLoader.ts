interface ImageLoaderProps {
  src: string;
  width: number;
  quality?: number;
}

// Available widths from the upload script
const AVAILABLE_WIDTHS = [160, 240, 320, 360, 480, 640, 800, 960];

// Format preference order (AVIF > WebP > JPEG)
const FORMATS = ['avif', 'webp', 'jpeg'] as const;

function selectOptimalWidth(requestedWidth: number): number {
  // Find the smallest width that's >= requested width
  const optimal = AVAILABLE_WIDTHS.find((w) => w >= requestedWidth);
  // If no width is large enough, use the largest available
  return optimal || AVAILABLE_WIDTHS[AVAILABLE_WIDTHS.length - 1]!;
}

function getImageBaseName(filename: string): string {
  // Remove file extension to get base name
  return filename.replace(/\.[^.]+$/, '');
}

const formatSupportCache = new Map<string, boolean>();

function supportsFormat(format: string): boolean {
  if (formatSupportCache.has(format)) return formatSupportCache.get(format)!;
  if (typeof window === 'undefined') return false;

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;

  let supported: boolean;
  switch (format) {
    case 'avif':
      supported = canvas.toDataURL('image/avif').startsWith('data:image/avif');
      break;
    case 'webp':
      supported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
      break;
    default:
      supported = true; // JPEG is universally supported
  }
  formatSupportCache.set(format, supported);
  return supported;
}

// Cache the best supported format so the loop only runs once per page load
let cachedBestFormat: string | null = null;

function getBestFormat(): string {
  if (cachedBestFormat !== null) return cachedBestFormat;
  if (typeof window === 'undefined') return 'webp'; // SSR default
  for (const format of FORMATS) {
    if (supportsFormat(format)) {
      cachedBestFormat = format;
      return format;
    }
  }
  cachedBestFormat = 'jpeg';
  return cachedBestFormat;
}

export default function r2ImageLoader({
  src,
  width,
}: ImageLoaderProps): string {
  const baseName = getImageBaseName(src);
  const optimalWidth = selectOptimalWidth(width);
  const format = getBestFormat();
  const baseUrl = process.env.NEXT_PUBLIC_R2_URL ?? '';
  return `${baseUrl}/variants/${format}/${optimalWidth}/${baseName}.${format}`;
}
