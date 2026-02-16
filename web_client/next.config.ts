import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable verbose logging in development
  output: "standalone",
  logging: {
    fetches: {
      fullUrl: true,
    },
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
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'replicate.delivery',
      },
    ],
  },

  async headers() {
    // Only apply strict security headers in production
    // Development mode needs looser CSP for Turbopack HMR
    if (process.env.NODE_ENV !== 'production') {
      return [];
    }

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
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()'
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://images.unsplash.com https://storage.googleapis.com https://*.googleusercontent.com https://replicate.delivery; font-src 'self' data:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebasestorage.app https://syd-brain-w6yrkh3gfa-ew.a.run.app; frame-src 'self' https://*.firebaseapp.com https://*.google.com; frame-ancestors 'self'; upgrade-insecure-requests;"
          }

        ]
      }
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        // These rewrites are checked before headers/redirects
        // and before all files including _next/public files which
        // allows required files to be overridden
        {
          source: '/api/py/:path*',
          destination: process.env.NODE_ENV === 'development'
            ? 'http://127.0.0.1:8080/api/:path*' // Local Python Backend
            : 'https://syd-brain-w6yrkh3gfa-ew.a.run.app/api/:path*', // Cloud Run
        },
        {
          source: '/chat/stream',
          destination: process.env.NODE_ENV === 'development'
            ? 'http://127.0.0.1:8080/chat/stream' // Local Python Backend
            : 'https://syd-brain-w6yrkh3gfa-ew.a.run.app/chat/stream', // Cloud Run
        }
      ],
      afterFiles: [],
      fallback: [],
    };
  }
};


const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

export default withBundleAnalyzer(nextConfig);
