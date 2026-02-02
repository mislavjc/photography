import { cacheLife } from 'next/cache';
import { notFound } from 'next/navigation';

import { PhotoPage as PhotoPageComponent } from 'components/photo-display';

import { loadManifest } from 'lib/manifest-server';

interface PhotoPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; q?: string }>;
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
  const { from, q } = await searchParams;

  const photoData = await getPhotoData(photoId);

  if (!photoData) {
    notFound();
  }

  const basePath = from === 'timeline' ? '/timeline' : '/';
  const backHref = q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath;

  return (
    <PhotoPageComponent
      photoName={photoId}
      photoData={photoData}
      backHref={backHref}
    />
  );
}
