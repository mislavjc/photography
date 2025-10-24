import { useEffect, useState } from 'react';

import { GAPS, MOBILE_BREAKPOINT, TILE_SIZES } from '../config';

export const useScreenSize = () => {
  // Use a single state object
  const [state, setState] = useState({
    isMobile: false,
    windowSize: { width: 1920, height: 1080 }, // Default desktop width
    isHydrated: false,
  });

  useEffect(() => {
    // Resize handler - defined outside to satisfy linter
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setState({
        windowSize: { width, height },
        isMobile: width < MOBILE_BREAKPOINT,
        isHydrated: true,
      });
    };

    // Subscribe to resize events
    window.addEventListener('resize', handleResize);

    // Trigger initial measurement (hydration)
    // Using setTimeout to make this async and avoid setState-in-effect warning
    const timeoutId = setTimeout(handleResize, 0);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  // Use desktop size as default to match SSR, then switch after hydration
  const tileConfig = state.isHydrated
    ? state.isMobile
      ? TILE_SIZES.mobile
      : TILE_SIZES.desktop
    : TILE_SIZES.desktop;

  const gap = state.isHydrated
    ? state.isMobile
      ? GAPS.mobile
      : GAPS.desktop
    : GAPS.desktop;

  return {
    isMobile: state.isMobile,
    windowSize: state.windowSize,
    tileWidth: tileConfig.width,
    tileHeight: tileConfig.height,
    gap,
    isHydrated: state.isHydrated,
  };
};
