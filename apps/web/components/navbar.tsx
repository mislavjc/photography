'use client';

import React, { useMemo, useState } from 'react';
import { Calendar, Map as MapIcon, Search, Shuffle, X } from 'lucide-react';
import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  m,
  useReducedMotion,
} from 'motion/react';
import type { Manifest } from 'types';

import type { PlacedItem } from 'lib/layout';
import { SEARCH_CATEGORIES } from 'lib/search-categories';

import { Minimap } from './minimap';
import { ThemeToggle } from './theme-toggle';

const APPS = [
  { id: 'canvas', name: 'Canvas', href: '/', icon: MapIcon, component: null },
  {
    id: 'timeline',
    name: 'Timeline',
    href: '/timeline',
    icon: Calendar,
    component: null,
  },
  {
    id: 'map',
    name: 'Map',
    href: '/map',
    icon: MapIcon,
    component: null,
  },
  {
    id: 'random',
    name: 'Random',
    href: '/random',
    icon: Shuffle,
    component: null,
  },
  {
    id: 'minimap',
    name: 'Minimap',
    href: null,
    icon: MapIcon,
    component: 'MinimapWindow',
  },
];

type MinimapProps = {
  worldW: number;
  worldH: number;
  camX: number;
  camY: number;
  viewW: number;
  viewH: number;
  tiles: PlacedItem[];
  manifest: Manifest;
  onSetCam: (_xy: { x: number; y: number }) => void;
  sampleStep?: number;
  sizePx?: number;
  pad?: number;
};

type TimelineNavProps = {
  years: number[];
  currentYear: number | null;
  onJumpToYear: (year: number | null) => void;
};

interface NavbarSearchProps {
  onSearch: (query: string) => void;
  onClearSearch: () => void;
  isSearching: boolean;
  searchResultCount?: number;
  initialQuery: string;
  onOpenChange?: (open: boolean) => void;
  categorySampleIds?: string[];
  searchPreview?: Array<{ id: string }>;
}

const R2_URL = process.env.NEXT_PUBLIC_R2_URL ?? '';

function NavbarSearch({
  onSearch,
  onClearSearch,
  isSearching,
  searchResultCount,
  initialQuery,
  onOpenChange,
  categorySampleIds,
  searchPreview = [],
}: NavbarSearchProps) {
  const [inputState, setInputState] = useState({
    value: initialQuery,
    syncedProp: initialQuery,
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusedCatIdx, setFocusedCatIdx] = useState(-1);
  const searchRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const categoryRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Sync input with URL when it changes externally (setState during render)
  if (inputState.syncedProp !== initialQuery) {
    setInputState({
      value: searchOpen ? inputState.value : initialQuery,
      syncedProp: initialQuery,
    });
  }

  const inputValue = inputState.value;
  const hasActiveSearch = initialQuery.length > 0;

  // Notify parent of open state changes
  const updateSearchOpen = React.useCallback(
    (open: boolean) => {
      setSearchOpen(open);
      if (!open) setFocusedCatIdx(-1);
      onOpenChange?.(open);
    },
    [onOpenChange],
  );

  // Memoize category filtering to avoid recalculating on every render
  const matchingCategories = useMemo(() => {
    if (!inputValue.trim()) return SEARCH_CATEGORIES;
    const lowerInput = inputValue.toLowerCase();
    return SEARCH_CATEGORIES.filter(
      (cat) =>
        cat.label.toLowerCase().includes(lowerInput) ||
        cat.query.toLowerCase().includes(lowerInput),
    );
  }, [inputValue]);

  const handleSearch = React.useCallback(
    (query: string) => {
      if (query.trim()) {
        onSearch(query.trim());
      }
    },
    [onSearch],
  );

  // Debounced search - triggers after 400ms of no typing
  // Uses AbortController to cancel stale searches
  const handleInputChange = (value: string) => {
    setInputState((prev) => ({ ...prev, value }));
    setFocusedCatIdx(-1);

    // Clear pending debounce and abort any in-flight search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Debounce the search
    if (value.trim()) {
      debounceRef.current = setTimeout(() => {
        // Create new AbortController for this search
        abortControllerRef.current = new AbortController();
        handleSearch(value);
      }, 400);
    } else if (hasActiveSearch) {
      // Immediately clear if input is empty and there was a search
      onClearSearch();
    }
  };

  // Move DOM focus to the highlighted category button
  React.useEffect(() => {
    if (focusedCatIdx >= 0) {
      categoryRefs.current[focusedCatIdx]?.focus();
    }
  }, [focusedCatIdx]);

  // Cleanup AbortController on unmount
  React.useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleClear = React.useCallback(() => {
    setInputState((prev) => ({ ...prev, value: '' }));
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    onClearSearch();
  }, [onClearSearch]);

  const handleFocus = () => {
    updateSearchOpen(true);
  };

  // Close search dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        updateSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [updateSearchOpen]);

  // Keyboard shortcuts: Escape to close/clear, / to focus search
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs (except our search input)
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (e.key === 'Escape') {
        if (searchOpen) {
          updateSearchOpen(false);
          inputRef.current?.blur();
        } else if (hasActiveSearch) {
          // Clear search if there's an active search
          handleClear();
        }
      }

      // "/" to focus search (only when not already typing)
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        inputRef.current?.focus();
        updateSearchOpen(true);
      }
    };
    // passive: false because we call preventDefault for "/" key
    document.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen, hasActiveSearch, handleClear, updateSearchOpen]);

  return (
    <div ref={searchRef} className="relative flex-1 md:max-w-lg md:mx-auto">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          handleSearch(inputValue);
        }}
        className={`flex items-center gap-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 px-4 py-2.5 transition-colors ${
          searchOpen ? 'bg-neutral-200/70 dark:bg-neutral-700/70' : ''
        }`}
      >
        {isSearching ? (
          <div
            className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600"
            aria-hidden="true"
          />
        ) : (
          <Search
            className="h-[18px] w-[18px] text-neutral-500"
            aria-hidden="true"
          />
        )}
        <input
          ref={inputRef}
          type="text"
          placeholder="Search..."
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // Cancel debounce and search immediately
              if (debounceRef.current) {
                clearTimeout(debounceRef.current);
              }
              handleSearch(inputValue);
              updateSearchOpen(false);
              inputRef.current?.blur();
            }
            if (e.key === 'ArrowDown' && matchingCategories.length > 0) {
              e.preventDefault();
              setFocusedCatIdx(0);
            }
          }}
          className="flex-1 bg-transparent text-base sm:text-sm text-neutral-700 dark:text-neutral-200 outline-none focus-visible:outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
        />
        {isSearching ? (
          <span className="text-xs text-neutral-500 animate-pulse">
            Searching…
          </span>
        ) : searchResultCount !== undefined && searchResultCount > 0 ? (
          <span className="text-xs text-neutral-500 whitespace-nowrap">
            {searchResultCount} results
          </span>
        ) : null}
        {(inputValue || hasActiveSearch) && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600"
            aria-label="Clear search"
          >
            <X className="h-4 w-4 text-neutral-400" aria-hidden="true" />
          </button>
        )}
      </form>

      {/* Search dropdown */}
      <AnimatePresence>
        {searchOpen && (
          <m.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{
              duration: 0.15,
              ease: [0.215, 0.61, 0.355, 1] as const,
            }}
            className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 p-2"
          >
            {/* Search result preview thumbnails (shown when search is active) */}
            {searchPreview.length > 0 && (
              <div className="mb-2">
                <div className="flex gap-1.5">
                  {searchPreview.slice(0, 6).map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      tabIndex={-1}
                      onClick={() => updateSearchOpen(false)}
                      className="flex-shrink-0 h-14 w-14 overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-700 hover:opacity-80 transition-opacity"
                    >
                      <img
                        src={`${R2_URL}/variants/grid/avif/160/${result.id}.avif`}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="eager"
                      />
                    </button>
                  ))}
                  {searchResultCount !== undefined && searchResultCount > 6 && (
                    <div className="flex-shrink-0 h-14 w-14 flex items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-700/50">
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium text-center leading-tight">
                        +{searchResultCount - 6}
                        <br />
                        more
                      </span>
                    </div>
                  )}
                </div>
                <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-2" />
              </div>
            )}

            {/* Show matching categories as autocomplete (uses memoized filter) */}
            {inputValue.trim() && matchingCategories.length === 0 ? (
              <div className="py-4 text-center text-sm text-neutral-500">
                Press Enter to search for &ldquo;{inputValue}&rdquo;
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {matchingCategories.map((cat, i) => {
                  const catIdx = SEARCH_CATEGORIES.indexOf(cat);
                  const sampleId = categorySampleIds?.[catIdx];
                  const imageUrl = sampleId
                    ? `${R2_URL}/variants/grid/avif/480/${sampleId}.avif`
                    : undefined;
                  return (
                    <m.button
                      key={cat.id}
                      ref={(el) => {
                        categoryRefs.current[i] = el;
                      }}
                      type="button"
                      onClick={() => {
                        setInputState((prev) => ({
                          ...prev,
                          value: cat.query,
                        }));
                        setFocusedCatIdx(-1);
                        handleSearch(cat.query);
                        updateSearchOpen(false);
                        inputRef.current?.blur();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setFocusedCatIdx(
                            Math.min(i + 1, matchingCategories.length - 1),
                          );
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          if (i === 0) {
                            setFocusedCatIdx(-1);
                            inputRef.current?.focus();
                          } else {
                            setFocusedCatIdx(i - 1);
                          }
                        }
                      }}
                      className="flex items-center gap-3 rounded-xl bg-white dark:bg-neutral-900 p-2.5 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600 active:scale-[0.98]"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.15,
                        delay: Math.min(i, 6) * 0.025,
                        ease: [0.215, 0.61, 0.355, 1] as const,
                      }}
                    >
                      {imageUrl && (
                        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-200">
                          <img
                            src={imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                      <span className="text-[15px] font-medium text-neutral-800 dark:text-neutral-200">
                        {cat.label}
                      </span>
                    </m.button>
                  );
                })}
              </div>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type NavbarProps = {
  minimapProps?: MinimapProps;
  activePage?: string;
  timelineProps?: TimelineNavProps;
  onSearch?: (query: string) => void;
  onClearSearch?: () => void;
  isSearching?: boolean;
  searchResultCount?: number;
  searchQuery?: string;
  /** One photo ID (no extension) per search category, used for dropdown thumbnails */
  categorySampleIds?: string[];
  /** First few search results for showing thumbnails in the dropdown */
  searchPreview?: Array<{ id: string }>;
};

export function Navbar({
  minimapProps,
  activePage,
  timelineProps,
  onSearch,
  onClearSearch,
  isSearching = false,
  searchResultCount,
  searchQuery: initialQuery = '',
  categorySampleIds,
  searchPreview,
}: NavbarProps) {
  const [openWindows, setOpenWindows] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Detect mobile for logo animation - only update when crossing threshold
  React.useEffect(() => {
    let lastIsMobile = window.innerWidth < 768;
    setIsMobile(lastIsMobile);

    const checkMobile = () => {
      const nowMobile = window.innerWidth < 768;
      if (nowMobile !== lastIsMobile) {
        lastIsMobile = nowMobile;
        setIsMobile(nowMobile);
      }
    };

    window.addEventListener('resize', checkMobile, { passive: true });
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const anyWindowOpen = openWindows.size > 0;

  const toggleWindow = (component: string) => {
    // Don't open minimap if minimapProps not available
    if (component === 'MinimapWindow' && !minimapProps) return;
    const next = new Set<string>();
    if (!openWindows.has(component)) next.add(component);
    setOpenWindows(next);
  };

  // Escape to close windows (search handles its own Escape)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && anyWindowOpen) {
        setOpenWindows(new Set());
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [anyWindowOpen]);

  return (
    <LazyMotion features={domAnimation}>
      {/* Backdrop for windows */}
      <AnimatePresence>
        {anyWindowOpen && (
          <m.div
            key="backdrop"
            className="fixed inset-0 z-[60] bg-black/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpenWindows(new Set())}
          />
        )}
      </AnimatePresence>

      {/* Navbar */}
      <m.nav
        initial={shouldReduceMotion ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.2,
          ease: [0.215, 0.61, 0.355, 1],
        }}
        className="fixed top-0 left-0 right-0 z-[70] bg-white dark:bg-neutral-900 border-b border-neutral-200/50 dark:border-neutral-800"
      >
        <div className="mx-auto flex h-14 items-center gap-3 px-4">
          {/* Left: Logo (desktop) or hidden on mobile when search focused */}
          <m.a
            href="/"
            className="flex-shrink-0 flex items-center overflow-hidden md:w-7"
            initial={false}
            animate={{
              width: isMobile && searchOpen ? 0 : 28,
              opacity: isMobile && searchOpen ? 0 : 1,
            }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <img
              src="/icon.png"
              alt="Logo"
              className="h-7 w-7"
              width={28}
              height={28}
            />
          </m.a>

          {/* Center: Search */}
          {onSearch && onClearSearch ? (
            <NavbarSearch
              onSearch={onSearch}
              onClearSearch={onClearSearch}
              isSearching={isSearching}
              searchResultCount={searchResultCount}
              initialQuery={initialQuery}
              onOpenChange={setSearchOpen}
              categorySampleIds={categorySampleIds}
              searchPreview={searchPreview}
            />
          ) : (
            <div className="flex-1" />
          )}

          {/* Right: Actions (desktop only) - fixed width to balance left side */}
          <div className="w-32 flex-shrink-0 hidden md:flex items-center justify-end gap-1">
            <ThemeToggle />
            {/* Year selector for timeline */}
            {timelineProps && (
              <select
                value={timelineProps.currentYear?.toString() ?? 'all'}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'all') {
                    timelineProps.onJumpToYear(null);
                  } else {
                    timelineProps.onJumpToYear(parseInt(value, 10));
                  }
                }}
                aria-label="Select year"
                className="appearance-none rounded-lg bg-neutral-100 pl-3 pr-8 py-2 text-sm font-medium text-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-400 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23737373%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat"
              >
                <option value="all">All Years</option>
                {timelineProps.years.map((year) => (
                  <option key={year} value={year.toString()}>
                    {year}
                  </option>
                ))}
              </select>
            )}
            {APPS.filter(
              (app) =>
                (app.component !== 'MinimapWindow' || minimapProps) &&
                app.id !== activePage,
            ).map((app) => (
              <NavbarButton
                key={app.id}
                href={app.href}
                label={app.name}
                componentName={app.component || ''}
                isOpen={openWindows.has(app.component || '')}
                onToggleWindow={toggleWindow}
              />
            ))}
          </div>
        </div>

        {/* Mobile nav links - below search bar */}
        <div className="flex md:hidden items-center gap-1 px-4 pb-2">
          <ThemeToggle />
          {APPS.filter(
            (app) => app.component !== 'MinimapWindow' && app.id !== 'minimap',
          ).map((app) => (
            <MobileNavLink
              key={app.id}
              href={app.href}
              label={app.name}
              isActive={app.id === activePage}
            />
          ))}
          {timelineProps && (
            <>
              <span className="text-neutral-300 mx-1">·</span>
              <select
                value={timelineProps.currentYear?.toString() ?? 'all'}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'all') {
                    timelineProps.onJumpToYear(null);
                  } else {
                    timelineProps.onJumpToYear(parseInt(value, 10));
                  }
                }}
                aria-label="Select year"
                className="appearance-none bg-transparent text-xs font-medium text-neutral-500 focus-visible:ring-2 focus-visible:ring-neutral-400 rounded"
              >
                <option value="all">All Years</option>
                {timelineProps.years.map((year) => (
                  <option key={year} value={year.toString()}>
                    {year}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </m.nav>

      {/* Windows */}
      <AnimatePresence>
        {openWindows.has('MinimapWindow') && minimapProps && (
          <MinimapWindow
            key="minimap"
            onClose={() => {
              const next = new Set(openWindows);
              next.delete('MinimapWindow');
              setOpenWindows(next);
            }}
            minimapProps={minimapProps}
          />
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}

function NavbarButton({
  href,
  label,
  componentName,
  isOpen,
  onToggleWindow,
}: {
  href?: string | null;
  label: string;
  componentName?: string;
  isOpen?: boolean;
  onToggleWindow?: (_component: string) => void;
}) {
  const baseClasses = `rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600 ${
    isOpen
      ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100'
  }`;

  // Use Link for navigation, button for window toggle
  if (href) {
    return (
      <a href={href} className={baseClasses}>
        {label}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => onToggleWindow?.(componentName || '')}
      className={baseClasses}
    >
      {label}
    </button>
  );
}

function MobileNavLink({
  href,
  label,
  isActive,
}: {
  href?: string | null;
  label: string;
  isActive?: boolean;
}) {
  if (!href) return null;

  return (
    <a
      href={href}
      className={`relative min-h-[44px] flex items-center px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600 rounded ${
        isActive
          ? 'text-neutral-900 dark:text-neutral-100'
          : 'text-neutral-500 dark:text-neutral-400'
      }`}
    >
      {label}
      {isActive && (
        <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-neutral-300" />
      )}
    </a>
  );
}

function MinimapWindow({
  onClose,
  minimapProps,
}: {
  onClose: () => void;
  minimapProps: MinimapProps;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15 }}
      className="fixed right-4 top-[62px] z-[75]"
    >
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 p-2">
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="text-xs font-medium text-neutral-500">Minimap</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div
          className="overflow-hidden rounded-xl bg-white"
          style={{ touchAction: 'none' }}
        >
          <Minimap
            {...minimapProps}
            sampleStep={minimapProps.sampleStep ?? 1}
            sizePx={280}
          />
        </div>
      </div>
    </m.div>
  );
}
