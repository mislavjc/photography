'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';

import { trackEvent } from './analytics';
import { searchPhotos, type SearchResult, warmupSearchWorker } from './search';

/**
 * Client-only URL query-param state. Unlike nuqs / `useSearchParams`, it does
 * NOT read the param during render, so it never suspends a static prerender —
 * the photo grid stays in the static shell and its LCP image is baked into the
 * prerendered HTML (no hydration wait to paint it). The real value is read from
 * the URL after mount and on back/forward; writes update the URL client-side
 * with no server round-trip.
 */
function useUrlQueryParam(
  key: string,
): [string | null, (value: string | null) => void] {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    const read = () => {
      const v = new URLSearchParams(window.location.search).get(key);
      setValue(v || null);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, [key]);

  const set = useCallback(
    (next: string | null) => {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set(key, next);
      else url.searchParams.delete(key);
      window.history.pushState(null, '', url);
      setValue(next);
    },
    [key],
  );

  return [value, set];
}

interface UsePhotoSearchOptions {
  /** Base title to use when no search is active */
  baseTitle: string;
  /** Title format when searching, %q is replaced with query, %n with count */
  searchTitleFormat?: string;
}

interface UsePhotoSearchReturn {
  /** Current search query from URL */
  query: string | null;
  /** Set of photo IDs matching the search, null when no search */
  filteredIds: Set<string> | null;
  /** Whether a search is currently in progress */
  isSearching: boolean;
  /** Number of results, undefined when no search */
  searchResultCount: number | undefined;
  /** Preview of search results (first 8) */
  searchPreview: SearchResult[];
  /** Error message when search fails, null when ok */
  searchError: string | null;
  /** Handler to execute a search */
  handleSearch: (q: string) => void;
  /** Handler to clear the search */
  handleClearSearch: () => void;
}

export function usePhotoSearch({
  baseTitle,
  searchTitleFormat = '"%q" (%n) - Photography',
}: UsePhotoSearchOptions): UsePhotoSearchReturn {
  const [query, setQuery] = useUrlQueryParam('q');

  const [filteredIds, setFilteredIds] = useState<Set<string> | null>(null);
  const [, startTransition] = useTransition();
  // The slow part (Gemini embedding round-trip, ~0.5-1.5s) runs OUTSIDE the
  // transition, so the transition's pending flag is false during the actual
  // wait. Track fetch state explicitly so the UI can show a loading indicator
  // for the whole search, not just the brief result-swap render.
  const [isFetching, setIsFetching] = useState(false);
  const [searchResultCount, setSearchResultCount] = useState<
    number | undefined
  >(undefined);
  const [searchPreview, setSearchPreview] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // React out state on query change (the "adjusting state during render" pattern):
  // clear on an empty query, or flip the loading flag the instant a new query
  // arrives — before the effect below runs the actual fetch — so the indicator
  // shows immediately without an extra render or a setState-in-effect.
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    if (query) {
      setIsFetching(true);
    } else {
      setFilteredIds(null);
      setSearchResultCount(undefined);
      setSearchPreview([]);
      setSearchError(null);
      setIsFetching(false);
    }
  }

  // Warm up the Cloudflare Worker on mount so the first real search is fast
  useEffect(() => {
    warmupSearchWorker();
  }, []);

  // Reveal the gallery once a shared `/?q=` link's search settles (results, no
  // results, or error) — clears the pre-paint cover from SearchLoadingGuard.
  // Until then the overlay hides the unfiltered grid so it never flashes.
  useEffect(() => {
    if (filteredIds !== null || searchError !== null) {
      document.documentElement.removeAttribute('data-searching');
    }
  }, [filteredIds, searchError]);

  // Execute search when query changes
  useEffect(() => {
    if (!query) {
      document.title = baseTitle;
      return;
    }

    const abortController = new AbortController();

    // Loading state: keep the current grid (previous results, or all photos)
    // visible while the new search runs — don't reset to the unfiltered grid,
    // which would flash all photos when refining a search. Results swap in once
    // they land; the navbar shows the in-progress spinner meanwhile.
    startTransition(() => {
      setSearchResultCount(undefined);
      setSearchPreview([]);
    });

    // Fetch outside of transition; pass signal so the network request is cancelled on abort
    searchPhotos(query, abortController.signal)
      .then((results) => {
        // Ignore if this search was superseded
        if (abortController.signal.aborted) return;

        const ids = new Set(results.map((r) => r.id));
        const preview = results.slice(0, 8);

        setIsFetching(false);
        // Update state in transition for non-urgent update
        startTransition(() => {
          setFilteredIds(ids);
          setSearchResultCount(ids.size);
          setSearchPreview(preview);
          setSearchError(null);
        });

        // Update title and analytics immediately
        document.title = searchTitleFormat
          .replace('%q', query)
          .replace('%n', String(ids.size));

        trackEvent('Search', {
          query,
          result_count: String(ids.size),
        });
      })
      .catch((error) => {
        // AbortError means the request was intentionally cancelled (query changed)
        if (
          abortController.signal.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')
        )
          return;

        console.error('Search failed:', error);

        const isTimeout =
          error instanceof DOMException && error.name === 'TimeoutError';

        setIsFetching(false);
        startTransition(() => {
          setFilteredIds(null);
          setSearchResultCount(undefined);
          setSearchPreview([]);
          setSearchError(
            isTimeout
              ? 'Search timed out. Please try again.'
              : 'Search is unavailable. Please try again later.',
          );
        });

        document.title = baseTitle;
      });

    // Cleanup: abort ongoing search when query changes
    return () => abortController.abort();
  }, [query, baseTitle, searchTitleFormat]);

  const handleSearch = (q: string) => {
    const trimmed = q.trim();
    if (trimmed) {
      setQuery(trimmed);
    }
  };

  const handleClearSearch = () => {
    setQuery(null);
  };

  return {
    query,
    filteredIds,
    isSearching: isFetching,
    searchResultCount,
    searchPreview,
    searchError,
    handleSearch,
    handleClearSearch,
  };
}
