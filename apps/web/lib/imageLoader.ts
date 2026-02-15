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
  return optimal || AVAILABLE_WIDTHS[AVAILABLE_WIDTHS.length - 1];
}

function getImageBaseName(filename: string): string {
  // Remove file extension to get base name
  return filename.replace(/\.[^.]+$/, '');
}

function supportsFormat(format: string): boolean {
  if (typeof window === 'undefined') return false;

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;

  switch (format) {
    case 'avif':
      return canvas.toDataURL('image/avif').startsWith('data:image/avif');
    case 'webp':
      return canvas.toDataURL('image/webp').startsWith('data:image/webp');
    default:
      return true; // JPEG is universally supported
  }
}

export default function r2ImageLoader({
  src,
  width,
}: ImageLoaderProps): string {
  // Extract filename from src (assuming src is just the filename like "DSCF1911.jpg")
  const filename = src;
  const baseName = getImageBaseName(filename);
  const optimalWidth = selectOptimalWidth(width);

  // Determine best format based on browser support
  let selectedFormat = 'jpeg';
  if (typeof window !== 'undefined') {
    for (const format of FORMATS) {
      if (supportsFormat(format)) {
        selectedFormat = format;
        break;
      }
    }
  } else {
    // Use WebP as default for SSR (good browser support, better than JPEG)
    selectedFormat = 'webp';
  }

  // Build R2 URL for variant
  // Pattern: https://r2.photos.mislavjc.com/variants/{format}/{width}/{baseName}.{format}
  const baseUrl = 'https://r2.photos.mislavjc.com';
  const variantPath = `variants/${selectedFormat}/${optimalWidth}/${baseName}.${selectedFormat}`;

  return `${baseUrl}/${variantPath}`;
}

// Fallback loader for SSR or when format detection fails
export function r2ImageLoaderSSR({ src, width }: ImageLoaderProps): string {
  const filename = src;
  const baseName = getImageBaseName(filename);
  const optimalWidth = selectOptimalWidth(width);

  // Use WebP as default for SSR (good browser support, better than JPEG)
  const baseUrl = 'https://r2.photos.mislavjc.com';
  const variantPath = `variants/webp/${optimalWidth}/${baseName}.webp`;

  return `${baseUrl}/${variantPath}`;
}
