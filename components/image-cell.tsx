'use client';

import React, { useEffect, useState } from 'react';

import { blurhashToDataURL, getBlurhashForSeed, imgUrl } from '../lib/tile';
import type { ImageCellProps } from '../types';

export const ImageCell = ({
  rect,
  tileLeft,
  tileTop,
  tileSize,
  viewport,
  onHover,
}: ImageCellProps) => {
  const absLeft = tileLeft + rect.x;
  const absTop = tileTop + rect.y;
  const absRight = absLeft + rect.w;
  const absBottom = absTop + rect.h;
  const isVisible = !(
    absRight < viewport.left ||
    absLeft > viewport.right ||
    absBottom < viewport.top ||
    absTop > viewport.bottom
  );

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const url1x = imgUrl(rect.seed, rect.w, rect.h);
  const url2x = imgUrl(
    rect.seed,
    Math.round(rect.w * 2),
    Math.round(rect.h * 2),
  );
  const url = dpr > 1.25 ? url2x : url1x;

  const [preview, setPreview] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const bh = getBlurhashForSeed(rect.seed);
    const build = async () => {
      if (bh) {
        const data = await blurhashToDataURL(
          bh,
          Math.max(16, Math.round(rect.w / 12)),
          Math.max(16, Math.round(rect.h / 12)),
        );
        if (!cancelled) setPreview(data);
        return;
      }

      const tiny = imgUrl(
        rect.seed,
        Math.max(16, Math.round(rect.w / 12)),
        Math.max(16, Math.round(rect.h / 12)),
      );
      if (!cancelled) setPreview(tiny);
    };
    build();
    return () => {
      cancelled = true;
    };
  }, [rect.seed, rect.w, rect.h]);

  if (!isVisible) {
    return (
      <div
        style={{
          position: 'absolute',
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
        }}
      />
    );
  }

  return (
    <div
      className="group absolute overflow-hidden"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onPointerEnter={() => onHover(url)}
      onPointerLeave={() => onHover(null)}
      draggable={false}
    >
      {preview && (
        <img
          src={preview}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${loaded ? 'opacity-0' : 'opacity-100'}`}
          style={{
            filter: 'blur(12px)',
            transform: 'scale(1.06)',
            transformOrigin: 'center',
          }}
          aria-hidden
          draggable={false}
        />
      )}
      <img
        src={url}
        alt=""
        className={`relative h-full w-full select-none object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        draggable={false}
        decoding="async"
        loading="eager"
        fetchPriority="low"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
};
