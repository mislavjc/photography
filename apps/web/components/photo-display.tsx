/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Picture } from './picture';
import { SimilarPhotos } from './similar-photos';

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
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
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
          card
            .querySelector<HTMLElement>('[data-fallback]')
            ?.classList.remove('hidden');
        }}
      />
      <div
        className="absolute inset-0 hidden flex items-center justify-center bg-neutral-200"
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
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

// Extracted metadata panel for reuse between desktop sidebar and mobile sheet
function MetadataPanel({
  photoName,
  photoData,
  formattedDate,
  mapUrl,
  hasLocation,
  showSimilar,
  mapLoading = 'eager',
}: {
  photoName: string;
  photoData: PhotoData;
  formattedDate: string | null;
  mapUrl: string | null;
  hasLocation: boolean;
  showSimilar: boolean;
  mapLoading?: 'lazy' | 'eager';
}) {
  return (
    <motion.div
      className="p-5 space-y-5"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {formattedDate && (
        <motion.div
          className="text-neutral-400 text-sm font-mono"
          suppressHydrationWarning
          variants={sectionVariants}
        >
          {formattedDate}
        </motion.div>
      )}

      {photoData.description && (
        <motion.section variants={sectionVariants}>
          <Label>Description</Label>
          <p className="text-neutral-800 leading-relaxed text-sm">
            {photoData.description}
          </p>
        </motion.section>
      )}

      <motion.section variants={sectionVariants}>
        <Label>Dimensions</Label>
        <div className="font-mono text-neutral-800">
          {photoData.w} x {photoData.h}
        </div>
      </motion.section>

      <motion.div className="grid grid-cols-1 gap-4" variants={sectionVariants}>
        {photoData.exif.camera && (
          <section>
            <Label>Camera</Label>
            <div className="font-mono text-neutral-800 text-sm">
              {photoData.exif.camera}
            </div>
          </section>
        )}
        {photoData.exif.lens && (
          <section>
            <Label>Lens</Label>
            <div className="font-mono text-neutral-800 text-sm">
              {photoData.exif.lens}
            </div>
          </section>
        )}
      </motion.div>

      <motion.div className="grid grid-cols-2 gap-4" variants={sectionVariants}>
        {photoData.exif.focalLength && (
          <section>
            <Label>Focal Length</Label>
            <div className="font-mono text-neutral-800 text-sm">
              {photoData.exif.focalLength}
            </div>
          </section>
        )}
        {photoData.exif.aperture && (
          <section>
            <Label>Aperture</Label>
            <div className="font-mono text-neutral-800 text-sm">
              {photoData.exif.aperture}
            </div>
          </section>
        )}
        {photoData.exif.shutterSpeed && (
          <section>
            <Label>Shutter</Label>
            <div className="font-mono text-neutral-800 text-sm">
              {photoData.exif.shutterSpeed}
            </div>
          </section>
        )}
        {photoData.exif.iso && (
          <section>
            <Label>ISO</Label>
            <div className="font-mono text-neutral-800 text-sm">
              {photoData.exif.iso}
            </div>
          </section>
        )}
      </motion.div>

      {hasLocation && (
        <motion.section variants={sectionVariants}>
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
        </motion.section>
      )}

      {showSimilar && (
        <motion.div variants={sectionVariants}>
          <SimilarPhotos photoId={photoName} />
        </motion.div>
      )}
    </motion.div>
  );
}

// Color swatches component
function ColorSwatches({ colors }: { colors: Array<{ hex: string }> }) {
  if (colors.length === 0) return null;

  return (
    <>
      {/* Mobile: horizontal stack */}
      <div className="fixed top-4 right-4 flex flex-row items-center lg:hidden">
        {colors.slice(0, 5).map((color, i) => (
          <motion.div
            key={color.hex}
            className="w-8 h-8 rounded-full"
            style={{
              backgroundColor: color.hex,
              zIndex: 5 - i,
              marginLeft: i === 0 ? 0 : -12,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
          />
        ))}
      </div>
      {/* Desktop: vertical stack */}
      <div className="fixed bottom-4 left-4 hidden lg:flex flex-col-reverse items-center">
        {colors.slice(0, 5).map((color, i) => (
          <motion.div
            key={color.hex}
            className="w-10 h-10 rounded-full"
            style={{
              backgroundColor: color.hex,
              zIndex: 5 - i,
              marginBottom: i === 0 ? 0 : -12,
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
          />
        ))}
      </div>
    </>
  );
}

// Shared hook for photo display data
function usePhotoDisplayData(photoData: PhotoData) {
  const dominantColors = photoData.exif.dominantColors ?? [];
  const dominant = dominantColors[0]?.hex ?? '#e2001a';
  const hasLocation = Boolean(photoData.exif.location);

  const mapUrl = useMemo(() => {
    if (!hasLocation) return null;
    const { latitude, longitude } = photoData.exif.location!;
    const zoom = isPortrait(photoData.w, photoData.h) ? 15 : 14;
    return mapboxStaticUrl({
      lat: latitude,
      lon: longitude,
      zoom,
      width: 600,
      height: 300,
      colorHex: dominant.replace('#', ''),
    });
  }, [hasLocation, photoData, dominant]);

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
}

// PhotoPage - for /photo/[id] route, uses Link for navigation
interface PhotoPageProps extends PhotoDisplayBaseProps {
  backHref?: string;
}

export function PhotoPage({
  photoName,
  photoData,
  backHref = '/',
}: PhotoPageProps) {
  const { dominantColors, dominant, hasLocation, mapUrl, formattedDate } =
    usePhotoDisplayData(photoData);

  return (
    <div className="min-h-[100svh] bg-white lg:bg-white">
      {/* Close button - Link for page navigation */}
      <Link
        href={backHref}
        className="fixed top-4 left-4 z-50 w-10 h-10 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-neutral-400 active:scale-[0.97] active:transition-transform"
        aria-label="Back to gallery"
      >
        <X className="w-5 h-5 text-neutral-600" aria-hidden="true" />
      </Link>

      <ColorSwatches colors={dominantColors} />

      {/* Desktop layout */}
      <div className="hidden lg:flex min-h-[100svh]">
        {/* Image area */}
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
              alt={photoName}
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

        {/* Sidebar - floating card */}
        <aside className="w-96 p-4">
          <div className="rounded-2xl bg-neutral-100 overflow-y-auto max-h-[calc(100vh-2rem)]">
            <MetadataPanel
              photoName={photoName}
              photoData={photoData}
              formattedDate={formattedDate}
              mapUrl={mapUrl}
              hasLocation={hasLocation}
              showSimilar={true}
              mapLoading="eager"
            />
          </div>
        </aside>
      </div>

      {/* Mobile layout - fixed image with scrolling bottom sheet */}
      <div className="lg:hidden min-h-[100svh] overflow-y-auto overscroll-contain">
        {/* Image - fixed in place */}
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
              alt={photoName}
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

        {/* Spacer to push sheet to bottom initially */}
        <div className="h-[60svh]" />

        {/* Bottom sheet - scrolls up over the image */}
        <div className="bg-neutral-100 rounded-t-3xl min-h-[60svh] relative z-[45]">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-neutral-300" />
          </div>

          <div className="pt-2 pb-8">
            <MetadataPanel
              photoName={photoName}
              photoData={photoData}
              formattedDate={formattedDate}
              mapUrl={mapUrl}
              hasLocation={hasLocation}
              showSimilar={true}
              mapLoading="lazy"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// PhotoModal - for intercepted route modal, uses router.back()
export function PhotoModal({ photoName, photoData }: PhotoDisplayBaseProps) {
  const router = useRouter();
  const { dominantColors, dominant, hasLocation, mapUrl, formattedDate } =
    usePhotoDisplayData(photoData);

  const handleClose = () => router.back();

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-white lg:overflow-hidden overflow-y-auto overscroll-contain"
      role="dialog"
      aria-modal={true}
      aria-label={`Photo: ${photoName}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Close button - button with router.back() */}
      <button
        type="button"
        onClick={handleClose}
        className="fixed top-4 left-4 z-[110] w-10 h-10 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-neutral-400 active:scale-[0.97] active:transition-transform"
        aria-label="Close"
      >
        <X className="w-5 h-5 text-neutral-600" aria-hidden="true" />
      </button>

      <ColorSwatches colors={dominantColors} />

      {/* Desktop layout */}
      <div className="hidden lg:flex h-full">
        {/* Image area */}
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
              alt={photoName}
              profile="large"
              loading="eager"
              intrinsicWidth={photoData.w}
              intrinsicHeight={photoData.h}
              imgClassName="block w-full h-full object-contain"
              pictureClassName="block w-full h-full"
              sizes="70vw"
              dominantColor={dominant}
            />
          </div>
        </div>

        {/* Sidebar - floating card */}
        <aside className="w-96 p-4">
          <div className="rounded-2xl bg-neutral-100 overflow-y-auto max-h-[calc(100vh-2rem)]">
            <MetadataPanel
              photoName={photoName}
              photoData={photoData}
              formattedDate={formattedDate}
              mapUrl={mapUrl}
              hasLocation={hasLocation}
              showSimilar={false}
              mapLoading="eager"
            />
          </div>
        </aside>
      </div>

      {/* Mobile layout - fixed image with scrolling bottom sheet */}
      <div className="lg:hidden">
        {/* Image - fixed in place */}
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
              alt={photoName}
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

        {/* Spacer to push sheet to bottom initially */}
        <div className="h-[60svh]" />

        {/* Bottom sheet - scrolls up over the image */}
        <div className="bg-neutral-100 rounded-t-3xl min-h-[60svh] relative z-[106] overscroll-contain">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-neutral-300" />
          </div>

          <div className="pt-2 pb-8">
            <MetadataPanel
              photoName={photoName}
              photoData={photoData}
              formattedDate={formattedDate}
              mapUrl={mapUrl}
              hasLocation={hasLocation}
              showSimilar={false}
              mapLoading="lazy"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
