'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { Tile } from 'components/tile';
import { buildTileRects, clamp } from 'lib/tile';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  BASE_TILE_SIZE,
  CELL_OVERSCAN_PX,
  EMA_ALPHA,
  FRICTION_PER_SEC,
  MAX_ZOOM,
  MID,
  MIN_SPEED,
  MIN_ZOOM,
  OVERSCAN_TILES,
  WORLD_TILES,
} from '../config';
import type { AccumulatedDelta, Position, Velocity } from '../types';

const InfiniteImageMap = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const tileSize = BASE_TILE_SIZE * zoom;

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

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !(e.metaKey || e.shiftKey)) return;
      e.preventDefault();
      const el = scrollRef.current!;
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left + el.scrollLeft;
      const py = e.clientY - rect.top + el.scrollTop;

      const prevZoom = zoom;
      const nextZoom = clamp(
        zoom * (e.deltaY < 0 ? 1.1 : 0.9),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      if (nextZoom === prevZoom) return;
      setZoom(nextZoom);

      // Force remeasure after zoom change to update cached sizes
      requestAnimationFrame(() => {
        rowVirtualizer.measure();
        colVirtualizer.measure();
        const scale = nextZoom / prevZoom;
        el.scrollTo({
          left: px * scale - (e.clientX - rect.left),
          top: py * scale - (e.clientY - rect.top),
        });
      });
    },
    [zoom, rowVirtualizer, colVirtualizer],
  );

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

  const cols = colVirtualizer.getVirtualItems();
  const rows = rowVirtualizer.getVirtualItems();

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

  const viewport = useMemo(() => {
    const el = scrollRef.current;
    if (!el) return { left: 0, top: 0, right: 0, bottom: 0 };
    return {
      left: el.scrollLeft - CELL_OVERSCAN_PX,
      top: el.scrollTop - CELL_OVERSCAN_PX,
      right: el.scrollLeft + el.clientWidth + CELL_OVERSCAN_PX,
      bottom: el.scrollTop + el.clientHeight + CELL_OVERSCAN_PX,
    };
  }, [cols, rows]);

  return (
    <div className="relative h-screen w-screen bg-white text-neutral-900 select-none">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden cursor-grab active:cursor-grabbing [touch-action:none] [overscroll-behavior:none]"
        onContextMenu={(e) => e.preventDefault()}
        onWheel={onWheel}
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
