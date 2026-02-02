import Link from 'next/link';
import { connection } from 'next/server';

import { PhotoPage } from 'components/photo-display';

import { loadManifest } from 'lib/manifest-server';
import { selectRandomPhoto } from 'lib/manifest-utils';

export default async function RandomPage() {
  // Defer to request time since we use Math.random()
  await connection();

  const manifest = await loadManifest();
  const photoNames = Object.keys(manifest);

  if (photoNames.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-base font-semibold">Photo not found</div>
        <p className="text-base text-neutral-600 text-center">
          The photo you&rsquo;re looking for doesn&rsquo;t exist or may have
          been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-mono text-base hover:opacity-80 transition-opacity"
        >
          <span>←</span> <span>Back to Canvas</span>
        </Link>
      </div>
    );
  }

  const randomPhotoName = selectRandomPhoto(photoNames);
  const photoData = manifest[randomPhotoName];

  return <PhotoPage photoName={randomPhotoName} photoData={photoData} backHref="/" />;
}
