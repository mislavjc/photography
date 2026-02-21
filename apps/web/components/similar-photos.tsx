import { cacheLife } from 'next/cache';
import Image from 'next/image';

import { getSimilarPhotos } from 'lib/search';

import { SimilarPhotoLink } from './similar-photo-link';

function imageUrl(id: string) {
  return `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/variants/grid/avif/480/${id}.avif`;
}

async function fetchSimilar(photoId: string) {
  'use cache';
  cacheLife('days');

  const id = photoId.replace(/\.[^.]+$/, '');
  return getSimilarPhotos(id);
}

export async function SimilarPhotos({ photoId }: { photoId: string }) {
  const results = await fetchSimilar(photoId);

  if (results.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400 text-xs font-mono mb-3">
        Similar
      </div>
      <div className="flex gap-1 overflow-x-auto -mx-5 px-5 scrollbar-none">
        {results.map((result) => (
          <SimilarPhotoLink
            key={result.id}
            photoId={photoId}
            targetId={result.id}
          >
            <Image
              src={imageUrl(result.id)}
              alt=""
              width={160}
              height={96}
              className="h-full w-auto block"
              loading="lazy"
              unoptimized
            />
          </SimilarPhotoLink>
        ))}
      </div>
    </section>
  );
}
