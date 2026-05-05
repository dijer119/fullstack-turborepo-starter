import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["dijer.synology.me", "dijer.synology.me:3000"],
    },
  },
};

export default nextConfig;
