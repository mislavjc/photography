'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Manifest } from 'types';

import { Picture } from 'components/picture';

import {
  computeJustifiedRows,
  GAP,
  TARGET_ROW_HEIGHT,
} from 'lib/timeline-layout';
import type { DayGroup } from 'lib/timeline-utils';

interface TimelineDayRowProps {
  day: DayGroup;
  manifest: Manifest;
  containerWidth: number;
}

export function TimelineDayRow({
  day,
  manifest,
  containerWidth,
}: TimelineDayRowProps) {
  const router = useRouter();

  const rows = useMemo(() => {
    return computeJustifiedRows(
      day.photos,
      containerWidth,
      TARGET_ROW_HEIGHT,
      GAP,
    );
  }, [day.photos, containerWidth]);

  const handlePhotoClick = (filename: string) => {
    router.push(`/${encodeURIComponent(filename)}`);
  };

  return (
    <div className="flex gap-3 sm:gap-6">
      {/* Timeline line - always visible on left */}
      <div className="relative shrink-0 w-px bg-neutral-200 self-stretch" />

      {/* Content: date + photos */}
      <div className="flex-1 min-w-0">
        {/* Date label - mobile only */}
        <div className="pt-3 pb-1.5 sm:hidden">
          <span className="font-mono text-[11px] text-neutral-400">
            {day.label}
          </span>
        </div>

        {/* Desktop: date on left side */}
        <div className="hidden sm:flex sm:items-start sm:gap-6">
          <div className="w-20 shrink-0 pt-1">
            <span className="font-mono text-xs text-neutral-500">
              {day.label}
            </span>
          </div>

          {/* Photos grid - desktop */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col" style={{ gap: GAP }}>
              {rows.map((row, rowIndex) => {
                const rowKey = `${rowIndex}-${row.photos[0]?.filename ?? 'empty'}`;
                return (
                  <div
                    key={rowKey}
                    className="flex"
                    style={{ gap: GAP, height: row.height }}
                  >
                    {row.photos.map((photo) => {
                      const meta = manifest[photo.filename];
                      const dominantColor =
                        meta?.exif?.dominantColors?.[0]?.hex;

                      return (
                        <button
                          type="button"
                          key={photo.filename}
                          className="cursor-pointer overflow-hidden hover:opacity-80 transition-opacity shrink-0"
                          style={{
                            width: photo.width,
                            height: photo.height,
                          }}
                          onClick={() => handlePhotoClick(photo.filename)}
                          data-filename={photo.filename}
                        >
                          <Picture
                            uuidWithExt={photo.filename}
                            alt={photo.filename}
                            profile="grid"
                            intrinsicWidth={photo.originalW}
                            intrinsicHeight={photo.originalH}
                            pictureClassName="block w-full h-full"
                            imgClassName="block w-full h-full object-cover"
                            sizes={`${photo.width}px`}
                            loading="lazy"
                            dominantColor={dominantColor}
                            mode="fill"
                            fit="cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Photos grid - mobile (full width) */}
        <div
          className="sm:hidden overflow-hidden"
          style={{ maxWidth: containerWidth }}
        >
          <div className="flex flex-col" style={{ gap: GAP }}>
            {rows.map((row, rowIndex) => {
              const rowKey = `mobile-${rowIndex}-${row.photos[0]?.filename ?? 'empty'}`;
              return (
                <div
                  key={rowKey}
                  className="flex"
                  style={{ gap: GAP, height: row.height }}
                >
                  {row.photos.map((photo) => {
                    const meta = manifest[photo.filename];
                    const dominantColor = meta?.exif?.dominantColors?.[0]?.hex;

                    return (
                      <button
                        type="button"
                        key={photo.filename}
                        className="cursor-pointer overflow-hidden hover:opacity-80 transition-opacity shrink-0"
                        style={{
                          width: photo.width,
                          height: photo.height,
                        }}
                        onClick={() => handlePhotoClick(photo.filename)}
                        data-filename={photo.filename}
                      >
                        <Picture
                          uuidWithExt={photo.filename}
                          alt={photo.filename}
                          profile="grid"
                          intrinsicWidth={photo.originalW}
                          intrinsicHeight={photo.originalH}
                          pictureClassName="block w-full h-full"
                          imgClassName="block w-full h-full object-cover"
                          sizes={`${photo.width}px`}
                          loading="lazy"
                          dominantColor={dominantColor}
                          mode="fill"
                          fit="cover"
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
