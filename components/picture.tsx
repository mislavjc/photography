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
  const base = uuidWithExt.replace(/\.[^.]+$/, ''); // strip ext
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
  uuidWithExt: string; // e.g. "1f5a2d2f-....jpg"
  alt: string;
  profile: Profile; // "grid" | "large"
  loading?: 'lazy' | 'eager';
  className?: string;
  sizes?: string; // override sizes attribute
}

export function Picture({
  uuidWithExt,
  alt,
  profile,
  loading = 'lazy',
  className = '',
  sizes,
}: PictureProps) {
  const widths = profile === 'grid' ? GRID_WIDTHS : LARGE_WIDTHS;

  // sensible defaults per profile
  const defaultSizes =
    profile === 'grid'
      ? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px'
      : '100vw';

  return (
    <picture className={className}>
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
        src={r2VariantUrl(uuidWithExt, profile, 320, 'jpeg')}
        srcSet={buildSrcSet(uuidWithExt, profile, 'jpeg', widths)}
        sizes={sizes || defaultSizes}
        alt={alt}
        loading={loading}
        draggable={false}
        className={className}
      />
    </picture>
  );
}
