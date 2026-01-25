/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import Link from 'next/link';

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

interface PhotoDisplayProps {
  photoName: string;
  photoData: PhotoData;
  backHref?: string;
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

export function PhotoDisplay({
  photoName,
  photoData,
  backHref = '/',
}: PhotoDisplayProps) {
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

  // Format date nicely
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

  return (
    <div className="min-h-[100svh] bg-white lg:bg-white">
      {/* Close button - top left */}
      <Link
        href={backHref}
        className="fixed top-4 left-4 z-50 w-10 h-10 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors"
        aria-label="Back to gallery"
      >
        <X className="w-5 h-5 text-neutral-600" />
      </Link>

      {/* Color swatches - top right on mobile, bottom left on desktop */}
      {dominantColors.length > 0 && (
        <div className="fixed flex gap-2 top-4 right-4 lg:top-auto lg:right-auto lg:bottom-4 lg:left-4 flex-row lg:flex-col">
          {dominantColors.slice(0, 5).map((color) => (
            <div
              key={color.hex}
              className="w-10 h-10 rounded-full shadow-sm ring-1 ring-black/10"
              style={{ backgroundColor: color.hex }}
              title={color.hex}
            />
          ))}
        </div>
      )}

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
            <div className="p-5 space-y-5">
              {formattedDate && (
                <div className="text-neutral-400 text-sm font-mono">
                  {formattedDate}
                </div>
              )}

              {photoData.description && (
                <section>
                  <Label>Description</Label>
                  <p className="text-neutral-800 leading-relaxed text-sm">
                    {photoData.description}
                  </p>
                </section>
              )}

              <section>
                <Label>Dimensions</Label>
                <div className="font-mono text-neutral-800">
                  {photoData.w} x {photoData.h}
                </div>
              </section>

              <div className="grid grid-cols-1 gap-4">
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
              </div>

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              {hasLocation && (
                <section>
                  <Label>Location</Label>
                  {photoData.exif.location!.address && (
                    <div className="text-neutral-800 text-sm mb-2">
                      {photoData.exif.location!.address}
                    </div>
                  )}

                  {mapUrl && (
                    <div
                      className="relative overflow-hidden rounded-lg"
                      style={{ aspectRatio: '600 / 300' }}
                      data-mapcard
                    >
                      <div
                        className="absolute inset-0 bg-neutral-200"
                        data-skel
                      />
                      <img
                        src={mapUrl}
                        alt={`Map preview for ${photoName}`}
                        className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300"
                        width={600}
                        height={300}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        onLoad={(e) => {
                          const card = e.currentTarget.closest(
                            '[data-mapcard]',
                          ) as HTMLElement;
                          e.currentTarget.classList.remove('opacity-0');
                          card
                            .querySelector<HTMLElement>('[data-skel]')
                            ?.classList.add('hidden');
                        }}
                        onError={(e) => {
                          const card = e.currentTarget.closest(
                            '[data-mapcard]',
                          ) as HTMLElement;
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
                  )}

                  <div className="font-mono text-xs text-neutral-500 mt-2">
                    {photoData.exif.location!.latitude.toFixed(6)},{' '}
                    {photoData.exif.location!.longitude.toFixed(6)}
                    {photoData.exif.location!.altitude != null && (
                      <> - {photoData.exif.location!.altitude}m</>
                    )}
                  </div>
                </section>
              )}

              <SimilarPhotos photoId={photoName} />
            </div>
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

          <div className="p-5 pt-2 space-y-5 pb-8">
            {formattedDate && (
              <div className="text-neutral-400 text-sm font-mono">
                {formattedDate}
              </div>
            )}

            {photoData.description && (
              <section>
                <Label>Description</Label>
                <p className="text-neutral-800 leading-relaxed text-sm">
                  {photoData.description}
                </p>
              </section>
            )}

            <section>
              <Label>Dimensions</Label>
              <div className="font-mono text-neutral-800">
                {photoData.w} x {photoData.h}
              </div>
            </section>

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            {hasLocation && (
              <section>
                <Label>Location</Label>
                {photoData.exif.location!.address && (
                  <div className="text-neutral-800 text-sm mb-2">
                    {photoData.exif.location!.address}
                  </div>
                )}

                {mapUrl && (
                  <div
                    className="relative overflow-hidden rounded-lg"
                    style={{ aspectRatio: '600 / 300' }}
                    data-mapcard
                  >
                    <div
                      className="absolute inset-0 bg-neutral-200"
                      data-skel
                    />
                    <img
                      src={mapUrl}
                      alt={`Map preview for ${photoName}`}
                      className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300"
                      width={600}
                      height={300}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      onLoad={(e) => {
                        const card = e.currentTarget.closest(
                          '[data-mapcard]',
                        ) as HTMLElement;
                        e.currentTarget.classList.remove('opacity-0');
                        card
                          .querySelector<HTMLElement>('[data-skel]')
                          ?.classList.add('hidden');
                      }}
                      onError={(e) => {
                        const card = e.currentTarget.closest(
                          '[data-mapcard]',
                        ) as HTMLElement;
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
                )}

                <div className="font-mono text-xs text-neutral-500 mt-2">
                  {photoData.exif.location!.latitude.toFixed(6)},{' '}
                  {photoData.exif.location!.longitude.toFixed(6)}
                  {photoData.exif.location!.altitude != null && (
                    <> - {photoData.exif.location!.altitude}m</>
                  )}
                </div>
              </section>
            )}

            <SimilarPhotos photoId={photoName} />
          </div>
        </div>
      </div>
    </div>
  );
}
