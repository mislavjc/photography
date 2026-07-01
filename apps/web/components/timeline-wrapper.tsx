'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Manifest } from 'types';

import { registerPhotoPreviews } from 'lib/photo-preview-store';
import type { TimelineData } from 'lib/timeline-utils';
import type { TimelineLayoutItem } from 'lib/timeline-utils';
import { usePhotoSearch } from 'lib/use-photo-search';

import { Timeline } from './timeline';

type Props = {
  data: TimelineData;
  manifest: Manifest;
  ssrItems: TimelineLayoutItem[];
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
    searchPreview,
    searchError,
    handleSearch,
    handleClearSearch,
  } = usePhotoSearch({
    baseTitle: 'Timeline - Photography',
    searchTitleFormat: '"%q" (%n) - Timeline',
  });

  // Feed the modal's instant shell so a clicked photo can paint immediately.
  useEffect(() => {
    registerPhotoPreviews(manifest);
  }, [manifest]);

  // Warm the shared modal route chunk once, on idle, so opening a photo is instant.
  const router = useRouter();
  useEffect(() => {
    const first = Object.keys(manifest)[0];
    if (!first) return;
    const warm = () => router.prefetch(`/photo/${encodeURIComponent(first)}`);
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(warm, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(warm, 1500);
    return () => clearTimeout(id);
  }, [manifest, router]);

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
      searchPreview={searchPreview}
      searchQuery={query ?? ''}
      searchError={searchError}
    />
  );
}
