import type { NextConfig } from "next";
import createBundleAnalyzer from '@next/bundle-analyzer';

const nextConfig: NextConfig = {
  // The authenticated E2E suite needs its own build (NEXT_PUBLIC_* are inlined
  // at build time, so emulator mode cannot be toggled on an existing artifact).
  // An overridable distDir lets that build live alongside the real one instead
  // of clobbering `.next` on every run.
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // Next's dev-origin protection treats `127.0.0.1` as a different origin from
  // `localhost` and silently blocks its HMR/RSC dev requests otherwise — the
  // page still renders (SSR HTML is unaffected) but client hydration never
  // completes, so every 'use client' effect (scroll listeners, timers, state)
  // stays dead with no console error. Ignored outside `next dev`.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],

  // Enable verbose logging in development
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  // firebase-admin pulls in jwks-rsa@4.x, which requires jose@6 (ESM-only)
  // via a plain CommonJS require(). Turbopack's own externalization check
  // can't safely externalize that nested ESM file, and its fallback bundling
  // path doesn't rewrite the raw require() either — so any Server Action
  // that verifies a Firebase ID token crashes at module-load time with
  // "Failed to load external module firebase-admin.../auth: ERR_REQUIRE_ESM".
  // Declaring the package here makes Next.js load it via native Node
  // require/import instead of Turbopack's bundler, which resolves this
  // ESM/CJS interop correctly. See github.com/auth0/node-jwks-rsa/issues/493.
  serverExternalPackages: ['firebase-admin'],

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
          // NOTE: Content-Security-Policy is set dynamically by proxy.ts (the
          // Next.js 16 middleware file) with a per-request cryptographic nonce
          // and 'strict-dynamic' — enforcing, not Report-Only (F-01).
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
            : 'https://syd-brain-w6yrkh3gfa-ew.a.run.app/api/:path*', // Cloud Run (Active)
        },
        {
          source: '/chat/stream',
          destination: process.env.NODE_ENV === 'development'
            ? 'http://127.0.0.1:8080/chat/stream' // Local Python Backend (8080 on Windows)
            : 'https://syd-brain-w6yrkh3gfa-ew.a.run.app/chat/stream', // Cloud Run (Active)
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
