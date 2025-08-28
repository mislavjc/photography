'use client';

import { Picture } from 'components/picture';
import { computeNearSquareLayout, type Layout } from 'lib/layout';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Manifest } from 'types';

const SSR_SAFE_VW = 1200;
const SSR_SAFE_VH = 800;

const VIRTUAL_MARGIN = 400;

// Kinetics (tuned for snappier, non-slippery feel)
const INERTIA_TAU_MS = 240; // exponential decay time-constant (~0.24s)
const SPEED_SMOOTHING = 0.12; // less smoothing → more accurate velocity
const MAX_SPEED = 3.5; // clamp swipe velocity
const MIN_INERTIA_SPEED = 0.06; // only fling on intentional swipes
const DRAG_GAIN = 0.9; // move world a bit less than the cursor (heavier feel)
const PAD = 200;

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

type Props = {
  manifest: Manifest;
  initialLayout?: Layout;
};

export function PannableGrid({ manifest, initialLayout }: Props) {
  const router = useRouter();
  const { vw, vh } = useViewportSize();
  const layout = useMemo(
    () => initialLayout ?? computeNearSquareLayout(manifest),
    [manifest, initialLayout],
  );

  // Initial centered camera (SSR-safe)
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
  const camRef = useRef(cam);
  useEffect(() => {
    camRef.current = cam;
  }, [cam]);

  // Live bounds
  const minX = -PAD;
  const minY = -PAD;
  const maxX = Math.max(0, layout.width - vw + PAD);
  const maxY = Math.max(0, layout.height - vh + PAD);

  // Dragging state
  const draggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const velRef = useRef({ vx: 0, vy: 0 }); // smoothed pointer velocity

  // Inertia state (simplified: velocity with exponential decay)
  const inertiaRef = useRef<{
    active: boolean;
    lastTick: number; // ms
    vx: number; // px/ms (current)
    vy: number; // px/ms (current)
  } | null>(null);

  const rafRef = useRef<number | null>(null);

  // RAF loop: handle inertia (time-based kinematics)
  useEffect(() => {
    const tick = () => {
      const inert = inertiaRef.current;
      if (inert && inert.active) {
        const now = performance.now();
        const dt = Math.max(0, now - inert.lastTick); // ms

        // Exponential velocity decay: v(t+dt) = v * exp(-dt/τ)
        const k = Math.exp(-dt / INERTIA_TAU_MS);

        // Displacement under exp decay over dt: s = v * τ * (1 - k)
        const dx = inert.vx * INERTIA_TAU_MS * (1 - k);
        const dy = inert.vy * INERTIA_TAU_MS * (1 - k);

        const nextX = camRef.current.x - dx;
        const nextY = camRef.current.y - dy;

        // Clamp & kill the axis that hits bounds
        const clampedX = clamp(nextX, minX, maxX);
        const clampedY = clamp(nextY, minY, maxY);

        // Update velocities for next frame
        let nextVx = inert.vx * k;
        let nextVy = inert.vy * k;

        if (clampedX !== nextX) nextVx = 0;
        if (clampedY !== nextY) nextVy = 0;

        setCam({ x: clampedX, y: clampedY });
        camRef.current = { x: clampedX, y: clampedY };

        inertiaRef.current = {
          active: Math.hypot(nextVx, nextVy) > 0.01, // stop quickly
          lastTick: now,
          vx: nextVx,
          vy: nextVy,
        };
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [minX, maxX, minY, maxY]);

  // Click detection state
  const clickStartRef = useRef<{
    x: number;
    y: number;
    t: number;
    element?: HTMLElement;
  } | null>(null);

  // Pointer handlers
  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    const isPhotoClick = target.closest('article') !== null;

    // Always prepare for potential dragging
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = false; // Start as false, will become true on move
    lastPosRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    velRef.current = { vx: 0, vy: 0 };
    inertiaRef.current = null;

    // Store click start info if on a photo
    if (isPhotoClick) {
      clickStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        t: performance.now(),
        element: target.closest('article') as HTMLElement,
      };
    } else {
      clickStartRef.current = null;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!lastPosRef.current) return;

    const now = performance.now();
    const dt = Math.max(1, now - lastPosRef.current.t);
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    const distance = Math.hypot(dx, dy);

    // Start dragging if movement exceeds threshold
    if (!draggingRef.current && distance > 5) {
      draggingRef.current = true;
      // Clear click start info when we start dragging
      clickStartRef.current = null;
    }

    if (!draggingRef.current) return;

    // Heavier feel while dragging
    const ddx = dx * DRAG_GAIN;
    const ddy = dy * DRAG_GAIN;

    setCam((c) => {
      const nx = clamp(c.x - ddx, minX, maxX);
      const ny = clamp(c.y - ddy, minY, maxY);
      camRef.current = { x: nx, y: ny };
      return { x: nx, y: ny };
    });

    // Exponential smoothing for velocity (px/ms), clamped
    const sampleVx = clamp(dx / dt, -MAX_SPEED, MAX_SPEED);
    const sampleVy = clamp(dy / dt, -MAX_SPEED, MAX_SPEED);
    velRef.current = {
      vx:
        (1 - SPEED_SMOOTHING) * velRef.current.vx + SPEED_SMOOTHING * sampleVx,
      vy:
        (1 - SPEED_SMOOTHING) * velRef.current.vy + SPEED_SMOOTHING * sampleVy,
    };

    lastPosRef.current = { x: e.clientX, y: e.clientY, t: now };
  }

  function onPointerUp(e: React.PointerEvent) {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    // If we weren't dragging and have click start info, check for navigation
    if (!draggingRef.current && clickStartRef.current) {
      const clickDuration = performance.now() - clickStartRef.current.t;
      const clickDistance = Math.hypot(
        e.clientX - clickStartRef.current.x,
        e.clientY - clickStartRef.current.y,
      );

      // If click was quick and didn't move much, navigate
      if (clickDuration < 300 && clickDistance < 10) {
        const photoElement = clickStartRef.current.element;
        if (photoElement) {
          const filename = photoElement.getAttribute('data-filename');
          if (filename) {
            router.push(`/${encodeURIComponent(filename)}`);
          }
        }
      }
    }

    // If we were dragging, start inertia if speed is meaningful
    if (draggingRef.current) {
      const { vx, vy } = velRef.current;
      const speed = Math.hypot(vx, vy);
      inertiaRef.current =
        speed >= MIN_INERTIA_SPEED
          ? { active: true, lastTick: performance.now(), vx, vy }
          : null;
    }

    // Reset state
    draggingRef.current = false;
    lastPosRef.current = null;
    clickStartRef.current = null;
  }

  function onPointerCancel() {
    draggingRef.current = false;
    lastPosRef.current = null;
    inertiaRef.current = null;
    clickStartRef.current = null;
  }

  // Virtualization
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
  }, [layout, virtualRect.x, virtualRect.y, virtualRect.w, virtualRect.h]);

  // Recenter after hydration if viewport differs
  useEffect(() => {
    if (vw === SSR_SAFE_VW && vh === SSR_SAFE_VH) return;
    const nx = clamp((layout.width - vw) / 2, minX, maxX);
    const ny = clamp((layout.height - vh) / 2, minY, maxY);
    setCam({ x: nx, y: ny });
    camRef.current = { x: nx, y: ny };
  }, [vw, vh, layout.width, layout.height]); // eslint-disable-line

  return (
    <div
      className="fixed inset-0 touch-none overscroll-none select-none bg-neutral-100"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={(e) => {
        const WHEEL_GAIN = 0.8; // lower = heavier
        // desktop nicety: wheel pans; shift for horizontal
        if (e.shiftKey) {
          setCam((c) => {
            const nx = clamp(c.x + e.deltaY * WHEEL_GAIN, minX, maxX);
            camRef.current = { x: nx, y: c.y };
            return { x: nx, y: c.y };
          });
        } else {
          setCam((c) => {
            const nx = clamp(c.x + e.deltaX * WHEEL_GAIN, minX, maxX);
            const ny = clamp(c.y + e.deltaY * WHEEL_GAIN, minY, maxY);
            camRef.current = { x: nx, y: ny };
            return { x: nx, y: ny };
          });
        }
        // Optional: wheel inertia (commented out to not conflict with pointer inertia)
        // inertiaRef.current = null;
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
            data-filename={it.filename}
            className="absolute cursor-pointer hover:opacity-80 transition-opacity"
            style={{ left: it.x, top: it.y, width: it.w, height: it.h }}
          >
            <Picture
              uuidWithExt={it.filename}
              alt={it.filename}
              profile="grid"
              className="w-full h-full object-cover bg-gray-50"
              sizes={`${Math.round(it.w)}px`}
            />
          </article>
        ))}
      </div>

      {/* HUD - dev only */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute left-4 bottom-4 text-xs bg-white/80 backdrop-blur rounded-md px-2 py-1 shadow">
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
