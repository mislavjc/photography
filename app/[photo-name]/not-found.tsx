import Link from 'next/link';

import { PhotoDisplay } from 'components/photo-display';

import { loadManifest } from 'lib/manifest-server';

export default async function NotFound() {
  const manifest = await loadManifest();
  const photoNames = Object.keys(manifest);

  if (photoNames.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-base font-semibold">Photo not found</div>
        <p className="text-base text-neutral-600 text-center">
          The photo you’re looking for doesn’t exist or may have been moved.
        </p>
        <Link
          href="/grid"
          className="inline-flex items-center gap-2 font-mono text-base hover:opacity-80 transition-opacity"
        >
          <span>←</span> <span>Back to Grid</span>
        </Link>
      </div>
    );
  }

  const randomPhotoName =
    photoNames[Math.floor(Math.random() * photoNames.length)];
  const photoData = manifest[randomPhotoName];

  return (
    <PhotoDisplay
      photoName={randomPhotoName}
      photoData={photoData}
      backHref="/"
      dockHeaderRems={3.5}
      showGrid
    />
  );
}
