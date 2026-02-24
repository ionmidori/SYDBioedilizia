import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable verbose logging in development
  output: "standalone",
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
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
    if (process.env.NODE_ENV !== 'production') {
      // In development, we still need COOP for Firebase OAuth popups
      return [
        {
          source: '/:path*',
          headers: [
            {
              key: 'Cross-Origin-Opener-Policy',
              value: 'unsafe-none'
            },
            {
              key: 'Cross-Origin-Embedder-Policy',
              value: 'unsafe-none'
            }
          ]
        }
      ];
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
            key: 'Cross-Origin-Opener-Policy',
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
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://www.google.com https://www.googletagmanager.com https://www.recaptcha.net https://vercel.live; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://images.unsplash.com https://storage.googleapis.com https://*.googleusercontent.com https://replicate.delivery https://vercel.com https://assets.vercel.com; font-src 'self' data: https://assets.vercel.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebasestorage.app https://syd-brain-w6yrkh3gfa-ew.a.run.app https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://vercel.live https://*.pusher.com; frame-src 'self' https://*.firebaseapp.com https://*.google.com https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://vercel.live; frame-ancestors 'self'; media-src 'self' blob:; upgrade-insecure-requests;"
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
            ? 'http://127.0.0.1:8081/api/:path*' // Local Python Backend
            : 'https://syd-brain-w6yrkh3gfa-ew.a.run.app/api/:path*', // Cloud Run (Active)
        },
        {
          source: '/chat/stream',
          destination: process.env.NODE_ENV === 'development'
            ? 'http://127.0.0.1:8081/chat/stream' // Local Python Backend
            : 'https://syd-brain-w6yrkh3gfa-ew.a.run.app/chat/stream', // Cloud Run (Active)
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
