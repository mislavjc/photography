'use client';

import { useEffect, useRef } from 'react';

interface PerformanceMonitorProps {
  enabled?: boolean;
}

export const PerformanceMonitor = ({
  enabled = false,
}: PerformanceMonitorProps) => {
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const fpsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;

    let animationId: number;

    const measureFPS = () => {
      frameCount.current++;
      const currentTime = performance.now();

      if (currentTime - lastTime.current >= 1000) {
        const fps = Math.round(
          (frameCount.current * 1000) / (currentTime - lastTime.current),
        );

        if (fpsRef.current) {
          fpsRef.current.textContent = `FPS: ${fps}`;
          fpsRef.current.style.color =
            fps < 30 ? 'red' : fps < 50 ? 'orange' : 'green';
        }

        frameCount.current = 0;
        lastTime.current = currentTime;
      }

      animationId = requestAnimationFrame(measureFPS);
    };

    measureFPS();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={fpsRef}
      style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '8px 12px',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '14px',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      FPS: --
    </div>
  );
};
