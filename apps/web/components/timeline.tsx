'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ChevronUp } from 'lucide-react';
import type { Manifest } from 'types';

import { EXT_RE } from 'lib/constants';
import {
  computeMasonryLayout,
  GAP,
  type MasonryColumn,
} from 'lib/timeline-layout';
import type {
  DayGroup,
  MonthGroup,
  TimelineData,
  YearGroup,
} from 'lib/timeline-utils';

import { Navbar } from './navbar';
import { SearchNoResults } from './search-no-results';
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
  precomputedMasonry?: MasonryColumn[];
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

// Stable references for useSyncExternalStore (hydration detection)
const emptySubscribe = () => () => {};
const returnTrue = () => true;
const returnFalse = () => false;

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
  const isHydrated = useSyncExternalStore(
    emptySubscribe,
    returnTrue,
    returnFalse,
  );
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
            const id = photo.filename.replace(EXT_RE, '');
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

  // Calculate the width available for photos (memoized)
  // Mobile: no sidebar (timeline line hidden, photos full width)
  // Desktop: timeline 1px + gap-6 (24px) + date w-20 (80px) + gap-6 (24px) = 129px
  const sidebarWidth = isMobile ? 0 : 129;
  const photoContainerWidth = useMemo(
    () => Math.max(150, (innerWidth ?? 800) - sidebarWidth),
    [innerWidth, sidebarWidth],
  );

  // Update viewport dimensions on resize (uses ResizeObserver for container width)
  useEffect(() => {
    let lastIsMobile = window.innerWidth < 640;

    const updateViewport = () => {
      setViewportHeight(window.innerHeight);
      // Only update isMobile when crossing threshold
      const nowMobile = window.innerWidth < 640;
      if (nowMobile !== lastIsMobile) {
        lastIsMobile = nowMobile;
        setIsMobile(nowMobile);
      }
    };

    updateViewport();
    window.addEventListener('resize', updateViewport, { passive: true });
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Use ResizeObserver for container width (avoids expensive getComputedStyle)
  useEffect(() => {
    const container = innerContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // contentRect is more widely supported and gives us content width
        setInnerWidth(entry.contentRect.width);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
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
  // Split into smaller memos for better cache invalidation
  const isSearchActive = filteredIds && filteredIds.size > 0;

  // Determine if we should use SSR items (before hydration, not searching)
  const useSSRItems =
    !isHydrated && ssrItems && ssrTotalHeight && !isSearchActive;

  // Compute layout items from filtered data (only when not using SSR items)
  const computedItems = useMemo(() => {
    if (useSSRItems) return null; // Skip computation when using SSR items

    const items: Array<{
      type: 'year' | 'month' | 'day';
      key: string;
      top: number;
      height: number;
      data: YearGroup | MonthGroup | DayGroup;
      yearKey: string;
      monthKey?: string;
      precomputedMasonry?: MasonryColumn[];
    }> = [];

    let currentTop = 0;
    const YEAR_HEADER_HEIGHT = 80;
    const MONTH_HEADER_HEIGHT = 56;
    const DAY_ROW_PADDING = 24;
    const MOBILE_DATE_HEIGHT = isMobile ? 36 : 0;

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
          const masonry = computeMasonryLayout(day.photos, photoContainerWidth);
          const dayHeight = Math.max(
            48,
            masonry.height + DAY_ROW_PADDING + MOBILE_DATE_HEIGHT,
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
            precomputedMasonry: masonry.columns,
          });
          currentTop += dayHeight;
        }
      }
    }

    return { items, totalHeight: currentTop };
  }, [filteredData, photoContainerWidth, isMobile, useSSRItems]);

  // Merge SSR items with data references (only when using SSR items)
  const ssrMergedItems = useMemo(() => {
    if (!useSSRItems || !ssrItems || !ssrTotalHeight) return null;

    // Build lookup maps for O(1) access instead of repeated .find()
    const yearMap = new Map<string, YearGroup>();
    const monthMap = new Map<string, MonthGroup>();
    const dayMap = new Map<string, DayGroup>();
    for (const year of filteredData.years) {
      yearMap.set(year.key, year);
      for (const month of year.months) {
        monthMap.set(`${year.key}-${month.key}`, month);
        for (const day of month.days) {
          dayMap.set(`${year.key}-${month.key}-${day.key}`, day);
        }
      }
    }

    const items = ssrItems.map((ssrItem) => {
      let itemData: YearGroup | MonthGroup | DayGroup | undefined;

      if (ssrItem.type === 'year') {
        itemData = yearMap.get(ssrItem.yearKey);
      } else if (ssrItem.type === 'month') {
        itemData = monthMap.get(`${ssrItem.yearKey}-${ssrItem.monthKey}`);
      } else if (ssrItem.type === 'day') {
        const dayKey = ssrItem.key.replace('day-', '');
        itemData = dayMap.get(dayKey);
      }

      return {
        ...ssrItem,
        data: itemData as YearGroup | MonthGroup | DayGroup,
      };
    });

    return { items, totalHeight: ssrTotalHeight };
  }, [useSSRItems, ssrItems, ssrTotalHeight, filteredData]);

  // Final items - either SSR merged or computed
  const itemsWithPositions = ssrMergedItems ??
    computedItems ?? { items: [], totalHeight: 0 };

  // Find visible items using binary search (items are ordered by top)
  const visibleItems = useMemo(() => {
    const viewTop = scrollTop - VIRTUAL_MARGIN;
    const viewBottom = scrollTop + viewportHeight + VIRTUAL_MARGIN;
    const items = itemsWithPositions.items;

    // Binary search: first item whose bottom edge is below viewTop
    let lo = 0,
      hi = items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (items[mid].top + items[mid].height <= viewTop) lo = mid + 1;
      else hi = mid;
    }

    const out = [];
    for (let i = lo; i < items.length; i++) {
      if (items[i].top >= viewBottom) break;
      out.push(items[i]);
    }
    return out;
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
    <div className="min-h-screen bg-white dark:bg-neutral-900 pt-14 pb-24 overflow-x-hidden">
      {/* Virtual scroll container */}
      <div
        ref={innerContainerRef}
        className="relative mx-auto max-w-6xl px-2 sm:px-6 lg:px-12"
        style={{ height: itemsWithPositions.totalHeight }}
      >
        {visibleItems.map((item) => {
          if (item.type === 'year') {
            const yearData = item.data as YearGroup;
            return (
              <div
                key={item.key}
                className="absolute left-0 right-0 px-2 sm:px-6 lg:px-12"
                style={{ top: item.top, height: item.height }}
              >
                <div className="sticky top-14 z-20 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm py-4 sm:py-6">
                  <h2 className="font-mono text-xl sm:text-2xl font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight">
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
                className="absolute left-0 right-0 px-2 sm:px-6 lg:px-12"
                style={{ top: item.top, height: item.height }}
              >
                <div className="sticky top-[88px] z-10 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm py-2 sm:py-3">
                  <h3 className="font-mono text-xs sm:text-sm uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
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
                className="absolute left-0 right-0 px-2 sm:px-6 lg:px-12 sm:py-3"
                style={{ top: item.top, height: item.height }}
              >
                <TimelineDayRow
                  day={dayData}
                  manifest={manifest}
                  containerWidth={photoContainerWidth}
                  precomputedMasonry={item.precomputedMasonry}
                  searchQuery={searchQuery}
                />
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Empty state when search returns no results */}
      {searchResultCount === 0 && searchQuery && !isSearching && (
        <SearchNoResults searchQuery={searchQuery} onSearch={onSearch} />
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
          className="fixed bottom-20 right-4 md:bottom-6 z-[60] flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700"
          aria-label="Scroll to top"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
