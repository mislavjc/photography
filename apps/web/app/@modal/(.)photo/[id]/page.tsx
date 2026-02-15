import { cacheLife } from 'next/cache';
import { notFound } from 'next/navigation';

import { PhotoModal } from 'components/photo-display';

import { loadManifest } from 'lib/manifest-server';

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

  return <PhotoModal photoName={photoId} photoData={photoData} />;
}
