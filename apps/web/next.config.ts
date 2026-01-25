import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  experimental: {
    optimizePackageImports: [
      'motion',
      'lucide-react',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-select',
    ],
    // Enable CSS optimization for smaller bundles
    optimizeCss: true,
  },
  async redirects() {
    return [
      {
        // Redirect old /[photo-name] routes to new /photo/[id] format
        // Match UUIDs with file extensions (e.g., 00000000-0000-0000-0000-000000000000.jpg)
        source:
          '/:id([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[a-z]+)',
        destination: '/photo/:id',
        permanent: true,
      },
    ];
  },
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
