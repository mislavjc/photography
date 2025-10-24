/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { blurhashToDataURL, getBlurhashForSeed, imgUrl } from '../lib/tile';
import type { ImageCellProps, ImageMetadata } from '../types';

const ImageCellComponent = ({
  rect,
  tileLeft,
  tileTop,
  viewport,
  onHover,
  manifest,
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

  // Memoize expensive calculations
  const { url } = useMemo(() => {
    const dpr =
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const url1x = imgUrl(rect.seed, rect.w, rect.h, rect.imageId);
    const url2x = imgUrl(
      rect.seed,
      Math.round(rect.w * 2),
      Math.round(rect.h * 2),
      rect.imageId,
    );
    const url = dpr > 1.25 ? url2x : url1x;
    return { url };
  }, [rect.seed, rect.w, rect.h, rect.imageId]);

  const [preview, setPreview] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Only load preview for visible images to reduce unnecessary work
    if (!isVisible) return;

    let cancelled = false;
    const bh = getBlurhashForSeed(rect.seed, rect.imageId, manifest);
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
        rect.imageId,
      );
      if (!cancelled) setPreview(tiny);
    };
    build();
    return () => {
      cancelled = true;
    };
  }, [rect.seed, rect.w, rect.h, rect.imageId, manifest, isVisible]);

  // Enhanced orientation and EXIF handling
  const actualRatio = rect.w / rect.h;
  const APSC_LANDSCAPE_RATIO = 23.5 / 15.7; // ≈ 1.497
  const APSC_PORTRAIT_RATIO = 15.7 / 23.5; // ≈ 0.668
  const RATIO_TOLERANCE = 0.01; // Allow small floating point differences

  // Determine expected orientation based on slot dimensions
  const slotIsLandscape = actualRatio > 1;
  const expectedRatio = slotIsLandscape
    ? APSC_LANDSCAPE_RATIO
    : APSC_PORTRAIT_RATIO;
  const hasCorrectAPSC =
    Math.abs(actualRatio - expectedRatio) <= RATIO_TOLERANCE;

  // Check image orientation vs slot orientation (if we have manifest data)
  let hasWrongOrientation = false;
  let orientationInfo = '';
  // exifRotation placeholder for future CSS transform use

  if (rect.imageId && manifest) {
    const imageData = manifest[rect.imageId];
    if (imageData) {
      // Check if image orientation matches slot orientation
      const imageIsPortrait = imageData.h > imageData.w;
      const orientationMatches = imageIsPortrait === !slotIsLandscape; // slotIsLandscape is false for portrait slots

      if (!orientationMatches) {
        hasWrongOrientation = true;
        orientationInfo = `${rect.imageId}: ${imageIsPortrait ? 'portrait' : 'landscape'} image in ${slotIsLandscape ? 'landscape' : 'portrait'} slot (${imageData.w}x${imageData.h})`;

        // Log orientation mismatch with additional debugging info
        const imageRatio = imageData.w / imageData.h;
        console.log(`📐 Orientation mismatch: ${orientationInfo}`);
        console.log(
          `   Image ratio: ${imageRatio.toFixed(3)}, Slot ratio: ${actualRatio.toFixed(3)}`,
        );
      }

      // Note: Browser should handle EXIF rotation automatically, but if issues persist,
      // we could add CSS transforms here based on EXIF data in the future
    }
  }

  // Show red border for either wrong ratio OR wrong orientation
  const needsRedBorder = !hasCorrectAPSC || hasWrongOrientation;

  // Create tooltip text for red border explanation
  const getTooltipText = () => {
    if (!needsRedBorder) return '';
    const issues = [];
    if (!hasCorrectAPSC) {
      issues.push(
        `Wrong APSC ratio (expected: ${expectedRatio.toFixed(3)}, got: ${actualRatio.toFixed(3)})`,
      );
    }
    if (hasWrongOrientation) {
      issues.push(orientationInfo);
    }
    return issues.join('\n');
  };

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
      className={`group absolute overflow-hidden ${needsRedBorder ? 'border-4 border-red-500' : ''}`}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        contain: 'layout style paint',
        willChange: 'transform',
        boxSizing: 'border-box',
      }}
      {...(onHover && {
        onPointerEnter: () => {
          if (rect.imageId && manifest) {
            const imageData = manifest[rect.imageId];
            if (imageData) {
              const isDevelopment = process.env.NODE_ENV === 'development';
              const metadata: ImageMetadata = {
                filename: rect.imageId,
                dimensions: { w: imageData.w, h: imageData.h },
                orientation:
                  imageData.h > imageData.w ? 'portrait' : 'landscape',
                url: url,
                exif: isDevelopment
                  ? imageData.exif || {
                      camera: null,
                      lens: null,
                      focalLength: null,
                      aperture: null,
                      shutterSpeed: null,
                      iso: null,
                      location: null,
                      dateTime: null,
                    }
                  : {
                      camera: null,
                      lens: null,
                      focalLength: null,
                      aperture: null,
                      shutterSpeed: null,
                      iso: null,
                      location: null,
                      dateTime: null,
                    },
              };
              onHover(metadata);
            }
          }
        },
        onPointerLeave: () => onHover(null),
      })}
      draggable={false}
      title={getTooltipText()}
    >
      {preview && (
        <>
          {preview.startsWith('data:') ? (
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
          ) : (
            <img
              src={preview}
              alt=""
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${loaded ? 'opacity-0' : 'opacity-100'}`}
              style={{
                filter: 'blur(12px)',
                transform: 'scale(1.06)',
                transformOrigin: 'center',
                objectFit: 'cover',
              }}
              aria-hidden
              draggable={false}
            />
          )}
        </>
      )}
      <img
        src={url}
        alt=""
        className={`relative h-full w-full select-none object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        draggable={false}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        style={{ objectFit: 'cover' }}
      />
    </div>
  );
};

// Memoize component with custom comparison for better performance
export const ImageCell = React.memo(
  ImageCellComponent,
  (prevProps, nextProps) => {
    // Only re-render if essential props change
    return (
      prevProps.rect.seed === nextProps.rect.seed &&
      prevProps.rect.x === nextProps.rect.x &&
      prevProps.rect.y === nextProps.rect.y &&
      prevProps.rect.w === nextProps.rect.w &&
      prevProps.rect.h === nextProps.rect.h &&
      prevProps.rect.imageId === nextProps.rect.imageId &&
      prevProps.tileLeft === nextProps.tileLeft &&
      prevProps.tileTop === nextProps.tileTop &&
      prevProps.tileSize === nextProps.tileSize &&
      prevProps.viewport.left === nextProps.viewport.left &&
      prevProps.viewport.top === nextProps.viewport.top &&
      prevProps.viewport.right === nextProps.viewport.right &&
      prevProps.viewport.bottom === nextProps.viewport.bottom &&
      prevProps.manifest === nextProps.manifest
    );
  },
);
