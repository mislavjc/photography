'use client';

import Link from 'next/link';

import { trackEvent } from 'lib/analytics';

export function SimilarPhotoLink({
  photoId,
  targetId,
  children,
}: {
  photoId: string;
  targetId: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/photo/${targetId}`}
      replace
      // Bounded set of similar photos with high click-intent. The destination's
      // photo data is cached ('use cache'), so prefetch ships it ahead of the
      // click for an instant transition (not just the App Shell skeleton).
      prefetch
      onClick={() =>
        trackEvent('Similar Photo Click', {
          from_photo: photoId,
          to_photo: targetId,
        })
      }
      className="flex-shrink-0 h-24 block overflow-hidden bg-neutral-200"
    >
      {children}
    </Link>
  );
}
