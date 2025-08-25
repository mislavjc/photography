import React from 'react';

import ClientHomePage from '../components/client-home-page';
import { loadManifest } from '../lib/manifest-server';

export default async function HomePage() {
  const manifest = await loadManifest();

  return <ClientHomePage manifest={manifest} />;
}
