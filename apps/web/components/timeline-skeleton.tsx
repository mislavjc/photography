/**
 * Skeleton loader for Timeline page.
 * Matches the visual structure to minimize CLS.
 */
export function TimelineSkeleton() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-900 pb-24 overflow-x-hidden">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-12">
        {/* Year header skeleton */}
        <div className="py-4 sm:py-6">
          <div className="h-7 sm:h-8 w-20 bg-neutral-200 dark:bg-neutral-800 rounded animate-shimmer" />
        </div>

        {/* Month header skeleton */}
        <div className="py-2 sm:py-3">
          <div className="h-4 w-24 bg-neutral-100 dark:bg-neutral-900 rounded animate-shimmer" />
        </div>

        {/* Day rows skeleton - static structure for performance */}
        <DayRowSkeleton rowId="row-1" />
        <DayRowSkeleton rowId="row-2" />
        <DayRowSkeleton rowId="row-3" />
        <DayRowSkeleton rowId="row-4" />
        <DayRowSkeleton rowId="row-5" />
      </div>
    </div>
  );
}

function DayRowSkeleton({ rowId }: { rowId: string }) {
  return (
    <div className="flex gap-3 sm:gap-6 py-3">
      {/* Timeline line */}
      <div className="shrink-0 w-px bg-neutral-200 dark:bg-neutral-800 self-stretch min-h-[160px]" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Date label */}
        <div className="hidden sm:flex sm:items-start sm:gap-6">
          <div className="w-20 shrink-0 pt-1">
            <div className="h-3 w-16 bg-neutral-100 dark:bg-neutral-900 rounded animate-shimmer" />
          </div>

          {/* Photo row skeleton */}
          <div className="flex-1 flex gap-2">
            <div
              className="bg-neutral-100 dark:bg-neutral-900 rounded animate-shimmer"
              style={{ width: '160px', height: '160px' }}
            />
            <div
              className="bg-neutral-100 dark:bg-neutral-900 rounded animate-shimmer"
              style={{ width: '200px', height: '160px' }}
            />
            <div
              className="bg-neutral-100 dark:bg-neutral-900 rounded animate-shimmer"
              style={{ width: '160px', height: '160px' }}
            />
            <div
              className="bg-neutral-100 dark:bg-neutral-900 rounded animate-shimmer"
              style={{ width: '200px', height: '160px' }}
            />
          </div>
        </div>

        {/* Mobile skeleton */}
        <div className="sm:hidden">
          <div className="pt-3 pb-1.5">
            <div className="h-3 w-20 bg-neutral-100 dark:bg-neutral-900 rounded animate-shimmer" />
          </div>
          <div className="flex gap-2 overflow-hidden">
            <div
              className="bg-neutral-100 dark:bg-neutral-900 rounded animate-shimmer shrink-0"
              style={{ width: '120px', height: '120px' }}
            />
            <div
              className="bg-neutral-100 dark:bg-neutral-900 rounded animate-shimmer shrink-0"
              style={{ width: '120px', height: '120px' }}
            />
            <div
              className="bg-neutral-100 dark:bg-neutral-900 rounded animate-shimmer shrink-0"
              style={{ width: '120px', height: '120px' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
