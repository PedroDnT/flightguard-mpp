/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Support existing src/ modules
  transpilePackages: [],
  // Enable experimental features for API routes
  experimental: {
    serverActions: {
      allowedOrigins: ['*'],
    },
  },
}

module.exports = nextConfig
