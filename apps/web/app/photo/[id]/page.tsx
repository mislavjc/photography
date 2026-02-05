import { cacheLife } from 'next/cache';
import { notFound } from 'next/navigation';

import { PhotoPage as PhotoPageComponent } from 'components/photo-display';

import { loadManifest } from 'lib/manifest-server';

interface PhotoPageProps {
  params: Promise<{ id: string }>;
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

// Page is now fully static - searchParams are read client-side via useSearchParams
// This enables partial prerendering: photo content is cached, back link is dynamic
export default async function PhotoPage({ params }: PhotoPageProps) {
  const { id: photoId } = await params;

  const photoData = await getPhotoData(photoId);

  if (!photoData) {
    notFound();
  }

  return <PhotoPageComponent photoName={photoId} photoData={photoData} />;
}
