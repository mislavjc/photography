'use client';

import { ErrorPage } from 'components/error-page';

export default function MapError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPage
      title="Failed to load map"
      description="Something went wrong while loading the photo map."
      reset={reset}
    />
  );
}
