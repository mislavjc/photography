import type { Metadata } from 'next';
import React from 'react';

import ClientHomePage from '../components/client-home-page';
import { loadManifest } from '../lib/manifest-server';
import { filterManifestByTimeRange } from '../lib/time-filter';
import type { TimeRange } from '../types';

interface HomePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// Create parser configuration for server-side usage
const timeRangeParser = (value: string | null) => value || 'all';

export async function generateMetadata({
  searchParams,
}: HomePageProps): Promise<Metadata> {
  const { timeRange: timeRangeUnparsed } = await searchParams;

  // Parse search params manually since nuqs server-side API might be different
  const timeRange = timeRangeParser(timeRangeUnparsed as string);

  const timeRangeLabels = {
    all: 'All Times',
    morning: 'Morning Photos',
    afternoon: 'Afternoon Photos',
    evening: 'Evening Photos',
    night: 'Night Photos',
  };

  return {
    title: `Photography - ${timeRangeLabels[timeRange as TimeRange]}`,
    description: `Browse photography collection filtered by ${timeRangeLabels[timeRange as TimeRange].toLowerCase()}`,
  };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { timeRange: timeRangeUnparsed } = await searchParams;

  // Parse search params manually
  const timeRange = timeRangeParser(timeRangeUnparsed as string);

  const manifest = await loadManifest();

  // Filter manifest server-side based on time range
  const filteredManifest = filterManifestByTimeRange(
    manifest,
    timeRange as TimeRange,
  );

  return <ClientHomePage manifest={filteredManifest} />;
}
