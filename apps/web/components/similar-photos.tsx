import { cacheLife } from 'next/cache';

import { loadManifest } from 'lib/manifest-server';
import { getSimilarPhotos } from 'lib/search';

import { Picture } from './picture';
import { SimilarPhotoLink } from './similar-photo-link';

async function fetchSimilar(photoId: string) {
  'use cache';
  cacheLife('days');

  const id = photoId.replace(/\.[^.]+$/, '');
  return getSimilarPhotos(id);
}

export async function SimilarPhotos({ photoId }: { photoId: string }) {
  const [results, manifest] = await Promise.all([
    fetchSimilar(photoId),
    loadManifest(),
  ]);

  if (results.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-3">
        Similar
      </div>
      <div className="flex gap-1 overflow-x-auto -mx-5 px-5 scrollbar-none">
        {results.map((result) => {
          const entry = manifest[result.id] ?? manifest[`${result.id}.jpg`];
          return (
            <SimilarPhotoLink
              key={result.id}
              photoId={photoId}
              targetId={result.id}
            >
              <div
                className="h-full"
                style={{
                  aspectRatio: entry ? `${entry.w} / ${entry.h}` : '3 / 2',
                }}
              >
                <Picture
                  uuidWithExt={result.id}
                  alt=""
                  profile="grid"
                  loading="lazy"
                  entry={entry}
                  pictureClassName="block w-full h-full"
                  sizes="160px"
                  fit="cover"
                />
              </div>
            </SimilarPhotoLink>
          );
        })}
      </div>
    </section>
  );
}
