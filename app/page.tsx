import type { Metadata } from 'next';
import React from 'react';

import ClientHomePage from '../components/client-home-page';
import { PhotoFilter } from '../components/photo-filter';
import { filterManifestByColorRange } from '../lib/color-filter';
import { loadManifest } from '../lib/manifest-server';
import { filterManifestByTimeRange } from '../lib/time-filter';
import type { ColorRange, TimeRange } from '../types';

interface HomePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// Create parser configuration for server-side usage
const timeRangeParser = (value: string | null) => value || 'all';
const colorRangeParser = (value: string | null) => value || 'all';

export async function generateMetadata({
  searchParams,
}: HomePageProps): Promise<Metadata> {
  const { timeRange: timeRangeUnparsed, colorRange: colorRangeUnparsed } =
    await searchParams;

  // Parse search params manually since nuqs server-side API might be different
  const timeRange = timeRangeParser(timeRangeUnparsed as string);
  const colorRange = colorRangeParser(colorRangeUnparsed as string);

  const timeRangeLabels = {
    all: 'All Times',
    morning: 'Morning Photos',
    afternoon: 'Afternoon Photos',
    evening: 'Evening Photos',
    night: 'Night Photos',
  };

  const colorRangeLabels = {
    all: 'All Colors',
    red: 'Red Photos',
    blue: 'Blue Photos',
    green: 'Green Photos',
    yellow: 'Yellow Photos',
    purple: 'Purple Photos',
    orange: 'Orange Photos',
    pink: 'Pink Photos',
    cyan: 'Cyan Photos',
    brown: 'Brown Photos',
    gray: 'Gray Photos',
    black: 'Black Photos',
    white: 'White Photos',
  };

  const timeLabel = timeRangeLabels[timeRange as TimeRange];
  const colorLabel = colorRangeLabels[colorRange as ColorRange];

  if (timeRange === 'all' && colorRange === 'all') {
    return {
      title: 'Photography - All Photos',
      description: 'Browse complete photography collection',
    };
  }

  const filters = [];
  if (timeRange !== 'all') filters.push(timeLabel.toLowerCase());
  if (colorRange !== 'all') filters.push(colorLabel.toLowerCase());

  return {
    title: `Photography - ${timeLabel}${colorRange !== 'all' ? ` (${colorLabel})` : ''}`,
    description: `Browse photography collection${filters.length > 0 ? ` filtered by ${filters.join(' and ')}` : ''}`,
  };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { timeRange: timeRangeUnparsed, colorRange: colorRangeUnparsed } =
    await searchParams;

  // Parse search params manually
  const timeRange = timeRangeParser(timeRangeUnparsed as string);
  const colorRange = colorRangeParser(colorRangeUnparsed as string);

  const manifest = await loadManifest();

  // Apply filters in sequence: first time, then color
  let filteredManifest = filterManifestByTimeRange(
    manifest,
    timeRange as TimeRange,
  );

  filteredManifest = filterManifestByColorRange(
    filteredManifest,
    colorRange as ColorRange,
  );

  return (
    <div>
      <ClientHomePage manifest={filteredManifest} />
      <PhotoFilter />
    </div>
  );
}
