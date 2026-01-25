import { cacheLife } from 'next/cache';
import { notFound } from 'next/navigation';

import { PhotoDisplay } from 'components/photo-display';

import { loadManifest } from 'lib/manifest-server';

interface PhotoPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
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

export default async function PhotoPage({
  params,
  searchParams,
}: PhotoPageProps) {
  const { id: photoId } = await params;
  const { from } = await searchParams;

  const photoData = await getPhotoData(photoId);

  if (!photoData) {
    notFound();
  }

  const backHref = from === 'timeline' ? '/timeline' : '/';

  return (
    <PhotoDisplay
      photoName={photoId}
      photoData={photoData}
      backHref={backHref}
    />
  );
}
