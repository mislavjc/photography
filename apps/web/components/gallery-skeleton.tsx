// Shimmering image-shaped placeholders for gallery loading states (route-level
// loading.tsx and the search-loading guard). Responsive CSS-columns masonry.
//
// Tiles use real aspect ratios, not fixed heights: the collection is ~76% portrait
// (2:3) and ~23% landscape (3:2), with no squares — so the placeholders mirror that
// mix (mostly tall, some wide) and stay correctly shaped at every column width,
// instead of reading as squares that snap to portrait/landscape once photos load.
const P = 0.667; // 2:3 portrait
const L = 1.5; // 3:2 landscape
const TILE_ASPECTS = [
  P,
  L,
  P,
  P,
  P,
  L,
  P,
  P,
  P,
  P,
  L,
  P,
  P,
  L,
  P,
  P,
  P,
  P,
  L,
  P,
  P,
  P,
  L,
  P,
  P,
  P,
  P,
  L,
  P,
  P,
];

export function GallerySkeleton() {
  return (
    <div
      className="h-full w-full overflow-hidden px-3 pt-16"
      aria-hidden="true"
    >
      <div className="columns-3 gap-3 sm:columns-4 lg:columns-6">
        {TILE_ASPECTS.map((ar, i) => (
          <div
            key={i}
            className="animate-shimmer mb-3 w-full rounded-sm"
            // Stagger the sweep so the shimmer reads as a wave across the grid
            // rather than every tile pulsing in unison.
            style={{
              aspectRatio: `${ar}`,
              animationDelay: `${(i % 8) * 0.12}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
