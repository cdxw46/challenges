import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  // @ts-ignore
  allowedDevOrigins: ['sat-foundations-slides-holly.trycloudflare.com'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/api/:path*', // Proxy to Backend
      },
    ];
  },
};

export default nextConfig;
