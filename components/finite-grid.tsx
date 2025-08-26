'use client';

import { computeNearSquareLayout, type Layout } from 'lib/layout';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Manifest } from 'types';

const SSR_SAFE_VW = 1200;
const SSR_SAFE_VH = 800;
const VIRTUAL_MARGIN = 400;
const INERTIA_DECAY = 0.92;
const MAX_SPEED = 4.5;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function useViewportSize() {
  const [vw, setVw] = useState(SSR_SAFE_VW);
  const [vh, setVh] = useState(SSR_SAFE_VH);

  useEffect(() => {
    const update = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    update();
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);

  return { vw, vh };
}
// -----------------------------------------------------------------------------

type Props = {
  manifest: Manifest;
  initialLayout?: Layout;
};

export function PannableGrid({ manifest, initialLayout }: Props) {
  const { vw, vh } = useViewportSize();

  const layout = useMemo(
    () => initialLayout ?? computeNearSquareLayout(manifest),
    [manifest, initialLayout],
  );

  const PAD = 200;

  const initialCam = useMemo(() => {
    const minX = -PAD;
    const minY = -PAD;
    const maxX = Math.max(0, layout.width - SSR_SAFE_VW + PAD);
    const maxY = Math.max(0, layout.height - SSR_SAFE_VH + PAD);
    return {
      x: clamp((layout.width - SSR_SAFE_VW) / 2, minX, maxX),
      y: clamp((layout.height - SSR_SAFE_VH) / 2, minY, maxY),
    };
  }, [layout.width, layout.height]);

  const [cam, setCam] = useState(initialCam);
  const minX = -PAD;
  const minY = -PAD;
  const maxX = Math.max(0, layout.width - vw + PAD);
  const maxY = Math.max(0, layout.height - vh + PAD);

  const draggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const velRef = useRef({ vx: 0, vy: 0 });
  const rafRef = useRef<number | null>(null);

  // Inertia loop
  useEffect(() => {
    const tick = () => {
      if (!draggingRef.current) {
        const { vx, vy } = velRef.current;
        if (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01) {
          setCam((c) => ({
            x: clamp(c.x - vx, minX, maxX),
            y: clamp(c.y - vy, minY, maxY),
          }));
          velRef.current = { vx: vx * INERTIA_DECAY, vy: vy * INERTIA_DECAY };
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [minX, maxX, minY, maxY]);

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    lastPosRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    velRef.current = { vx: 0, vy: 0 };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current || !lastPosRef.current) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastPosRef.current.t);
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;

    setCam((c) => ({
      x: clamp(c.x - dx, minX, maxX),
      y: clamp(c.y - dy, minY, maxY),
    }));

    const vx = clamp(dx / dt, -MAX_SPEED, MAX_SPEED);
    const vy = clamp(dy / dt, -MAX_SPEED, MAX_SPEED);
    velRef.current = { vx, vy };
    lastPosRef.current = { x: e.clientX, y: e.clientY, t: now };
  }
  function onPointerUp(e: React.PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    draggingRef.current = false;
    lastPosRef.current = null;
  }
  function onPointerCancel() {
    draggingRef.current = false;
    lastPosRef.current = null;
  }

  const viewRect = { x: cam.x, y: cam.y, w: vw, h: vh };
  const virtualRect = {
    x: Math.max(0, viewRect.x - VIRTUAL_MARGIN),
    y: Math.max(0, viewRect.y - VIRTUAL_MARGIN),
    w: viewRect.w + VIRTUAL_MARGIN * 2,
    h: viewRect.h + VIRTUAL_MARGIN * 2,
  };

  const visibleItems = useMemo(() => {
    const out: typeof layout.items = [];
    const vx1 = virtualRect.x,
      vy1 = virtualRect.y;
    const vx2 = virtualRect.x + virtualRect.w,
      vy2 = virtualRect.y + virtualRect.h;
    for (const it of layout.items) {
      const ix1 = it.x,
        iy1 = it.y;
      const ix2 = it.x + it.w,
        iy2 = it.y + it.h;
      if (ix1 < vx2 && ix2 > vx1 && iy1 < vy2 && iy2 > vy1) out.push(it);
    }
    return out;
  }, [
    layout.items,
    virtualRect.x,
    virtualRect.y,
    virtualRect.w,
    virtualRect.h,
  ]);

  useEffect(() => {
    if (vw === SSR_SAFE_VW && vh === SSR_SAFE_VH) return;
    setCam({
      x: clamp((layout.width - vw) / 2, minX, maxX),
      y: clamp((layout.height - vh) / 2, minY, maxY),
    });
  }, [vw, vh, layout.width, layout.height]); // eslint-disable-line

  return (
    <div
      className="fixed inset-0 touch-none overscroll-none select-none bg-neutral-100"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={(e) => {
        if (e.shiftKey) {
          setCam((c) => ({ x: clamp(c.x + e.deltaY, minX, maxX), y: c.y }));
        } else {
          setCam((c) => ({
            x: clamp(c.x + e.deltaX, minX, maxX),
            y: clamp(c.y + e.deltaY, minY, maxY),
          }));
        }
      }}
      role="application"
      aria-label="Pannable photo grid"
    >
      {/* World container */}
      <div
        className="absolute will-change-transform"
        style={{
          transform: `translate3d(${-cam.x}px, ${-cam.y}px, 0)`,
          width: layout.width,
          height: layout.height,
        }}
      >
        {visibleItems.map((it) => (
          <article
            key={it.filename}
            className="absolute"
            style={{ left: it.x, top: it.y, width: it.w, height: it.h }}
          >
            <Picture
              filename={it.filename}
              alt={it.filename}
              className="w-full h-full object-cover rounded-lg shadow-sm bg-gray-50"
            />
          </article>
        ))}
      </div>

      {/* HUD - Development only */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute left-4 bottom-4 text-xs bg-white/80 backdrop-blur rounded-md px-2 py-1 shadow">
          <div>Cols: {layout.columns}</div>
          <div>
            World: {Math.round(layout.width)} × {Math.round(layout.height)} px
          </div>
          <div>
            Cam: {Math.round(cam.x)}, {Math.round(cam.y)}
          </div>
          <div>
            Nodes: {visibleItems.length}/{layout.items.length}
          </div>
        </div>
      )}
    </div>
  );
}

const AVAILABLE_WIDTHS = [160, 240, 320, 480, 640, 800, 960] as const;
const FORMATS = ['avif', 'webp', 'jpeg'] as const;

function getImageBaseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}
function r2VariantUrl(
  filename: string,
  width: number,
  format: (typeof FORMATS)[number],
) {
  const base = getImageBaseName(filename);
  return `https://r2.photography.mislavjc.com/variants/${format}/${width}/${base}.${format}`;
}
function buildSrcSet(filename: string, format: (typeof FORMATS)[number]) {
  return AVAILABLE_WIDTHS.map(
    (w) => `${r2VariantUrl(filename, w, format)} ${w}w`,
  ).join(', ');
}
const DEFAULT_SIZES =
  '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px';

function Picture({
  filename,
  alt,
  loading = 'lazy',
  className = '',
}: {
  filename: string;
  alt: string;
  loading?: 'lazy' | 'eager';
  className?: string;
}) {
  return (
    <picture className={className}>
      <source
        type="image/avif"
        srcSet={buildSrcSet(filename, 'avif')}
        sizes={DEFAULT_SIZES}
      />
      <source
        type="image/webp"
        srcSet={buildSrcSet(filename, 'webp')}
        sizes={DEFAULT_SIZES}
      />
      <img
        src={r2VariantUrl(filename, 320, 'jpeg')}
        srcSet={buildSrcSet(filename, 'jpeg')}
        sizes={DEFAULT_SIZES}
        alt={alt}
        loading={loading}
        className="w-full h-full object-cover block"
        draggable={false}
      />
    </picture>
  );
}
