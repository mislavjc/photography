import { PhotoDisplay } from 'components/photo-display';
import { loadManifest } from 'lib/manifest-server';
import Link from 'next/link';
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
    <div className="min-h-screen p-8">
      <div className="mb-8">
        <Link
          href="/grid"
          className="inline-flex items-center text-lg hover:opacity-80 transition-opacity"
        >
          ← Back to Grid
        </Link>
      </div>

      <PhotoDisplay photoName={photoName} photoData={photoData} />
    </div>
  );
}
