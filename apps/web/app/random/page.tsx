import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';

import { PhotoPage } from 'components/photo-display';
import { SimilarPhotos } from 'components/similar-photos';

import { loadManifest } from 'lib/manifest-server';
import { selectRandomPhoto } from 'lib/manifest-utils';

export const metadata: Metadata = {
  title: 'Random Photo',
};

export default async function RandomPage() {
  // Defer to request time since we use Math.random()
  await connection();

  const manifest = await loadManifest();
  const photoNames = Object.keys(manifest);

  if (photoNames.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 bg-white dark:bg-neutral-950">
        <div className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Photo not found
        </div>
        <p className="text-base text-neutral-600 dark:text-neutral-400 text-center">
          The photo you&rsquo;re looking for doesn&rsquo;t exist or may have
          been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-mono text-base text-neutral-900 dark:text-neutral-100 hover:opacity-80 transition-opacity"
        >
          <span>←</span> <span>Back to Canvas</span>
        </Link>
      </div>
    );
  }

  const randomPhotoName = selectRandomPhoto(photoNames);
  const photoData = manifest[randomPhotoName];

  return (
    <Suspense>
      <PhotoPage
        photoName={randomPhotoName}
        photoData={photoData}
        similarSlot={
          <Suspense fallback={<div className="h-24 animate-shimmer" />}>
            <SimilarPhotos photoId={randomPhotoName} />
          </Suspense>
        }
      />
    </Suspense>
  );
}
