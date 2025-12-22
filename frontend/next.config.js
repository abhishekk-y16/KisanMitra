/**
 * Next.js config for GitHub Pages deployment under repository path /KisanBuddy
 */
module.exports = {
  basePath: '/KisanBuddy',
  assetPrefix: '/KisanBuddy/',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
}
/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

// Only use basePath/assetPrefix in production (for GitHub Pages)
const isProduction = process.env.NODE_ENV === 'production';
const basePath = isProduction ? '/KisanMitra' : '';

const nextConfig = {
  // Enable static export for Next.js `output: 'export'` (used by GitHub Pages)
  output: 'export',
  // Serve the site from the repository subpath when published to GitHub Pages
  basePath: basePath,
  assetPrefix: basePath,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || 'https://kisanmitra-coge.onrender.com',
  },
};

module.exports = withPWA(nextConfig);
