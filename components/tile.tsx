'use client';

import React, { useMemo } from 'react';

import type { TileProps } from '../types';
import { ImageCell } from './image-cell';

export const Tile = ({
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
