'use client';

import dynamic from 'next/dynamic';
const Minimap = dynamic(
  () => import('components/minimap').then((m) => m.Minimap),
  { ssr: false },
);
const DevHud = dynamic(
  () => import('components/dev-hud').then((m) => m.DevHud),
  { ssr: false },
);
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

// --- helpers ---
function readSavedCam(key: string): { x: number; y: number } | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (
      obj &&
      typeof obj.x === 'number' &&
      isFinite(obj.x) &&
      typeof obj.y === 'number' &&
      isFinite(obj.y)
    ) {
      return { x: obj.x, y: obj.y };
    }
  } catch {}
  return null;
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
  stateKey?: string;
};

export function PannableGrid({
  manifest,
  initialLayout,
  stateKey = 'grid:default',
}: Props) {
  const router = useRouter();
  const { vw, vh } = useViewportSize();
  const layout = useMemo(
    () => initialLayout ?? computeNearSquareLayout(manifest),
    [manifest, initialLayout],
  );

  // Track whether we restored from storage to avoid recentering over it
  const restoredFromStorageRef = useRef(false);

  // Initial cam: start at top-left (0,0). Apply saved position AFTER hydrate to avoid SSR mismatch.
  const [cam, setCam] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const camRef = useRef(cam);
  useEffect(() => {
    camRef.current = cam;
  }, [cam]);

  // Live bounds
  const minX = -PAD;
  const minY = -PAD;
  const maxX = Math.max(0, layout.width - vw + PAD);
  const maxY = Math.max(0, layout.height - vh + PAD);

  // Initialize camera once: restore saved if present else center
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    const saved = readSavedCam(stateKey);
    if (saved) {
      const nx = clamp(saved.x, minX, maxX);
      const ny = clamp(saved.y, minY, maxY);
      restoredFromStorageRef.current = true;
      setCam({ x: nx, y: ny });
      camRef.current = { x: nx, y: ny };
    } else {
      const nx = clamp((layout.width - vw) / 2, minX, maxX);
      const ny = clamp((layout.height - vh) / 2, minY, maxY);
      setCam({ x: nx, y: ny });
      camRef.current = { x: nx, y: ny };
    }
    didInitRef.current = true;
  }, [stateKey, minX, maxX, minY, maxY, layout.width, layout.height, vw, vh]);

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

    // [click-to-open] save immediately BEFORE navigating
    if (!draggingRef.current && clickStartRef.current) {
      const clickDuration = performance.now() - clickStartRef.current.t;
      const clickDistance = Math.hypot(
        e.clientX - clickStartRef.current.x,
        e.clientY - clickStartRef.current.y,
      );

      if (clickDuration < 300 && clickDistance < 10) {
        const photoElement = clickStartRef.current.element;
        if (photoElement) {
          const filename = photoElement.getAttribute('data-filename');
          if (filename) {
            saveCam(camRef.current); // <— ensure persisted before route change
            router.push(`/${encodeURIComponent(filename)}`);
          }
        }
      }
    }

    // inertia start (unchanged) ...
    if (draggingRef.current) {
      const { vx, vy } = velRef.current;
      const speed = Math.hypot(vx, vy);
      inertiaRef.current =
        speed >= MIN_INERTIA_SPEED
          ? { active: true, lastTick: performance.now(), vx, vy }
          : null;
      // also save right after a drag ends (snappier persistence)
      saveCam(camRef.current);
    }

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

  // On viewport/layout changes: clamp camera to bounds (no auto-centering)
  useEffect(() => {
    const clamped = {
      x: clamp(camRef.current.x, minX, maxX),
      y: clamp(camRef.current.y, minY, maxY),
    };
    if (clamped.x !== camRef.current.x || clamped.y !== camRef.current.y) {
      setCam(clamped);
      camRef.current = clamped;
    }
  }, [vw, vh, layout.width, layout.height, minX, maxX, minY, maxY]);

  // Persist helpers
  const saveCam = React.useCallback(
    (c: { x: number; y: number }) => {
      try {
        sessionStorage.setItem(stateKey, JSON.stringify({ x: c.x, y: c.y }));
      } catch {}
    },
    [stateKey],
  );

  // Add a jump helper (clamps + saves)
  const jumpCam = React.useCallback(
    (c: { x: number; y: number }) => {
      const nx = clamp(c.x, minX, maxX);
      const ny = clamp(c.y, minY, maxY);
      setCam({ x: nx, y: ny });
      camRef.current = { x: nx, y: ny };
      // persist immediately for snappy back/forward behavior
      try {
        sessionStorage.setItem(stateKey, JSON.stringify({ x: nx, y: ny }));
      } catch {}
    },
    [minX, maxX, minY, maxY, stateKey],
  );

  // Debounced saver (kept)
  const saveTimer = useRef<number | null>(null);

  // Optional: also save during wheel pan "idle" (coarse heuristic)
  const wheelSaveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (saveTimer.current) cancelAnimationFrame(saveTimer.current);
    saveTimer.current = requestAnimationFrame(() => saveCam(camRef.current));
    return () => {
      if (saveTimer.current) cancelAnimationFrame(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam.x, cam.y, stateKey]);

  // Save on visibility/pagehide/beforeunload (BFCache safe)
  useEffect(() => {
    const onFreeze = () => saveCam(camRef.current);
    document.addEventListener('visibilitychange', onFreeze);
    window.addEventListener('beforeunload', onFreeze);
    window.addEventListener('pagehide', onFreeze); // important for BFCache
    return () => {
      document.removeEventListener('visibilitychange', onFreeze);
      window.removeEventListener('beforeunload', onFreeze);
      window.removeEventListener('pagehide', onFreeze);
    };
  }, [saveCam]);

  return (
    <div
      className="fixed inset-0 touch-none overscroll-none select-none bg-neutral-100"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={(e) => {
        const WHEEL_GAIN = 0.8;
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
        if (wheelSaveTimer.current)
          cancelAnimationFrame(wheelSaveTimer.current);
        wheelSaveTimer.current = requestAnimationFrame(() =>
          saveCam(camRef.current),
        );
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
        {visibleItems.map((it) => {
          const meta = manifest[it.filename]; // { w, h, ... } from Manifest
          const intrinsicW = meta?.w ?? 3; // fallback guards
          const intrinsicH = meta?.h ?? 2;
          const isInViewport =
            it.x < viewRect.x + viewRect.w &&
            it.x + it.w > viewRect.x &&
            it.y < viewRect.y + viewRect.h &&
            it.y + it.h > viewRect.y;

          return (
            <article
              key={it.filename}
              data-filename={it.filename}
              className="absolute cursor-pointer"
              style={{ left: it.x, top: it.y, width: it.w, height: it.h }}
            >
              <Picture
                uuidWithExt={it.filename}
                alt={it.filename}
                profile="grid"
                intrinsicWidth={intrinsicW}
                intrinsicHeight={intrinsicH}
                pictureClassName="block w-full h-full"
                imgClassName="block w-full h-full object-cover bg-gray-50"
                sizes={`${Math.round(it.w)}px`}
                loading="eager"
                fetchPriority={isInViewport ? 'high' : 'low'}
              />
            </article>
          );
        })}
      </div>

      {/* Minimap */}
      <Minimap
        className="absolute right-4 bottom-4"
        worldW={layout.width}
        worldH={layout.height}
        camX={cam.x}
        camY={cam.y}
        viewW={vw}
        viewH={vh}
        tiles={layout.items} // {x,y,w,h,filename} in your layout
        manifest={manifest}
        onSetCam={jumpCam}
        sampleStep={1} // increase to 2/3/4 if you have thousands of tiles
        sizePx={168}
        pad={PAD}
      />

      {/* HUD - dev only */}
      {process.env.NODE_ENV === 'development' && (
        <DevHud
          layout={layout}
          cam={cam}
          vw={vw}
          vh={vh}
          visibleItems={visibleItems}
          minX={minX}
          minY={minY}
          maxX={maxX}
          maxY={maxY}
        />
      )}
    </div>
  );
}
