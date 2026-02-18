import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { PhotoPage as PhotoPageComponent } from 'components/photo-display';
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
    </Suspense>
  );
}
