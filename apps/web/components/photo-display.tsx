/* eslint-disable @next/next/no-img-element */
'use client';

import React, { Suspense, useMemo } from 'react';
import { X } from 'lucide-react';
import { domAnimation, LazyMotion, m, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { env } from 'lib/env';

import { Picture } from './picture';

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="uppercase tracking-[0.14em] text-neutral-500 text-xs font-mono mb-1">
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

const mapboxStaticUrl = ({
  lat,
  lon,
  zoom = 14,
  width = 800,
  height = 420,
  colorHex = 'e2001a',
  styleId = 'mapbox/light-v11',
  retina = true,
}: {
  lat: number;
  lon: number;
  zoom?: number;
  width?: number;
  height?: number;
  colorHex?: string;
  styleId?: string;
  retina?: boolean;
}) => {
  const token = env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const L = lat.toFixed(6);
  const X = lon.toFixed(6);
  const pin = `pin-l+${colorHex}(${X},${L})`;
  const at2x = retina ? '@2x' : '';
  return `https://api.mapbox.com/styles/v1/${styleId}/static/${pin}/${X},${L},${zoom}/${width}x${height}${at2x}?access_token=${token}`;
};

function isPortrait(w: number, h: number) {
  return h >= w;
}

// Extracted map image component for reuse
function MapImage({
  mapUrl,
  photoName,
  loading = 'eager',
}: {
  mapUrl: string;
  photoName: string;
  loading?: 'lazy' | 'eager';
}) {
  return (
    <div
      className="relative overflow-hidden rounded-lg"
      style={{ aspectRatio: '600 / 300' }}
      data-mapcard
    >
      <div className="absolute inset-0 bg-neutral-200" data-skel />
      <img
        src={mapUrl}
        alt={`Map preview for ${photoName}`}
        className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300"
        width={600}
        height={300}
        loading={loading}
        decoding="async"
        draggable={false}
        onLoad={(e) => {
          const card = e.currentTarget.closest('[data-mapcard]') as HTMLElement;
          e.currentTarget.classList.remove('opacity-0');
          card
            .querySelector<HTMLElement>('[data-skel]')
            ?.classList.add('hidden');
        }}
        onError={(e) => {
          const card = e.currentTarget.closest('[data-mapcard]') as HTMLElement;
          e.currentTarget.classList.add('hidden');
          card
            .querySelector<HTMLElement>('[data-skel]')
            ?.classList.add('hidden');
          const fallback = card.querySelector<HTMLElement>('[data-fallback]');
          if (fallback) {
            fallback.classList.remove('hidden');
            fallback.classList.add('flex');
          }
        }}
      />
      <div
        className="absolute inset-0 hidden items-center justify-center bg-neutral-200"
        data-fallback
      >
        <div className="text-center text-xs text-neutral-500 font-mono px-4">
          Map unavailable
        </div>
      </div>
    </div>
  );
}

// Animation variants for metadata sections
const sectionVariants = {
  hidden: { opacity: 0, transform: 'translateY(8px)' },
  visible: {
    opacity: 1,
    transform: 'translateY(0px)',
    transition: {
      duration: 0.25,
      ease: [0.23, 1, 0.32, 1] as const, // ease-out-quint (smoother)
    },
  },
};

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0,
    },
  },
};

// Extracted metadata panel for reuse between desktop sidebar and mobile sheet
function MetadataPanel({
  photoName,
  photoData,
  formattedDate,
  mapUrl,
  hasLocation,
  mapLoading = 'eager',
  similarSlot,
}: {
  photoName: string;
  photoData: PhotoData;
  formattedDate: string | null;
  mapUrl: string | null;
  hasLocation: boolean;
  mapLoading?: 'lazy' | 'eager';
  similarSlot?: React.ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <m.div
      className="p-5 space-y-5"
      initial={shouldReduceMotion ? false : 'hidden'}
      animate="visible"
      variants={containerVariants}
    >
      {formattedDate && (
        <m.div
          className="text-neutral-400 text-sm font-mono"
          suppressHydrationWarning
          variants={sectionVariants}
        >
          {formattedDate}
        </m.div>
      )}

      <m.section variants={sectionVariants}>
        <Label>Dimensions</Label>
        <div className="font-mono text-neutral-800 dark:text-neutral-200">
          {photoData.w} x {photoData.h}
        </div>
      </m.section>

      <m.div className="grid grid-cols-1 gap-4" variants={sectionVariants}>
        {photoData.exif.camera && (
          <section>
            <Label>Camera</Label>
            <div className="font-mono text-neutral-800 dark:text-neutral-200 text-sm">
              {photoData.exif.camera}
            </div>
          </section>
        )}
        {photoData.exif.lens && (
          <section>
            <Label>Lens</Label>
            <div className="font-mono text-neutral-800 dark:text-neutral-200 text-sm">
              {photoData.exif.lens}
            </div>
          </section>
        )}
      </m.div>

      <m.div className="grid grid-cols-2 gap-4" variants={sectionVariants}>
        {photoData.exif.focalLength && (
          <section>
            <Label>Focal Length</Label>
            <div className="font-mono text-neutral-800 dark:text-neutral-200 text-sm">
              {photoData.exif.focalLength}
            </div>
          </section>
        )}
        {photoData.exif.aperture && (
          <section>
            <Label>Aperture</Label>
            <div className="font-mono text-neutral-800 dark:text-neutral-200 text-sm">
              {photoData.exif.aperture}
            </div>
          </section>
        )}
        {photoData.exif.shutterSpeed && (
          <section>
            <Label>Shutter</Label>
            <div className="font-mono text-neutral-800 dark:text-neutral-200 text-sm">
              {photoData.exif.shutterSpeed}
            </div>
          </section>
        )}
        {photoData.exif.iso && (
          <section>
            <Label>ISO</Label>
            <div className="font-mono text-neutral-800 dark:text-neutral-200 text-sm">
              {photoData.exif.iso}
            </div>
          </section>
        )}
      </m.div>

      {hasLocation && (
        <m.section variants={sectionVariants}>
          <Label>Location</Label>
          {photoData.exif.location!.address && (
            <div className="text-neutral-800 text-sm mb-2">
              {photoData.exif.location!.address}
            </div>
          )}

          {mapUrl && (
            <MapImage
              mapUrl={mapUrl}
              photoName={photoName}
              loading={mapLoading}
            />
          )}

          <div className="font-mono text-xs text-neutral-500 mt-2">
            {photoData.exif.location!.latitude.toFixed(6)},{' '}
            {photoData.exif.location!.longitude.toFixed(6)}
            {photoData.exif.location!.altitude != null && (
              <> - {photoData.exif.location!.altitude}m</>
            )}
          </div>
        </m.section>
      )}

      {similarSlot && <m.div variants={sectionVariants}>{similarSlot}</m.div>}
    </m.div>
  );
}

// Color swatches component
function ColorSwatches({ colors }: { colors: Array<{ hex: string }> }) {
  const shouldReduceMotion = useReducedMotion();

  if (colors.length === 0) return null;

  return (
    <>
      {/* Mobile: horizontal stack */}
      <div className="fixed top-4 right-4 flex flex-row items-center lg:hidden">
        {colors.slice(0, 5).map((color, i) => (
          <m.div
            key={color.hex}
            className="w-8 h-8 rounded-full"
            style={{
              backgroundColor: color.hex,
              zIndex: 5 - i,
              marginLeft: i === 0 ? 0 : -12,
            }}
            initial={
              shouldReduceMotion
                ? false
                : { opacity: 0, transform: 'scale(0.96)' }
            }
            animate={{ opacity: 1, transform: 'scale(1)' }}
            transition={{
              duration: 0.3,
              delay: shouldReduceMotion ? 0 : i * 0.05,
              ease: [0.23, 1, 0.32, 1] as const,
            }}
          />
        ))}
      </div>
      {/* Desktop: vertical stack */}
      <div className="fixed bottom-4 left-4 hidden lg:flex flex-col-reverse items-center">
        {colors.slice(0, 5).map((color, i) => (
          <m.div
            key={color.hex}
            className="w-10 h-10 rounded-full"
            style={{
              backgroundColor: color.hex,
              zIndex: 5 - i,
              marginBottom: i === 0 ? 0 : -12,
            }}
            initial={
              shouldReduceMotion
                ? false
                : { opacity: 0, transform: 'scale(0.96)' }
            }
            animate={{ opacity: 1, transform: 'scale(1)' }}
            transition={{
              duration: 0.3,
              delay: shouldReduceMotion ? 0 : i * 0.05,
              ease: [0.23, 1, 0.32, 1] as const,
            }}
          />
        ))}
      </div>
    </>
  );
}

function photoAlt(photoData: PhotoData) {
  return photoData.description || 'Photo';
}

// Shared hook for photo display data
function usePhotoDisplayData(photoData: PhotoData) {
  const dominantColors = photoData.exif.dominantColors ?? [];
  const dominant = dominantColors[0]?.hex ?? '#e2001a';
  const hasLocation = Boolean(photoData.exif.location);

  const lat = photoData.exif.location?.latitude;
  const lon = photoData.exif.location?.longitude;
  const mapUrl = useMemo(() => {
    if (!hasLocation || lat == null || lon == null) return null;
    const zoom = isPortrait(photoData.w, photoData.h) ? 15 : 14;
    return mapboxStaticUrl({
      lat,
      lon,
      zoom,
      width: 600,
      height: 300,
      colorHex: dominant.replace('#', ''),
    });
  }, [hasLocation, lat, lon, photoData.w, photoData.h, dominant]);

  const formattedDate = useMemo(() => {
    if (!photoData.exif.dateTime) return null;
    try {
      const date = new Date(photoData.exif.dateTime);
      return date
        .toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
        .toUpperCase();
    } catch {
      return photoData.exif.dateTime;
    }
  }, [photoData.exif.dateTime]);

  return { dominantColors, dominant, hasLocation, mapUrl, formattedDate };
}

// Shared props for both variants
interface PhotoDisplayBaseProps {
  photoName: string;
  photoData: PhotoData;
  similarSlot?: React.ReactNode;
}

// Hook to compute back href from search params (client-side only)
// This enables the page to be prerendered while back navigation is dynamic
function useBackHref() {
  const searchParams = useSearchParams();
  return useMemo(() => {
    const from = searchParams.get('from');
    const q = searchParams.get('q');
    const basePath = from === 'timeline' ? '/timeline' : '/';
    return q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath;
  }, [searchParams]);
}

// Shared photo layout used by both PhotoPage and PhotoModal
function PhotoLayout({
  photoName,
  photoData,
  closeButton,
  desktopContainerClassName,
  mobileContainerClassName,
  sheetZClassName,
  similarSlot,
}: PhotoDisplayBaseProps & {
  closeButton: React.ReactNode;
  desktopContainerClassName: string;
  mobileContainerClassName: string;
  sheetZClassName: string;
}) {
  const { dominantColors, dominant, hasLocation, mapUrl, formattedDate } =
    usePhotoDisplayData(photoData);
  const alt = photoAlt(photoData);

  return (
    <LazyMotion features={domAnimation}>
      {closeButton}
      <ColorSwatches colors={dominantColors} />

      {/* Desktop layout */}
      <div className={`hidden lg:flex ${desktopContainerClassName}`}>
        <div className="flex-1 flex items-center justify-center p-16 pl-8">
          <div
            className="relative"
            style={{
              aspectRatio: `${photoData.w} / ${photoData.h}`,
              maxHeight: 'calc(100vh - 8rem)',
              maxWidth: '100%',
            }}
          >
            <Picture
              uuidWithExt={photoName}
              alt={alt}
              profile="large"
              loading="eager"
              intrinsicWidth={photoData.w}
              intrinsicHeight={photoData.h}
              imgClassName="block max-w-full max-h-[calc(100vh-8rem)] w-auto h-auto object-contain"
              pictureClassName="block"
              sizes="70vw"
              dominantColor={dominant}
            />
          </div>
        </div>

        <aside className="w-96 p-4">
          <div className="rounded-2xl bg-neutral-100 dark:bg-neutral-800/80 overflow-y-auto max-h-[calc(100vh-2rem)]">
            <MetadataPanel
              photoName={photoName}
              photoData={photoData}
              formattedDate={formattedDate}
              mapUrl={mapUrl}
              hasLocation={hasLocation}
              mapLoading="eager"
              similarSlot={similarSlot}
            />
          </div>
        </aside>
      </div>

      {/* Mobile layout - fixed image with scrolling bottom sheet */}
      <div className={`lg:hidden ${mobileContainerClassName}`}>
        <div className="fixed inset-x-0 top-0 bottom-[40svh] flex items-center justify-center p-4 pt-16 pointer-events-none">
          <div
            className="relative"
            style={{
              aspectRatio: `${photoData.w} / ${photoData.h}`,
              maxHeight: '100%',
              maxWidth: '100%',
            }}
          >
            <Picture
              uuidWithExt={photoName}
              alt={alt}
              profile="large"
              loading="eager"
              intrinsicWidth={photoData.w}
              intrinsicHeight={photoData.h}
              imgClassName="block max-w-full max-h-full w-auto h-auto object-contain"
              pictureClassName="block"
              sizes="100vw"
              dominantColor={dominant}
            />
          </div>
        </div>

        <div className="h-[60svh]" />

        <div
          className={`bg-neutral-100 dark:bg-neutral-800/80 rounded-t-3xl min-h-[60svh] relative ${sheetZClassName}`}
        >
          <div className="flex justify-center pt-3 pb-2">
            <div
              className="w-10 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600"
              aria-hidden="true"
            />
          </div>

          <div className="pt-2 pb-8">
            <MetadataPanel
              photoName={photoName}
              photoData={photoData}
              formattedDate={formattedDate}
              mapUrl={mapUrl}
              hasLocation={hasLocation}
              mapLoading="lazy"
              similarSlot={similarSlot}
            />
          </div>
        </div>
      </div>
    </LazyMotion>
  );
}

const closeButtonClassName =
  'fixed top-4 left-4 w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600 active:scale-[0.97] active:transition-transform';

// Back button that reads search params to determine navigation target.
// Wrapped in Suspense so useSearchParams doesn't bail out the whole page.
function BackButtonLink({ className }: { className: string }) {
  const backHref = useBackHref();
  return (
    <Link href={backHref} className={className} aria-label="Back to gallery">
      <X
        className="w-5 h-5 text-neutral-600 dark:text-neutral-300"
        aria-hidden="true"
      />
    </Link>
  );
}

// PhotoPage - for /photo/[id] route, uses Link for navigation
type PhotoPageProps = PhotoDisplayBaseProps;

export function PhotoPage({
  photoName,
  photoData,
  similarSlot,
}: PhotoPageProps) {
  return (
    <div className="min-h-[100svh] bg-white dark:bg-neutral-900">
      <PhotoLayout
        photoName={photoName}
        photoData={photoData}
        similarSlot={similarSlot}
        desktopContainerClassName="min-h-[100svh]"
        mobileContainerClassName="min-h-[100svh] overflow-y-auto overscroll-contain"
        sheetZClassName="z-[45]"
        closeButton={
          <Suspense
            fallback={
              <Link
                href="/"
                className={`z-50 ${closeButtonClassName}`}
                aria-label="Back to gallery"
              >
                <X
                  className="w-5 h-5 text-neutral-600 dark:text-neutral-300"
                  aria-hidden="true"
                />
              </Link>
            }
          >
            <BackButtonLink className={`z-50 ${closeButtonClassName}`} />
          </Suspense>
        }
      />
    </div>
  );
}

// PhotoModal - for intercepted route modal, uses router.back()
export function PhotoModal({
  photoName,
  photoData,
  similarSlot,
}: PhotoDisplayBaseProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className="fixed inset-0 z-[100] bg-white dark:bg-neutral-900 lg:overflow-hidden overflow-y-auto overscroll-contain"
        role="dialog"
        aria-modal={true}
        aria-label={`Photo: ${photoAlt(photoData)}`}
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: 0.15,
          ease: [0.215, 0.61, 0.355, 1],
        }}
      >
        <PhotoLayout
          photoName={photoName}
          photoData={photoData}
          similarSlot={similarSlot}
          desktopContainerClassName="h-full"
          mobileContainerClassName=""
          sheetZClassName="z-[106] overscroll-contain"
          closeButton={
            <button
              type="button"
              onClick={() => router.back()}
              className={`z-[110] ${closeButtonClassName}`}
              aria-label="Close"
            >
              <X
                className="w-5 h-5 text-neutral-600 dark:text-neutral-300"
                aria-hidden="true"
              />
            </button>
          }
        />
      </m.div>
    </LazyMotion>
  );
}
