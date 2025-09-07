export default function Loading() {
  return (
    <div className="relative w-full min-h-[100svh] bg-white text-neutral-900">
      {/* GRID OVERLAY — matches the main component */}
      <>
        {/* mobile/tablet: 6 columns */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 px-4 sm:px-6 lg:hidden z-0"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                to right,
                rgba(0,0,0,0.14) 0px,
                rgba(0,0,0,0.14) 1px,
                transparent 1px,
                transparent calc(100vw/6)
              )
            `,
            backgroundSize: '100vw 100vh',
            backgroundPosition: '0 0',
            backgroundRepeat: 'repeat',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        />
        {/* desktop: 12 columns */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 px-12 hidden lg:block z-0"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                to right,
                rgba(0,0,0,0.14) 0px,
                rgba(0,0,0,0.14) 1px,
                transparent 1px,
                transparent calc(100vw/12)
              )
            `,
            backgroundSize: '100vw 100vh',
            backgroundPosition: '0 0',
            backgroundRepeat: 'repeat',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        />
      </>

      {/* content container */}
      <div className="relative z-10 px-4 sm:px-6 lg:px-12">
        {/* sticky header skeleton */}
        <header className="sticky top-[env(safe-area-inset-top)] z-20 gap-16 flex items-center justify-between bg-white/85 backdrop-blur-sm h-14">
          <div className="inline-flex items-center gap-2 font-mono text-neutral-800">
            <div className="h-2 w-8 bg-neutral-300 animate-pulse rounded" />
            <span>←&nbsp;Back</span>
          </div>
          <div className="font-mono text-neutral-500 bg-neutral-300 animate-pulse h-4 w-32 rounded" />
        </header>

        {/* layout skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-2">
          {/* IMAGE PLACEHOLDER — mobile: auto height; desktop: viewport minus header */}
          <div className="lg:col-span-8">
            <div
              className="relative w-full overflow-hidden bg-neutral-100 animate-pulse"
              style={{
                aspectRatio: '4 / 3', // reasonable default aspect ratio
                maxHeight: 'calc(100vh - 3.5rem)',
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-neutral-400 font-mono text-sm uppercase tracking-wider">
                  Loading photo...
                </div>
              </div>
            </div>
          </div>

          {/* META SKELETON — sits right under the image on mobile; scrolls independently on desktop */}
          <aside className="lg:col-span-4 lg:overflow-y-auto">
            <div className="pt-2 sm:pt-3 lg:pt-4 pb-6 sm:pb-8 space-y-6">
              {/* Description skeleton */}
              <section className="space-y-2">
                <div className="uppercase tracking-[0.14em] text-neutral-600 font-mono text-xs">
                  Description
                </div>
                <div className="font-sans leading-[1.45] space-y-2">
                  <div className="h-4 bg-neutral-200 animate-pulse rounded w-full" />
                  <div className="h-4 bg-neutral-200 animate-pulse rounded w-3/4" />
                  <div className="h-4 bg-neutral-200 animate-pulse rounded w-1/2" />
                </div>
              </section>

              {/* Dimensions skeleton */}
              <section className="space-y-2">
                <div className="uppercase tracking-[0.14em] text-neutral-600 font-mono text-xs">
                  Dimensions
                </div>
                <div className="font-mono font-semibold h-5 bg-neutral-200 animate-pulse rounded w-24" />
              </section>

              {/* Camera/Lens skeleton */}
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="uppercase tracking-[0.14em] text-neutral-600 font-mono text-xs">
                    Camera
                  </div>
                  <div className="font-mono h-4 bg-neutral-200 animate-pulse rounded w-20" />
                </div>
                <div className="space-y-2">
                  <div className="uppercase tracking-[0.14em] text-neutral-600 font-mono text-xs">
                    Lens
                  </div>
                  <div className="font-mono h-4 bg-neutral-200 animate-pulse rounded w-16" />
                </div>
              </section>

              {/* EXIF data skeleton */}
              <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="uppercase tracking-[0.14em] text-neutral-600 font-mono text-xs">
                    Focal Length
                  </div>
                  <div className="font-mono h-4 bg-neutral-200 animate-pulse rounded w-12" />
                </div>
                <div className="space-y-2">
                  <div className="uppercase tracking-[0.14em] text-neutral-600 font-mono text-xs">
                    Aperture
                  </div>
                  <div className="font-mono h-4 bg-neutral-200 animate-pulse rounded w-8" />
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <div className="uppercase tracking-[0.14em] text-neutral-600 font-mono text-xs">
                    Shutter
                  </div>
                  <div className="font-mono h-4 bg-neutral-200 animate-pulse rounded w-10" />
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                  <div className="uppercase tracking-[0.14em] text-neutral-600 font-mono text-xs">
                    ISO
                  </div>
                  <div className="font-mono h-4 bg-neutral-200 animate-pulse rounded w-8" />
                </div>
              </section>

              {/* Date skeleton */}
              <section className="space-y-2">
                <div className="uppercase tracking-[0.14em] text-neutral-600 font-mono text-xs">
                  Date Captured
                </div>
                <div className="font-mono h-4 bg-neutral-200 animate-pulse rounded w-32" />
              </section>
            </div>
          </aside>
        </div>

        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  );
}
