import { Metadata } from 'next';
import { cacheLife } from 'next/cache';

import { MapView } from 'components/map-view';
import { loadManifest } from 'lib/manifest-server';

export const metadata: Metadata = {
  title: 'Photo Map',
  description: 'Explore photos by location on an interactive world map',
};

async function getMapData() {
  'use cache';
  cacheLife('days');

  const manifest = await loadManifest();

  // Extract photos with location data
  const photos = Object.entries(manifest)
    .filter(([, data]) => data.exif?.location)
    .map(([id, data]) => ({
      id,
      lat: data.exif.location!.latitude,
      lng: data.exif.location!.longitude,
      altitude: data.exif.location!.altitude,
      date: data.exif.dateTime,
      w: data.w,
      h: data.h,
      blurhash: data.blurhash,
      camera: data.exif.camera,
      dominantColor: data.exif.dominantColors?.[0]?.hex || '#e2001a',
    }));

  return {
    photos,
    count: photos.length,
  };
}

export default async function MapPage() {
  const data = await getMapData();

  return (
    <div className="fixed inset-0 bg-neutral-50">
      <MapView initialData={data} />
    </div>
  );
}
