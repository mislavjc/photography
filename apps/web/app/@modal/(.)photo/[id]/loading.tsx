'use client';

import { X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';

import { ContainedPhoto } from 'components/contained-photo';

import { getPhotoPreview } from 'lib/photo-preview-store';

// Instant shell for the intercepted photo modal. It renders the clicked photo's
// image (blurred thumbhash placeholder + full-res, both derived from the client
// preview store) the moment a tile is clicked, while the modal page streams its
// metadata in behind it. The layout mirrors PhotoLayout so the image keeps its
// position when the real content replaces this fallback.
function ImageBox({
  id,
  variant,
}: {
  id: string;
  variant: 'desktop' | 'mobile';
}) {
  const preview = getPhotoPreview(id);
  if (!preview) {
    return (
      <div className="w-full h-full animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
    );
  }
  return (
    <ContainedPhoto variant={variant} uuidWithExt={id} alt="" entry={preview} />
  );
}

export default function PhotoModalLoading() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ? decodeURIComponent(String(params.id)) : '';

  return (
    <div className="fixed inset-0 z-[100] bg-white dark:bg-neutral-900 overflow-hidden">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Close"
        className="fixed top-4 left-4 z-[110] w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center transition-colors"
      >
        <X
          className="w-5 h-5 text-neutral-600 dark:text-neutral-300"
          aria-hidden="true"
        />
      </button>

      {/* Desktop: image + metadata-sidebar skeleton (mirrors PhotoLayout) */}
      <div className="hidden lg:flex h-full">
        <div className="flex-1 flex items-center justify-center p-16 pl-8">
          {id && <ImageBox id={id} variant="desktop" />}
        </div>
        <aside className="w-96 p-4">
          <div className="rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 p-5">
            <div className="animate-pulse space-y-5">
              <div className="h-3.5 w-28 rounded bg-neutral-200/80 dark:bg-neutral-700/80" />
              <div className="space-y-2">
                <div className="h-2.5 w-20 rounded bg-neutral-200/80 dark:bg-neutral-700/80" />
                <div className="h-4 w-32 rounded bg-neutral-200/80 dark:bg-neutral-700/80" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-2.5 w-16 rounded bg-neutral-200/80 dark:bg-neutral-700/80" />
                    <div className="h-4 w-20 rounded bg-neutral-200/80 dark:bg-neutral-700/80" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile: image pinned to top (mirrors PhotoLayout) */}
      <div className="lg:hidden">
        <div className="fixed inset-x-0 top-0 bottom-[40svh] flex items-center justify-center p-4 pt-16">
          {id && <ImageBox id={id} variant="mobile" />}
        </div>
      </div>
    </div>
  );
}
