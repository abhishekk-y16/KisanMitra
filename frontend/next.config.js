/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig = {
  // Enable static export for Next.js `output: 'export'` (used by GitHub Pages)
  output: 'export',
  // Serve the site from the repository subpath when published to GitHub Pages
  basePath: '/KisanMitra',
  assetPrefix: '/KisanMitra',
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
  },
};

module.exports = withPWA(nextConfig);
