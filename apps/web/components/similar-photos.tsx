'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { getSimilarPhotos, type SearchResult } from 'lib/search';

interface SimilarPhotosProps {
  photoId: string;
}

export function SimilarPhotos({ photoId }: SimilarPhotosProps) {
  const [similar, setSimilar] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchSimilar() {
      setLoading(true);
      try {
        const results = await getSimilarPhotos(photoId);
        if (!cancelled) {
          setSimilar(results);
        }
      } catch (error) {
        console.error('Failed to fetch similar photos:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSimilar();

    return () => {
      cancelled = true;
    };
  }, [photoId]);

  if (loading) {
    return (
      <section>
        <div className="uppercase tracking-[0.14em] text-neutral-500 text-xs font-mono mb-3">
          Similar
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => (
            <div
              key={id}
              className="aspect-square rounded-lg bg-neutral-200 animate-pulse"
            />
          ))}
        </div>
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
      <div className="grid grid-cols-3 gap-1.5">
        {similar.map((result) => {
          const imageUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/variants/grid/avif/480/${result.id}.avif`;
          return (
            <Link
              key={result.id}
              href={`/photo/${result.id}`}
              className="aspect-square overflow-hidden rounded-lg bg-neutral-200 transition-transform hover:scale-105"
            >
              <img
                src={imageUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
