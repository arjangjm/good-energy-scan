import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';
// Next needs inline scripts to hydrate, so script-src allows them. Everything else stays same-origin.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Content-Security-Policy', value: csp },
      ],
    }];
  },
  // An all-caps QR (HTTPS://HOST/C/CODE) is smaller to print. Send /C/ to /c/.
  async rewrites() {
    return [{ source: '/C/:code', destination: '/c/:code' }];
  },
};
export default config;
