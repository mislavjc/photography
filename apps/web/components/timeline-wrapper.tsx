'use client';

import type { Manifest } from 'types';

import type { TimelineData } from 'lib/timeline-utils';
import { usePhotoSearch } from 'lib/use-photo-search';

import type { PrecomputedItem } from '../app/timeline/page';

import { Timeline } from './timeline';

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
  const {
    query,
    filteredIds,
    isSearching,
    searchResultCount,
    searchError,
    handleSearch,
    handleClearSearch,
  } = usePhotoSearch({
    baseTitle: 'Timeline - Photography',
    searchTitleFormat: '"%q" (%n) - Timeline',
  });

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
      searchError={searchError}
    />
  );
}
