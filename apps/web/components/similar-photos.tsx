'use client';

import { memo, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';

import { trackEvent } from 'lib/analytics';
import { getSimilarPhotos, type SearchResult } from 'lib/search';

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
};

interface SimilarPhotosProps {
  photoId: string;
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
        const results = await getSimilarPhotos(photoId, controller.signal);
        setSimilar(results);
      } catch (error) {
        // Ignore abort errors
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
        <div className="grid grid-cols-3 gap-1.5">
          {['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => (
            <div
              key={id}
              className="aspect-square rounded-lg animate-shimmer"
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
      <motion.div
        className="grid grid-cols-3 gap-1.5"
        initial="hidden"
        animate="visible"
        variants={gridVariants}
      >
        {similar.map((result) => {
          const imageUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/variants/grid/avif/480/${result.id}.avif`;
          return (
            <motion.div key={result.id} variants={itemVariants}>
              <Link
                href={`/photo/${result.id}`}
                onClick={() =>
                  trackEvent('Similar Photo Click', {
                    from_photo: photoId,
                    to_photo: result.id,
                  })
                }
                className="block aspect-square overflow-hidden rounded-lg bg-neutral-200 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-neutral-400"
              >
                <img
                  src={imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  width={480}
                  height={480}
                  loading="lazy"
                />
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
});
