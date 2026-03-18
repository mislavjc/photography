'use client';

import { ErrorPage } from 'components/error-page';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPage
      title="Something went wrong"
      description="An unexpected error occurred. Please try again."
      reset={reset}
    />
  );
}
