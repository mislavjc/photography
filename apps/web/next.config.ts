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
      {
        protocol: 'https',
        hostname: 'pub-0c0ced8cca504a779995fa0289895697.r2.dev',
      },
    ],
  },
};

export default nextConfig;
