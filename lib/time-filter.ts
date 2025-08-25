import type { Manifest, TimeRange } from '../types';

export function filterManifestByTimeRange(
  manifest: Manifest,
  timeRange: TimeRange,
): Manifest {
  if (timeRange === 'all') {
    // Always return a new object reference to trigger re-renders
    return { ...manifest };
  }

  const filteredManifest: Manifest = {};

  for (const [filename, entry] of Object.entries(manifest)) {
    const dateTime = entry.exif?.dateTime;
    if (!dateTime) {
      continue; // Skip entries without dateTime
    }

    // Parse the dateTime string (assuming ISO format or similar)
    const date = new Date(dateTime);
    if (isNaN(date.getTime())) {
      continue; // Skip invalid dates
    }

    const hour = date.getHours();

    let isInRange = false;

    switch (timeRange) {
      case 'morning':
        // 6:00 AM to 12:00 PM
        isInRange = hour >= 6 && hour < 12;
        break;
      case 'afternoon':
        // 12:00 PM to 5:00 PM
        isInRange = hour >= 12 && hour < 17;
        break;
      case 'evening':
        // 5:00 PM to 9:00 PM
        isInRange = hour >= 17 && hour < 21;
        break;
      case 'night':
        // 9:00 PM to 6:00 AM (next day)
        isInRange = hour >= 21 || hour < 6;
        break;
      default:
        isInRange = true;
    }

    if (isInRange) {
      filteredManifest[filename] = entry;
    }
  }

  return filteredManifest;
}
