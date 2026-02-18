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
