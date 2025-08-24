'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useCallback, useEffect, useRef } from 'react';

import {
  CELL_OVERSCAN_PX,
  EMA_ALPHA,
  FRICTION_PER_SEC,
  MID,
  MIN_SPEED,
  OVERSCAN_TILES,
  WORLD_TILES,
} from '../config';
import { useScreenSize } from '../hooks/useScreenSize';
import { buildTileRects } from '../lib/tile';
import type {
  AccumulatedDelta,
  Manifest,
  Position,
  Rect,
  Velocity,
} from '../types';
import { Tile } from './tile';

interface InfiniteImageMapProps {
  manifest: Manifest;
}

const InfiniteImageMap = ({ manifest }: InfiniteImageMapProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { tileWidth, tileHeight, gap, isHydrated } = useScreenSize();

  // Ultra-fast LRU cache implementation for 60fps performance
  const rectCache = useRef(new Map<string, Rect[]>());
  const cacheOrder = useRef(
    new Map<string, { prev: string | null; next: string | null }>(),
  );
  const cacheHead = useRef<string | null>(null);
  const cacheTail = useRef<string | null>(null);
  const keyFor = (
    tx: number,
    ty: number,
    width: number,
    hasManifest: boolean,
  ) => `${tx}:${ty}:${Math.round(width)}:${hasManifest}`;
  // Ultra-fast cache access and eviction for smooth scrolling
  const moveToHead = useCallback((key: string) => {
    const node = cacheOrder.current.get(key);
    if (!node || key === cacheHead.current) return;

    // Remove from current position
    if (node.prev) {
      const prevNode = cacheOrder.current.get(node.prev);
      if (prevNode) prevNode.next = node.next;
    }
    if (node.next) {
      const nextNode = cacheOrder.current.get(node.next);
      if (nextNode) nextNode.prev = node.prev;
    }
    if (key === cacheTail.current) {
      cacheTail.current = node.prev;
    }

    // Move to head
    node.prev = null;
    node.next = cacheHead.current;
    if (cacheHead.current) {
      const headNode = cacheOrder.current.get(cacheHead.current);
      if (headNode) headNode.prev = key;
    }
    cacheHead.current = key;
    if (!cacheTail.current) {
      cacheTail.current = key;
    }
  }, []);

  const getRects = useCallback(
    (tx: number, ty: number, manifestData?: Manifest) => {
      const k = keyFor(tx, ty, tileWidth, !!manifestData);
      const hit = rectCache.current.get(k);
      if (hit) {
        moveToHead(k);
        return hit;
      }

      const rects = buildTileRects(
        tx,
        ty,
        tileWidth,
        tileHeight,
        gap,
        manifestData,
      );

      // Fast LRU eviction
      if (rectCache.current.size >= 500) {
        // Reduced cache size for better performance
        if (cacheTail.current) {
          const tailNode = cacheOrder.current.get(cacheTail.current);
          rectCache.current.delete(cacheTail.current);
          cacheOrder.current.delete(cacheTail.current);
          cacheTail.current = tailNode?.prev || null;
          if (cacheTail.current) {
            const newTailNode = cacheOrder.current.get(cacheTail.current);
            if (newTailNode) newTailNode.next = null;
          }
        }
      }

      rectCache.current.set(k, rects);
      cacheOrder.current.set(k, { prev: null, next: null });
      moveToHead(k);
      return rects;
    },
    [tileWidth, tileHeight, gap, moveToHead],
  );

  const rowVirtualizer = useVirtualizer({
    count: WORLD_TILES,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => tileHeight + gap, // Add responsive gap between tiles vertically
    overscan: OVERSCAN_TILES,
  });
  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: WORLD_TILES,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => tileWidth + gap, // Add responsive gap between tiles horizontally
    overscan: OVERSCAN_TILES,
  });

  const totalWidth = colVirtualizer.getTotalSize();
  const totalHeight = rowVirtualizer.getTotalSize();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const centerLeft = totalWidth / 2 - el.clientWidth / 2;
    const centerTop = totalHeight / 2 - el.clientHeight / 2;
    if (
      !('dataset' in el) ||
      el.scrollLeft < 1000 ||
      el.scrollTop < 1000 ||
      totalWidth - el.scrollLeft - el.clientWidth < 1000 ||
      totalHeight - el.scrollTop - el.clientHeight < 1000
    ) {
      el.scrollTo({
        left: centerLeft,
        top: centerTop,
        behavior: 'instant' as ScrollBehavior,
      });
    }
    el.dataset.mounted = '1';
  }, [totalWidth, totalHeight]);

  // Force remeasure when hydrated and tile size changes (important for mobile)
  useEffect(() => {
    if (isHydrated) {
      requestAnimationFrame(() => {
        rowVirtualizer.measure();
        colVirtualizer.measure();
      });
    }
  }, [isHydrated, tileWidth, tileHeight, rowVirtualizer, colVirtualizer]);

  const dragging = useRef(false);
  const last = useRef<Position>({ x: 0, y: 0, t: 0 });
  const acc = useRef<AccumulatedDelta>({ dx: 0, dy: 0 });
  const emaV = useRef<Velocity>({ vx: 0, vy: 0 });
  const vel = useRef<Velocity>({ vx: 0, vy: 0 });
  const rafRef = useRef<number | null>(null);
  const lastFrame = useRef<number>(0);

  const step = useCallback((now: number) => {
    const el = scrollRef.current!;
    const dtMs = lastFrame.current ? now - lastFrame.current : 16.67;
    lastFrame.current = now;

    if (dragging.current) {
      if (acc.current.dx || acc.current.dy) {
        el.scrollLeft -= acc.current.dx;
        el.scrollTop -= acc.current.dy;
        vel.current.vx = emaV.current.vx;
        vel.current.vy = emaV.current.vy;
        acc.current.dx = 0;
        acc.current.dy = 0;
      }
      rafRef.current = requestAnimationFrame(step);
      return;
    }

    const scale = dtMs / 16.67;
    if (Math.hypot(vel.current.vx, vel.current.vy) >= MIN_SPEED) {
      el.scrollLeft -= vel.current.vx * scale;
      el.scrollTop -= vel.current.vy * scale;
      const decay = Math.exp(-FRICTION_PER_SEC * (dtMs / 1000));
      vel.current.vx *= decay;
      vel.current.vy *= decay;
      rafRef.current = requestAnimationFrame(step);
    } else {
      rafRef.current = null;
    }
  }, []);

  const ensureRAF = useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(step);
  }, [step]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      acc.current = { dx: 0, dy: 0 };
      emaV.current = { vx: 0, vy: 0 };
      vel.current = { vx: 0, vy: 0 };
      ensureRAF();
    },
    [ensureRAF],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const nativeEvent = e.nativeEvent as PointerEvent & {
        getCoalescedEvents?: () => PointerEvent[];
      };
      const evts = nativeEvent.getCoalescedEvents?.() || [e];
      let dxSum = 0,
        dySum = 0;
      let lastX = last.current.x;
      let lastY = last.current.y;
      let lastT = last.current.t;
      const now = performance.now();

      for (const ev of evts) {
        const cx = 'clientX' in ev ? ev.clientX : e.clientX;
        const cy = 'clientY' in ev ? ev.clientY : e.clientY;
        const dx = cx - lastX;
        const dy = cy - lastY;
        dxSum += dx;
        dySum += dy;
        const dt = Math.max(1, now - lastT);
        const instVx = (dx / dt) * 16.67;
        const instVy = (dy / dt) * 16.67;
        emaV.current.vx =
          emaV.current.vx * (1 - EMA_ALPHA) + instVx * EMA_ALPHA;
        emaV.current.vy =
          emaV.current.vy * (1 - EMA_ALPHA) + instVy * EMA_ALPHA;
        lastX = cx;
        lastY = cy;
        lastT = now;
      }

      acc.current.dx += dxSum;
      acc.current.dy += dySum;
      last.current = { x: lastX, y: lastY, t: now };
      ensureRAF();
    },
    [ensureRAF],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    ensureRAF();
  }, [ensureRAF]);

  // Minimal prefetching for 60fps performance
  useEffect(() => {
    if (!('requestIdleCallback' in window)) return;

    // Use longer idle callback timeout for less aggressive prefetching
    const id = window.requestIdleCallback(
      () => {
        const visCols = colVirtualizer.getVirtualItems();
        const visRows = rowVirtualizer.getVirtualItems();

        // Only prefetch 1 tile ahead for maximum performance
        if (visCols.length > 0 && visRows.length > 0) {
          const dirX = Math.sign(vel.current.vx) || 1;
          const dirY = Math.sign(vel.current.vy) || 1;
          const nextCol = visCols[visCols.length - 1].index + dirX;
          const nextRow = visRows[visRows.length - 1].index + dirY;

          const tx = nextCol - MID;
          const ty = nextRow - MID;
          const k = keyFor(tx, ty, tileWidth, !!manifest);

          if (!rectCache.current.has(k)) {
            const rects = buildTileRects(
              tx,
              ty,
              tileWidth,
              tileHeight,
              gap,
              manifest || undefined,
            );
            rectCache.current.set(k, rects);
            cacheOrder.current.set(k, { prev: null, next: null });
            moveToHead(k);
          }
        }
      },
      { timeout: 100 },
    ); // Longer timeout for less frequent prefetching

    return () => window.cancelIdleCallback?.(id);
  }, [
    rowVirtualizer,
    colVirtualizer,
    tileWidth,
    tileHeight,
    gap,
    manifest,
    moveToHead,
  ]);

  // No more dynamic measurement needed - using fixed tall tiles

  const viewportRef = useRef({ left: 0, top: 0, right: 0, bottom: 0 });

  // Update viewport on every render but avoid triggering re-renders
  const el = scrollRef.current;
  if (el) {
    viewportRef.current = {
      left: el.scrollLeft - CELL_OVERSCAN_PX,
      top: el.scrollTop - CELL_OVERSCAN_PX,
      right: el.scrollLeft + el.clientWidth + CELL_OVERSCAN_PX,
      bottom: el.scrollTop + el.clientHeight + CELL_OVERSCAN_PX,
    };
  }
  const viewport = viewportRef.current;

  return (
    <div className="relative h-screen w-screen bg-white text-neutral-900 select-none">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden cursor-grab active:cursor-grabbing [touch-action:none] [overscroll-behavior:none]"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => dragging.current && onPointerUp()}
      >
        <div
          className="relative"
          style={{ width: totalWidth, height: totalHeight }}
        >
          {rowVirtualizer.getVirtualItems().map((row) => (
            <React.Fragment key={row.key}>
              {colVirtualizer.getVirtualItems().map((col) => {
                const tx = col.index - MID;
                const ty = row.index - MID;

                // Performance: Remove debug logging in production

                return (
                  <Tile
                    key={`${row.index}:${col.index}`}
                    tx={tx}
                    ty={ty}
                    left={col.start + gap / 2} // Add responsive margin for x-axis gaps
                    top={row.start + gap / 2} // Add responsive margin for y-axis gaps
                    tileWidth={tileWidth} // Use full tile width
                    tileHeight={tileHeight}
                    getRects={getRects}
                    viewport={viewport}
                    onHover={() => null}
                    manifest={manifest}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InfiniteImageMap;
