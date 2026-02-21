import { Suspense } from 'react';
import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';
import { notFound } from 'next/navigation';

import { PhotoPage as PhotoPageComponent } from 'components/photo-display';
import { PhotoKeyboardNav } from 'components/photo-keyboard-nav';
import { SimilarPhotos } from 'components/similar-photos';

import { loadManifest } from 'lib/manifest-server';

interface PhotoPageProps {
  params: Promise<{ id: string }>;
}

async function getPhotoData(photoId: string) {
  'use cache';
  cacheLife('days');

  const manifest = await loadManifest();
  const key = manifest[photoId] ? photoId : `${photoId}.jpg`;

  if (!manifest[key]) {
    return null;
  }

  return manifest[key];
}

export async function generateMetadata({
  params,
}: PhotoPageProps): Promise<Metadata> {
  const { id: photoId } = await params;
  const photoData = await getPhotoData(photoId);
  if (!photoData) return {};
  return {
    title: 'Photo',
  };
}

// Page is now fully static - searchParams are read client-side via useSearchParams
// This enables partial prerendering: photo content is cached, back link is dynamic
export default async function PhotoPage({ params }: PhotoPageProps) {
  const { id: photoId } = await params;

  const photoData = await getPhotoData(photoId);

  if (!photoData) {
    notFound();
  }

  // Get all photo IDs sorted by date for keyboard navigation
  const manifest = await loadManifest();
  const allPhotoIds = Object.entries(manifest)
    .filter(([, data]) => data.exif?.dateTime)
    .sort(([, a], [, b]) => {
      const dateA = new Date(a.exif.dateTime!).getTime();
      const dateB = new Date(b.exif.dateTime!).getTime();
      return dateB - dateA; // Newest first
    })
    .map(([id]) => id);

  return (
    <Suspense>
      <PhotoPageComponent
        photoName={photoId}
        photoData={photoData}
        similarSlot={
          <Suspense fallback={<div className="h-24 animate-shimmer" />}>
            <SimilarPhotos photoId={photoId} />
          </Suspense>
        }
      />
      <PhotoKeyboardNav currentPhotoId={photoId} allPhotoIds={allPhotoIds} />
    </Suspense>
  );
}
