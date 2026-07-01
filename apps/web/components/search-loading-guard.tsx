import { GallerySkeleton } from 'components/gallery-skeleton';

/**
 * Pre-paint guard for shared `/?q=` search links.
 *
 * The gallery is statically prerendered *unfiltered* (so its LCP image is baked
 * into the HTML and paints instantly). But on a cold load of a search URL, the
 * filter only applies after the client-side search resolves — which would flash
 * the full gallery first. This inline script runs during HTML parse, before the
 * gallery paints: if `?q` is present it marks the document, and the CSS below
 * covers the gallery with a spinner until `usePhotoSearch` clears the mark once
 * results (or no-results / error) land. Normal `/` loads are untouched.
 */
export function SearchLoadingGuard() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(new URLSearchParams(location.search).get('q'))document.documentElement.setAttribute('data-searching','')}catch(e){}`,
        }}
      />
      {/* z-60 sits below the navbar (z-70) so the search box stays visible. */}
      <div
        className="search-loading-overlay fixed inset-0 z-[60] bg-neutral-100 dark:bg-neutral-900"
        aria-hidden="true"
      >
        <GallerySkeleton />
      </div>
    </>
  );
}
