'use client';

import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function TimelineError({ reset }: ErrorProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6">
      <div className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
        Failed to load timeline
      </div>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center max-w-sm">
        Something went wrong while loading your photos.
      </p>
      <div className="flex items-center gap-6">
        <button
          onClick={reset}
          className="font-mono text-sm hover:opacity-70 transition-opacity underline underline-offset-4"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-mono text-sm hover:opacity-70 transition-opacity"
        >
          <span>←</span> <span>Canvas</span>
        </Link>
      </div>
    </div>
  );
}
