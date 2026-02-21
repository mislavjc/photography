'use client';

import { memo, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Manifest } from 'types';

import { Picture } from 'components/picture';

import {
  computeMasonryLayout,
  GAP,
  type MasonryColumn,
} from 'lib/timeline-layout';
import type { DayGroup } from 'lib/timeline-utils';

interface TimelineDayRowProps {
  day: DayGroup;
  manifest: Manifest;
  containerWidth: number;
  precomputedMasonry?: MasonryColumn[];
  searchQuery?: string;
}

export const TimelineDayRow = memo(function TimelineDayRow({
  day,
  manifest,
  containerWidth,
  precomputedMasonry,
  searchQuery,
}: TimelineDayRowProps) {
  const router = useRouter();

  const columns = useMemo(() => {
    if (precomputedMasonry) return precomputedMasonry;
    return computeMasonryLayout(day.photos, containerWidth).columns;
  }, [day.photos, containerWidth, precomputedMasonry]);

  const handlePhotoClick = useCallback(
    (filename: string) => {
      const params = new URLSearchParams();
      params.set('from', 'timeline');
      if (searchQuery) {
        params.set('q', searchQuery);
      }
      router.push(
        `/photo/${encodeURIComponent(filename)}?${params.toString()}`,
      );
    },
    [router, searchQuery],
  );

  return (
    <div className="sm:flex sm:gap-6">
      {/* Timeline line - desktop only */}
      <div className="hidden sm:block relative shrink-0 w-px bg-neutral-200 dark:bg-neutral-800 self-stretch" />

      <div className="sm:flex-1 min-w-0">
        {/* Date label - mobile only (above photos) */}
        <div className="py-2.5 sm:hidden">
          <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
            {day.label}
          </span>
        </div>

        <div className="sm:flex sm:items-start sm:gap-6">
          {/* Date column - desktop only */}
          <div className="hidden sm:block w-20 shrink-0 pt-1">
            <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
              {day.label}
            </span>
          </div>

          {/* Photos: masonry grid */}
          <div className="sm:flex-1 min-w-0 overflow-hidden">
            <div className="flex" style={{ gap: GAP }}>
              {columns.map((col, colIdx) => (
                <div
                  key={colIdx}
                  className="flex flex-col flex-1"
                  style={{ gap: GAP }}
                >
                  {col.photos.map((photo) => {
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
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
