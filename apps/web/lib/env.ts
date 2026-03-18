import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    R2_PUBLIC_URL: z.string().url().optional(),
    R2_VARIANTS_PREFIX: z.string().min(1).default('variants'),
    REVALIDATION_SECRET: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_R2_URL: z.string().url(),
    NEXT_PUBLIC_MAPBOX_TOKEN: z.string().min(1),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_R2_URL: process.env.NEXT_PUBLIC_R2_URL,
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  },
});
