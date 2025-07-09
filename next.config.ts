import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Ensure proper static file handling
  assetPrefix: process.env.NODE_ENV === 'production' ? '' : '',
  
  // FIXED: Use the new serverExternalPackages instead of experimental.serverComponentsExternalPackages
  serverExternalPackages: ['firebase-admin'],
  
  // REMOVED: output: 'standalone' for now to avoid deployment issues
  // You can add this back later if needed for Docker deployment
  
  // Force proper content types and caching
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
        ],
      },
      {
        source: '/_next/static/css/:path*',
        headers: [
          {
            key: 'Content-Type',
            value: 'text/css; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ]
  },
  
  // Fix webpack configuration for chunk loading
  webpack: (config, { dev, isServer }) => {
    // Fix for chunk loading 
    if (dev) {
      config.optimization.splitChunks = false
      config.cache = false
    }
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks.cacheGroups,
          default: {
            minChunks: 1,
            priority: -20,
            reuseExistingChunk: true,
          },
        },
      }
    }

    return config
  },
}

export default nextConfig