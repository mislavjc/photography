'use client';

import React, { useMemo } from 'react';

import type { TileProps } from '../types';
import { ImageCell } from './image-cell';

const TileComponent = ({
  tx,
  ty,
  left,
  top,
  tileSize,
  getRects,
  viewport,
  onHover,
}: TileProps) => {
  const rects = useMemo(
    () => getRects(tx, ty, tileSize),
    [tx, ty, tileSize, getRects],
  );

  return (
    <div
      className="absolute"
      style={{
        transform: `translate3d(${left}px, ${top}px, 0)`,
        width: tileSize,
        height: tileSize,
        contain: 'layout paint size style',
        willChange: 'transform',
        isolation: 'isolate',
      }}
    >
      {rects.map((r, i) => (
        <ImageCell
          key={i}
          rect={r}
          tileLeft={left}
          tileTop={top}
          tileSize={tileSize}
          viewport={viewport}
          onHover={onHover}
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
