'use client';

import React, { useState } from 'react';
import { Calendar, Map as MapIcon, Search, Shuffle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { Manifest } from 'types';

import type { PlacedItem } from 'lib/layout';
import { SEARCH_CATEGORIES } from 'lib/search-categories';

import { Minimap } from './minimap';

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

type SearchPreview = {
  id: string;
  score: number;
};

type NavbarProps = {
  minimapProps?: MinimapProps;
  activePage?: string;
  timelineProps?: TimelineNavProps;
  onSearch?: (query: string) => void;
  onClearSearch?: () => void;
  isSearching?: boolean;
  searchResultCount?: number;
  searchQuery?: string;
  searchPreview?: SearchPreview[];
};

export const Navbar = ({
  minimapProps,
  activePage,
  timelineProps,
  onSearch,
  onClearSearch,
  isSearching,
  searchResultCount,
  searchQuery: initialQuery = '',
  searchPreview,
}: NavbarProps) => {
  const [openWindows, setOpenWindows] = useState<Set<string>>(new Set());
  const [inputValue, setInputValue] = useState(initialQuery);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const searchRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect mobile for logo animation
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync input with URL when it changes externally
  React.useEffect(() => {
    if (!searchOpen) {
      setInputValue(initialQuery);
    }
  }, [initialQuery, searchOpen]);

  const anyWindowOpen = openWindows.size > 0;
  const hasActiveSearch = initialQuery.length > 0;

  const handleSearch = React.useCallback(
    (query: string) => {
      if (onSearch && query.trim()) {
        onSearch(query.trim());
      }
    },
    [onSearch],
  );

  // Debounced search - triggers after 300ms of no typing
  const handleInputChange = (value: string) => {
    setInputValue(value);

    // Clear pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the search
    if (value.trim()) {
      debounceRef.current = setTimeout(() => {
        handleSearch(value);
      }, 400);
    } else if (hasActiveSearch) {
      // Immediately clear if input is empty and there was a search
      onClearSearch?.();
    }
  };

  const handleClear = React.useCallback(() => {
    setInputValue('');
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    onClearSearch?.();
  }, [onClearSearch]);

  const handleFocus = () => {
    setSearchOpen(true);
  };

  const handleBlur = () => {
    // Keep the current input value, don't reset
  };

  const toggleWindow = (component: string) => {
    // Don't open minimap if minimapProps not available
    if (component === 'MinimapWindow' && !minimapProps) return;
    const next = new Set<string>();
    if (!openWindows.has(component)) next.add(component);
    setOpenWindows(next);
  };

  // Close search dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          setSearchOpen(false);
          inputRef.current?.blur();
        } else if (hasActiveSearch) {
          // Clear search if there's an active search
          handleClear();
        } else if (anyWindowOpen) {
          setOpenWindows(new Set());
        }
      }

      // "/" to focus search (only when not already typing)
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        inputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen, anyWindowOpen, hasActiveSearch, handleClear]);

  return (
    <>
      {/* Backdrop for windows */}
      <AnimatePresence>
        {anyWindowOpen && (
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[60] bg-black/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenWindows(new Set())}
          />
        )}
      </AnimatePresence>

      {/* Navbar */}
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-0 left-0 right-0 z-[70] bg-white"
      >
        <div className="mx-auto flex h-14 items-center gap-3 px-4">
          {/* Left: Logo (desktop) or hidden on mobile when search focused */}
          <motion.a
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
          </motion.a>

          {/* Center: Search - expands full width on mobile when focused */}
          <div
            ref={searchRef}
            className="relative flex-1 md:max-w-lg md:mx-auto"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch(inputValue);
              }}
              className={`flex items-center gap-3 rounded-xl bg-neutral-100 px-4 py-2.5 transition-colors ${
                searchOpen ? 'bg-neutral-200/70' : ''
              }`}
            >
              {isSearching ? (
                <div
                  className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600"
                  aria-hidden="true"
                />
              ) : (
                <Search
                  className="h-[18px] w-[18px] text-neutral-400"
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
                onBlur={handleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    // Cancel debounce and search immediately
                    if (debounceRef.current) {
                      clearTimeout(debounceRef.current);
                    }
                    handleSearch(inputValue);
                    setSearchOpen(false);
                    inputRef.current?.blur();
                  }
                }}
                className="flex-1 bg-transparent text-base sm:text-sm text-neutral-700 outline-none focus-visible:outline-none placeholder:text-neutral-400"
              />
              {isSearching ? (
                <span className="text-xs text-neutral-500 animate-pulse">
                  Searching…
                </span>
              ) : searchResultCount !== undefined && searchResultCount > 0 ? (
                <span className="text-xs text-neutral-500">
                  {searchResultCount} results
                </span>
              ) : null}
              {(inputValue || hasActiveSearch) && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-md p-0.5 hover:bg-neutral-200 focus-visible:ring-2 focus-visible:ring-neutral-400"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4 text-neutral-400" aria-hidden="true" />
                </button>
              )}
            </form>

            {/* Search dropdown */}
            <AnimatePresence>
              {searchOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-neutral-200 bg-neutral-100 p-2"
                >
                  {/* Show matching categories as autocomplete when typing */}
                  {inputValue.trim() ? (
                    (() => {
                      const matchingCategories = SEARCH_CATEGORIES.filter(
                        (cat) =>
                          cat.label
                            .toLowerCase()
                            .includes(inputValue.toLowerCase()) ||
                          cat.query
                            .toLowerCase()
                            .includes(inputValue.toLowerCase()),
                      );
                      if (matchingCategories.length > 0) {
                        return (
                          <div className="grid grid-cols-2 gap-1.5">
                            {matchingCategories.map((cat) => {
                              const imageUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/variants/grid/avif/480/${cat.previewIds[0]}.avif`;
                              return (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => {
                                    setInputValue(cat.query);
                                    handleSearch(cat.query);
                                  }}
                                  className="flex items-center gap-3 rounded-xl bg-white p-2.5 text-left transition-colors hover:bg-neutral-50"
                                >
                                  <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-200">
                                    <img
                                      src={imageUrl}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  </div>
                                  <span className="text-[15px] font-medium text-neutral-800">
                                    {cat.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      }
                      return (
                        <div className="py-4 text-center text-sm text-neutral-500">
                          Press Enter to search for &ldquo;{inputValue}&rdquo;
                        </div>
                      );
                    })()
                  ) : (
                    /* Show category suggestions when input is empty */
                    <div className="grid grid-cols-2 gap-1.5">
                      {SEARCH_CATEGORIES.map((cat) => {
                        const imageUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/variants/grid/avif/480/${cat.previewIds[0]}.avif`;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setInputValue(cat.query);
                              handleSearch(cat.query);
                            }}
                            className="flex items-center gap-3 rounded-xl bg-white p-2.5 text-left transition-colors hover:bg-neutral-50"
                          >
                            <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-200">
                              <img
                                src={imageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <span className="text-[15px] font-medium text-neutral-800">
                              {cat.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Actions (desktop only) - fixed width to balance left side */}
          <div className="w-32 flex-shrink-0 hidden md:flex items-center justify-end gap-1">
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
      </motion.nav>

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
    </>
  );
};

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
  const baseClasses = `rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-neutral-400 ${
    isOpen
      ? 'bg-neutral-100 text-neutral-900'
      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
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
      className={`relative px-2 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-neutral-400 rounded ${
        isActive ? 'text-neutral-900' : 'text-neutral-400'
      }`}
    >
      {label}
      {isActive && (
        <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-neutral-300" />
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
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15 }}
      className="fixed right-4 top-[62px] z-[75]"
    >
      <div className="rounded-2xl border border-neutral-200 bg-neutral-100 p-2">
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
            worldW={minimapProps.worldW}
            worldH={minimapProps.worldH}
            camX={minimapProps.camX}
            camY={minimapProps.camY}
            viewW={minimapProps.viewW}
            viewH={minimapProps.viewH}
            tiles={minimapProps.tiles}
            manifest={minimapProps.manifest}
            onSetCam={minimapProps.onSetCam}
            sampleStep={minimapProps.sampleStep ?? 1}
            sizePx={280}
            pad={minimapProps.pad}
          />
        </div>
      </div>
    </motion.div>
  );
}
