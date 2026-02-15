import { cacheLife } from 'next/cache';
import { Suspense } from 'react';

import { TimelineSkeleton } from 'components/timeline-skeleton';
import { TimelineWrapper } from 'components/timeline-wrapper';

import { loadManifest } from 'lib/manifest-server';
import {
  computeMasonryLayout,
  GAP,
  type MasonryColumn,
} from 'lib/timeline-layout';
import { groupPhotosForTimeline, type TimelineData } from 'lib/timeline-utils';
import type { Manifest } from 'types';

// Precompute item heights for default desktop width to reduce CLS
const DEFAULT_CONTAINER_WIDTH = 900; // Approximate desktop photo container width
const YEAR_HEADER_HEIGHT = 80;
const MONTH_HEADER_HEIGHT = 56;
const DAY_ROW_PADDING = 24;

export interface PrecomputedItem {
  type: 'year' | 'month' | 'day';
  key: string;
  top: number;
  height: number;
  yearKey: string;
  monthKey?: string;
  precomputedMasonry?: MasonryColumn[];
}

// Precompute and trim data on the server
async function getTimelineData(): Promise<{
  timelineData: TimelineData;
  trimmedManifest: Manifest;
  lcpImages: string[];
  precomputedItems: PrecomputedItem[];
  totalHeight: number;
}> {
  'use cache';
  cacheLife('days');

  const manifest = await loadManifest();
  const timelineData = groupPhotosForTimeline(manifest);

  // Only send essential manifest data to client (dominant colors for placeholders)
  // We use type assertion since we only need a subset of fields for rendering
  const trimmedManifest: Manifest = {};
  for (const [key, value] of Object.entries(manifest)) {
    trimmedManifest[key] = {
      blurhash: value.blurhash,
      w: value.w,
      h: value.h,
      exif: {
        ...value.exif,
        // Only keep first dominant color to reduce payload
        dominantColors: value.exif?.dominantColors?.slice(0, 1),
      },
    };
  }

  // Precompute layout positions for SSR to reduce CLS
  const precomputedItems: PrecomputedItem[] = [];
  let currentTop = 0;

  for (const year of timelineData.years) {
    precomputedItems.push({
      type: 'year',
      key: `year-${year.key}`,
      top: currentTop,
      height: YEAR_HEADER_HEIGHT,
      yearKey: year.key,
    });
    currentTop += YEAR_HEADER_HEIGHT;

    for (const month of year.months) {
      const monthUniqueKey = `${year.key}-${month.key}`;
      precomputedItems.push({
        type: 'month',
        key: `month-${monthUniqueKey}`,
        top: currentTop,
        height: MONTH_HEADER_HEIGHT,
        yearKey: year.key,
        monthKey: month.key,
      });
      currentTop += MONTH_HEADER_HEIGHT;

      for (const day of month.days) {
        const masonry = computeMasonryLayout(
          day.photos,
          DEFAULT_CONTAINER_WIDTH,
        );
        const dayHeight = Math.max(48, masonry.height + DAY_ROW_PADDING);

        const dayUniqueKey = `${year.key}-${month.key}-${day.key}`;
        precomputedItems.push({
          type: 'day',
          key: `day-${dayUniqueKey}`,
          top: currentTop,
          height: dayHeight,
          yearKey: year.key,
          monthKey: month.key,
          precomputedMasonry: masonry.columns,
        });
        currentTop += dayHeight;
      }
    }
  }

  // Get first few photos for LCP preload (from first visible day)
  const lcpImages: string[] = [];
  const firstYear = timelineData.years[0];
  if (firstYear) {
    const firstMonth = firstYear.months[0];
    if (firstMonth) {
      const firstDay = firstMonth.days[0];
      if (firstDay) {
        // Get first 3 photos for preload
        lcpImages.push(...firstDay.photos.slice(0, 3).map((p) => p.filename));
      }
    }
  }

  return {
    timelineData,
    trimmedManifest,
    lcpImages,
    precomputedItems,
    totalHeight: currentTop,
  };
}

export default async function TimelinePage() {
  const {
    timelineData,
    trimmedManifest,
    lcpImages,
    precomputedItems,
    totalHeight,
  } = await getTimelineData();

  return (
    <main>
      {/* Preload LCP images */}
      {lcpImages.map((filename) => {
        const base = filename.replace(/\.[^.]+$/, '');
        return (
          <link
            key={filename}
            rel="preload"
            as="image"
            href={`https://r2.photos.mislavjc.com/variants/grid/avif/480/${base}.avif`}
            type="image/avif"
          />
        );
      })}
      <Suspense fallback={<TimelineSkeleton />}>
        <TimelineWrapper
          data={timelineData}
          manifest={trimmedManifest}
          ssrItems={precomputedItems}
          ssrTotalHeight={totalHeight}
        />
      </Suspense>
    </main>
  );
}
