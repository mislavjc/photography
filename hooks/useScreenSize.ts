import { useEffect, useState } from 'react';

import { GAPS, MOBILE_BREAKPOINT, TILE_SIZES } from '../config';

export const useScreenSize = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [windowSize, setWindowSize] = useState({
    width: 1920, // Default desktop width
    height: 1080,
  });
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Set initial values after hydration
    const width = window.innerWidth;
    const height = window.innerHeight;
    setWindowSize({ width, height });
    setIsMobile(width < MOBILE_BREAKPOINT);
    setIsHydrated(true);

    const handleResize = () => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      setWindowSize({ width: newWidth, height: newHeight });
      setIsMobile(newWidth < MOBILE_BREAKPOINT);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Use desktop size as default to match SSR, then switch after hydration
  const tileConfig = isHydrated
    ? isMobile
      ? TILE_SIZES.mobile
      : TILE_SIZES.desktop
    : TILE_SIZES.desktop;

  const gap = isHydrated
    ? isMobile
      ? GAPS.mobile
      : GAPS.desktop
    : GAPS.desktop;

  return {
    isMobile,
    windowSize,
    tileWidth: tileConfig.width,
    tileHeight: tileConfig.height,
    gap,
    isHydrated,
  };
};
