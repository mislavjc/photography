import { cacheLife } from 'next/cache';
import { notFound } from 'next/navigation';

import { loadManifest } from 'lib/manifest-server';

import { PhotoDisplay } from 'components/photo-display';

interface PhotoPageProps {
  params: Promise<{ 'photo-name': string }>;
  searchParams: Promise<{ from?: string }>;
}

async function getPhotoData(photoName: string) {
  'use cache';
  cacheLife('days');

  const manifest = await loadManifest();

  if (!manifest[photoName]) {
    return null;
  }

  return manifest[photoName];
}

export default async function PhotoPage({
  params,
  searchParams,
}: PhotoPageProps) {
  const { 'photo-name': photoName } = await params;
  const { from } = await searchParams;

  const photoData = await getPhotoData(photoName);

  if (!photoData) {
    notFound();
  }

  const backHref = from === 'timeline' ? '/timeline' : '/';

  return (
    <PhotoDisplay
      photoName={photoName}
      photoData={photoData}
      backHref={backHref}
      dockHeaderRems={3.5}
      showGrid
    />
  );
}
