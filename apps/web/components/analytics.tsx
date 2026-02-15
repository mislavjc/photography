'use client';

import { SITE_CONFIG } from 'lib/constants';

// Module-level: runs once when this chunk loads on the client
if (typeof window !== 'undefined') {
  import('@plausible-analytics/tracker').then(({ init }) => {
    init({ domain: SITE_CONFIG.domain });
  });
}

// Null component — only exists so the server layout can include this module
export function Analytics() {
  return null;
}
