import { Manifest } from 'types';

const AVAILABLE_WIDTHS = [160, 240, 320, 480, 640, 800, 960] as const;
type FORMATS = 'avif' | 'webp' | 'jpeg';

function getImageBaseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function r2VariantUrl(filename: string, width: number, format: FORMATS) {
  const base = getImageBaseName(filename);
  return `https://r2.photography.mislavjc.com/variants/${format}/${width}/${base}.${format}`;
}

function buildSrcSet(filename: string, format: FORMATS) {
  return AVAILABLE_WIDTHS.map(
    (w) => `${r2VariantUrl(filename, w, format)} ${w}w`,
  ).join(', ');
}

// sizes tuned for 2 columns on mobile
const DEFAULT_SIZES =
  '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px';

function Picture({
  filename,
  alt,
  loading = 'lazy',
  className = '',
}: {
  filename: string;
  alt: string;
  loading?: 'lazy' | 'eager';
  className?: string;
}) {
  return (
    <picture className={className}>
      <source
        type="image/avif"
        srcSet={buildSrcSet(filename, 'avif')}
        sizes={DEFAULT_SIZES}
      />
      <source
        type="image/webp"
        srcSet={buildSrcSet(filename, 'webp')}
        sizes={DEFAULT_SIZES}
      />
      <img
        src={r2VariantUrl(filename, 320, 'jpeg')}
        srcSet={buildSrcSet(filename, 'jpeg')}
        sizes={DEFAULT_SIZES}
        alt={alt}
        loading={loading}
        className="w-full h-full object-cover block"
      />
    </picture>
  );
}

export const GridComponent = ({ manifest }: { manifest: Manifest }) => {
  const entries = Object.entries(manifest);

  return (
    <>
      <div className="max-w-7xl">
        {/* Tailwind Masonry: 2 columns on mobile, scale up on larger screens */}
        <div className="columns-2 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 p-4">
          {entries.map(([filename, metadata]) => (
            <article
              key={filename}
              className="mb-4 break-inside-avoid cursor-zoom-in"
            >
              <div
                className="relative w-full bg-gray-50"
                style={{ aspectRatio: `${metadata.w} / ${metadata.h}` }}
              >
                <Picture
                  filename={filename}
                  alt={filename}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
};
