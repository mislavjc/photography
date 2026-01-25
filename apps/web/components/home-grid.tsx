'use client';

import { useCallback, useState, useTransition } from 'react';
import type { Manifest } from 'types';
import type { Layout } from 'lib/layout';
import { searchPhotos } from 'lib/search';
import { PannableGrid } from './finite-grid';

type Props = {
  manifest: Manifest;
  initialLayout: Layout;
};

export function HomeGrid({ manifest, initialLayout }: Props) {
  const [filteredIds, setFilteredIds] = useState<Set<string> | null>(null);
  const [isSearching, startTransition] = useTransition();
  const [searchResultCount, setSearchResultCount] = useState<
    number | undefined
  >(undefined);

  const handleSearch = useCallback((query: string) => {
    startTransition(async () => {
      try {
        const results = await searchPhotos(query);
        const ids = new Set(results.map((r) => r.id));
        setFilteredIds(ids);
        setSearchResultCount(ids.size);
      } catch (error) {
        console.error('Search failed:', error);
        setFilteredIds(null);
        setSearchResultCount(undefined);
      }
    });
  }, []);

  const handleClearSearch = useCallback(() => {
    setFilteredIds(null);
    setSearchResultCount(undefined);
  }, []);

  return (
    <PannableGrid
      manifest={manifest}
      initialLayout={initialLayout}
      stateKey="grid"
      filteredIds={filteredIds}
      onSearch={handleSearch}
      onClearSearch={handleClearSearch}
      isSearching={isSearching}
      searchResultCount={searchResultCount}
    />
  );
}
