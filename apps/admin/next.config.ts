import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Emits a self-contained server bundle for the Docker runtime image.
  output: 'standalone',
  // The workspace root, so file tracing follows symlinked packages correctly.
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),

  transpilePackages: ['@pasta/ui', '@pasta/hooks'],

  experimental: {
    optimizePackageImports: ['lucide-react', '@pasta/ui', 'recharts'],
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // The admin panel is never embedded anywhere.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
