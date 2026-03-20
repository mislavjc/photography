'use client';

import { ErrorPage } from 'components/error-page';

export default function TimelineError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPage
      title="Failed to load timeline"
      description="Something went wrong while loading your photos."
      reset={reset}
    />
  );
}
