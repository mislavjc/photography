import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  experimental: {
    optimizePackageImports: [
      'motion',
      'lucide-react',
      'nuqs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-select',
      '@radix-ui/react-slot',
      'class-variance-authority',
    ],
    // Enable CSS optimization for smaller bundles
    optimizeCss: true,
  },
  async redirects() {
    return [
      {
        // Redirect old domain to new domain
        source: '/:path*',
        has: [{ type: 'host', value: 'photography.mislavjc.com' }],
        destination: 'https://photos.mislavjc.com/:path*',
        permanent: true,
      },
      {
        // Redirect old /[photo-name] routes to new /photo/[id] format
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
        hostname: 'r2.photos.mislavjc.com',
      },
      {
        protocol: 'https',
        hostname: 'pub-0c0ced8cca504a779995fa0289895697.r2.dev',
      },
    ],
  },
};

export default nextConfig;
