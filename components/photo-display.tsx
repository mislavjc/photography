import Link from 'next/link';
import React from 'react';

import { Picture } from './picture';

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="uppercase tracking-[0.14em] text-neutral-600 font-mono">
      {children}
    </div>
  );
}

interface PhotoData {
  blurhash?: string;
  w: number;
  h: number;
  exif: {
    camera?: string | null;
    lens?: string | null;
    focalLength?: string | null;
    aperture?: string | null;
    shutterSpeed?: string | null;
    iso?: string | null;
    dateTime?: string | null;
    location?: {
      latitude: number;
      longitude: number;
      altitude?: number;
    } | null;
    dominantColors?: Array<{ hex: string }> | null;
  };
  description?: string;
}

interface PhotoDisplayProps {
  photoName: string;
  photoData: PhotoData;
  backHref?: string;
  /** header height in rem (space reserved for back area) */
  dockHeaderRems?: number; // default 3.5
  showGrid?: boolean;
}

export function PhotoDisplay({
  photoName,
  photoData,
  backHref = '/grid',
  dockHeaderRems = 3.5,
  showGrid = true,
}: PhotoDisplayProps) {
  const dominant = photoData.exif.dominantColors?.[0]?.hex ?? '#e2001a';
  const headerH = `${dockHeaderRems}rem`;

  return (
    <div
      className="relative w-full min-h-[100svh] bg-white text-neutral-900"
      // single source of truth for header height
      style={{ ['--headerH' as string]: headerH }}
    >
      {/* GRID OVERLAY — covers full viewport, positioned before content */}
      {showGrid && (
        <>
          {/* mobile/tablet: 6 columns */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 px-4 sm:px-6 lg:hidden z-0"
            style={{
              backgroundImage: `
                repeating-linear-gradient(
                  to right,
                  rgba(0,0,0,0.14) 0px,
                  rgba(0,0,0,0.14) 1px,
                  transparent 1px,
                  transparent calc(100vw/6)
                )
              `,
              backgroundSize: '100vw 100vh',
              backgroundPosition: '0 0',
              backgroundRepeat: 'repeat',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          />
          {/* desktop: 12 columns */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 px-12 hidden lg:block z-0"
            style={{
              backgroundImage: `
                repeating-linear-gradient(
                  to right,
                  rgba(0,0,0,0.14) 0px,
                  rgba(0,0,0,0.14) 1px,
                  transparent 1px,
                  transparent calc(100vw/12)
                )
              `,
              backgroundSize: '100vw 100vh',
              backgroundPosition: '0 0',
              backgroundRepeat: 'repeat',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          />
        </>
      )}

      {/* content container (padding also used by the overlay so lines align) */}
      <div className="relative z-10 px-4 sm:px-6 lg:px-12">
        {/* sticky header (back) */}
        <header
          className="sticky top-[env(safe-area-inset-top)] z-20 gap-16 flex items-center justify-between bg-white/85 backdrop-blur-sm"
          style={{ height: 'var(--headerH)' }}
        >
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 font-mono text-neutral-800 hover:opacity-80 transition-opacity"
          >
            <span
              className="inline-block h-2 w-8"
              style={{ backgroundColor: dominant }}
            />
            <span>←&nbsp;Back</span>
          </Link>
          <div className="font-mono text-neutral-500 truncate">{photoName}</div>
        </header>

        {/* layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-2">
          {/* IMAGE — mobile: auto height; desktop: viewport minus header */}
          <div className="lg:col-span-8">
            <div className="relative h-auto lg:h-[calc(100vh-var(--headerH))]">
              <Picture
                uuidWithExt={photoName}
                alt={photoName}
                profile="large"
                loading="eager"
                className="block h-full w-full object-contain object-left-top"
              />
            </div>
          </div>

          {/* META — sits right under the image on mobile; scrolls independently on desktop if long */}
          <aside
            className="lg:col-span-4 lg:overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - var(--headerH))' }}
          >
            <div className="pt-2 sm:pt-3 lg:pt-4 pb-6 sm:pb-8 space-y-6">
              {photoData.description && (
                <section className="space-y-2">
                  <Label>Description</Label>
                  <p className="font-sans leading-[1.45]">
                    {photoData.description}
                  </p>
                </section>
              )}

              <section className="space-y-2">
                <Label>Dimensions</Label>
                <div className="font-mono font-semibold">
                  {photoData.w} × {photoData.h}
                </div>
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Camera</Label>
                  <div className="font-mono">
                    {photoData.exif.camera || 'UNKNOWN'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Lens</Label>
                  <div className="font-mono">
                    {photoData.exif.lens || 'UNKNOWN'}
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Focal Length</Label>
                  <div className="font-mono">
                    {photoData.exif.focalLength || 'UNKNOWN'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Aperture</Label>
                  <div className="font-mono">
                    {photoData.exif.aperture || 'UNKNOWN'}
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <Label>Shutter</Label>
                  <div className="font-mono">
                    {photoData.exif.shutterSpeed || 'UNKNOWN'}
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                  <Label>ISO</Label>
                  <div className="font-mono">
                    {photoData.exif.iso || 'UNKNOWN'}
                  </div>
                </div>
              </section>

              {photoData.exif.dateTime && (
                <section className="space-y-2">
                  <Label>Date Captured</Label>
                  <div className="font-mono">{photoData.exif.dateTime}</div>
                </section>
              )}

              {photoData.exif.location && (
                <section className="space-y-2">
                  <Label>Location</Label>
                  <div className="font-mono leading-[1.3]">
                    <div>LAT {photoData.exif.location.latitude.toFixed(6)}</div>
                    <div>
                      LNG {photoData.exif.location.longitude.toFixed(6)}
                    </div>
                    {photoData.exif.location.altitude != null && (
                      <div>ALT {photoData.exif.location.altitude}m</div>
                    )}
                  </div>
                </section>
              )}
            </div>
          </aside>
        </div>

        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  );
}
