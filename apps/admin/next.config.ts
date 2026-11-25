import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@vicinity/shared'],
  poweredByHeader: false,
  // The portal is admin-only: never let it be framed, and keep a strict CSP (React escapes all rendered text).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
