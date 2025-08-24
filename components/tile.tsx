'use client';

import React, { useMemo } from 'react';

import type { TileProps } from '../types';
import { ImageCell } from './image-cell';

const TileComponent = ({
  tx,
  ty,
  left,
  top,
  tileWidth,
  tileHeight,
  getRects,
  viewport,
  onHover,
  manifest,
}: TileProps) => {
  const rects = useMemo(
    () => getRects(tx, ty, manifest),
    [tx, ty, getRects, manifest],
  );

  return (
    <div
      className="absolute"
      title={`Tile (${tx}, ${ty}) - ${rects.length} images`}
      style={{
        transform: `translate3d(${left}px, ${top}px, 0)`,
        width: tileWidth,
        height: tileHeight,
        contain: 'layout paint size style',
        willChange: 'transform',
        isolation: 'isolate',
        boxSizing: 'border-box',
      }}
    >
      {rects.map((r, i: number) => (
        <ImageCell
          key={i}
          rect={r}
          tileLeft={left}
          tileTop={top}
          tileSize={tileWidth}
          viewport={viewport}
          onHover={onHover}
          manifest={manifest}
        />
      ))}
    </div>
  );
};

// Memoize Tile component for better performance
export const Tile = React.memo(TileComponent, (prevProps, nextProps) => {
  // Only re-render if essential props change
  return (
    prevProps.tx === nextProps.tx &&
    prevProps.ty === nextProps.ty &&
    prevProps.left === nextProps.left &&
    prevProps.top === nextProps.top &&
    prevProps.tileSize === nextProps.tileSize &&
    prevProps.viewport.left === nextProps.viewport.left &&
    prevProps.viewport.top === nextProps.viewport.top &&
    prevProps.viewport.right === nextProps.viewport.right &&
    prevProps.viewport.bottom === nextProps.viewport.bottom
  );
});
