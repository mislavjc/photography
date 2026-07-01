import { containedPhotoSizes, PHOTO_IMAGE_HEIGHT } from 'lib/image-sizes';

import { Picture, type PlaceholderEntry } from './picture';

/**
 * A photo displayed "contained" in an aspect-ratio box. Shared by the full photo
 * page, the intercepted modal, and the modal's instant loading shell so the box
 * sizing, `sizes`, and fetch settings stay identical across the loading->loaded
 * swap — no layout jump, and the same srcset variant is reused.
 */
export function ContainedPhoto({
  variant,
  uuidWithExt,
  alt,
  entry,
  dominantColor,
}: {
  variant: 'desktop' | 'mobile';
  uuidWithExt: string;
  alt: string;
  /** Dimensions (required, for the aspect-ratio box) + placeholder fields. */
  entry: PlaceholderEntry & { w: number; h: number };
  /** Optional placeholder fallback when the entry has no dominant color. */
  dominantColor?: string;
}) {
  return (
    <div
      className="relative"
      style={{
        aspectRatio: `${entry.w} / ${entry.h}`,
        height: PHOTO_IMAGE_HEIGHT[variant],
        maxWidth: '100%',
      }}
    >
      <Picture
        uuidWithExt={uuidWithExt}
        alt={alt}
        profile="large"
        loading="eager"
        fetchPriority="high"
        entry={entry}
        dominantColor={dominantColor}
        pictureClassName="block w-full h-full"
        sizes={containedPhotoSizes(entry.w, entry.h)[variant]}
        fit="contain"
      />
    </div>
  );
}
