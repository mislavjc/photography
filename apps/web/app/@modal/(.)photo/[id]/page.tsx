import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PhotoModal } from 'components/photo-display';
import { SimilarPhotos } from 'components/similar-photos';

import { getPhotoData } from 'lib/manifest-server';

export const metadata: Metadata = {
  title: 'Photo',
};

interface ModalPageProps {
  params: Promise<{ id: string }>;
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
