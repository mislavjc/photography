import { cacheLife } from 'next/cache';

import { computeNearSquareLayout } from 'lib/layout';
import { loadManifest } from 'lib/manifest-server';

import { PannableGrid } from '../components/finite-grid';

export default async function Page() {
  'use cache';
  cacheLife('days');

  const manifest = await loadManifest();

  const layout = computeNearSquareLayout(manifest);

  return (
    <div>
      <PannableGrid
        manifest={manifest}
        initialLayout={layout}
        stateKey={`grid`}
      />
    </div>
  );
}
