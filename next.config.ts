/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force cache busting for development
  generateEtags: false,
  
  // Headers for service worker and security
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
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
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
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
          // Force no cache in development
          ...(process.env.NODE_ENV === 'development' ? [{
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          }] : []),
        ],
      },
    ];
  },
};

module.exports = nextConfig;