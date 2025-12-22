/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

// Decide where we're deploying. For Vercel leave basePath/assetPrefix unset.
const isGitHubPages = process.env.NEXT_PUBLIC_DEPLOY_TARGET === 'GH_PAGES';
const repoBase = '/KisanBuddy';
const basePath = isGitHubPages ? repoBase : '';
const assetPrefix = isGitHubPages ? `${repoBase}/` : '';

const nextConfig = {
  // When deploying to GitHub Pages we use static export and repo subpath.
  ...(isGitHubPages ? { output: 'export', basePath: basePath, assetPrefix: assetPrefix, trailingSlash: true } : {}),
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || 'https://kisanbuddy-coge.onrender.com',
  },
};

module.exports = withPWA(nextConfig);
