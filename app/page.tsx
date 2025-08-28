import { PhotoFilter } from 'components/photo-filter';
import { filterManifestByColorRange } from 'lib/color-filter';
import { computeNearSquareLayout } from 'lib/layout';
import { loadManifest } from 'lib/manifest-server';
import { filterManifestByTimeRange } from 'lib/time-filter';
import { ColorRange, TimeRange } from 'types';

import { PannableGrid } from '../components/finite-grid';

interface HomePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// Create parser configuration for server-side usage
const timeRangeParser = (value: string | null) => value || 'all';
const colorRangeParser = (value: string | null) => value || 'all';

export default async function Page({ searchParams }: HomePageProps) {
  const { timeRange: timeRangeUnparsed, colorRange: colorRangeUnparsed } =
    await searchParams;

  const timeRange = timeRangeParser(timeRangeUnparsed as string);
  const colorRange = colorRangeParser(colorRangeUnparsed as string);

  const manifest = await loadManifest();

  // Log the entire manifest object with full depth for better inspection
  console.dir(manifest, { depth: null });

  // Apply filters in sequence: first time, then color
  let filteredManifest = filterManifestByTimeRange(
    manifest,
    timeRange as TimeRange,
  );

  filteredManifest = filterManifestByColorRange(
    filteredManifest,
    colorRange as ColorRange,
  );

  const layout = computeNearSquareLayout(filteredManifest);

  return (
    <div>
      <PannableGrid manifest={filteredManifest} initialLayout={layout} />
      {/* <PhotoFilter /> */}
    </div>
  );
}
