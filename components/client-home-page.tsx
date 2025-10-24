'use client';

import React, { useCallback, useState } from 'react';

import type { ImageMetadata, Manifest } from '../types';

import InfiniteImageMap from './infinite-image-map';
import { MetadataTooltip } from './metadata-tooltip';
import { PerformanceMonitor } from './performance-monitor';
import { PhotoFilter } from './photo-filter';

interface ClientHomePageProps {
  manifest: Manifest;
}

export default function ClientHomePage({ manifest }: ClientHomePageProps) {
  const [hoveredMetadata, setHoveredMetadata] = useState<ImageMetadata | null>(
    null,
  );
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const handleHover = useCallback((metadata: ImageMetadata | null) => {
    setHoveredMetadata(metadata);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  }, []);

  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <div onMouseMove={handleMouseMove}>
      <InfiniteImageMap
        key={`manifest-${Object.keys(manifest).length}-${Object.keys(manifest).slice(0, 5).sort().join('-')}`}
        manifest={manifest}
        onHover={isDevelopment ? handleHover : undefined}
      />
      <PhotoFilter />
      {isDevelopment && (
        <MetadataTooltip metadata={hoveredMetadata} position={mousePosition} />
      )}
      <PerformanceMonitor enabled={isDevelopment} />
    </div>
  );
}
