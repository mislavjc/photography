// The image column's vertical chrome on desktop: the `p-16` padding around the
// image (4rem top + 4rem bottom = 8rem). Kept as one constant so the container
// height and the `sizes` height-bound below can't drift apart.
const DESKTOP_CHROME = '8rem';

/**
 * Definite heights for the contained-photo box, by layout variant. Definite (not
 * max-height) so the aspect-ratio box resolves its size BEFORE the image loads —
 * otherwise it collapses to 0 and the thumbhash placeholder has no area to paint.
 */
export const PHOTO_IMAGE_HEIGHT = {
  desktop: `calc(100vh - ${DESKTOP_CHROME})`,
  mobile: '100%', // of the `bottom-[40svh]` fixed box, i.e. 60svh
} as const;

/**
 * A contained photo's displayed width is bounded by BOTH the available width
 * and (available height x aspect ratio). A flat `sizes="70vw"` ignores the
 * height bound, so tall/portrait photos fetch a needlessly large srcset variant
 * (e.g. the 2560px one) even though they render much narrower. Encoding the
 * height bound lets the browser pick a right-sized variant, cutting LCP.
 *
 * The shell and the real modal must pass identical values so the browser reuses
 * the same downloaded variant across the loading->loaded swap.
 */
export function containedPhotoSizes(
  w: number,
  h: number,
): {
  desktop: string;
  mobile: string;
} {
  const aspect = (w / h).toFixed(3);
  return {
    // Desktop: image sits in a flex-1 column beside a 24rem sidebar, capped at
    // the PHOTO_IMAGE_HEIGHT.desktop above.
    desktop: `min(70vw, calc((100vh - ${DESKTOP_CHROME}) * ${aspect}))`,
    // Mobile: image occupies the top ~60svh at full width.
    mobile: `min(100vw, calc(60svh * ${aspect}))`,
  };
}
