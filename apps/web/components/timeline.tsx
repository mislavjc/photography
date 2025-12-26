'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Manifest } from 'types';

import {
  calculateTotalHeight,
  computeJustifiedRows,
  GAP,
  TARGET_ROW_HEIGHT,
} from 'lib/timeline-layout';
import type {
  DayGroup,
  MonthGroup,
  TimelineData,
  YearGroup,
} from 'lib/timeline-utils';

import { TimelineDayRow } from './timeline-day-row';

// Lazy load the dock
const TimelineDock = lazy(() =>
  import('./timeline-dock').then((m) => ({ default: m.TimelineDock })),
);

// Virtualization settings
const VIRTUAL_MARGIN = 600; // px above/below viewport to render

interface TimelineProps {
  data: TimelineData;
  manifest: Manifest;
}

export function Timeline({ data, manifest }: TimelineProps) {
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [innerWidth, setInnerWidth] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Calculate the width available for photos
  // Mobile: timeline 1px + gap-3 (12px) + safety buffer (16px) = 29px (date stacks above, padding handled by container px-4)
  // Desktop: timeline 1px + gap-6 (24px) + date w-20 (80px) + gap-6 (24px) = 129px
  const sidebarWidth = isMobile ? 1 + 12 + 16 : 1 + 24 + 80 + 24;
  const photoContainerWidth = Math.max(150, (innerWidth ?? 800) - sidebarWidth);

  // Update dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      setViewportHeight(window.innerHeight);
      // sm breakpoint is 640px
      setIsMobile(window.innerWidth < 640);
      if (innerContainerRef.current) {
        // Measure the inner container (after padding is applied)
        const style = getComputedStyle(innerContainerRef.current);
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const paddingRight = parseFloat(style.paddingRight) || 0;
        const contentWidth =
          innerContainerRef.current.clientWidth - paddingLeft - paddingRight;
        setInnerWidth(contentWidth);
        setIsReady(true);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions, { passive: true });
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Handle scroll
  useEffect(() => {
    const handleScroll = () => {
      setScrollTop(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Pre-calculate heights for all items to enable virtualization
  const itemsWithPositions = useMemo(() => {
    const items: Array<{
      type: 'year' | 'month' | 'day';
      key: string;
      top: number;
      height: number;
      data: YearGroup | MonthGroup | DayGroup;
      yearKey: string;
      monthKey?: string;
    }> = [];

    let currentTop = 0;
    const YEAR_HEADER_HEIGHT = 80;
    const MONTH_HEADER_HEIGHT = 56;
    const DAY_ROW_PADDING = 24; // vertical padding for day rows
    const MOBILE_DATE_HEIGHT = isMobile ? 32 : 0; // extra height for stacked date label + padding (pt-3 + pb-1.5 + text) on mobile

    for (const year of data.years) {
      items.push({
        type: 'year',
        key: `year-${year.key}`,
        top: currentTop,
        height: YEAR_HEADER_HEIGHT,
        data: year,
        yearKey: year.key,
      });
      currentTop += YEAR_HEADER_HEIGHT;

      for (const month of year.months) {
        const monthUniqueKey = `${year.key}-${month.key}`;
        items.push({
          type: 'month',
          key: `month-${monthUniqueKey}`,
          top: currentTop,
          height: MONTH_HEADER_HEIGHT,
          data: month,
          yearKey: year.key,
          monthKey: month.key,
        });
        currentTop += MONTH_HEADER_HEIGHT;

        for (const day of month.days) {
          // Calculate day row height based on photos
          const rows = computeJustifiedRows(
            day.photos,
            photoContainerWidth,
            TARGET_ROW_HEIGHT,
            GAP,
          );
          const photosHeight = calculateTotalHeight(rows, GAP);
          const dayHeight = Math.max(
            48,
            photosHeight + DAY_ROW_PADDING + MOBILE_DATE_HEIGHT,
          );

          const dayUniqueKey = `${year.key}-${month.key}-${day.key}`;
          items.push({
            type: 'day',
            key: `day-${dayUniqueKey}`,
            top: currentTop,
            height: dayHeight,
            data: day,
            yearKey: year.key,
            monthKey: month.key,
          });
          currentTop += dayHeight;
        }
      }
    }

    return { items, totalHeight: currentTop };
  }, [data, photoContainerWidth, isMobile]);

  // Find visible items
  const visibleItems = useMemo(() => {
    const viewTop = scrollTop - VIRTUAL_MARGIN;
    const viewBottom = scrollTop + viewportHeight + VIRTUAL_MARGIN;

    return itemsWithPositions.items.filter(
      (item) => item.top + item.height > viewTop && item.top < viewBottom,
    );
  }, [itemsWithPositions.items, scrollTop, viewportHeight]);

  // Track current year for dock display (derived from visible items)
  const currentYear = useMemo(() => {
    // Find the first visible year header, or find year from visible items
    const firstYearItem = visibleItems.find((item) => item.type === 'year');
    if (firstYearItem?.data) {
      const yearData = firstYearItem.data as YearGroup;
      return yearData.year;
    }
    // Fallback: get year from first visible item's yearKey
    const firstItem = visibleItems[0];
    if (firstItem?.yearKey && firstItem.yearKey !== 'unknown') {
      return parseInt(firstItem.yearKey, 10);
    }
    return null;
  }, [visibleItems]);

  // Jump to year handler
  const handleJumpToYear = useCallback(
    (year: number | null) => {
      if (year === null) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const yearItem = itemsWithPositions.items.find(
        (item) => item.type === 'year' && item.yearKey === String(year),
      );
      if (yearItem) {
        window.scrollTo({ top: yearItem.top, behavior: 'smooth' });
      }
    },
    [itemsWithPositions.items],
  );

  return (
    <div className="min-h-screen bg-white pb-24 overflow-x-hidden">
      {/* Virtual scroll container */}
      <div
        ref={innerContainerRef}
        className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-12"
        style={{ height: isReady ? itemsWithPositions.totalHeight : 'auto' }}
      >
        {isReady &&
          visibleItems.map((item) => {
            if (item.type === 'year') {
              const yearData = item.data as YearGroup;
              return (
                <div
                  key={item.key}
                  className="absolute left-0 right-0 px-4 sm:px-6 lg:px-12"
                  style={{ top: item.top, height: item.height }}
                >
                  <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm py-4 sm:py-6">
                    <h2 className="font-mono text-xl sm:text-2xl font-semibold text-neutral-900 tracking-tight">
                      {yearData.label}
                    </h2>
                  </div>
                </div>
              );
            }

            if (item.type === 'month') {
              const monthData = item.data as MonthGroup;
              return (
                <div
                  key={item.key}
                  className="absolute left-0 right-0 px-4 sm:px-6 lg:px-12"
                  style={{ top: item.top, height: item.height }}
                >
                  <div className="sticky top-12 sm:top-14 z-10 bg-white/90 backdrop-blur-sm py-2 sm:py-3">
                    <h3 className="font-mono text-xs sm:text-sm uppercase tracking-[0.14em] text-neutral-500">
                      {monthData.label}
                    </h3>
                  </div>
                </div>
              );
            }

            if (item.type === 'day') {
              const dayData = item.data as DayGroup;
              return (
                <div
                  key={item.key}
                  className="absolute left-0 right-0 px-4 sm:px-6 lg:px-12 sm:py-3"
                  style={{ top: item.top, height: item.height }}
                >
                  <TimelineDayRow
                    day={dayData}
                    manifest={manifest}
                    containerWidth={photoContainerWidth}
                  />
                </div>
              );
            }

            return null;
          })}
      </div>

      {/* Dock */}
      <Suspense fallback={null}>
        <TimelineDock
          years={data.allYears}
          currentYear={currentYear}
          onJumpToYear={handleJumpToYear}
        />
      </Suspense>
    </div>
  );
}
