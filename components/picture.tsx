// components/picture.tsx
'use client';
import React from 'react';

type Formats = 'avif' | 'webp' | 'jpeg';
type Profile = 'grid' | 'large';

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
  sizes?: string;

  /** Intrinsic photo dimensions (from manifest) to prevent CLS */
  intrinsicWidth: number;
  intrinsicHeight: number;

  /** Applied to <img> only */
  imgClassName?: string;
  /** Optional: class on <picture> */
  pictureClassName?: string;

  /** Optional inline style for <img> (e.g., objectPosition) */
  imgStyle?: React.CSSProperties;
}

export function Picture({
  uuidWithExt,
  alt,
  profile,
  loading = 'lazy',
  sizes,
  intrinsicWidth,
  intrinsicHeight,
  imgClassName = '',
  pictureClassName = '',
  imgStyle,
}: PictureProps) {
  const widths = profile === 'grid' ? GRID_WIDTHS : LARGE_WIDTHS;
  const defaultSizes =
    profile === 'grid'
      ? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px'
      : '(max-width: 1024px) calc(100vw - 2rem), 100vw';

  return (
    <picture className={pictureClassName}>
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
        draggable={false}
        className={imgClassName}
        style={imgStyle}
      />
    </picture>
  );
}
