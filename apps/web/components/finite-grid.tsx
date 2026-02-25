'use client';

import React, {
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import type { Manifest } from 'types';

import { Picture } from 'components/picture';
import { SearchNoResults } from 'components/search-no-results';

import { EXT_RE } from 'lib/constants';
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

// Find first index where items[i].y + items[i].h > minY (layout.items must be sorted by y)
function firstInView(items: { y: number; h: number }[], minY: number): number {
  let lo = 0,
    hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid]!.y + items[mid]!.h <= minY) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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
  searchError?: string | null;
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
  searchError,
}: Props) {
  const { vw, vh } = useViewportSize();

  // Filter manifest if search results provided
  const filteredManifest = useMemo(() => {
    if (!filteredIds || filteredIds.size === 0) return manifest;
    const filtered: Manifest = {};
    for (const [filename, entry] of Object.entries(manifest)) {
      const id = filename.replace(EXT_RE, '');
      if (filteredIds.has(id)) {
        filtered[filename] = entry;
      }
    }
    return filtered;
  }, [manifest, filteredIds]);

  // Sample IDs from manifest for SearchNoResults collage (spread across the full collection)
  const sampleIds = useMemo(() => {
    const keys = Object.keys(manifest);
    if (keys.length === 0) return [];
    const needed = SEARCH_CATEGORIES.length * 3;
    const step = Math.max(1, Math.floor(keys.length / needed));
    return Array.from({ length: Math.min(needed, keys.length) }, (_, i) =>
      keys[(i * step) % keys.length]!.replace(EXT_RE, ''),
    );
  }, [manifest]);

  // Defer the expensive layout recomputation so it doesn't block the UI during search
  const deferredFilteredManifest = useDeferredValue(filteredManifest);

  const layout = useMemo(
    () =>
      deferredFilteredManifest === manifest
        ? (initialLayout ?? computeNearSquareLayout(manifest))
        : computeNearSquareLayout(deferredFilteredManifest),
    [deferredFilteredManifest, manifest, initialLayout],
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

  // Initialize camera once: restore saved if present else center.
  // Wrapped in requestAnimationFrame to avoid synchronous setState in effect
  // (which the React Compiler can't optimize).
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;

    const id = requestAnimationFrame(() => {
      if (didInitRef.current) return;
      didInitRef.current = true;

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
    });

    return () => cancelAnimationFrame(id);
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
    lastPosRef.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    velRef.current = { vx: 0, vy: 0 };
    inertiaRef.current = null;

    // Store click start info if on a photo
    if (isPhotoClick) {
      clickStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
        element: target.closest('article') as HTMLElement,
      };
    } else {
      clickStartRef.current = null;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!lastPosRef.current) return;

    const dt = Math.max(1, e.timeStamp - lastPosRef.current.t);
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

    lastPosRef.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
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
      const clickDuration = e.timeStamp - clickStartRef.current.t;
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
          lastTick: e.timeStamp,
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
    const vx1 = virtualRect.x;
    const vy1 = virtualRect.y;
    const vx2 = virtualRect.x + virtualRect.w;
    const vy2 = virtualRect.y + virtualRect.h;
    const items = layout.items; // sorted by y
    const start = firstInView(items, vy1);
    const out: typeof items = [];
    for (let i = start; i < items.length; i++) {
      const it = items[i]!;
      if (it.y > vy2) break;
      if (it.x < vx2 && it.x + it.w > vx1) out.push(it);
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
        className="fixed inset-0 touch-none overscroll-none select-none bg-neutral-100 dark:bg-neutral-900"
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

      {/* Empty state when search returns no results or fails */}
      {(searchResultCount === 0 || searchError) &&
        searchQuery &&
        !isSearching && (
          <SearchNoResults
            searchQuery={searchQuery}
            onSearch={onSearch}
            sampleIds={sampleIds}
            searchError={searchError}
          />
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
            categorySampleIds={sampleIds.filter((_, i) => i % 3 === 0)}
          />
        </Suspense>
      )}
    </div>
  );
}
