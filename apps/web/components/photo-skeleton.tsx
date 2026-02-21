export function PhotoSkeleton() {
  return (
    <div className="min-h-[100svh] bg-white dark:bg-neutral-950">
      {/* Close button skeleton - top left */}
      <div className="fixed top-4 left-4 z-50 w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-900 animate-pulse" />

      {/* Color swatches skeleton - top right on mobile (horizontal), bottom left on desktop (vertical) */}
      <>
        {/* Mobile */}
        <div className="fixed top-4 right-4 flex flex-row items-center lg:hidden">
          {['swatch-1', 'swatch-2', 'swatch-3', 'swatch-4', 'swatch-5'].map(
            (id, i) => (
              <div
                key={id}
                className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse"
                style={{
                  zIndex: 5 - i,
                  marginLeft: i === 0 ? 0 : -12,
                }}
              />
            ),
          )}
        </div>
        {/* Desktop */}
        <div className="fixed bottom-4 left-4 hidden lg:flex flex-col-reverse items-center">
          {['swatch-1', 'swatch-2', 'swatch-3', 'swatch-4', 'swatch-5'].map(
            (id, i) => (
              <div
                key={id}
                className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-800 animate-pulse"
                style={{
                  zIndex: 5 - i,
                  marginBottom: i === 0 ? 0 : -12,
                }}
              />
            ),
          )}
        </div>
      </>

      {/* Desktop layout */}
      <div className="hidden lg:flex min-h-[100svh]">
        {/* Image area skeleton */}
        <div className="flex-1 flex items-center justify-center p-16 pl-8">
          <div
            className="bg-neutral-100 dark:bg-neutral-900 animate-pulse rounded-lg flex items-center justify-center"
            style={{
              aspectRatio: '4 / 3',
              width: '100%',
              maxHeight: 'calc(100vh - 8rem)',
            }}
          >
            <div className="text-neutral-400 dark:text-neutral-600 font-mono text-sm uppercase tracking-wider">
              Loading photo...
            </div>
          </div>
        </div>

        {/* Sidebar skeleton - floating card */}
        <aside className="w-96 p-4">
          <div className="rounded-2xl bg-neutral-100 dark:bg-neutral-900 p-5 space-y-5">
            {/* Date skeleton */}
            <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />

            {/* Description skeleton */}
            <section>
              <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                Description
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded w-full" />
                <div className="h-4 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded w-3/4" />
              </div>
            </section>

            {/* Dimensions skeleton */}
            <section>
              <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                Dimensions
              </div>
              <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
            </section>

            {/* Camera & Lens skeleton */}
            <div className="grid grid-cols-1 gap-4">
              <section>
                <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                  Camera
                </div>
                <div className="h-4 w-32 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
              </section>
              <section>
                <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                  Lens
                </div>
                <div className="h-4 w-28 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
              </section>
            </div>

            {/* Technical details skeleton */}
            <div className="grid grid-cols-2 gap-4">
              <section>
                <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                  Focal Length
                </div>
                <div className="h-4 w-12 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
              </section>
              <section>
                <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                  Aperture
                </div>
                <div className="h-4 w-8 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
              </section>
              <section>
                <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                  Shutter
                </div>
                <div className="h-4 w-10 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
              </section>
              <section>
                <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                  ISO
                </div>
                <div className="h-4 w-8 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
              </section>
            </div>

            {/* Location skeleton */}
            <section>
              <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                Location
              </div>
              <div className="h-4 w-40 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded mb-2" />
              <div
                className="bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded-lg"
                style={{ aspectRatio: '600 / 300' }}
              />
              <div className="h-3 w-32 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded mt-2" />
            </section>
          </div>
        </aside>
      </div>

      {/* Mobile layout - fixed image with bottom sheet */}
      <div className="lg:hidden h-[100svh] overflow-y-auto">
        {/* Image skeleton - fixed */}
        <div className="fixed inset-0 flex items-center justify-center p-4 pt-16 pb-[35svh] pointer-events-none">
          <div
            className="bg-neutral-100 dark:bg-neutral-900 animate-pulse rounded-lg flex items-center justify-center w-full"
            style={{
              aspectRatio: '4 / 3',
              maxHeight: '100%',
              maxWidth: '100%',
            }}
          >
            <div className="text-neutral-400 dark:text-neutral-600 font-mono text-sm uppercase tracking-wider">
              Loading photo...
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="h-[60svh]" />

        {/* Bottom sheet skeleton */}
        <div className="bg-neutral-100 dark:bg-neutral-900 rounded-t-3xl min-h-[60svh] relative z-[45]">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700" />
          </div>

          <div className="p-5 pt-2 space-y-5">
            {/* Date skeleton */}
            <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />

            {/* Description skeleton */}
            <section>
              <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                Description
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded w-full" />
                <div className="h-4 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded w-3/4" />
              </div>
            </section>

            {/* Dimensions skeleton */}
            <section>
              <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                Dimensions
              </div>
              <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
            </section>

            {/* Camera & Lens skeleton */}
            <div className="grid grid-cols-2 gap-4">
              <section>
                <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                  Camera
                </div>
                <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
              </section>
              <section>
                <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                  Lens
                </div>
                <div className="h-4 w-20 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
              </section>
            </div>

            {/* Technical details skeleton */}
            <div className="grid grid-cols-2 gap-4">
              <section>
                <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                  Focal Length
                </div>
                <div className="h-4 w-12 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
              </section>
              <section>
                <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                  Aperture
                </div>
                <div className="h-4 w-8 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
              </section>
              <section>
                <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                  Shutter
                </div>
                <div className="h-4 w-10 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
              </section>
              <section>
                <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-1">
                  ISO
                </div>
                <div className="h-4 w-8 bg-neutral-200 dark:bg-neutral-800 animate-pulse rounded" />
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
