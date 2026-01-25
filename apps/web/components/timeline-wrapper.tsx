'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Manifest } from 'types';

import { searchPhotos } from 'lib/search';
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
        router.push(`/timeline?${params.toString()}`, { scroll: false });
      }
    },
    [router, searchParams],
  );

  const handleClearSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('q');
    const newUrl = params.toString()
      ? `/timeline?${params.toString()}`
      : '/timeline';
    router.push(newUrl, { scroll: false });
  }, [router, searchParams]);

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
      searchQuery={urlQuery}
    />
  );
}
