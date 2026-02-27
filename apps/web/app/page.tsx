import { Suspense } from 'react';
import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';

import { EXT_RE } from 'lib/constants';
import { computeNearSquareLayout } from 'lib/layout';
import { loadManifest } from 'lib/manifest-server';
import { trimManifestForClient } from 'lib/manifest-utils';

import { HomeGrid } from '../components/home-grid';

export const metadata: Metadata = {
  title: 'Photos',
};

const SSR_VIEWPORT_WIDTH = 1200;
const SSR_VIEWPORT_HEIGHT = 800;
const LCP_PRELOAD_COUNT = 3;

// Get LCP candidate images (center of the grid, visible on initial load)
function getLcpCandidates(
  layout: ReturnType<typeof computeNearSquareLayout>,
  count = LCP_PRELOAD_COUNT,
) {
  const centerX = layout.width / 2;
  const centerY = layout.height / 2;
  // Match the client grid's SSR-safe viewport to keep preload targets aligned.
  const viewW = SSR_VIEWPORT_WIDTH;
  const viewH = SSR_VIEWPORT_HEIGHT;

  // Find images near center that will be visible first and prioritize larger tiles.
  return layout.items
    .filter(
      (it) =>
        it.x < centerX + viewW / 2 &&
        it.x + it.w > centerX - viewW / 2 &&
        it.y < centerY + viewH / 2 &&
        it.y + it.h > centerY - viewH / 2,
    )
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .slice(0, count);
}

const R2_URL =
  process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_URL ?? '';

export default async function Page() {
  'use cache';
  cacheLife('days');

  const manifest = await loadManifest();

  const layout = computeNearSquareLayout(manifest);
  const lcpCandidates = getLcpCandidates(layout);

  // Strip manifest to only fields needed by client: w, h, first dominant color
  const trimmedManifest = trimManifestForClient(manifest);

  return (
    <>
      {/* Preload LCP candidate images for faster initial paint */}
      {R2_URL &&
        lcpCandidates.map((candidate) => {
          const base = candidate.filename.replace(EXT_RE, '');
          return (
            <link
              key={candidate.filename}
              rel="preload"
              as="image"
              href={`${R2_URL}/variants/grid/avif/320/${base}.avif`}
              type="image/avif"
              crossOrigin="anonymous"
            />
          );
        })}
      <main>
        <Suspense fallback={null}>
          <HomeGrid manifest={trimmedManifest} initialLayout={layout} />
        </Suspense>
      </main>
    </>
  );
}
