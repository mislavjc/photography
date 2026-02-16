import { cacheLife } from 'next/cache';
import { Suspense } from 'react';

import { computeNearSquareLayout } from 'lib/layout';
import { loadManifest } from 'lib/manifest-server';
import type { Manifest } from 'types';

import { HomeGrid } from '../components/home-grid';

// Get LCP candidate images (center of the grid, visible on initial load)
function getLcpCandidates(
  layout: ReturnType<typeof computeNearSquareLayout>,
  count = 4,
) {
  const centerX = layout.width / 2;
  const centerY = layout.height / 2;
  // Approximate initial viewport size
  const viewW = 1400;
  const viewH = 900;

  // Find images near center that will be visible first
  return layout.items
    .filter(
      (it) =>
        it.x < centerX + viewW / 2 &&
        it.x + it.w > centerX - viewW / 2 &&
        it.y < centerY + viewH / 2 &&
        it.y + it.h > centerY - viewH / 2,
    )
    .slice(0, count);
}

const EXT_RE = /\.[^.]+$/;

export default async function Page() {
  'use cache';
  cacheLife('days');

  const manifest = await loadManifest();

  const layout = computeNearSquareLayout(manifest);
  const lcpCandidates = getLcpCandidates(layout);

  // Strip manifest to only fields needed by client: w, h, first dominant color
  const trimmedManifest = {} as Manifest;
  for (const [key, value] of Object.entries(manifest)) {
    trimmedManifest[key] = {
      w: value.w,
      h: value.h,
      exif: {
        dominantColors: value.exif?.dominantColors?.slice(0, 1),
      },
    } as Manifest[string];
  }

  return (
    <>
      {/* Preload LCP candidate images for faster initial paint */}
      {lcpCandidates.map((candidate) => {
        const base = candidate.filename.replace(EXT_RE, '');
        return (
          <link
            key={candidate.filename}
            rel="preload"
            as="image"
            href={`https://r2.photos.mislavjc.com/variants/grid/avif/480/${base}.avif`}
            type="image/avif"
          />
        );
      })}
      <div>
        <Suspense fallback={null}>
          <HomeGrid manifest={trimmedManifest} initialLayout={layout} />
        </Suspense>
      </div>
    </>
  );
}
