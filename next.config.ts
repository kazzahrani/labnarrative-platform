import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/admin/systems-outreach",
        destination: "/admin/systems",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
