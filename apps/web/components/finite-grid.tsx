'use client';

import React, {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import type { Manifest } from 'types';

import { Picture } from 'components/picture';

import { computeNearSquareLayout, type Layout } from 'lib/layout';
import { SEARCH_CATEGORIES } from 'lib/search-categories';

// Lazy load Navbar with idle callback to defer heavy dependencies until after LCP
const Navbar = lazy(() =>
  new Promise<typeof import('./navbar')>((resolve) => {
    // Use requestIdleCallback to defer loading until browser is idle
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => resolve(import('./navbar')), { timeout: 3000 });
    } else {
      // Fallback for Safari
      setTimeout(() => resolve(import('./navbar')), 100);
    }
  }).then((m) => ({ default: m.Navbar })),
);

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

type SearchPreview = {
  id: string;
  score: number;
};

type Props = {
  manifest: Manifest;
  initialLayout?: Layout;
  stateKey?: string;
  filteredIds?: Set<string> | null;
  onSearch?: (query: string) => void;
  onClearSearch?: () => void;
  isSearching?: boolean;
  searchResultCount?: number;
  searchQuery?: string;
  searchPreview?: SearchPreview[];
};

export function PannableGrid({
  manifest,
  initialLayout,
  stateKey = 'grid:default',
  filteredIds,
  onSearch,
  onClearSearch,
  isSearching,
  searchResultCount,
  searchQuery,
  searchPreview,
}: Props) {
  const { vw, vh } = useViewportSize();

  // Filter manifest if search results provided
  const filteredManifest = useMemo(() => {
    if (!filteredIds || filteredIds.size === 0) return manifest;
    const filtered: Manifest = {};
    for (const [filename, entry] of Object.entries(manifest)) {
      const id = filename.replace(/\.[^.]+$/, '');
      if (filteredIds.has(id)) {
        filtered[filename] = entry;
      }
    }
    return filtered;
  }, [manifest, filteredIds]);

  const layout = useMemo(
    () =>
      filteredIds && filteredIds.size > 0
        ? computeNearSquareLayout(filteredManifest)
        : (initialLayout ?? computeNearSquareLayout(manifest)),
    [filteredManifest, filteredIds, initialLayout, manifest],
  );

  // Disable browser back/forward gestures on this page
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    // Store original values
    const origHtmlOverscroll = html.style.overscrollBehavior;
    const origBodyOverscroll = body.style.overscrollBehavior;
    const origTouchAction = body.style.touchAction;

    // Disable overscroll (prevents swipe back/forward)
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';
    body.style.touchAction = 'none';

    return () => {
      html.style.overscrollBehavior = origHtmlOverscroll;
      body.style.overscrollBehavior = origBodyOverscroll;
      body.style.touchAction = origTouchAction;
    };
  }, []);

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

  // Inertia tick function - only called when inertia is active
  const runInertiaTick = React.useCallback(() => {
    const tick = () => {
      const inert = inertiaRef.current;
      if (!inert || !inert.active) {
        rafRef.current = null;
        return; // Stop the loop when inertia becomes inactive
      }

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

      const stillActive = Math.hypot(nextVx, nextVy) > 0.01;
      inertiaRef.current = {
        active: stillActive,
        lastTick: now,
        vx: nextVx,
        vy: nextVy,
      };

      if (stillActive) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    // Start the loop if not already running
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [minX, maxX, minY, maxY]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Click detection state
  const clickStartRef = useRef<{
    x: number;
    y: number;
    t: number;
    element?: HTMLElement;
  } | null>(null);
  // Track if we just finished dragging (to block Link clicks)
  const wasJustDraggingRef = useRef(false);
  // For deferred pointer capture
  const pointerCaptureTargetRef = useRef<HTMLElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  // Pointer handlers
  function onPointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    const isPhotoClick = target.closest('article') !== null;

    // Store the container for potential pointer capture later
    pointerCaptureTargetRef.current = e.currentTarget as HTMLElement;
    pointerIdRef.current = e.pointerId;

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
      // Now capture the pointer for smooth dragging
      if (pointerCaptureTargetRef.current && pointerIdRef.current !== null) {
        try {
          pointerCaptureTargetRef.current.setPointerCapture(
            pointerIdRef.current,
          );
        } catch {}
      }
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
    // Release pointer capture if we had it
    if (pointerCaptureTargetRef.current && pointerIdRef.current !== null) {
      try {
        pointerCaptureTargetRef.current.releasePointerCapture(
          pointerIdRef.current,
        );
      } catch {}
    }
    pointerCaptureTargetRef.current = null;
    pointerIdRef.current = null;

    // [click-to-open] save cam position before Link navigation
    if (!draggingRef.current && clickStartRef.current) {
      const clickDuration = performance.now() - clickStartRef.current.t;
      const clickDistance = Math.hypot(
        e.clientX - clickStartRef.current.x,
        e.clientY - clickStartRef.current.y,
      );

      if (clickDuration < 300 && clickDistance < 10) {
        // Save camera position - Link click will handle navigation
        saveCam(camRef.current);
      }
    }

    // inertia start - only start RAF loop if we have meaningful velocity
    if (draggingRef.current) {
      const { vx, vy } = velRef.current;
      const speed = Math.hypot(vx, vy);
      if (speed >= MIN_INERTIA_SPEED) {
        inertiaRef.current = {
          active: true,
          lastTick: performance.now(),
          vx,
          vy,
        };
        runInertiaTick(); // Start the RAF loop
      } else {
        inertiaRef.current = null;
      }
      // also save right after a drag ends (snappier persistence)
      saveCam(camRef.current);
      // Mark that we just dragged so click handler can block navigation
      wasJustDraggingRef.current = true;
      // Reset after a tick so only the immediate click is blocked
      requestAnimationFrame(() => {
        wasJustDraggingRef.current = false;
      });
    }

    draggingRef.current = false;
    lastPosRef.current = null;
    clickStartRef.current = null;
  }

  function onPointerCancel() {
    pointerCaptureTargetRef.current = null;
    pointerIdRef.current = null;
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

  // On bounds changes: clamp camera
  useEffect(() => {
    const clamped = {
      x: clamp(camRef.current.x, minX, maxX),
      y: clamp(camRef.current.y, minY, maxY),
    };
    if (clamped.x !== camRef.current.x || clamped.y !== camRef.current.y) {
      setCam(clamped);
      camRef.current = clamped;
    }
  }, [minX, maxX, minY, maxY]);

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

  // Defer navbar rendering until after initial paint for better LCP
  const [showNavbar, setShowNavbar] = useState(false);
  useEffect(() => {
    // Use requestIdleCallback to show navbar after browser is idle
    let id: number | ReturnType<typeof setTimeout>;

    if (typeof requestIdleCallback !== 'undefined') {
      id = requestIdleCallback(() => setShowNavbar(true), { timeout: 2000 });
    } else {
      id = setTimeout(() => setShowNavbar(true), 100);
    }

    return () => {
      if (typeof cancelIdleCallback !== 'undefined' && typeof id === 'number') {
        cancelIdleCallback(id);
      } else {
        clearTimeout(id as ReturnType<typeof setTimeout>);
      }
    };
  }, []);

  // Consolidated RAF-based save timer (shared between camera changes and wheel events)
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef(false);

  const scheduleSave = React.useCallback(() => {
    if (pendingSaveRef.current) return; // Already scheduled
    pendingSaveRef.current = true;
    if (saveTimerRef.current) cancelAnimationFrame(saveTimerRef.current);
    saveTimerRef.current = requestAnimationFrame(() => {
      saveCam(camRef.current);
      pendingSaveRef.current = false;
    });
  }, [saveCam]);

  // Save camera position when it changes (debounced via RAF)
  useEffect(() => {
    scheduleSave();
    return () => {
      if (saveTimerRef.current) cancelAnimationFrame(saveTimerRef.current);
    };
  }, [scheduleSave]);

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

  // Arrow key navigation
  useEffect(() => {
    const ARROW_SPEED = 100;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      let dx = 0;
      let dy = 0;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          dy = -ARROW_SPEED;
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          dy = ARROW_SPEED;
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          dx = -ARROW_SPEED;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          dx = ARROW_SPEED;
          break;
        default:
          return;
      }

      e.preventDefault();
      setCam((c) => {
        const nx = clamp(c.x + dx, minX, maxX);
        const ny = clamp(c.y + dy, minY, maxY);
        camRef.current = { x: nx, y: ny };
        return { x: nx, y: ny };
      });
    };

    // passive: false because we call preventDefault for arrow keys
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [minX, maxX, minY, maxY]);

  return (
    <div>
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
          scheduleSave();
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
          {visibleItems.map((it, idx) => {
            const meta = manifest[it.filename]; // { w, h, ... } from Manifest
            const intrinsicW = meta?.w ?? 3; // fallback guards
            const intrinsicH = meta?.h ?? 2;
            const isInViewport =
              it.x < viewRect.x + viewRect.w &&
              it.x + it.w > viewRect.x &&
              it.y < viewRect.y + viewRect.h &&
              it.y + it.h > viewRect.y;
            // Only first 4 viewport images get high priority for LCP
            const isLCPCandidate = isInViewport && idx < 4;

            return (
              <article
                key={it.filename}
                data-filename={it.filename}
                className="absolute"
                style={{ left: it.x, top: it.y, width: it.w, height: it.h }}
              >
                <Link
                  href={`/photo/${encodeURIComponent(it.filename)}${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ''}`}
                  className="block w-full h-full cursor-pointer"
                  onClick={(e) => {
                    // Block navigation if we just finished dragging
                    if (wasJustDraggingRef.current || draggingRef.current) {
                      e.preventDefault();
                    }
                  }}
                  draggable={false}
                >
                  <Picture
                    uuidWithExt={it.filename}
                    alt={it.filename}
                    profile="grid"
                    intrinsicWidth={intrinsicW}
                    intrinsicHeight={intrinsicH}
                    pictureClassName="block w-full h-full"
                    imgClassName="block w-full h-full object-cover"
                    sizes={`${Math.round(it.w)}px`}
                    loading={isInViewport ? 'eager' : 'lazy'}
                    fetchPriority={isLCPCandidate ? 'high' : 'auto'}
                    dominantColor={
                      meta?.exif?.dominantColors?.[0]?.hex ?? '#f9fafb'
                    }
                  />
                </Link>
              </article>
            );
          })}
        </div>
      </div>

      {/* Empty state when search returns no results */}
      {searchResultCount === 0 && searchQuery && !isSearching && (
        <div className="fixed inset-0 z-[40] flex items-center justify-center bg-white pt-14 px-4">
          <div className="w-full max-w-4xl rounded-3xl bg-neutral-100 p-6 sm:p-10">
            <div className="mb-8 text-center">
              <h2 className="text-xl sm:text-2xl font-medium text-neutral-900">
                No results for "{searchQuery}"
              </h2>
              <p className="mt-2 text-sm text-neutral-500">
                Try searching for one of these categories instead
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
              {SEARCH_CATEGORIES.map((cat, idx) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSearch?.(cat.query)}
                  className={`group flex flex-col overflow-hidden rounded-2xl bg-neutral-200/60 p-3 transition-all hover:bg-neutral-200 hover:ring-2 hover:ring-neutral-300 ${idx >= 4 ? 'hidden sm:flex' : ''}`}
                >
                  {/* Photo collage - 3 overlapping images */}
                  <div className="relative h-28 sm:h-32 mb-3">
                    {cat.previewIds.slice(0, 3).map((id, idx) => {
                      const imageUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/variants/grid/avif/480/${id}.avif`;
                      const rotation =
                        idx === 0
                          ? '-rotate-6'
                          : idx === 1
                            ? 'rotate-3'
                            : '-rotate-2';
                      const offset =
                        idx === 0
                          ? 'left-0 top-2'
                          : idx === 1
                            ? 'right-0 top-0'
                            : 'left-1/2 -translate-x-1/2 top-4';
                      const zIndex =
                        idx === 0 ? 'z-10' : idx === 1 ? 'z-20' : 'z-30';
                      const size =
                        idx === 2
                          ? 'w-20 h-20 sm:w-24 sm:h-24'
                          : 'w-16 h-16 sm:w-20 sm:h-20';
                      return (
                        <div
                          key={id}
                          className={`absolute ${offset} ${zIndex} ${rotation} ${size} overflow-hidden rounded-lg bg-white shadow-md transition-transform duration-300 group-hover:rotate-0`}
                        >
                          <img
                            src={imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <span className="text-sm font-medium text-neutral-700 text-center">
                    {cat.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showNavbar && (
        <Suspense fallback={null}>
          <Navbar
            minimapProps={{
              worldW: layout.width,
              worldH: layout.height,
              camX: cam.x,
              camY: cam.y,
              viewW: vw,
              viewH: vh,
              tiles: layout.items,
              manifest: filteredManifest,
              onSetCam: jumpCam,
              sampleStep: 1,
              sizePx: 220,
              pad: PAD,
            }}
            activePage="canvas"
            onSearch={onSearch}
            onClearSearch={onClearSearch}
            isSearching={isSearching}
            searchResultCount={searchResultCount}
            searchQuery={searchQuery}
            searchPreview={searchPreview}
          />
        </Suspense>
      )}
    </div>
  );
}
