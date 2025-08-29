'use client';
import type { PlacedItem } from 'lib/layout';
import React from 'react';
import type { Manifest } from 'types';

type MinimapProps = {
  worldW: number;
  worldH: number;
  camX: number;
  camY: number;
  viewW: number;
  viewH: number;
  tiles: PlacedItem[];
  manifest: Manifest;
  className?: string;
  onSetCam: (xy: { x: number; y: number }) => void;
  sampleStep?: number;
  sizePx?: number; // default 160
  pad?: number; // camera padding (default 200)
};

export function Minimap({
  worldW,
  worldH,
  camX,
  camY,
  viewW,
  viewH,
  tiles,
  manifest,
  className,
  onSetCam,
  sampleStep = 1,
  sizePx = 160,
  pad = 200,
}: MinimapProps) {
  const outer = Math.max(120, sizePx);
  const innerPad = 8; // inner padding

  // Calculate effective world bounds including camera padding
  const effectiveWorldW = worldW + pad * 2;
  const effectiveWorldH = worldH + pad * 2;

  // Fit effective world into square
  const inner = outer - innerPad * 2;
  const scale = Math.min(inner / effectiveWorldW, inner / effectiveWorldH);
  const drawW = Math.max(1, effectiveWorldW * scale);
  const drawH = Math.max(1, effectiveWorldH * scale);

  const offsetX = (outer - drawW) / 2;
  const offsetY = (outer - drawH) / 2;

  // Viewport rect in minimap space (adjusted for camera padding)
  const vx = offsetX + (camX + pad) * scale;
  const vy = offsetY + (camY + pad) * scale;
  const vw = Math.max(6, viewW * scale);
  const vh = Math.max(6, viewH * scale);

  // Drag state + cursors
  const draggingRef = React.useRef(false);
  const dragOffsetRef = React.useRef<{ dx: number; dy: number }>({
    dx: 0,
    dy: 0,
  });
  const [cursor, setCursor] = React.useState<'grab' | 'grabbing' | 'crosshair'>(
    'crosshair',
  );

  function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }
  function sanitizeHex(hex: string): string {
    if (!hex) return '#c7c7c7';
    const s = hex.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
    if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`;
    return '#c7c7c7';
  }

  // Convert minimap point -> world cam top-left (clamped)
  function pointToCamTopLeft(mx: number, my: number) {
    const wx = (mx - offsetX) / scale - pad; // subtract padding to get actual world coordinate
    const wy = (my - offsetY) / scale - pad;
    const cx = clamp(wx, -pad, Math.max(0, worldW - viewW + pad));
    const cy = clamp(wy, -pad, Math.max(0, worldH - viewH + pad));
    return { x: cx, y: cy };
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.stopPropagation();
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    const mx = e.nativeEvent.offsetX;
    const my = e.nativeEvent.offsetY;

    // If down inside viewport -> drag with grab cursor
    if (mx >= vx && mx <= vx + vw && my >= vy && my <= vy + vh) {
      draggingRef.current = true;
      dragOffsetRef.current = { dx: mx - vx, dy: my - vy };
      setCursor('grabbing');
    } else {
      // Click-to-jump: place top-left so the dragged rect centers on click,
      // then clamp so you CAN hit the exact edges.
      const desiredTopLeft = {
        x: (mx - offsetX) / scale - viewW / 2 - pad,
        y: (my - offsetY) / scale - viewH / 2 - pad,
      };
      const c = {
        x: clamp(desiredTopLeft.x, -pad, Math.max(0, worldW - viewW + pad)),
        y: clamp(desiredTopLeft.y, -pad, Math.max(0, worldH - viewH + pad)),
      };
      onSetCam(c);
      setCursor('crosshair');
    }
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!draggingRef.current) return;
    e.stopPropagation();
    const mx = e.nativeEvent.offsetX;
    const my = e.nativeEvent.offsetY;
    const nx = mx - dragOffsetRef.current.dx;
    const ny = my - dragOffsetRef.current.dy;
    const c = pointToCamTopLeft(nx, ny);
    onSetCam(c);
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    e.stopPropagation();
    try {
      (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
    } catch {}
    draggingRef.current = false;
    setCursor('crosshair');
  }
  function onPointerCancel(e: React.PointerEvent<SVGSVGElement>) {
    e.stopPropagation();
    draggingRef.current = false;
    setCursor('crosshair');
  }
  function onMouseEnter() {
    setCursor(draggingRef.current ? 'grabbing' : 'crosshair');
  }
  function onMouseLeave() {
    setCursor('crosshair');
  }

  // Build rects (optionally downsampled)
  const rects = React.useMemo(() => {
    const out: JSX.Element[] = [];
    // stride to reduce DOM if needed
    for (let i = 0; i < tiles.length; i += Math.max(1, sampleStep)) {
      const t = tiles[i];

      // ⬇️ shift tiles by +pad so they sit inside the effective world
      const x = offsetX + (t.x + pad) * scale;
      const y = offsetY + (t.y + pad) * scale;
      const w = Math.max(1, t.w * scale);
      const h = Math.max(1, t.h * scale);

      // Extract dominant color (fallback to gray)
      const mc = manifest[t.filename];
      const hex =
        mc?.exif?.dominantColors?.[0]?.hex ??
        mc?.exif?.dominantColors?.[0] ??
        '#c7c7c7';

      out.push(
        <rect
          key={t.filename}
          x={x}
          y={y}
          width={w}
          height={h}
          fill={sanitizeHex(hex)}
          stroke="none"
          opacity={0.95}
          rx={w > 3 && h > 3 ? 0.8 : 0} // tiny rounding for bigger mini-tiles
        />,
      );
    }
    return out;
  }, [tiles, manifest, scale, offsetX, offsetY, sampleStep, pad]);

  return (
    <div
      className={[
        'rounded-xl shadow-xl ring-2 ring-gray-200/50',
        'bg-white border border-gray-200/50',
        'pointer-events-auto',
        className ?? '',
      ].join(' ')}
      style={{ width: outer, height: outer }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerCancel={(e) => e.stopPropagation()}
    >
      <svg
        width={outer}
        height={outer}
        className="block"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        role="img"
        aria-label="Minimap"
      >
        {/* Frame area */}
        <rect
          x={0}
          y={0}
          width={outer}
          height={outer}
          rx={12}
          ry={12}
          fill="transparent"
        />
        {/* World area background (square fit) */}
        <rect
          x={offsetX}
          y={offsetY}
          width={drawW}
          height={drawH}
          fill="#fafafa"
          strokeWidth={1.5}
          rx={6}
          ry={6}
        />
        {/* Actual content bounds inside effective world (optional guide) */}
        <rect
          x={offsetX + pad * scale}
          y={offsetY + pad * scale}
          width={worldW * scale}
          height={worldH * scale}
          fill="none"
          stroke="#9ca3af"
          strokeDasharray="2,2"
          strokeWidth={0.8}
        />
        {/* Tiles */}
        <g>{rects}</g>
        {/* Viewport */}
        <rect
          x={vx}
          y={vy}
          width={vw}
          height={vh}
          fill="none"
          stroke="#111827"
          strokeWidth={2}
        />
        <line
          x1={vx}
          y1={vy}
          x2={vx + vw}
          y2={vy + vh}
          stroke="#111827"
          strokeWidth={1}
        />
        <line
          x1={vx + vw}
          y1={vy}
          x2={vx}
          y2={vy + vh}
          stroke="#111827"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}
