'use client';

import type { Layout } from 'lib/layout';
import { motion } from 'motion/react';
import React, { useState } from 'react';

interface DevHudProps {
  layout: Layout;
  cam: { x: number; y: number };
  vw: number;
  vh: number;
  visibleItems: typeof layout.items;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function DevHud({
  layout,
  cam,
  vw,
  vh,
  visibleItems,
  minX,
  minY,
  maxX,
  maxY,
}: DevHudProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      layout
      layoutId="dev-hud"
      className={`absolute left-4 bottom-4 z-10 ${
        isExpanded
          ? 'text-xs bg-black text-green-400 rounded px-2 py-1.5 shadow-lg font-mono max-w-xs border border-green-500/70'
          : 'w-7 h-7 bg-black text-green-400 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-900 transition-colors shadow-lg border border-green-500/50'
      }`}
      transition={{
        layout: {
          duration: 0.15,
          ease: 'easeOut',
        },
      }}
      onClick={
        !isExpanded
          ? (e) => {
              e.stopPropagation();
              setIsExpanded(true);
            }
          : undefined
      }
      onPointerDown={(e) => e.stopPropagation()}
      title={isExpanded ? undefined : 'Show dev info'}
      whileHover={
        !isExpanded ? { scale: 1.02, transition: { duration: 0.1 } } : undefined
      }
      whileTap={
        !isExpanded
          ? { scale: 0.98, transition: { duration: 0.05 } }
          : undefined
      }
    >
      {isExpanded ? (
        <div className="space-y-0.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-green-300 font-bold text-xs">❯ dev</div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
              className="text-red-400 hover:text-red-300 text-xs transition-colors w-3 h-3 flex items-center justify-center"
              title="Close"
            >
              ×
            </button>
          </div>

          <div className="space-y-0.5 text-xs">
            <div className="text-green-300/80 font-medium">Layout</div>
            <div className="ml-1 text-green-400/90">
              {Math.round(layout.width)}×{Math.round(layout.height)}px
            </div>
            <div className="ml-1 text-green-400/90">
              [{minX},{minY}] → [{Math.round(maxX)},{Math.round(maxY)}]
            </div>

            <div className="text-green-300/80 font-medium">Position</div>
            <div className="ml-1 text-green-400/90">
              ({Math.round(cam.x)}, {Math.round(cam.y)})
            </div>
            <div className="ml-1 text-green-400/90">
              {Math.round(vw)}×{Math.round(vh)}px
            </div>

            <div className="text-green-300/80 font-medium">Tiles</div>
            <div className="ml-1 text-green-400/90">
              {visibleItems.length}/{layout.items.length}
            </div>
          </div>
        </div>
      ) : (
        <span className="text-xs font-bold">❯</span>
      )}
    </motion.div>
  );
}
