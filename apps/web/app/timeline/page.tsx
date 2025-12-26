import { cacheLife } from 'next/cache';

import { Timeline } from 'components/timeline';

import { loadManifest } from 'lib/manifest-server';
import { groupPhotosForTimeline } from 'lib/timeline-utils';

export default async function TimelinePage() {
  'use cache';
  cacheLife('days');

  const manifest = await loadManifest();
  const timelineData = groupPhotosForTimeline(manifest);

  return (
    <main>
      <Timeline data={timelineData} manifest={manifest} />
    </main>
  );
}
