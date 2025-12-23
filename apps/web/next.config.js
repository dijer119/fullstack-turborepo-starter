/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  transpilePackages: ["ui"],

  // HMR 관련 설정 (Next.js 15 버그 해결)
  webpack: (config, { dev, isServer }) => {
    // 개발 모드에서만 적용
    if (dev && !isServer) {
      // HMR 관련 설정
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },

  // API 프록시 설정
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};
