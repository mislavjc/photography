import type { track as trackFn } from '@plausible-analytics/tracker';

let _track: typeof trackFn | null = null;
let _ready: Promise<void> | null = null;

function ensureLoaded(): Promise<void> {
  if (_ready) return _ready;
  _ready = import('@plausible-analytics/tracker').then((mod) => {
    _track = mod.track;
  });
  return _ready;
}

/**
 * Fire a custom Plausible event. Safe to call before the tracker loads —
 * the call will be queued until init completes. No-ops on the server.
 */
export function trackEvent(name: string, props?: Record<string, string>): void {
  if (typeof window === 'undefined') return;

  const fire = () => {
    _track?.(name, props ? { props } : {});
  };

  if (_track) {
    fire();
  } else {
    ensureLoaded().then(fire);
  }
}
