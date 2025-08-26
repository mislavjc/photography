import { computeNearSquareLayout } from 'lib/layout';
import { loadManifest } from 'lib/manifest-server';

import { PannableGrid } from '../../components/finite-grid';

export default async function Page() {
  const manifest = await loadManifest();
  const layout = computeNearSquareLayout(manifest);

  return <PannableGrid manifest={manifest} initialLayout={layout} />;
}
