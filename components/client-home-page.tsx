'use client';

import React, { useCallback, useState } from 'react';

import type { ImageMetadata, Manifest } from '../types';
import InfiniteImageMap from './infinite-image-map';
import { MetadataTooltip } from './metadata-tooltip';
import { PerformanceMonitor } from './performance-monitor';

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
        manifest={manifest}
        onHover={isDevelopment ? handleHover : undefined}
      />
      {isDevelopment && (
        <MetadataTooltip metadata={hoveredMetadata} position={mousePosition} />
      )}
      <PerformanceMonitor enabled={isDevelopment} />
    </div>
  );
}
