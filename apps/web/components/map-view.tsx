'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { Navbar } from './navbar';
import { Picture } from './picture';
import { useTheme } from './theme-provider';

// ============================================================================
// Types
// ============================================================================

type Photo = {
  id: string;
  lat: number;
  lng: number;
  altitude?: number;
  date: string | null;
  w: number;
  h: number;
  blurhash: string;
  camera: string | null;
  dominantColor: string;
};

type MapData = {
  photos: Photo[];
  count: number;
};

type MapViewProps = {
  initialData: MapData;
};

// ============================================================================
// Constants
// ============================================================================

const MAP_STYLES = {
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
} as const;

const MAP_CONFIG = {
  center: [0, 30] as [number, number],
  zoom: 1.5,
  minZoom: 1,
  maxZoom: 18,
} as const;

const CLUSTER_CONFIG = {
  maxZoom: 14,
  radius: 50,
} as const;

const POPUP_CONFIG = {
  maxWidth: 240,
  maxHeight: 180,
  offset: 15,
} as const;

const ANIMATION = {
  cluster: { duration: 500 },
  photo: { duration: 800, minZoom: 14 },
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

function buildPhotoGeoJSON(photos: Photo[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: photos.map((photo) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [photo.lng, photo.lat],
      },
      properties: {
        id: photo.id,
        date: photo.date,
        camera: photo.camera,
        color: photo.dominantColor,
      },
    })),
  };
}

function buildPhotoUrl(photoId: string): string {
  const base = photoId.replace(/\.[^.]+$/, '');
  return `${process.env.NEXT_PUBLIC_R2_URL}/variants/grid/jpeg/320/${base}.jpeg`;
}

function calculatePopupDimensions(width: number, height: number) {
  const aspectRatio = width / height;
  let displayWidth = POPUP_CONFIG.maxWidth;
  let displayHeight = displayWidth / aspectRatio;

  if (displayHeight > POPUP_CONFIG.maxHeight) {
    displayHeight = POPUP_CONFIG.maxHeight;
    displayWidth = displayHeight * aspectRatio;
  }

  return { width: displayWidth, height: displayHeight };
}

function formatDate(date: string | null): string {
  if (!date) return 'No date';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildPopupElement(photo: Photo): HTMLElement {
  const { width, height } = calculatePopupDimensions(photo.w, photo.h);
  const photoUrl = buildPhotoUrl(photo.id);

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'padding: 0; margin: 0;';

  const img = document.createElement('img');
  img.src = photoUrl;
  img.alt = 'Photo preview';
  img.style.cssText = `width: ${width}px; height: ${height}px; object-fit: contain; display: block;`;
  img.loading = 'lazy';

  const dateDiv = document.createElement('div');
  dateDiv.style.cssText =
    'padding: 8px 4px 4px; font-size: 11px; color: #737373; font-family: ui-monospace, monospace;';
  dateDiv.textContent = formatDate(photo.date);

  wrapper.appendChild(img);
  wrapper.appendChild(dateDiv);

  return wrapper;
}

// ============================================================================
// Component
// ============================================================================

export function MapView({ initialData }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initializeMap = async () => {
      const mapboxgl = await import('mapbox-gl');

      if (!mapContainerRef.current || mapRef.current) return;

      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) {
        setError('Mapbox token not configured');
        setIsLoading(false);
        return;
      }

      mapboxgl.default.accessToken = token;

      const mapStyle =
        resolvedTheme === 'dark' ? MAP_STYLES.dark : MAP_STYLES.light;

      const map = new mapboxgl.default.Map({
        container: mapContainerRef.current,
        style: mapStyle,
        ...MAP_CONFIG,
      });

      map.on('load', () => {
        const geojson = buildPhotoGeoJSON(initialData.photos);

        map.addSource('photos', {
          type: 'geojson',
          data: geojson,
          cluster: true,
          clusterMaxZoom: CLUSTER_CONFIG.maxZoom,
          clusterRadius: CLUSTER_CONFIG.radius,
        });

        // Add layers
        addClusterLayers(map);
        addPointLayer(map);

        // Add interactions
        setupClusterInteractions(map);
        setupPointInteractions(map, initialData, setSelectedPhotos);
        setupPhotoPreview(map, initialData, mapboxgl);

        setIsLoading(false);
      });

      mapRef.current = map;
    };

    initializeMap().catch((err) => {
      console.error('Failed to initialize map:', err);
      setError('Failed to load map library');
      setIsLoading(false);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [initialData, resolvedTheme]);

  // Update map style when theme changes
  useEffect(() => {
    if (!mapRef.current || isLoading) return;

    const newStyle =
      resolvedTheme === 'dark' ? MAP_STYLES.dark : MAP_STYLES.light;
    mapRef.current.setStyle(newStyle);
  }, [resolvedTheme, isLoading]);

  return (
    <>
      <Navbar activePage="map" />
      <div className="fixed inset-0 pt-16 bg-white">
        <div ref={mapContainerRef} className="w-full h-full" />

        {isLoading && <LoadingState />}
        {error && <ErrorState error={error} />}
        {selectedPhotos.length > 0 && (
          <PhotoSidebar
            photos={selectedPhotos}
            onClose={() => setSelectedPhotos([])}
          />
        )}
      </div>
    </>
  );
}

// ============================================================================
// Map Setup Functions
// ============================================================================

function addClusterLayers(map: any) {
  // Shadow layer for depth
  map.addLayer({
    id: 'cluster-shadow',
    type: 'circle',
    source: 'photos',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': 'rgba(0, 0, 0, 0.1)',
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        22,
        10,
        28,
        30,
        34,
        100,
        40,
        500,
        46,
      ],
      'circle-blur': 0.5,
      'circle-translate': [0, 2],
    },
  });

  // Main cluster circles
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'photos',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#171717',
      'circle-radius': [
        'step',
        ['get', 'point_count'],
        20,
        10,
        26,
        30,
        32,
        100,
        38,
        500,
        44,
      ],
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.95,
    },
  });

  // Cluster count labels
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'photos',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': [
        'step',
        ['get', 'point_count'],
        12,
        10,
        13,
        30,
        14,
        100,
        15,
        500,
        16,
      ],
    },
    paint: {
      'text-color': '#ffffff',
    },
  });
}

function addPointLayer(map: any) {
  map.addLayer({
    id: 'unclustered-point',
    type: 'circle',
    source: 'photos',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': '#404040',
      'circle-radius': 7,
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.9,
    },
  });
}

function setupClusterInteractions(map: any) {
  map.on('click', 'clusters', (e: any) => {
    const features = map.queryRenderedFeatures(e.point, {
      layers: ['clusters'],
    });
    const clusterId = features[0]?.properties?.cluster_id;
    if (!clusterId) return;

    const source = map.getSource('photos');
    source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
      if (err) return;
      map.easeTo({
        center: features[0].geometry.coordinates,
        zoom: zoom || 10,
        duration: ANIMATION.cluster.duration,
      });
    });
  });

  map.on('mouseenter', 'clusters', () => {
    map.getCanvas().style.cursor = 'pointer';
    map.setPaintProperty('clusters', 'circle-opacity', 1);
    map.setPaintProperty('clusters', 'circle-stroke-width', 4);
  });

  map.on('mouseleave', 'clusters', () => {
    map.getCanvas().style.cursor = '';
    map.setPaintProperty('clusters', 'circle-opacity', 0.95);
    map.setPaintProperty('clusters', 'circle-stroke-width', 3);
  });
}

function setupPointInteractions(
  map: any,
  data: MapData,
  setSelected: (photos: Photo[]) => void,
) {
  map.on('click', 'unclustered-point', (e: any) => {
    if (!e.features?.[0]) return;

    const coordinates = e.features[0].geometry.coordinates as [number, number];
    const photoId = e.features[0].properties?.id;
    if (!photoId) return;

    const photosAtLocation = data.photos.filter(
      (p) => p.lng === coordinates[0] && p.lat === coordinates[1],
    );

    setSelected(photosAtLocation);

    map.flyTo({
      center: coordinates,
      zoom: Math.max(map.getZoom(), ANIMATION.photo.minZoom),
      duration: ANIMATION.photo.duration,
    });
  });
}

function setupPhotoPreview(map: any, data: MapData, mapboxgl: any) {
  const popup = new mapboxgl.default.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: POPUP_CONFIG.offset,
    className: 'map-photo-popup',
  });

  map.on('mouseenter', 'unclustered-point', (e: any) => {
    map.getCanvas().style.cursor = 'pointer';
    map.setPaintProperty('unclustered-point', 'circle-radius', 9);
    map.setPaintProperty('unclustered-point', 'circle-opacity', 1);

    if (!e.features?.[0]) return;

    const coordinates = e.features[0].geometry.coordinates.slice() as [
      number,
      number,
    ];
    const photoId = e.features[0].properties?.id;
    if (!photoId) return;

    const photo = data.photos.find((p) => p.id === photoId);
    if (!photo) return;

    // Fix coordinates for world wrapping
    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
      coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
    }

    popup.setLngLat(coordinates).setDOMContent(buildPopupElement(photo)).addTo(map);
  });

  map.on('mouseleave', 'unclustered-point', () => {
    map.getCanvas().style.cursor = '';
    map.setPaintProperty('unclustered-point', 'circle-radius', 7);
    map.setPaintProperty('unclustered-point', 'circle-opacity', 0.9);
    popup.remove();
  });
}

// ============================================================================
// UI Components
// ============================================================================

function LoadingState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-neutral-600 font-mono">Loading map...</p>
      </div>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white">
      <div className="text-center max-w-md px-4">
        <p className="text-neutral-900 font-medium mb-2">Failed to load map</p>
        <p className="text-sm text-neutral-600">{error}</p>
      </div>
    </div>
  );
}

function PhotoSidebar({
  photos,
  onClose,
}: {
  photos: Photo[];
  onClose: () => void;
}) {
  return (
    <div className="absolute right-4 top-20 bottom-4 w-80 bg-white rounded-2xl shadow-lg overflow-hidden z-20">
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-neutral-200">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-neutral-900">
              {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
            </h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-neutral-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <span className="text-neutral-500 text-xs">✕</span>
            </button>
          </div>
          {photos[0]?.date && (
            <p className="text-xs text-neutral-500 font-mono">
              {formatDate(photos[0].date)}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2">
            {photos.map((photo) => (
              <Link
                key={photo.id}
                href={`/photo/${photo.id}?from=map`}
                className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-100"
              >
                <Picture
                  uuidWithExt={photo.id}
                  alt="Photo"
                  profile="grid"
                  loading="lazy"
                  intrinsicWidth={photo.w}
                  intrinsicHeight={photo.h}
                  imgClassName="w-full h-full object-cover transition-transform group-hover:scale-105"
                  pictureClassName="block"
                  sizes="160px"
                  dominantColor={photo.dominantColor}
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
