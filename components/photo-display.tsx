/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useMemo } from 'react';
import { Shuffle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from './ui/button';
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
      address?: string | null;
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
  randomPhotoRoute?: string;
}

const mapboxStaticUrl = ({
  lat,
  lon,
  zoom = 14,
  width = 800,
  height = 420,
  colorHex = 'e2001a',
  // pass either a-z / 0..99 or a known Maki icon. Leave undefined to omit.
  label,
  styleId = 'mapbox/light-v11',
  retina = true,
}: {
  lat: number;
  lon: number;
  zoom?: number;
  width?: number;
  height?: number;
  colorHex?: string;
  label?: string; // e.g. "l" or "12"; omit to avoid errors
  styleId?: string;
  retina?: boolean;
}) => {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
  const L = lat.toFixed(6);
  const X = lon.toFixed(6);

  // If label is provided, keep it; else, omit label.
  // (Safe fallback: alphanumeric like "l" or "1" if you prefer a label.)
  const pin = label
    ? `pin-l-${encodeURIComponent(label)}+${colorHex}(${X},${L})`
    : `pin-l+${colorHex}(${X},${L})`;

  const at2x = retina ? '@2x' : '';
  return `https://api.mapbox.com/styles/v1/${styleId}/static/${pin}/${X},${L},${zoom}/${width}x${height}${at2x}?access_token=${token}`;
};

function isPortrait(w: number, h: number) {
  return h >= w;
}

export function PhotoDisplay({
  photoName,
  photoData,
  backHref = '/grid',
  dockHeaderRems = 3.5,
  showGrid = true,
  randomPhotoRoute,
}: PhotoDisplayProps) {
  const router = useRouter();
  const dominant = photoData.exif.dominantColors?.[0]?.hex ?? '#e2001a';
  const headerH = `${dockHeaderRems}rem`;
  const hasLocation = Boolean(photoData.exif.location);

  const mapUrl = useMemo(() => {
    if (!hasLocation) return null;
    const { latitude, longitude } = photoData.exif.location!;
    // a bit tighter zoom if the photo is portrait (feels nicer)
    const zoom = isPortrait(photoData.w, photoData.h) ? 15 : 14;
    return mapboxStaticUrl({
      lat: latitude,
      lon: longitude,
      zoom,
      width: 800,
      height: 420,
      colorHex: (photoData.exif.dominantColors?.[0]?.hex ?? '#e2001a').replace(
        '#',
        '',
      ),
      // no label → cleaner
    });
  }, [hasLocation, photoData]);

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
          className="sticky top-[env(safe-area-inset-top)] z-20 bg-white/85 backdrop-blur-sm"
          style={{ height: 'var(--headerH)' }}
        >
          <div className="flex items-center justify-between h-full">
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
            <div className="flex items-center gap-2">
              {randomPhotoRoute && (
                <Button
                  onClick={() => router.push(randomPhotoRoute)}
                  variant="ghost"
                  size="sm"
                  className="font-mono text-neutral-600 hover:text-neutral-800 hover:bg-neutral-50 text-xs sm:text-sm"
                >
                  <Shuffle className="w-3 h-3 sm:w-4 sm:h-4" />
                </Button>
              )}
              <div className="font-mono text-neutral-500 truncate text-xs sm:text-sm max-w-[80px] sm:max-w-none">
                {photoName}
              </div>
            </div>
          </div>
        </header>

        {/* layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-2">
          {/* IMAGE — mobile: auto height; desktop: viewport minus header */}
          <div className="lg:col-span-8">
            <div
              className="relative w-full overflow-hidden"
              style={{
                aspectRatio: `${photoData.w} / ${photoData.h}`,
                maxHeight: `calc(100vh - var(--headerH))`,
              }}
            >
              {/* aspect-ratio matched BG underlay sized to actual image box */}
              <div
                className="absolute top-0 left-0 z-0"
                style={{
                  width: `min(100%, calc((100vh - var(--headerH)) * ${photoData.w / photoData.h}))`,
                  aspectRatio: `${photoData.w} / ${photoData.h}`,
                  maxHeight: `calc(100vh - var(--headerH))`,
                  backgroundColor: dominant,
                }}
              />

              <div className="absolute inset-0 z-10">
                <Picture
                  uuidWithExt={photoName}
                  alt={photoName}
                  profile="large"
                  loading="eager"
                  intrinsicWidth={photoData.w}
                  intrinsicHeight={photoData.h}
                  // key bits ↓
                  imgClassName="block w-full h-full object-contain object-left-top"
                  pictureClassName="block w-full h-full" // avoid inline <picture>
                  sizes="100vw"
                  dominantColor={dominant}
                />
              </div>
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

              {hasLocation && mapUrl && (
                <section className="space-y-2">
                  <Label>Location</Label>

                  {photoData.exif.location!.address && (
                    <div className="font-mono">
                      {photoData.exif.location!.address}
                    </div>
                  )}

                  {/* Map card: fixed aspect to prevent CLS */}
                  <div
                    className="relative overflow-hidden border border-neutral-200"
                    style={{ aspectRatio: '800 / 420' }} // reserve space up-front
                    data-mapcard
                  >
                    {/* Skeleton (visible until image loads or fails) */}
                    <div
                      className="absolute inset-0 bg-neutral-100"
                      data-skel
                    />

                    {/* Static map image */}
                    <img
                      src={mapUrl}
                      alt={`Map preview for ${photoName}`}
                      className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300"
                      width={800} // also helps CLS
                      height={420} // also helps CLS
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      onLoad={(e) => {
                        // hide skeleton when the image is ready
                        const card = (e.currentTarget.closest(
                          '[data-mapcard]',
                        ) as HTMLElement)!;
                        e.currentTarget.classList.remove('opacity-0');
                        card
                          .querySelector<HTMLElement>('[data-skel]')
                          ?.classList.add('hidden');
                        card
                          .querySelector<HTMLElement>('[data-fallback]')
                          ?.classList.add('hidden');
                      }}
                      onError={(e) => {
                        // hide image, show fallback text (no React state)
                        const card = (e.currentTarget.closest(
                          '[data-mapcard]',
                        ) as HTMLElement)!;
                        e.currentTarget.classList.add('hidden');
                        card
                          .querySelector<HTMLElement>('[data-skel]')
                          ?.classList.add('hidden');
                        card
                          .querySelector<HTMLElement>('[data-fallback]')
                          ?.classList.remove('hidden');
                      }}
                    />

                    {/* Fallback text overlay (hidden by default) */}
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-neutral-50"
                      data-fallback
                    >
                      <div className="text-center text-sm text-neutral-600 font-mono px-4">
                        {photoData.exif.location!.address ? (
                          <>
                            <div className="font-sans mb-2">
                              {photoData.exif.location!.address}
                            </div>
                            <div>
                              {photoData.exif.location!.latitude.toFixed(6)},{' '}
                              {photoData.exif.location!.longitude.toFixed(6)}
                            </div>
                          </>
                        ) : (
                          <>
                            Map unavailable ·{' '}
                            {photoData.exif.location!.latitude.toFixed(6)},{' '}
                            {photoData.exif.location!.longitude.toFixed(6)}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Minimal caption with coords (keep tiny, always visible) */}
                  <div className="font-mono text-sm text-neutral-600">
                    {photoData.exif.location!.latitude.toFixed(6)},{' '}
                    {photoData.exif.location!.longitude.toFixed(6)}
                    {photoData.exif.location!.altitude != null && (
                      <> · {photoData.exif.location!.altitude}m</>
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
