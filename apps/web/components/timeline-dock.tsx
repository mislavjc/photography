'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Calendar, Grid, Shuffle } from 'lucide-react';
import type { MotionValue } from 'motion/react';
import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'motion/react';
import { useRouter } from 'next/navigation';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/ui/select';

const SCALE = 1.05;
const DISTANCE = 48;
const NUDGE = 3;
const SPRING = { mass: 0.16, stiffness: 300, damping: 30 };

interface TimelineDockProps {
  years: number[];
  currentYear: number | null;
  onJumpToYear: (year: number | null) => void;
}

export function TimelineDock({
  years,
  currentYear,
  onJumpToYear,
}: TimelineDockProps) {
  const mouseLeft = useMotionValue(-Infinity);
  const left = useTransform(mouseLeft, [0, 40], [0, 0]);
  const right = useTransform(mouseLeft, [0, 40], [0, 0]);
  const leftSpring = useSpring(left, SPRING);
  const rightSpring = useSpring(right, SPRING);
  const dockRef = useRef<HTMLDivElement>(null);

  // Drive CSS vars for visual viewport (handles mobile browser chrome)
  useEffect(() => {
    const updateViewportVars = () => {
      const vv = window.visualViewport;
      const vvh = vv?.height ?? window.innerHeight;
      const vvOffsetTop = vv?.offsetTop ?? 0;
      const layoutHeight = window.innerHeight;
      const bottomOffset = layoutHeight - vvh - vvOffsetTop;

      document.documentElement.style.setProperty('--vvh', `${vvh}px`);
      document.documentElement.style.setProperty(
        '--vv-bottom-offset',
        `${Math.max(0, bottomOffset)}px`,
      );
    };
    updateViewportVars();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateViewportVars, { passive: true });
      vv.addEventListener('scroll', updateViewportVars, { passive: true });
    }
    window.addEventListener('resize', updateViewportVars, { passive: true });
    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateViewportVars);
        vv.removeEventListener('scroll', updateViewportVars);
      }
      window.removeEventListener('resize', updateViewportVars);
    };
  }, []);

  return (
    <motion.div
      ref={dockRef}
      onMouseMove={(e) => {
        const { left } = e.currentTarget.getBoundingClientRect();
        const offsetLeft = e.clientX - left;
        mouseLeft.set(offsetLeft);
      }}
      onMouseLeave={() => {
        mouseLeft.set(-Infinity);
      }}
      className="fixed left-1/2 -translate-x-1/2 xl:right-6 xl:left-auto xl:translate-x-0 flex h-16 items-end gap-3 px-2 pb-3 z-[70]"
      style={{
        // Adjust bottom position based on visual viewport offset (mobile browser chrome)
        bottom:
          'calc(var(--vv-bottom-offset, 0px) + max(16px, env(safe-area-inset-bottom)))',
      }}
    >
      <motion.div
        className="absolute rounded-2xl inset-y-0 bg-white border border-gray-300 -z-10"
        style={{ left: leftSpring, right: rightSpring }}
      />

      {/* Grid view icon */}
      <AppIcon mouseLeft={mouseLeft} href="/" icon={Grid}>
        Grid View
      </AppIcon>

      {/* Year selector */}
      <div className="flex items-center h-10">
        <Select
          value={currentYear?.toString() ?? 'all'}
          onValueChange={(value) => {
            if (value === 'all') {
              onJumpToYear(null);
            } else {
              onJumpToYear(parseInt(value, 10));
            }
          }}
        >
          <SelectTrigger className="w-auto min-w-[110px] h-10 bg-gray-100 border-0 rounded-lg shadow">
            <Calendar className="w-4 h-4 mr-1 text-gray-700" />
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Random photo icon */}
      <AppIcon mouseLeft={mouseLeft} href="/random" icon={Shuffle}>
        Random Photo
      </AppIcon>
    </motion.div>
  );
}

function AppIcon({
  mouseLeft,
  children,
  href,
  icon: Icon,
}: {
  mouseLeft: MotionValue;
  children: ReactNode;
  href?: string | null;
  icon?: React.ComponentType<{ className?: string }>;
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
            type="button"
            aria-label={children as string}
            style={{ x: xSpring, scale: scaleSpring, y }}
            onClick={() => {
              if (href) {
                router.push(href);
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
            className="aspect-square w-10 rounded-lg shadow origin-bottom flex items-center justify-center bg-gray-100"
          >
            {Icon && <Icon className="w-5 h-5 text-gray-700" />}
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
