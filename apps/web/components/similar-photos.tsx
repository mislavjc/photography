'use client';

import { memo, useEffect, useState } from 'react';
import Link from 'next/link';

import { trackEvent } from 'lib/analytics';
import { getSimilarPhotos, type SearchResult } from 'lib/search';

interface SimilarPhotosProps {
  photoId: string;
}

function imageUrl(id: string) {
  return `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/variants/grid/avif/480/${id}.avif`;
}

export const SimilarPhotos = memo(function SimilarPhotos({
  photoId,
}: SimilarPhotosProps) {
  const [similar, setSimilar] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchSimilar() {
      setLoading(true);
      try {
        const id = photoId.replace(/\.[^.]+$/, '');
        const results = await getSimilarPhotos(id, controller.signal);
        setSimilar(results);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error('Failed to fetch similar photos:', error);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchSimilar();

    return () => {
      controller.abort();
    };
  }, [photoId]);

  if (loading) {
    return (
      <section>
        <div className="uppercase tracking-[0.14em] text-neutral-500 text-xs font-mono mb-3">
          Similar
        </div>
        <div className="h-24 animate-shimmer" />
      </section>
    );
  }

  if (similar.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="uppercase tracking-[0.14em] text-neutral-500 text-xs font-mono mb-3">
        Similar
      </div>
      <div className="flex gap-1 overflow-x-auto -mx-5 px-5 scrollbar-none">
        {similar.map((result) => (
          <Link
            key={result.id}
            href={`/photo/${result.id}`}
            onClick={() =>
              trackEvent('Similar Photo Click', {
                from_photo: photoId,
                to_photo: result.id,
              })
            }
            className="flex-shrink-0 h-24 block overflow-hidden bg-neutral-200"
          >
            <img
              src={imageUrl(result.id)}
              alt=""
              className="h-full w-auto block"
              loading="lazy"
            />
          </Link>
        ))}
      </div>
    </section>
  );
});
