'use client';

import React, { ReactNode, useEffect, useRef, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Info, Map, Shuffle } from 'lucide-react';
import {
  animate,
  AnimatePresence,
  motion,
  MotionValue,
  useDragControls,
  useMotionValue,
  useSpring,
  useTransform,
} from 'motion/react';
import { useRouter } from 'next/navigation';
import type { Manifest } from 'types';

import type { Layout, PlacedItem } from 'lib/layout';

import { Minimap } from './minimap';

function getViewportHeight(): number {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  return vv?.height ?? window.innerHeight;
}

const SCALE = 1.05;
const DISTANCE = 48;
const NUDGE = 3;
const SPRING = { mass: 0.16, stiffness: 300, damping: 30 };

const APPS = [
  { name: 'Minimap', href: null, icon: Map, component: 'MinimapWindow' },
  { name: 'Dev Info', href: null, icon: Info, component: 'DevInfoWindow' },
  { name: 'Random Photo', href: '/random', icon: Shuffle, component: null },
];

type DockProps = {
  minimapProps: {
    worldW: number;
    worldH: number;
    camX: number;
    camY: number;
    viewW: number;
    viewH: number;
    tiles: PlacedItem[];
    manifest: Manifest;
    onSetCam: (_xy: { x: number; y: number }) => void;
    sampleStep?: number;
    sizePx?: number;
    pad?: number;
  };
  devHudProps: {
    layout: Layout;
    cam: { x: number; y: number };
    vw: number;
    vh: number;
    visibleItems: Layout['items'];
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
};

export const Dock = ({ minimapProps, devHudProps }: DockProps) => {
  const mouseLeft = useMotionValue(-Infinity);
  const mouseRight = useMotionValue(-Infinity);
  const left = useTransform(mouseLeft, [0, 40], [0, 0]);
  const right = useTransform(mouseRight, [0, 40], [0, 0]);
  const leftSpring = useSpring(left, SPRING);
  const rightSpring = useSpring(right, SPRING);
  const [openWindows, setOpenWindows] = useState<Set<string>>(new Set());
  const dockRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{
    rightPx: number;
    bottomPx: number;
    centerLeftPx: number;
    isDesktop: boolean;
  }>({ rightPx: 24, bottomPx: 144, centerLeftPx: 0, isDesktop: false });

  // NEW: lock background scroll on mobile when a window is open
  useEffect(() => {
    const hasWindow = openWindows.size > 0;
    const isDesktop =
      typeof window !== 'undefined' && window.innerWidth >= 1280;
    if (hasWindow && !isDesktop) {
      const { body, documentElement } = document;
      const prevOverflow = body.style.overflow;
      const prevOsb = documentElement.style.overscrollBehavior as string;
      body.style.overflow = 'hidden';
      documentElement.style.overscrollBehavior = 'none';
      return () => {
        body.style.overflow = prevOverflow;
        documentElement.style.overscrollBehavior = prevOsb || '';
      };
    }
  }, [openWindows]);

  // Drive a --vvh CSS var (stable viewport height)
  useEffect(() => {
    const setVvh = () => {
      const h = getViewportHeight();
      document.documentElement.style.setProperty('--vvh', `${h}px`);
    };
    setVvh();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', setVvh, { passive: true });
      vv.addEventListener('scroll', setVvh, { passive: true });
    }
    window.addEventListener('resize', setVvh, { passive: true });
    return () => {
      if (vv) {
        vv.removeEventListener('resize', setVvh);
        vv.removeEventListener('scroll', setVvh);
      }
      window.removeEventListener('resize', setVvh);
    };
  }, []);

  // Anchor calculations
  useEffect(() => {
    const updateAnchor = () => {
      const el = dockRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const isDesktop = window.innerWidth >= 1280;
      const vv = window.visualViewport;
      const viewportH = vv?.height ?? window.innerHeight;
      const topInVV = rect.top - (vv ? (vv.offsetTop ?? 0) : 0);
      const bottomOffset = Math.max(0, viewportH - topInVV + 16);
      setAnchor({
        isDesktop,
        rightPx: 24,
        bottomPx: bottomOffset,
        centerLeftPx: rect.left + rect.width / 2,
      });
    };
    updateAnchor();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateAnchor, { passive: true });
      vv.addEventListener('scroll', updateAnchor, { passive: true });
    }
    window.addEventListener('resize', updateAnchor, { passive: true });
    window.addEventListener('scroll', updateAnchor, { passive: true });
    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateAnchor);
        vv.removeEventListener('scroll', updateAnchor);
      }
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor);
    };
  }, []);

  const anyWindowOpen = openWindows.size > 0; // NEW

  return (
    <>
      {/* NEW: Backdrop to eat scroll/taps and close */}
      <AnimatePresence>
        {anyWindowOpen && (
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenWindows(new Set())}
          />
        )}
      </AnimatePresence>

      <motion.div
        ref={dockRef}
        onMouseMove={(e) => {
          const { left, right } = e.currentTarget.getBoundingClientRect();
          const offsetLeft = e.clientX - left;
          const offsetRight = right - e.clientX;
          mouseLeft.set(offsetLeft);
          mouseRight.set(offsetRight);
        }}
        onMouseLeave={() => {
          mouseLeft.set(-Infinity);
          mouseRight.set(-Infinity);
        }}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 xl:right-6 xl:left-auto xl:translate-x-0 flex h-16 items-end gap-3 px-2 pb-[max(12px,env(safe-area-inset-bottom))] z-[70]" // z-up
      >
        <motion.div
          className="absolute rounded-2xl inset-y-0 bg-white border border-gray-300 -z-10"
          style={{ left: leftSpring, right: rightSpring }}
        />

        {APPS.map((app, i) => (
          <AppIcon
            key={i}
            mouseLeft={mouseLeft}
            href={app.href}
            icon={app.icon}
            componentName={app.component || ''}
            isOpen={openWindows.has(app.component || '')}
            onToggleWindow={(component) => {
              const next = new Set<string>();
              if (!openWindows.has(component)) next.add(component);
              setOpenWindows(next);
            }}
          >
            {app.name}
          </AppIcon>
        ))}
      </motion.div>

      {/* Windows */}
      <AnimatePresence>
        {openWindows.has('MinimapWindow') && (
          <MinimapWindow
            key="minimap"
            onClose={() => {
              const next = new Set(openWindows);
              next.delete('MinimapWindow');
              setOpenWindows(next);
            }}
            minimapProps={minimapProps}
            isDesktop={anchor.isDesktop}
            anchorRightPx={anchor.rightPx}
            anchorBottomPx={anchor.bottomPx}
            anchorCenterLeftPx={anchor.centerLeftPx}
          />
        )}
        {openWindows.has('DevInfoWindow') && (
          <DevInfoWindow
            key="devinfo"
            onClose={() => {
              const next = new Set(openWindows);
              next.delete('DevInfoWindow');
              setOpenWindows(next);
            }}
            isDesktop={anchor.isDesktop}
            anchorRightPx={anchor.rightPx}
            anchorBottomPx={anchor.bottomPx}
            anchorCenterLeftPx={anchor.centerLeftPx}
            devHudProps={devHudProps}
          />
        )}
      </AnimatePresence>

      {/* Mobile demo strip unchanged */}
      <div className="sm:hidden">
        <div className="mx-auto flex h-16 max-w-full items-end gap-4 overflow-x-scroll rounded-2xl bg-gray-700 px-4 pb-3 sm:hidden">
          {Array.from(Array(8).keys()).map((i) => (
            <div
              key={i}
              className="aspect-square w-10 flex-shrink-0 rounded-lg bg-gray-100"
            />
          ))}
        </div>
        <p className="mt-4 text-center text-xs font-medium text-gray-300">
          View at 640px with a mouse
          <br /> to see the interaction.
        </p>
      </div>
    </>
  );
};

function AppIcon({
  mouseLeft,
  children,
  href,
  icon: Icon,
  componentName,
  isOpen,
  onToggleWindow,
}: {
  mouseLeft: MotionValue;
  children: ReactNode;
  href?: string | null;
  icon?: React.ComponentType<{ className?: string }>;
  componentName?: string;
  isOpen?: boolean;
  onToggleWindow?: (_component: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const distance = useTransform(() => {
    const bounds = ref.current
      ? { x: ref.current.offsetLeft, width: ref.current.offsetWidth }
      : { x: 0, width: 0 };
    return mouseLeft.get() - bounds.x - bounds.width / 2;
  });

  const scale = useTransform(distance, [-DISTANCE, 0, DISTANCE], [1, SCALE, 1]);
  const x = useTransform(() => {
    const d = distance.get();
    if (d === -Infinity) return 0;
    if (d < -DISTANCE || d > DISTANCE) return Math.sign(d) * -1 * NUDGE;
    return (-d / DISTANCE) * NUDGE * scale.get();
  });

  const scaleSpring = useSpring(scale, SPRING);
  const xSpring = useSpring(x, SPRING);
  const y = useMotionValue(0);

  return (
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <motion.button
            ref={ref}
            style={{ x: xSpring, scale: scaleSpring, y }}
            onClick={() => {
              if (href) {
                router.push(href);
              } else if (onToggleWindow) {
                onToggleWindow(componentName || '');
              } else {
                animate(y, [0, -40, 0], {
                  repeat: 2,
                  ease: [
                    [0, 0, 0.2, 1],
                    [0.8, 0, 1, 1],
                  ],
                  duration: 0.7,
                });
              }
            }}
            className={`aspect-square w-10 rounded-lg shadow origin-bottom flex items-center justify-center ${
              isOpen ? 'bg-blue-500' : 'bg-gray-100'
            }`}
          >
            {Icon && (
              <Icon
                className={`w-5 h-5 ${isOpen ? 'text-white' : 'text-gray-700'}`}
              />
            )}
          </motion.button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={10}
            className="bg-gray-700 shadow shadow-black border border-gray-600 px-2 py-1.5 text-sm rounded text-white font-medium z-[80]"
          >
            {children}
            <Tooltip.Arrow />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

// ----------------------------- macOS-style window -----------------------------

// Frame component extracted to avoid creating components during render
function WindowFrame({
  children,
  className,
  title,
  onClose,
  startDrag,
}: {
  children: ReactNode;
  className: string;
  title: string;
  onClose: () => void;
  startDrag: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      className={`bg-white rounded-lg shadow-2xl border border-gray-300 overflow-hidden ${className}`}
    >
      <div
        className="bg-gray-100 px-3 py-3 flex items-center border-b border-gray-300 select-none"
        onPointerDown={startDrag}
        style={{ touchAction: 'none' }}
      >
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1">
            <button
              onClick={onClose}
              className="w-3.5 h-3.5 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
              aria-label="Close"
            />
            <div className="w-3.5 h-3.5 rounded-full bg-yellow-500" />
            <div className="w-3.5 h-3.5 rounded-full bg-green-500" />
          </div>
          <span className="text-sm font-medium text-gray-700 ml-2">
            {title}
          </span>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function MacWindow({
  title,
  children,
  onClose,
  className = '',
  fixedPosition,
  anchorAboveDock,
  gapPx = 64,
  anchorRightPx,
  anchorBottomPx,
  anchorCenterLeftPx,
  isDesktop,
  draggable = false, // NEW: explicit drag toggle
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  fixedPosition?: { left: number; top: number };
  anchorAboveDock?: boolean;
  gapPx?: number;
  anchorRightPx?: number;
  anchorBottomPx?: number;
  anchorCenterLeftPx?: number;
  isDesktop?: boolean;
  draggable?: boolean; // NEW
}) {
  const [position] = useState({ x: 100, y: 100 });
  const dragControls = useDragControls(); // NEW
  const startDrag = (e: React.PointerEvent) => {
    // Only allow dragging via header on desktop, not on touch
    if (draggable && (e.pointerType === 'mouse' || e.pointerType === 'pen')) {
      dragControls.start(e);
    }
  };

  const anchoredStyleDesktop = {
    right: anchorRightPx ?? 24,
    bottom: anchorBottomPx ?? 64 + 16 + gapPx,
    maxWidth: 'min(560px, calc(100vw - 48px))',
    maxHeight:
      'min(80vh, min(80svh, min(80dvh, calc(var(--vvh, 100vh) - 160px))))',
  } as const;

  const mobileWrapperStyle: React.CSSProperties = {
    left: anchorCenterLeftPx ?? 0,
    bottom: anchorBottomPx ?? 64 + 16 + gapPx,
    transform: 'translateX(-50%)',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight:
      'min(80vh, min(80svh, min(80dvh, calc(var(--vvh, 100vh) - 160px))))',
    visibility: anchorCenterLeftPx ? 'visible' : 'hidden',
    // NEW: stop page scrolling/bounce while touching the window
    touchAction: 'none',
    overscrollBehavior: 'contain',
  };

  if (!anchorAboveDock) {
    // Free/drag position (desktop only, header-drag)
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 16 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="fixed z-[75]" // below backdrop(60) but above dock(70)
        style={{
          left: fixedPosition ? fixedPosition.left : position.x,
          top: fixedPosition ? fixedPosition.top : position.y,
        }}
        drag={false} // NEW: managed by dragControls
        dragControls={dragControls} // NEW
        dragMomentum={false}
        dragElastic={0}
      >
        <WindowFrame
          className={className}
          title={title}
          onClose={onClose}
          startDrag={startDrag}
        >
          {children}
        </WindowFrame>
      </motion.div>
    );
  }

  // Anchored above dock (fixed; no drag)
  if (isDesktop) {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 16 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="fixed z-[75]"
        style={anchoredStyleDesktop}
      >
        <WindowFrame
          className={className}
          title={title}
          onClose={onClose}
          startDrag={startDrag}
        >
          {children}
        </WindowFrame>
      </motion.div>
    );
  }

  // Mobile/tablet: wrap; block touch scroll
  return (
    <div
      className="fixed z-[75] pointer-events-none"
      style={mobileWrapperStyle}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 16 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="pointer-events-auto"
      >
        <WindowFrame
          className={className}
          title={title}
          onClose={onClose}
          startDrag={startDrag}
        >
          {children}
        </WindowFrame>
      </motion.div>
    </div>
  );
}

function MinimapWindow({
  onClose,
  minimapProps,
  isDesktop,
  anchorRightPx,
  anchorBottomPx,
  anchorCenterLeftPx,
}: {
  onClose: () => void;
  minimapProps: DockProps['minimapProps'];
  isDesktop?: boolean;
  anchorRightPx?: number;
  anchorBottomPx?: number;
  anchorCenterLeftPx?: number;
}) {
  return (
    <MacWindow
      title="Minimap"
      onClose={onClose}
      anchorAboveDock
      isDesktop={isDesktop}
      anchorRightPx={anchorRightPx}
      anchorBottomPx={anchorBottomPx}
      anchorCenterLeftPx={anchorCenterLeftPx}
      draggable={false} // NEW: fixed window UX
    >
      {/* NEW: prevent page scroll while interacting with the minimap */}
      <div
        className="flex items-center justify-center"
        style={{ touchAction: 'none' }}
      >
        <Minimap
          worldW={minimapProps.worldW}
          worldH={minimapProps.worldH}
          camX={minimapProps.camX}
          camY={minimapProps.camY}
          viewW={minimapProps.viewW}
          viewH={minimapProps.viewH}
          tiles={minimapProps.tiles}
          manifest={minimapProps.manifest}
          onSetCam={minimapProps.onSetCam}
          sampleStep={minimapProps.sampleStep ?? 1}
          sizePx={320}
          pad={minimapProps.pad}
        />
      </div>
    </MacWindow>
  );
}

function DevInfoWindow({
  onClose,
  isDesktop,
  anchorRightPx,
  anchorBottomPx,
  anchorCenterLeftPx,
  devHudProps,
}: {
  onClose: () => void;
  isDesktop?: boolean;
  anchorRightPx?: number;
  anchorBottomPx?: number;
  anchorCenterLeftPx?: number;
  devHudProps: DockProps['devHudProps'];
}) {
  return (
    <MacWindow
      title="Dev Info"
      onClose={onClose}
      anchorAboveDock
      isDesktop={isDesktop}
      anchorRightPx={anchorRightPx}
      anchorBottomPx={anchorBottomPx}
      anchorCenterLeftPx={anchorCenterLeftPx}
      draggable={false} // NEW: fixed window UX
    >
      <div className="p-4 space-y-4 min-w-[240px]">
        {/* ...unchanged Dev Info content... */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1 border-b border-gray-200">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <h3 className="text-sm font-semibold text-gray-800">Layout</h3>
          </div>
          <div className="space-y-1 pl-4">
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Size:</span>{' '}
              <span className="font-mono text-blue-600">
                {Math.round(devHudProps.layout.width)} ×{' '}
                {Math.round(devHudProps.layout.height)}px
              </span>
            </div>
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Bounds:</span>{' '}
              <span className="font-mono text-purple-600">
                [{devHudProps.minX}, {devHudProps.minY}] → [
                {Math.round(devHudProps.maxX)}, {Math.round(devHudProps.maxY)}]
              </span>
            </div>
          </div>
        </div>
        {/* ...rest of your Dev Info UI... */}
      </div>
    </MacWindow>
  );
}
