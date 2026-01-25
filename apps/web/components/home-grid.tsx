'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Manifest } from 'types';
import type { Layout } from 'lib/layout';
import { searchPhotos } from 'lib/search';
import { PannableGrid } from './finite-grid';

type Props = {
  manifest: Manifest;
  initialLayout: Layout;
};

export function HomeGrid({ manifest, initialLayout }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';

  const [filteredIds, setFilteredIds] = useState<Set<string> | null>(null);
  const [isSearching, startTransition] = useTransition();
  const [searchResultCount, setSearchResultCount] = useState<
    number | undefined
  >(undefined);

  // Execute search when URL query changes (including on initial load)
  useEffect(() => {
    if (urlQuery) {
      startTransition(async () => {
        try {
          const results = await searchPhotos(urlQuery);
          const ids = new Set(results.map((r) => r.id));
          setFilteredIds(ids);
          setSearchResultCount(ids.size);
        } catch (error) {
          console.error('Search failed:', error);
          setFilteredIds(null);
          setSearchResultCount(undefined);
        }
      });
    } else {
      setFilteredIds(null);
      setSearchResultCount(undefined);
    }
  }, [urlQuery]);

  const handleSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (trimmed) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('q', trimmed);
        router.push(`?${params.toString()}`, { scroll: false });
      }
    },
    [router, searchParams],
  );

  const handleClearSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    const newUrl = params.toString() ? `?${params.toString()}` : '/';
    router.push(newUrl, { scroll: false });
  }, [router, searchParams]);

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
      searchQuery={urlQuery}
    />
  );
}
