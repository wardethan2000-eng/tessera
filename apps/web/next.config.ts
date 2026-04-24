import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      afterFiles: [
        {
          source: "/api/:path*",
          destination: `${process.env.API_PROXY_URL || "http://localhost:4000"}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
