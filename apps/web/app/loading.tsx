const COLUMN_WIDTH = 220;
const GAP = 16;

// Pre-defined heights to simulate various aspect ratios (matching real photos)
const SKELETON_TILES = [
  // Row pattern that fills viewport with varying heights
  { col: 0, h: 280 },
  { col: 1, h: 180 },
  { col: 2, h: 320 },
  { col: 3, h: 220 },
  { col: 4, h: 260 },
  { col: 5, h: 200 },
  { col: 0, h: 220 },
  { col: 1, h: 300 },
  { col: 2, h: 180 },
  { col: 3, h: 280 },
  { col: 4, h: 200 },
  { col: 5, h: 320 },
  { col: 0, h: 200 },
  { col: 1, h: 240 },
  { col: 2, h: 280 },
  { col: 3, h: 160 },
  { col: 4, h: 300 },
  { col: 5, h: 220 },
];

// Compute y positions for masonry layout
function computeSkeletonLayout() {
  const colHeights = [0, 0, 0, 0, 0, 0];
  return SKELETON_TILES.map(({ col, h }) => {
    const x = col * (COLUMN_WIDTH + GAP);
    const y = colHeights[col];
    colHeights[col] += h + GAP;
    return { x, y, w: COLUMN_WIDTH, h };
  });
}

const layout = computeSkeletonLayout();

export default function Loading() {
  return (
    <div className="fixed inset-0 bg-neutral-100 overflow-hidden">
      <div className="relative w-full h-full">
        {layout.map((tile) => (
          <div
            key={`${tile.x}-${tile.y}`}
            className="absolute rounded bg-neutral-200 animate-pulse"
            style={{
              left: tile.x,
              top: tile.y,
              width: tile.w,
              height: tile.h,
            }}
          />
        ))}
      </div>
    </div>
  );
}
