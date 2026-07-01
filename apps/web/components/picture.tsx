import React, { memo } from 'react';

import { EXT_RE } from 'lib/constants';
import { env } from 'lib/env';
import { thumbhashToDataURL } from 'lib/thumbhash';

type Formats = 'avif' | 'webp' | 'jpeg';
type Profile = 'grid' | 'large';
type Fit = 'contain' | 'cover' | 'none' | 'scale-down' | 'fill';

// NOTE: omits the 360 variant on purpose — the LCP <link rel=preload> tags in
// app/page.tsx and app/timeline/page.tsx assume the browser picks 480 here
const GRID_WIDTHS = [160, 240, 320, 480, 640, 800, 960] as const;
const LARGE_WIDTHS = [
  256, 384, 512, 768, 1024, 1280, 1536, 1920, 2560,
] as const;

const R2_URL = env.NEXT_PUBLIC_R2_URL;

function r2VariantUrl(
  uuidWithExt: string,
  profile: Profile,
  width: number,
  format: Formats,
) {
  const base = uuidWithExt.replace(EXT_RE, '');
  return `${R2_URL}/variants/${profile}/${format}/${width}/${base}.${format}`;
}
function buildSrcSet(
  uuidWithExt: string,
  profile: Profile,
  format: Formats,
  widths: readonly number[],
) {
  return widths
    .map((w) => `${r2VariantUrl(uuidWithExt, profile, w, format)} ${w}w`)
    .join(', ');
}

/** The manifest fields Picture derives placeholder + dimension data from */
export interface PlaceholderEntry {
  thumbhash?: string;
  w?: number;
  h?: number;
  exif?: { dominantColors?: Array<{ hex: string }> | null } | null;
}

interface PictureProps {
  uuidWithExt: string;
  alt: string;
  profile: Profile;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  sizes?: string;

  /** Manifest entry; thumbhash, placeholder color, and dimensions derive from it */
  entry?: PlaceholderEntry;
  /** Fallbacks for when `entry` (or the matching field on it) is absent */
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  dominantColor?: string;
  thumbhash?: string;

  /** Class on the WRAPPER (not <picture>). The wrapper paints the placeholder,
   *  so it must be sized by the parent (e.g. "block w-full h-full"). */
  pictureClassName?: string;
  /** Applied to <img> only; sizing comes from inline styles */
  imgClassName?: string;
  imgStyle?: React.CSSProperties;

  fit?: Fit;
}

export const Picture = memo(function Picture({
  uuidWithExt,
  alt,
  profile,
  loading = 'lazy',
  fetchPriority = 'auto',
  sizes,
  entry,
  intrinsicWidth,
  intrinsicHeight,
  dominantColor,
  thumbhash,
  pictureClassName = '',
  imgClassName = '',
  imgStyle,
  fit = 'contain',
}: PictureProps) {
  // Priority images should be visible immediately for LCP - no fade-in
  const isPriority = fetchPriority === 'high';
  // Eager (in-viewport) images paint immediately too: fading them from opacity 0
  // delays the contentful paint (and the LCP) for no benefit — the fade is only
  // worth it for lazy tiles that scroll into view later.
  const eager = loading === 'eager';

  const widths = profile === 'grid' ? GRID_WIDTHS : LARGE_WIDTHS;
  const defaultSizes =
    profile === 'grid'
      ? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px'
      : '(max-width: 1024px) calc(100vw - 2rem), 100vw';
  const effectiveSizes = sizes || defaultSizes;

  const width = entry?.w ?? intrinsicWidth;
  const height = entry?.h ?? intrinsicHeight;
  const hash = entry?.thumbhash ?? thumbhash;
  const bgColor = entry?.exif?.dominantColors?.[0]?.hex ?? dominantColor;

  // The wrapper paints the placeholder: dominant color, with the decoded
  // thumbhash layered on top; the image then fades in over it
  const placeholderUrl = thumbhashToDataURL(hash);
  const wrapperStyles: React.CSSProperties = {
    backgroundColor: bgColor || 'transparent',
    ...(placeholderUrl && {
      backgroundImage: `url(${placeholderUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }),
  };

  const imgStyles: React.CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%', // fill wrapper (wrapper must define height)
    objectFit: fit,
    ...imgStyle,
  };

  // Use CSS-only fade-in animation to avoid React state and re-renders.
  // Priority/eager images render immediately; only lazy ones fade in.
  const fadeInClass = isPriority || eager ? '' : 'animate-fade-in';

  return (
    <div className={pictureClassName} style={wrapperStyles}>
      <picture>
        <source
          type="image/avif"
          srcSet={buildSrcSet(uuidWithExt, profile, 'avif', widths)}
          sizes={effectiveSizes}
        />
        <source
          type="image/webp"
          srcSet={buildSrcSet(uuidWithExt, profile, 'webp', widths)}
          sizes={effectiveSizes}
        />
        <img
          width={width}
          height={height}
          src={r2VariantUrl(uuidWithExt, profile, 320, 'jpeg')}
          srcSet={buildSrcSet(uuidWithExt, profile, 'jpeg', widths)}
          sizes={effectiveSizes}
          alt={alt}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding={isPriority ? 'sync' : 'async'}
          draggable={false}
          className={`${fadeInClass} ${imgClassName}`}
          style={imgStyles}
        />
      </picture>
    </div>
  );
});
