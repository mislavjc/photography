// components/picture.tsx
'use client';
import React, { useState } from 'react';

type Formats = 'avif' | 'webp' | 'jpeg';
type Profile = 'grid' | 'large';
type Mode = 'intrinsic' | 'fill';
type Fit = 'contain' | 'cover' | 'none' | 'scale-down' | 'fill';

const GRID_WIDTHS = [160, 240, 320, 480, 640, 800, 960] as const;
const LARGE_WIDTHS = [
  256, 384, 512, 768, 1024, 1280, 1536, 1920, 2560,
] as const;

function r2VariantUrl(
  uuidWithExt: string,
  profile: Profile,
  width: number,
  format: Formats,
) {
  const base = uuidWithExt.replace(/\.[^.]+$/, '');
  return `https://r2.photography.mislavjc.com/variants/${profile}/${format}/${width}/${base}.${format}`;
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

interface PictureProps {
  uuidWithExt: string;
  alt: string;
  profile: Profile;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  sizes?: string;
  intrinsicWidth: number;
  intrinsicHeight: number;

  /** Class on the WRAPPER (not <picture>) */
  pictureClassName?: string;
  /** Applied to <img> only */
  imgClassName?: string;
  imgStyle?: React.CSSProperties;

  /** Dominant color hex for background */
  dominantColor?: string;

  /** Layout behavior */
  mode?: Mode;
  fit?: Fit;
}

export function Picture({
  uuidWithExt,
  alt,
  profile,
  loading = 'lazy',
  fetchPriority = 'auto',
  sizes,
  intrinsicWidth,
  intrinsicHeight,
  pictureClassName = '',
  imgClassName = '',
  imgStyle,
  dominantColor,
  mode = 'intrinsic',
  fit = 'contain',
}: PictureProps) {
  // Priority images should be visible immediately for LCP - no fade-in
  const isPriority = fetchPriority === 'high';
  const [isLoaded, setIsLoaded] = useState(isPriority);

  const widths = profile === 'grid' ? GRID_WIDTHS : LARGE_WIDTHS;
  const defaultSizes =
    profile === 'grid'
      ? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px'
      : '(max-width: 1024px) calc(100vw - 2rem), 100vw';

  // Background color logic
  const backgroundColor = isLoaded
    ? 'transparent'
    : dominantColor || 'transparent';

  // Image styles based on mode
  const intrinsicImgStyles: React.CSSProperties = {
    ...(mode === 'intrinsic'
      ? {
          display: 'block',
          width: 'auto', // natural width
          height: 'auto', // preserve aspect ratio
          maxWidth: '100%', // shrink to fit parent width if needed
          maxHeight: '100%', // shrink to fit parent height if needed
          aspectRatio: `${intrinsicWidth} / ${intrinsicHeight}`,
        }
      : {
          width: '100%',
          height: '100%', // fill wrapper (wrapper must define height)
          objectFit: fit,
        }),
    ...imgStyle,
  };

  // Wrapper styles to match img sizing in intrinsic mode
  const wrapperStyles: React.CSSProperties = {
    backgroundColor,
    ...(mode === 'intrinsic' && {
      display: 'inline-block', // shrink to content width
      width: 'auto',
      maxWidth: '100%',
    }),
  };

  // Strip height classes that conflict with intrinsic mode
  const shouldStripHeightClasses = mode === 'intrinsic';
  const safeImgClass = shouldStripHeightClasses
    ? imgClassName
        .split(' ')
        .filter((c) => c && !/^h-(full|screen|\[.*\])$/.test(c))
        .join(' ')
    : imgClassName;

  return (
    <div className={pictureClassName} style={wrapperStyles}>
      <picture>
        <source
          type="image/avif"
          srcSet={buildSrcSet(uuidWithExt, profile, 'avif', widths)}
          sizes={sizes || defaultSizes}
        />
        <source
          type="image/webp"
          srcSet={buildSrcSet(uuidWithExt, profile, 'webp', widths)}
          sizes={sizes || defaultSizes}
        />
        <img
          width={intrinsicWidth}
          height={intrinsicHeight}
          src={r2VariantUrl(uuidWithExt, profile, 320, 'jpeg')}
          srcSet={buildSrcSet(uuidWithExt, profile, 'jpeg', widths)}
          sizes={sizes || defaultSizes}
          alt={alt}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding={isPriority ? 'sync' : 'async'}
          draggable={false}
          className={`${isPriority ? '' : 'transition-opacity duration-300'} ${isLoaded ? 'opacity-100' : 'opacity-0'} ${safeImgClass}`}
          style={intrinsicImgStyles}
          onLoad={isPriority ? undefined : () => setIsLoaded(true)}
        />
      </picture>
    </div>
  );
}
