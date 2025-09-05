'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import type { Layout, PlacedItem } from 'lib/layout';
import { Info, Map, Shuffle } from 'lucide-react';
import {
  animate,
  AnimatePresence,
  motion,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
} from 'motion/react';
import { useRouter } from 'next/navigation';
import React, { ReactNode, useRef, useState } from 'react';
import type { Manifest } from 'types';

import { Minimap } from './minimap';

const SCALE = 1.05; // max scale factor of an icon (barely noticeable)
const DISTANCE = 48; // pixels before mouse affects an icon
const NUDGE = 3; // pixels icons are moved away from mouse (minimal)
const SPRING = {
  mass: 0.16,
  stiffness: 300,
  damping: 30,
};
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
  // Remove horizontal movement - keep vertical scaling only
  const left = useTransform(mouseLeft, [0, 40], [0, 0]);
  const right = useTransform(mouseRight, [0, 40], [0, 0]);
  const leftSpring = useSpring(left, SPRING);
  const rightSpring = useSpring(right, SPRING);
  const [openWindows, setOpenWindows] = useState<Set<string>>(new Set());
  const dockRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{
    rightPx: number; // distance from screen right (desktop)
    bottomPx: number; // distance above dock
    centerLeftPx: number; // center X above dock (mobile/tablet)
    isDesktop: boolean;
  }>({
    rightPx: 24,
    bottomPx: 144,
    centerLeftPx: 0,
    isDesktop: false,
  });

  React.useEffect(() => {
    const updateAnchor = () => {
      const el = dockRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const isDesktop = window.innerWidth >= 1280; // xl breakpoint

      // distance above dock (same for both)
      const bottomOffset = window.innerHeight - rect.top + 16; // 16px gap above dock

      setAnchor({
        isDesktop,
        rightPx: 24, // ~xl:right-6 aesthetic; adjust if you want tighter
        bottomPx: bottomOffset,
        centerLeftPx: rect.left + rect.width / 2,
      });
    };

    updateAnchor();
    window.addEventListener('resize', updateAnchor, { passive: true });
    return () => window.removeEventListener('resize', updateAnchor);
  }, []);

  return (
    <>
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
        className="fixed bottom-4 left-1/2 transform -translate-x-1/2 xl:right-6 xl:left-auto xl:translate-x-0 flex h-16 items-end gap-3 px-2 pb-3 z-50"
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
              const newOpenWindows = new Set(openWindows);
              if (newOpenWindows.has(component)) {
                // If clicking on already open window, close it
                newOpenWindows.delete(component);
              } else {
                // Close all existing windows and open the new one
                newOpenWindows.clear();
                newOpenWindows.add(component);
              }
              setOpenWindows(newOpenWindows);
            }}
          >
            {app.name}
          </AppIcon>
        ))}
      </motion.div>

      {/* macOS-style windows */}
      <AnimatePresence>
        {openWindows.has('MinimapWindow') && (
          <MinimapWindow
            key="minimap"
            onClose={() => {
              const newOpenWindows = new Set(openWindows);
              newOpenWindows.delete('MinimapWindow');
              setOpenWindows(newOpenWindows);
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
              const newOpenWindows = new Set(openWindows);
              newOpenWindows.delete('DevInfoWindow');
              setOpenWindows(newOpenWindows);
            }}
            isDesktop={anchor.isDesktop}
            anchorRightPx={anchor.rightPx}
            anchorBottomPx={anchor.bottomPx}
            anchorCenterLeftPx={anchor.centerLeftPx}
            devHudProps={devHudProps}
          />
        )}
      </AnimatePresence>

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
    if (d === -Infinity) {
      return 0;
    } else if (d < -DISTANCE || d > DISTANCE) {
      return Math.sign(d) * -1 * NUDGE;
    } else {
      return (-d / DISTANCE) * NUDGE * scale.get();
    }
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

// macOS-style window components
function MacWindow({
  title,
  children,
  onClose,
  className = '',
  fixedPosition,
  anchorAboveDock,
  gapPx = 64,
  anchorRightPx, // NEW
  anchorBottomPx,
  anchorCenterLeftPx, // NEW
  isDesktop, // NEW
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
}) {
  const [position] = useState({ x: 100, y: 100 });

  const anchoredStyleDesktop = {
    right: anchorRightPx ?? 24,
    bottom: anchorBottomPx ?? 64 + 16 + gapPx,
    maxWidth: 'min(560px, calc(100vw - 48px))',
    maxHeight: 'min(80vh, calc(100vh - 160px))',
  } as const;

  // Mobile wrapper style - separate from motion.div to avoid transform conflicts
  const mobileWrapperStyle: React.CSSProperties = {
    left: anchorCenterLeftPx ?? 0,
    bottom: anchorBottomPx ?? 64 + 16 + gapPx,
    transform: 'translateX(-50%)',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'min(80vh, calc(100vh - 160px))',
    visibility: anchorCenterLeftPx ? 'visible' : 'hidden', // prevent initial jump
  };

  if (!anchorAboveDock) {
    // Free/drag position (unchanged)
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 20 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="fixed z-[70] pointer-events-auto"
        style={{
          left: fixedPosition ? fixedPosition.left : position.x,
          top: fixedPosition ? fixedPosition.top : position.y,
        }}
        drag
        dragMomentum={false}
      >
        <div
          className={`bg-white rounded-lg shadow-2xl border border-gray-300 overflow-hidden ${className}`}
        >
          <div className="bg-gray-100 px-3 py-2 flex items-center border-b border-gray-300">
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1">
                <button
                  onClick={onClose}
                  className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <span className="text-sm font-medium text-gray-700 ml-2">
                {title}
              </span>
            </div>
          </div>
          <div>{children}</div>
        </div>
      </motion.div>
    );
  }

  // Anchored above dock
  if (isDesktop) {
    // Desktop: pin by right (no translate)
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 20 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="fixed z-[70] pointer-events-auto"
        style={anchoredStyleDesktop}
      >
        <div
          className={`bg-white rounded-lg shadow-2xl border border-gray-300 overflow-hidden ${className}`}
        >
          <div className="bg-gray-100 px-3 py-2 flex items-center border-b border-gray-300">
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1">
                <button
                  onClick={onClose}
                  className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <span className="text-sm font-medium text-gray-700 ml-2">
                {title}
              </span>
            </div>
          </div>
          <div>{children}</div>
        </div>
      </motion.div>
    );
  }

  // Mobile/tablet: wrap to avoid transform conflicts
  return (
    <div
      className="fixed z-[70] pointer-events-none"
      style={mobileWrapperStyle}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 20 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="pointer-events-auto"
      >
        <div
          className={`bg-white rounded-lg shadow-2xl border border-gray-300 overflow-hidden ${className}`}
        >
          <div className="bg-gray-100 px-3 py-2 flex items-center border-b border-gray-300">
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1">
                <button
                  onClick={onClose}
                  className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
              </div>
              <span className="text-sm font-medium text-gray-700 ml-2">
                {title}
              </span>
            </div>
          </div>
          <div>{children}</div>
        </div>
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
    >
      <div className="flex items-center justify-center">
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
    >
      <div className="p-4 space-y-4 min-w-[240px]">
        {/* Layout Section */}
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

        {/* Position Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1 border-b border-gray-200">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <h3 className="text-sm font-semibold text-gray-800">Position</h3>
          </div>
          <div className="space-y-1 pl-4">
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Camera:</span>{' '}
              <span className="font-mono text-green-600">
                ({Math.round(devHudProps.cam.x)},{' '}
                {Math.round(devHudProps.cam.y)})
              </span>
            </div>
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Viewport:</span>{' '}
              <span className="font-mono text-emerald-600">
                {Math.round(devHudProps.vw)} × {Math.round(devHudProps.vh)}px
              </span>
            </div>
          </div>
        </div>

        {/* Tiles Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1 border-b border-gray-200">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            <h3 className="text-sm font-semibold text-gray-800">Tiles</h3>
          </div>
          <div className="pl-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 font-medium">
                Visible:
              </span>
              <span className="text-xs font-mono text-orange-600 font-semibold">
                {devHudProps.visibleItems.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 font-medium">Total:</span>
              <span className="text-xs font-mono text-gray-500">
                {devHudProps.layout.items.length}
              </span>
            </div>
            <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-orange-500 h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    (devHudProps.visibleItems.length /
                      devHudProps.layout.items.length) *
                    100
                  }%`,
                }}
              ></div>
            </div>
          </div>
        </div>

        {/* Performance Indicator */}
        <div className="pt-2 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Performance</span>
            <div className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  devHudProps.visibleItems.length >
                  devHudProps.layout.items.length * 0.5
                    ? 'bg-red-500'
                    : devHudProps.visibleItems.length >
                        devHudProps.layout.items.length * 0.25
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                }`}
              ></div>
              <span className="font-mono text-gray-600">
                {Math.round(
                  (devHudProps.visibleItems.length /
                    devHudProps.layout.items.length) *
                    100,
                )}
                %
              </span>
            </div>
          </div>
        </div>
      </div>
    </MacWindow>
  );
}
