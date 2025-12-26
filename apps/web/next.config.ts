import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  images: {
    loader: 'custom',
    loaderFile: './lib/imageLoader.ts',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'r2.photography.mislavjc.com',
      },
    ],
  },
};

export default nextConfig;
