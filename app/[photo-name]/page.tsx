import { PhotoDisplay } from 'components/photo-display';
import { loadManifest } from 'lib/manifest-server';
import { notFound } from 'next/navigation';

interface PhotoPageProps {
  params: Promise<{ 'photo-name': string }>;
}

export default async function PhotoPage({ params }: PhotoPageProps) {
  const { 'photo-name': photoName } = await params;
  const manifest = await loadManifest();

  if (!manifest[photoName]) {
    notFound();
  }

  const photoData = manifest[photoName];

  return (
    <PhotoDisplay
      photoName={photoName}
      photoData={photoData}
      backHref="/"
      dockHeaderRems={3.5}
      showGrid
    />
  );
}
