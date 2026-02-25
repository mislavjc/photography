'use client';

import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ reset }: ErrorProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6">
      <div className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
        Something went wrong
      </div>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center max-w-sm">
        An unexpected error occurred. Please try again.
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
