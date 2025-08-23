'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { Tile } from 'components/tile';
import { buildTileRects } from 'lib/tile';
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
import type { AccumulatedDelta, Position, Velocity } from '../types';

const InfiniteImageMap = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { tileSize, isHydrated } = useScreenSize();

  const rectCache = useRef(
    new Map<
      string,
      { x: number; y: number; w: number; h: number; seed: number }[]
    >(),
  );
  const keyFor = (tx: number, ty: number, size: number) =>
    `${tx}:${ty}:${Math.round(size)}`;
  const getRects = useCallback((tx: number, ty: number, size: number) => {
    const k = keyFor(tx, ty, size);
    const hit = rectCache.current.get(k);
    if (hit) return hit;
    const r = buildTileRects(tx, ty, size);
    rectCache.current.set(k, r);
    return r;
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: WORLD_TILES,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => tileSize,
    overscan: OVERSCAN_TILES,
  });
  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: WORLD_TILES,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => tileSize,
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
  }, [isHydrated, tileSize, rowVirtualizer, colVirtualizer]);

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

  const _cols = colVirtualizer.getVirtualItems();
  const _rows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    if (!('requestIdleCallback' in window)) return;
    const id = window.requestIdleCallback(() => {
      const visCols = colVirtualizer.getVirtualItems();
      const visRows = rowVirtualizer.getVirtualItems();
      const dirX = Math.sign(vel.current.vx) || 1;
      const dirY = Math.sign(vel.current.vy) || 1;
      const colsAhead = visCols.slice(-3).map((c) => c.index + dirX);
      const rowsAhead = visRows.slice(-3).map((r) => r.index + dirY);
      for (const ci of colsAhead)
        for (const ri of rowsAhead) {
          const tx = ci - MID;
          const ty = ri - MID;
          const k = `${tx}:${ty}:${Math.round(tileSize)}`;
          if (!rectCache.current.has(k))
            rectCache.current.set(k, buildTileRects(tx, ty, tileSize));
        }
    });
    return () => window.cancelIdleCallback?.(id);
  }, [rowVirtualizer, colVirtualizer, tileSize]);

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
                return (
                  <Tile
                    key={`${row.index}:${col.index}`}
                    tx={tx}
                    ty={ty}
                    left={col.start}
                    top={row.start}
                    tileSize={tileSize}
                    getRects={getRects}
                    viewport={viewport}
                    onHover={() => null}
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
