import { loadManifest } from 'lib/manifest-server';

import { GridComponent } from './grid-component';

export default async function GridPage() {
  const manifest = await loadManifest();

  return <GridComponent manifest={manifest} />;
}
