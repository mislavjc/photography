export default function TimelineLoading() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-12 py-8">
        {/* Year header skeleton */}
        <div className="mb-6 sm:mb-8">
          <div className="h-6 sm:h-7 w-14 sm:w-16 bg-neutral-100 rounded animate-pulse" />
        </div>

        {/* Month header skeleton */}
        <div className="mb-3 sm:mb-4">
          <div className="h-3 sm:h-4 w-16 sm:w-20 bg-neutral-100 rounded animate-pulse" />
        </div>

        {/* Day rows skeleton */}
        {[1, 2, 3].map((day) => (
          <div key={day} className="flex gap-3 sm:gap-6">
            {/* Timeline line */}
            <div className="w-px bg-neutral-100 self-stretch min-h-[140px] sm:min-h-[140px]" />

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Date - mobile (above photos) */}
              <div className="pt-3 pb-1.5 sm:hidden">
                <div className="h-3 w-20 bg-neutral-100 rounded animate-pulse" />
              </div>

              {/* Desktop layout */}
              <div className="hidden sm:flex sm:gap-6 sm:py-3">
                <div className="w-20 shrink-0 pt-1">
                  <div className="h-3 w-16 bg-neutral-100 rounded animate-pulse" />
                </div>
                <div className="flex gap-2 flex-1">
                  {[1, 2, 3].slice(0, 1 + (day % 2)).map((photo) => (
                    <div
                      key={photo}
                      className="bg-neutral-100 animate-pulse shrink-0"
                      style={{
                        width: 200 + (photo % 2) * 60,
                        height: 140,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Mobile layout - full width photos */}
              <div className="sm:hidden flex gap-1.5">
                {[1, 2].map((photo) => (
                  <div
                    key={photo}
                    className="bg-neutral-100 animate-pulse flex-1"
                    style={{ height: 100 }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* Another month */}
        <div className="mb-3 sm:mb-4 mt-8 sm:mt-10">
          <div className="h-3 sm:h-4 w-20 sm:w-24 bg-neutral-100 rounded animate-pulse" />
        </div>

        {[1, 2].map((day) => (
          <div key={day} className="flex gap-3 sm:gap-6">
            <div className="w-px bg-neutral-100 self-stretch min-h-[140px] sm:min-h-[140px]" />
            <div className="flex-1 min-w-0">
              <div className="pt-3 pb-1.5 sm:hidden">
                <div className="h-3 w-20 bg-neutral-100 rounded animate-pulse" />
              </div>
              <div className="hidden sm:flex sm:gap-6 sm:py-3">
                <div className="w-20 shrink-0 pt-1">
                  <div className="h-3 w-16 bg-neutral-100 rounded animate-pulse" />
                </div>
                <div className="flex gap-2 flex-1">
                  {[1, 2].map((photo) => (
                    <div
                      key={photo}
                      className="bg-neutral-100 animate-pulse shrink-0"
                      style={{
                        width: 180 + (photo % 2) * 80,
                        height: 140,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="sm:hidden flex gap-1.5">
                {[1, 2, 3].slice(0, 1 + (day % 2)).map((photo) => (
                  <div
                    key={photo}
                    className="bg-neutral-100 animate-pulse flex-1"
                    style={{ height: 100 }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
