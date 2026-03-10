import type { NextConfig } from "next";
import createBundleAnalyzer from '@next/bundle-analyzer';

const nextConfig: NextConfig = {
  // Enable verbose logging in development
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      'date-fns',
      '@radix-ui/react-dialog',
      '@radix-ui/react-slot',
      '@tanstack/react-query',
    ],
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/chatbotluca-a8a73.appspot.com/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/chatbotluca-a8a73.firebasestorage.app/**',
      },
      {
        protocol: 'https',
        hostname: 'chatbotluca-a8a73.firebasestorage.app',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9199',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '9199',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'replicate.delivery',
      },
    ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups'
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=(), browsing-topics=()'
          },
          // NOTE: Content-Security-Policy is now set dynamically by middleware.ts
          // with a per-request cryptographic nonce (replaces static 'unsafe-inline').
        ]
      }
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        // These rewrites are checked before headers/redirects
        // and before all files including _next/public files which
        {
          source: '/api/py/:path*',
          destination: process.env.NODE_ENV === 'development'
            ? 'http://127.0.0.1:8080/api/:path*' // Local Python Backend (8080 on Windows)
            : 'https://syd-brain-972229558318.europe-west1.run.app/api/:path*', // Cloud Run (Active)
        },
        {
          source: '/chat/stream',
          destination: process.env.NODE_ENV === 'development'
            ? 'http://127.0.0.1:8080/chat/stream' // Local Python Backend (8080 on Windows)
            : 'https://syd-brain-972229558318.europe-west1.run.app/chat/stream', // Cloud Run (Active)
        }
      ],
      afterFiles: [],
      fallback: [],
    };
  }
};


const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default withBundleAnalyzer(nextConfig as any);
