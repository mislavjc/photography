'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import type { Manifest } from 'types';

import { SEARCH_CATEGORIES } from 'lib/search-categories';

import {
  calculateTotalHeight,
  computeJustifiedRows,
  GAP,
  type JustifiedRow,
  TARGET_ROW_HEIGHT,
} from 'lib/timeline-layout';
import type {
  DayGroup,
  MonthGroup,
  TimelineData,
  YearGroup,
} from 'lib/timeline-utils';

import { Navbar } from './navbar';
import { TimelineDayRow } from './timeline-day-row';

// Virtualization settings
const VIRTUAL_MARGIN = 600; // px above/below viewport to render

// Type for SSR-precomputed items
interface SSRItem {
  type: 'year' | 'month' | 'day';
  key: string;
  top: number;
  height: number;
  yearKey: string;
  monthKey?: string;
  precomputedRows?: JustifiedRow[];
}

interface TimelineProps {
  data: TimelineData;
  manifest: Manifest;
  /** SSR-precomputed items for initial render (reduces CLS) */
  ssrItems?: SSRItem[];
  /** SSR-precomputed total height */
  ssrTotalHeight?: number;
  /** Filtered photo IDs from search */
  filteredIds?: Set<string> | null;
  /** Search handlers */
  onSearch?: (query: string) => void;
  onClearSearch?: () => void;
  isSearching?: boolean;
  searchResultCount?: number;
  searchQuery?: string;
}

// SSR-safe default width (reasonable desktop width minus typical sidebar)
const DEFAULT_CONTAINER_WIDTH = 1024;

export function Timeline({
  data,
  manifest,
  ssrItems,
  ssrTotalHeight,
  filteredIds,
  onSearch,
  onClearSearch,
  isSearching,
  searchResultCount,
  searchQuery,
}: TimelineProps) {
  const innerContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [innerWidth, setInnerWidth] = useState<number>(DEFAULT_CONTAINER_WIDTH);
  const [isMobile, setIsMobile] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Filter timeline data based on search results
  const filteredData = useMemo(() => {
    if (!filteredIds || filteredIds.size === 0) return data;

    const filteredYears: YearGroup[] = [];

    for (const year of data.years) {
      const filteredMonths: MonthGroup[] = [];

      for (const month of year.months) {
        const filteredDays: DayGroup[] = [];

        for (const day of month.days) {
          const filteredPhotos = day.photos.filter((photo) => {
            const id = photo.filename.replace(/\.[^.]+$/, '');
            return filteredIds.has(id);
          });

          if (filteredPhotos.length > 0) {
            filteredDays.push({ ...day, photos: filteredPhotos });
          }
        }

        if (filteredDays.length > 0) {
          filteredMonths.push({ ...month, days: filteredDays });
        }
      }

      if (filteredMonths.length > 0) {
        filteredYears.push({ ...year, months: filteredMonths });
      }
    }

    return { ...data, years: filteredYears };
  }, [data, filteredIds]);

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
      }
    };

    updateDimensions();
    setIsHydrated(true);
    window.addEventListener('resize', updateDimensions, { passive: true });
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Restore scroll position from sessionStorage
  useEffect(() => {
    const savedScroll = sessionStorage.getItem('timeline:scroll');
    if (savedScroll) {
      const scrollY = parseInt(savedScroll, 10);
      if (!isNaN(scrollY)) {
        window.scrollTo(0, scrollY);
      }
    }
  }, []);

  // Save scroll position to sessionStorage
  useEffect(() => {
    const saveScroll = () => {
      sessionStorage.setItem('timeline:scroll', String(window.scrollY));
    };

    // Save on visibility change and before unload
    document.addEventListener('visibilitychange', saveScroll);
    window.addEventListener('beforeunload', saveScroll);
    window.addEventListener('pagehide', saveScroll);

    return () => {
      document.removeEventListener('visibilitychange', saveScroll);
      window.removeEventListener('beforeunload', saveScroll);
      window.removeEventListener('pagehide', saveScroll);
    };
  }, []);

  // Handle scroll with RAF for smoother updates
  useEffect(() => {
    let rafId: number | null = null;
    let lastKnownScrollY = window.scrollY;

    const handleScroll = () => {
      lastKnownScrollY = window.scrollY;

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          setScrollTop(lastKnownScrollY);
          rafId = null;
        });
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  // Pre-calculate heights for all items to enable virtualization
  // Use SSR values initially to prevent CLS, then recalculate on client
  const isSearchActive = filteredIds && filteredIds.size > 0;

  const itemsWithPositions = useMemo(() => {
    // Before hydration, use SSR-precomputed values if available (but not when searching)
    if (!isHydrated && ssrItems && ssrTotalHeight && !isSearchActive) {
      // Merge SSR items with actual data references
      const items = ssrItems.map((ssrItem) => {
        let itemData: YearGroup | MonthGroup | DayGroup | undefined;

        if (ssrItem.type === 'year') {
          itemData = filteredData.years.find((y) => y.key === ssrItem.yearKey);
        } else if (ssrItem.type === 'month') {
          const year = filteredData.years.find(
            (y) => y.key === ssrItem.yearKey,
          );
          itemData = year?.months.find((m) => m.key === ssrItem.monthKey);
        } else if (ssrItem.type === 'day') {
          const year = filteredData.years.find(
            (y) => y.key === ssrItem.yearKey,
          );
          const month = year?.months.find((m) => m.key === ssrItem.monthKey);
          itemData = month?.days.find((d) => {
            const fullKey = `${ssrItem.yearKey}-${ssrItem.monthKey}-${d.key}`;
            return fullKey === ssrItem.key.replace('day-', '');
          });
        }

        return {
          ...ssrItem,
          data: itemData as YearGroup | MonthGroup | DayGroup,
        };
      });

      return { items, totalHeight: ssrTotalHeight };
    }

    // After hydration (or when searching), calculate based on actual container width
    const items: Array<{
      type: 'year' | 'month' | 'day';
      key: string;
      top: number;
      height: number;
      data: YearGroup | MonthGroup | DayGroup;
      yearKey: string;
      monthKey?: string;
      precomputedRows?: JustifiedRow[];
    }> = [];

    let currentTop = 0;
    const YEAR_HEADER_HEIGHT = 80;
    const MONTH_HEADER_HEIGHT = 56;
    const DAY_ROW_PADDING = 24; // vertical padding for day rows
    const MOBILE_DATE_HEIGHT = isMobile ? 32 : 0; // extra height for stacked date label + padding (pt-3 + pb-1.5 + text) on mobile

    for (const year of filteredData.years) {
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
            precomputedRows: rows,
          });
          currentTop += dayHeight;
        }
      }
    }

    return { items, totalHeight: currentTop };
  }, [
    filteredData,
    photoContainerWidth,
    isMobile,
    isHydrated,
    ssrItems,
    ssrTotalHeight,
    isSearchActive,
  ]);

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
    <div className="min-h-screen bg-white pt-14 pb-24 overflow-x-hidden">
      {/* Virtual scroll container */}
      <div
        ref={innerContainerRef}
        className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-12"
        style={{ height: itemsWithPositions.totalHeight }}
      >
        {visibleItems.map((item) => {
          if (item.type === 'year') {
            const yearData = item.data as YearGroup;
            return (
              <div
                key={item.key}
                className="absolute left-0 right-0 px-4 sm:px-6 lg:px-12"
                style={{ top: item.top, height: item.height }}
              >
                <div className="sticky top-14 z-20 bg-white/90 backdrop-blur-sm py-4 sm:py-6">
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
                <div className="sticky top-[88px] z-10 bg-white/90 backdrop-blur-sm py-2 sm:py-3">
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
                  precomputedRows={item.precomputedRows}
                />
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Empty state when search returns no results */}
      {searchResultCount === 0 && searchQuery && !isSearching && (
        <div className="fixed inset-0 z-[40] flex items-center justify-center bg-white pt-14 px-4">
          <div className="w-full max-w-4xl rounded-3xl bg-neutral-100 p-6 sm:p-10">
            <div className="mb-8 text-center">
              <h2 className="text-xl sm:text-2xl font-medium text-neutral-900">
                No results for "{searchQuery}"
              </h2>
              <p className="mt-2 text-sm text-neutral-500">
                Try searching for one of these categories instead
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
              {SEARCH_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSearch?.(cat.query)}
                  className="group flex flex-col overflow-hidden rounded-2xl bg-neutral-200/60 p-3 transition-all hover:bg-neutral-200 hover:ring-2 hover:ring-neutral-300"
                >
                  {/* Photo collage - 3 overlapping images */}
                  <div className="relative h-28 sm:h-32 mb-3">
                    {cat.previewIds.slice(0, 3).map((id, idx) => {
                      const imageUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/variants/grid/avif/480/${id}.avif`;
                      const rotation =
                        idx === 0
                          ? '-rotate-6'
                          : idx === 1
                            ? 'rotate-3'
                            : '-rotate-2';
                      const offset =
                        idx === 0
                          ? 'left-0 top-2'
                          : idx === 1
                            ? 'right-0 top-0'
                            : 'left-1/2 -translate-x-1/2 top-4';
                      const zIndex =
                        idx === 0 ? 'z-10' : idx === 1 ? 'z-20' : 'z-30';
                      const size =
                        idx === 2
                          ? 'w-20 h-20 sm:w-24 sm:h-24'
                          : 'w-16 h-16 sm:w-20 sm:h-20';
                      return (
                        <div
                          key={id}
                          className={`absolute ${offset} ${zIndex} ${rotation} ${size} overflow-hidden rounded-lg bg-white shadow-md transition-transform duration-300 group-hover:rotate-0`}
                        >
                          <img
                            src={imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <span className="text-sm font-medium text-neutral-700 text-center">
                    {cat.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Navbar with year selector and search */}
      <Navbar
        activePage="timeline"
        timelineProps={{
          years: data.allYears,
          currentYear,
          onJumpToYear: handleJumpToYear,
        }}
        onSearch={onSearch}
        onClearSearch={onClearSearch}
        isSearching={isSearching}
        searchResultCount={searchResultCount}
        searchQuery={searchQuery}
      />

      {/* Scroll to top button */}
      {scrollTop > 500 && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-20 right-4 md:bottom-6 z-[60] flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition-colors hover:bg-neutral-200"
          aria-label="Scroll to top"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
