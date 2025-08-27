import { PhotoDisplay } from 'components/photo-display';
import { loadManifest } from 'lib/manifest-server';
import Link from 'next/link';

export default async function NotFound() {
  const manifest = await loadManifest();

  // Get all photo names and pick a random one
  const photoNames = Object.keys(manifest);
  const randomPhotoName =
    photoNames[Math.floor(Math.random() * photoNames.length)];

  if (!randomPhotoName) {
    // Fallback if no photos available
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

        <div className="text-center">
          <h1 className="text-4xl font-bold mb-8">Photo Not Found</h1>
          <div className="mb-8">
            The photo you&apos;re looking for doesn&apos;t exist or may have
            been moved.
          </div>
          <div>No photos available to display.</div>
        </div>
      </div>
    );
  }

  const photoData = manifest[randomPhotoName];

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

      <PhotoDisplay
        photoName={randomPhotoName}
        photoData={photoData}
        showNotFoundMessage={true}
        customTitle={randomPhotoName}
      />
    </div>
  );
}
