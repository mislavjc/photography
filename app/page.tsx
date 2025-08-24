import React from 'react';

import InfiniteImageMap from '../components/infinite-image-map';
import { PerformanceMonitor } from '../components/performance-monitor';
import { loadManifest } from '../lib/manifest-server';

export default async function HomePage() {
  const manifest = await loadManifest();

  return (
    <>
      <InfiniteImageMap manifest={manifest} />
      <PerformanceMonitor enabled={process.env.NODE_ENV === 'development'} />
    </>
  );
}
