/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Stellar SDK requires these for browser compatibility
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

module.exports = nextConfig;
