'use client';

import { useEffect, useState, useTransition } from 'react';
import { useQueryState } from 'nuqs';
import type { Manifest } from 'types';

import { searchPhotos, type SearchResult } from 'lib/search';
import type { TimelineData } from 'lib/timeline-utils';

import { Timeline } from './timeline';
import type { PrecomputedItem } from '../app/timeline/page';

type Props = {
  data: TimelineData;
  manifest: Manifest;
  ssrItems: PrecomputedItem[];
  ssrTotalHeight: number;
};

export function TimelineWrapper({
  data,
  manifest,
  ssrItems,
  ssrTotalHeight,
}: Props) {
  const [query, setQuery] = useQueryState('q', { shallow: false });

  const [filteredIds, setFilteredIds] = useState<Set<string> | null>(null);
  const [isSearching, startTransition] = useTransition();
  const [searchResultCount, setSearchResultCount] = useState<
    number | undefined
  >(undefined);
  const [searchPreview, setSearchPreview] = useState<SearchResult[]>([]);

  // Execute search when query changes
  useEffect(() => {
    if (query) {
      startTransition(async () => {
        try {
          const results = await searchPhotos(query);
          const ids = new Set(results.map((r) => r.id));
          setFilteredIds(ids);
          setSearchResultCount(ids.size);
          setSearchPreview(results.slice(0, 8));
        } catch (error) {
          console.error('Search failed:', error);
          setFilteredIds(null);
          setSearchResultCount(undefined);
          setSearchPreview([]);
        }
      });
    } else {
      setFilteredIds(null);
      setSearchResultCount(undefined);
      setSearchPreview([]);
    }
  }, [query]);

  // Update page title based on search
  useEffect(() => {
    if (query && searchResultCount !== undefined) {
      document.title = `"${query}" (${searchResultCount}) - Timeline`;
    } else {
      document.title = 'Timeline - Photography';
    }
  }, [query, searchResultCount]);

  const handleSearch = (q: string) => {
    const trimmed = q.trim();
    if (trimmed) {
      setQuery(trimmed);
    }
  };

  const handleClearSearch = () => {
    setQuery(null);
  };

  return (
    <Timeline
      data={data}
      manifest={manifest}
      ssrItems={ssrItems}
      ssrTotalHeight={ssrTotalHeight}
      filteredIds={filteredIds}
      onSearch={handleSearch}
      onClearSearch={handleClearSearch}
      isSearching={isSearching}
      searchResultCount={searchResultCount}
      searchQuery={query ?? ''}
      searchPreview={searchPreview}
    />
  );
}
