import { Suspense } from 'react';
import type { Metadata } from 'next';
import { cacheLife, cacheTag } from 'next/cache';

import { EXT_RE } from 'lib/constants';
import { computeNearSquareLayout } from 'lib/layout';
import { loadManifest } from 'lib/manifest-server';
import { trimManifestForClient } from 'lib/manifest-utils';
import { R2_URL } from 'lib/r2-url';

import { HomeGrid } from '../components/home-grid';

export const metadata: Metadata = {
  title: 'Photos',
};

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

export default async function Page() {
  'use cache';
  cacheLife('days');
  cacheTag('manifest');

  const manifest = await loadManifest();

  const layout = computeNearSquareLayout(manifest);
  const lcpCandidates = getLcpCandidates(layout);

  // Strip manifest to only fields needed by client: w, h, first dominant color
  const trimmedManifest = trimManifestForClient(manifest);

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
            href={`${R2_URL}/variants/grid/avif/480/${base}.avif`}
            type="image/avif"
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
