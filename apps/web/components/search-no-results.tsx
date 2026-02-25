'use client';

import { SEARCH_CATEGORIES } from 'lib/search-categories';

const COLLAGE_ROTATIONS = ['-rotate-6', 'rotate-3', '-rotate-2'];
const COLLAGE_OFFSETS = [
  'left-0 top-2',
  'right-0 top-0',
  'left-1/2 -translate-x-1/2 top-4',
];
const COLLAGE_Z_INDICES = ['z-10', 'z-20', 'z-30'];

interface SearchNoResultsProps {
  searchQuery: string;
  onSearch?: (query: string) => void;
}

export function SearchNoResults({ searchQuery, onSearch }: SearchNoResultsProps) {
  return (
    <div className="fixed inset-0 z-[40] flex items-center justify-center bg-white dark:bg-neutral-900 pt-14 px-4">
      <div className="w-full max-w-4xl rounded-3xl bg-neutral-100 dark:bg-neutral-900 p-6 sm:p-10">
        <div className="mb-8 text-center">
          <h2 className="text-xl sm:text-2xl font-medium text-neutral-900 dark:text-neutral-100">
            No results for &ldquo;{searchQuery}&rdquo;
          </h2>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Try searching for one of these categories instead
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
          {SEARCH_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSearch?.(cat.query)}
              className={`group flex flex-col overflow-hidden rounded-2xl bg-neutral-200/60 dark:bg-neutral-800/60 p-3 transition-all hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:ring-2 hover:ring-neutral-300 dark:hover:ring-neutral-600 ${idx >= 4 ? 'hidden sm:flex' : ''}`}
            >
              <div className="relative h-28 sm:h-32 mb-3">
                {cat.previewIds.slice(0, 3).map((id, idx) => {
                  const imageUrl = `${process.env.NEXT_PUBLIC_R2_URL}/variants/grid/avif/480/${id}.avif`;
                  const rotation = COLLAGE_ROTATIONS[idx];
                  const offset = COLLAGE_OFFSETS[idx];
                  const zIndex = COLLAGE_Z_INDICES[idx];
                  const size =
                    idx === 2
                      ? 'w-20 h-20 sm:w-24 sm:h-24'
                      : 'w-16 h-16 sm:w-20 sm:h-20';
                  return (
                    <div
                      key={id}
                      className={`absolute ${offset} ${zIndex} ${rotation} ${size} overflow-hidden rounded-lg bg-white shadow-md transition-transform duration-300 group-hover:rotate-0`}
                    >
                      <img
                        src={imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  );
                })}
              </div>
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 text-center">
                {cat.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
