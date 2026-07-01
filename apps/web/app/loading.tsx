import { GallerySkeleton } from 'components/gallery-skeleton';

export default function Loading() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-neutral-100 dark:bg-neutral-900">
      <GallerySkeleton />
    </div>
  );
}
