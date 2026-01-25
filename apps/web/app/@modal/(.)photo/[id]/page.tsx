import { cacheLife } from 'next/cache';
import { notFound } from 'next/navigation';

import { PhotoModal } from 'components/photo-modal';

import { loadManifest } from 'lib/manifest-server';

interface ModalPageProps {
  params: Promise<{ id: string }>;
}

// Generate static pages for all photos at build time
export async function generateStaticParams() {
  const manifest = await loadManifest();
  return Object.keys(manifest).map((id) => ({ id }));
}

async function getPhotoData(photoId: string) {
  'use cache';
  cacheLife('days');

  const manifest = await loadManifest();

  if (!manifest[photoId]) {
    return null;
  }

  return manifest[photoId];
}

export default async function PhotoModalPage({ params }: ModalPageProps) {
  const { id: photoId } = await params;
  const photoData = await getPhotoData(photoId);

  if (!photoData) {
    notFound();
  }

  return <PhotoModal photoName={photoId} photoData={photoData} />;
}
