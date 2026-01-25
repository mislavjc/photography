'use client';

import type { Manifest } from 'types';
import type { Layout } from 'lib/layout';
import { usePhotoSearch } from 'lib/use-photo-search';
import { PannableGrid } from './finite-grid';

type Props = {
  manifest: Manifest;
  initialLayout: Layout;
};

export function HomeGrid({ manifest, initialLayout }: Props) {
  const {
    query,
    filteredIds,
    isSearching,
    searchResultCount,
    searchPreview,
    handleSearch,
    handleClearSearch,
  } = usePhotoSearch({
    baseTitle: 'Photography Portfolio',
    searchTitleFormat: '"%q" (%n) - Photography',
  });

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
      searchQuery={query ?? ''}
      searchPreview={searchPreview}
    />
  );
}
