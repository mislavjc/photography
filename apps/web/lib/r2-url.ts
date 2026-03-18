import { env } from './env';

/**
 * Resolved public R2 URL. Prefers the server-only `R2_PUBLIC_URL`
 * (e.g. a CDN origin) and falls back to the client-visible URL.
 *
 * Only importable from server components / server modules.
 */
export const R2_URL = env.R2_PUBLIC_URL ?? env.NEXT_PUBLIC_R2_URL;
