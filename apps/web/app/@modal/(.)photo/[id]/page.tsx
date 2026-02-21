import { Suspense } from 'react';
import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';
import { notFound } from 'next/navigation';

import { PhotoModal } from 'components/photo-display';
import { SimilarPhotos } from 'components/similar-photos';

import { loadManifest } from 'lib/manifest-server';

export const metadata: Metadata = {
  title: 'Photo',
};

interface ModalPageProps {
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

export default async function PhotoModalPage({ params }: ModalPageProps) {
  const { id: photoId } = await params;
  const photoData = await getPhotoData(photoId);

  if (!photoData) {
    notFound();
  }

  return (
    <PhotoModal
      photoName={photoId}
      photoData={photoData}
      similarSlot={
        <Suspense fallback={<div className="h-24 animate-shimmer" />}>
          <SimilarPhotos photoId={photoId} />
        </Suspense>
      }
    />
  );
}
