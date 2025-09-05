'use client';
import type { PlacedItem } from 'lib/layout';
import { motion } from 'motion/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const innerPad = 8;

  // Effective world incl. padding
  const effectiveWorldW = worldW + pad * 2;
  const effectiveWorldH = worldH + pad * 2;

  // Fit to square
  const inner = outer - innerPad * 2;
  const scale = Math.min(inner / effectiveWorldW, inner / effectiveWorldH);
  const drawW = Math.max(1, effectiveWorldW * scale);
  const drawH = Math.max(1, effectiveWorldH * scale);
  const offsetX = (outer - drawW) / 2;
  const offsetY = (outer - drawH) / 2;

  // Viewport rect (minimap space)
  const vx = offsetX + (camX + pad) * scale;
  const vy = offsetY + (camY + pad) * scale;
  const vw = Math.max(6, viewW * scale);
  const vh = Math.max(6, viewH * scale);

  // Camera center (world → minimap)
  const camCx = offsetX + (camX + pad + viewW / 2) * scale;
  const camCy = offsetY + (camY + pad + viewH / 2) * scale;

  // Trail of recent camera centers (breadcrumbs)
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  useEffect(() => {
    trailRef.current = [...trailRef.current, { x: camCx, y: camCy }].slice(-14);
  }, [camCx, camCy]);

  // Drag state
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [cursor, setCursor] = useState<'grab' | 'grabbing' | 'crosshair'>(
    'crosshair',
  );
  const [isCollapsed, setIsCollapsed] = useState(true);

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
  function pointToCamTopLeft(mx: number, my: number) {
    const wx = (mx - offsetX) / scale - pad;
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

    if (mx >= vx && mx <= vx + vw && my >= vy && my <= vy + vh) {
      draggingRef.current = true;
      dragOffsetRef.current = { dx: mx - vx, dy: my - vy };
      setCursor('grabbing');
    } else {
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

  // Mini-tiles
  const rects = useMemo(() => {
    const out: React.JSX.Element[] = [];
    for (let i = 0; i < tiles.length; i += Math.max(1, sampleStep)) {
      const t = tiles[i];
      const x = offsetX + (t.x + pad) * scale;
      const y = offsetY + (t.y + pad) * scale;
      const w = Math.max(1, t.w * scale);
      const h = Math.max(1, t.h * scale);
      const mc = manifest[t.filename];
      const hex = mc?.exif?.dominantColors?.[0]?.hex || '#c7c7c7';
      out.push(
        <rect
          key={t.filename}
          x={x}
          y={y}
          width={w}
          height={h}
          fill={sanitizeHex(hex)}
          stroke="none"
          opacity={0.9}
          rx={w > 3 && h > 3 ? 0.8 : 0}
        />,
      );
    }
    return out;
  }, [tiles, manifest, scale, offsetX, offsetY, sampleStep, pad]);

  // Light 3x3 grid over the content bounds
  const gridLines = useMemo(() => {
    const lines: React.JSX.Element[] = [];
    const gx = offsetX + pad * scale;
    const gy = offsetY + pad * scale;
    const gw = worldW * scale;
    const gh = worldH * scale;
    for (let i = 1; i <= 2; i++) {
      const x = gx + (gw * i) / 3;
      const y = gy + (gh * i) / 3;
      lines.push(
        <line
          key={`v${i}`}
          x1={x}
          y1={gy}
          x2={x}
          y2={gy + gh}
          stroke="#e5e7eb"
          strokeWidth={0.7}
        />,
      );
      lines.push(
        <line
          key={`h${i}`}
          x1={gx}
          y1={y}
          x2={gx + gw}
          y2={y}
          stroke="#e5e7eb"
          strokeWidth={0.7}
        />,
      );
    }
    return lines;
  }, [offsetX, offsetY, scale, worldW, worldH, pad]);

  // Breadcrumb path + dots
  const trailPath = useMemo(() => {
    if (!trailRef.current.length) return '';
    return trailRef.current
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
      .join(' ');
  }, [camCx, camCy]);

  return (
    <motion.div
      layout
      layoutId="minimap"
      className={[
        'rounded-xl shadow-xl ring-2 ring-gray-200/50',
        'bg-white border border-gray-200/50',
        'pointer-events-auto',
        className ?? '',
      ].join(' ')}
      style={{
        width: isCollapsed ? 40 : outer,
        height: isCollapsed ? 40 : outer,
      }}
      transition={{ layout: { duration: 0.2, ease: 'easeOut' } }}
      onClick={
        !isCollapsed
          ? undefined
          : (e) => {
              e.stopPropagation();
              setIsCollapsed(false);
            }
      }
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerCancel={(e) => e.stopPropagation()}
      whileHover={
        !isCollapsed
          ? undefined
          : { scale: 1.05, transition: { duration: 0.1 } }
      }
      whileTap={
        !isCollapsed
          ? undefined
          : { scale: 0.95, transition: { duration: 0.05 } }
      }
    >
      {isCollapsed ? (
        <div className="w-full h-full flex items-center justify-center cursor-pointer">
          <span className="text-gray-600 text-sm font-bold">🗺️</span>
        </div>
      ) : (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(true);
            }}
            className="absolute top-2 right-2 z-10 w-6 h-6 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 transition-colors"
            title="Collapse minimap"
          >
            ×
          </button>

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
            <defs>
              {/* Spotlight mask: cut a hole where the viewport is */}
              <mask id="viewport-spotlight">
                {/* black = hidden, white = visible */}
                <rect x="0" y="0" width={outer} height={outer} fill="white" />
                <rect
                  x={vx}
                  y={vy}
                  width={vw}
                  height={vh}
                  rx={3}
                  ry={3}
                  fill="black"
                />
              </mask>
              {/* Soft pulse for center dot */}
              <radialGradient id="pulse" cx="50%" cy="50%">
                <stop offset="0%" stopOpacity="0.35" />
                <stop offset="100%" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Frame */}
            <rect
              x={0}
              y={0}
              width={outer}
              height={outer}
              rx={12}
              ry={12}
              fill="transparent"
            />

            {/* World bg */}
            <rect
              x={offsetX}
              y={offsetY}
              width={drawW}
              height={drawH}
              fill="#fafafa"
              rx={6}
              ry={6}
            />

            {/* Content bounds */}
            <rect
              x={offsetX + pad * scale}
              y={offsetY + pad * scale}
              width={worldW * scale}
              height={worldH * scale}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth={0.9}
            />

            {/* Light grid over content */}
            <g>{gridLines}</g>

            {/* Tiles */}
            <g>{rects}</g>

            {/* Breadcrumb trail (path + fading dots) */}
            {trailRef.current.length > 1 && (
              <>
                <path
                  d={trailPath}
                  fill="none"
                  stroke="#111827"
                  strokeOpacity={0.25}
                  strokeWidth={1.5}
                />
                {trailRef.current.map((p, i, arr) => (
                  <circle
                    key={`t${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={i === arr.length - 1 ? 2.4 : 1.8}
                    fill="#111827"
                    opacity={i / arr.length}
                  />
                ))}
              </>
            )}

            {/* Viewport highlight: bold outline + dim everything else via mask */}
            <g>
              <rect
                x={0}
                y={0}
                width={outer}
                height={outer}
                fill="#000"
                opacity={0.18}
                mask="url(#viewport-spotlight)"
                pointerEvents="none"
              />
              <rect
                x={vx}
                y={vy}
                width={vw}
                height={vh}
                fill="none"
                stroke="#111827"
                strokeWidth={2.5}
              />
              {/* subtle inner stroke for contrast on light backgrounds */}
              <rect
                x={vx + 0.5}
                y={vy + 0.5}
                width={vw - 1}
                height={vh - 1}
                fill="none"
                stroke="#ffffff"
                strokeOpacity={0.6}
                strokeWidth={1}
              />
            </g>

            {/* Center marker with soft pulse */}
            <circle cx={camCx} cy={camCy} r={6} fill="url(#pulse)" />
            <circle cx={camCx} cy={camCy} r={2.2} fill="#111827" />
          </svg>
        </>
      )}
    </motion.div>
  );
}
