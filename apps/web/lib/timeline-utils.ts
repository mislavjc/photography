import type { Manifest, ManifestEntry } from 'types';

export interface PhotoWithMeta {
  filename: string;
  w: number;
  h: number;
  ar: number; // aspect ratio (w/h)
  dateTime: Date | null;
  entry?: ManifestEntry; // Only present server-side during grouping; stripped before serialization
}

export interface DayGroup {
  key: string; // "2024-12-25" or "unknown"
  label: string; // "Dec 25, 2024" or "Unknown Date"
  photos: PhotoWithMeta[];
}

export interface MonthGroup {
  key: string; // "2024-12" or "unknown"
  label: string; // "December" or "Unknown"
  year: number | null;
  month: number | null; // 0-11
  days: DayGroup[];
}

export interface YearGroup {
  key: string; // "2024" or "unknown"
  label: string; // "2024" or "Unknown Date"
  year: number | null;
  months: MonthGroup[];
}

export interface TimelineData {
  years: YearGroup[];
  allYears: number[]; // sorted list of years for jump-to navigation
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Parse date string to Date object.
 * Supports:
 * - ISO 8601 format: "2025-03-03T14:12:23Z"
 * - Traditional EXIF format: "2024:08:15 14:30:00"
 */
function parseExifDate(dateTime: string | null): Date | null {
  if (!dateTime) return null;

  // Try ISO 8601 format first (e.g., "2025-03-03T14:12:23Z")
  if (dateTime.includes('T')) {
    const date = new Date(dateTime);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  // Try traditional EXIF format: "YYYY:MM:DD HH:MM:SS"
  const exifMatch = dateTime.match(
    /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
  );
  if (exifMatch) {
    const [, year, month, day, hour, minute, second] = exifMatch;
    const date = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1, // months are 0-indexed
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10),
    );
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  // Try parsing as generic date string
  const date = new Date(dateTime);
  if (!Number.isNaN(date.getTime())) {
    return date;
  }

  return null;
}

/**
 * Format a date as "Dec 25, 2024"
 */
function formatDayLabel(date: Date): string {
  const month = MONTH_NAMES_SHORT[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

/**
 * Get day key for grouping: "2024-12-25"
 */
function getDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get month key for grouping: "2024-12"
 */
function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get year key for grouping: "2024"
 */
function getYearKey(date: Date): string {
  return String(date.getFullYear());
}

/**
 * Process manifest into grouped timeline data
 */
export function groupPhotosForTimeline(manifest: Manifest): TimelineData {
  // Convert manifest entries to PhotoWithMeta
  const photos: PhotoWithMeta[] = Object.entries(manifest).map(
    ([filename, entry]) => ({
      filename,
      w: entry.w,
      h: entry.h,
      ar: entry.w / entry.h,
      dateTime: parseExifDate(entry.exif?.dateTime ?? null),
      entry,
    }),
  );

  // Separate photos with and without dates
  const datedPhotos = photos.filter((p) => p.dateTime !== null);
  const undatedPhotos = photos.filter((p) => p.dateTime === null);

  // Sort dated photos by date (newest first)
  // We already filtered for non-null dateTime above
  datedPhotos.sort((a, b) => {
    const aTime = a.dateTime?.getTime() ?? 0;
    const bTime = b.dateTime?.getTime() ?? 0;
    return bTime - aTime;
  });

  // Group by year -> month -> day
  const yearMap = new Map<number, Map<number, Map<string, PhotoWithMeta[]>>>();

  for (const photo of datedPhotos) {
    const date = photo.dateTime;
    if (!date) continue; // Already filtered, but satisfies TypeScript
    const year = date.getFullYear();
    const month = date.getMonth();
    const dayKey = getDayKey(date);

    let monthMap = yearMap.get(year);
    if (!monthMap) {
      monthMap = new Map();
      yearMap.set(year, monthMap);
    }

    let dayMap = monthMap.get(month);
    if (!dayMap) {
      dayMap = new Map();
      monthMap.set(month, dayMap);
    }

    let dayPhotos = dayMap.get(dayKey);
    if (!dayPhotos) {
      dayPhotos = [];
      dayMap.set(dayKey, dayPhotos);
    }
    dayPhotos.push(photo);
  }

  // Convert maps to sorted arrays
  const years: YearGroup[] = [];
  const allYears: number[] = [];

  // Sort years descending (newest first)
  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => b - a);

  for (const year of sortedYears) {
    allYears.push(year);
    const monthMap = yearMap.get(year);
    if (!monthMap) continue;
    const months: MonthGroup[] = [];

    // Sort months descending (December first)
    const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => b - a);

    for (const month of sortedMonths) {
      const dayMap = monthMap.get(month);
      if (!dayMap) continue;
      const days: DayGroup[] = [];

      // Sort days descending (newest first)
      const sortedDays = Array.from(dayMap.keys()).sort((a, b) =>
        b.localeCompare(a),
      );

      for (const dayKey of sortedDays) {
        const dayPhotos = dayMap.get(dayKey);
        if (!dayPhotos || dayPhotos.length === 0) continue;
        // Get the date from the first photo to format the label
        const sampleDate = dayPhotos[0].dateTime;
        const label = sampleDate ? formatDayLabel(sampleDate) : dayKey;

        days.push({
          key: dayKey,
          label,
          photos: dayPhotos,
        });
      }

      months.push({
        key: getMonthKey(new Date(year, month, 1)),
        label: MONTH_NAMES[month],
        year,
        month,
        days,
      });
    }

    years.push({
      key: String(year),
      label: String(year),
      year,
      months,
    });
  }

  // Add unknown date group if there are undated photos
  if (undatedPhotos.length > 0) {
    years.push({
      key: 'unknown',
      label: 'Unknown Date',
      year: null,
      months: [
        {
          key: 'unknown',
          label: 'Unknown',
          year: null,
          month: null,
          days: [
            {
              key: 'unknown',
              label: 'Unknown Date',
              photos: undatedPhotos,
            },
          ],
        },
      ],
    });
  }

  return { years, allYears };
}

/**
 * Flatten timeline data into a list of renderable items for virtualization
 */
type TimelineItem =
  | { type: 'year-header'; year: YearGroup }
  | { type: 'month-header'; month: MonthGroup; yearKey: string }
  | { type: 'day-row'; day: DayGroup; monthKey: string; yearKey: string };

function flattenTimelineData(data: TimelineData): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const year of data.years) {
    items.push({ type: 'year-header', year });

    for (const month of year.months) {
      items.push({ type: 'month-header', month, yearKey: year.key });

      for (const day of month.days) {
        items.push({
          type: 'day-row',
          day,
          monthKey: month.key,
          yearKey: year.key,
        });
      }
    }
  }

  return items;
}
