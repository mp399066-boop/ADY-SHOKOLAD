/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['xlsx'],
  // Basic hardening for every page and API response: the CRM can't be framed
  // by another site (clickjacking), browsers don't guess content types, and
  // the private token links (/q/…, /order-form/…) never leak in a Referer.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

module.exports = nextConfig;
