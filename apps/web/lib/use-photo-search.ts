'use client';

import { useEffect, useState, useTransition } from 'react';
import { useQueryState } from 'nuqs';

import { trackEvent } from './analytics';
import { searchPhotos, type SearchResult } from './search';

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
  /** Handler to execute a search */
  handleSearch: (q: string) => void;
  /** Handler to clear the search */
  handleClearSearch: () => void;
}

export function usePhotoSearch({
  baseTitle,
  searchTitleFormat = '"%q" (%n) - Photography',
}: UsePhotoSearchOptions): UsePhotoSearchReturn {
  const [query, setQuery] = useQueryState('q', { shallow: false });

  const [filteredIds, setFilteredIds] = useState<Set<string> | null>(null);
  const [isSearching, startTransition] = useTransition();
  const [searchResultCount, setSearchResultCount] = useState<
    number | undefined
  >(undefined);
  const [searchPreview, setSearchPreview] = useState<SearchResult[]>([]);

  // Execute search when query changes
  useEffect(() => {
    if (!query) {
      setFilteredIds(null);
      setSearchResultCount(undefined);
      setSearchPreview([]);
      document.title = baseTitle;
      return;
    }

    const abortController = new AbortController();

    // Start transition for loading state
    startTransition(() => {
      setFilteredIds(null);
      setSearchResultCount(undefined);
      setSearchPreview([]);
    });

    // Fetch outside of transition
    searchPhotos(query)
      .then((results) => {
        // Ignore if this search was superseded
        if (abortController.signal.aborted) return;

        const ids = new Set(results.map((r) => r.id));
        const preview = results.slice(0, 8);

        // Update state in transition for non-urgent update
        startTransition(() => {
          setFilteredIds(ids);
          setSearchResultCount(ids.size);
          setSearchPreview(preview);
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
        if (abortController.signal.aborted) return;

        console.error('Search failed:', error);

        startTransition(() => {
          setFilteredIds(null);
          setSearchResultCount(undefined);
          setSearchPreview([]);
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
    isSearching,
    searchResultCount,
    searchPreview,
    handleSearch,
    handleClearSearch,
  };
}
