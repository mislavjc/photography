'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Manifest } from 'types';

import { Picture } from 'components/picture';

import {
  computeMasonryLayout,
  GAP,
  type MasonryColumn,
} from 'lib/timeline-layout';
import type { DayGroup } from 'lib/timeline-utils';

// A plain photo tile is a navigation, so it's a <Link> (like the canvas grid).
// `from=timeline` lets the photo page's back button return here.
function photoHref(filename: string, searchQuery?: string) {
  const params = new URLSearchParams({ from: 'timeline' });
  if (searchQuery) params.set('q', searchQuery);
  return `/photo/${encodeURIComponent(filename)}?${params.toString()}`;
}

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
                    const href = photoHref(photo.filename, searchQuery);

                    return (
                      <Link
                        href={href}
                        key={photo.filename}
                        // Opt out of the per-tile modal prefetch flurry; warm only
                        // the hovered tile (see finite-grid for the rationale).
                        prefetch={false}
                        className="block cursor-pointer overflow-hidden hover:opacity-80 transition-opacity shrink-0"
                        style={{
                          width: photo.width,
                          height: photo.height,
                        }}
                        onPointerEnter={() => router.prefetch(href)}
                        data-filename={photo.filename}
                      >
                        <Picture
                          uuidWithExt={photo.filename}
                          alt={photo.filename}
                          profile="grid"
                          entry={meta}
                          intrinsicWidth={photo.originalW}
                          intrinsicHeight={photo.originalH}
                          pictureClassName="block w-full h-full"
                          sizes={`${photo.width}px`}
                          loading="lazy"
                          fit="cover"
                        />
                      </Link>
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
