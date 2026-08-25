import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/platform/tenders/boq-extract": ["./node_modules/pdfjs-dist/**/*", "./node_modules/pdf-parse/**/*"],
    "/api/tenders/boq-analyze": ["./node_modules/pdfjs-dist/**/*", "./node_modules/pdf-parse/**/*"],
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/:path*",
          has: [{ type: "host", value: "trader-gateway.labnarrative.com" }],
          destination: "http://84.13.157.157:8080/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      { source: "/intelligence", destination: "/", permanent: true },
      { source: "/intelligence/plans", destination: "/plans", permanent: true },
      { source: "/intelligence/login", destination: "/login", permanent: true },
      { source: "/intelligence/client", destination: "/client", permanent: true },
      { source: "/intelligence/buy", destination: "/buy", permanent: true },
      { source: "/intelligence/activate", destination: "/activate", permanent: true },
      { source: "/intelligence/workspace", destination: "/workspace", permanent: true },
      {
        source: "/admin/systems-outreach",
        destination: "/admin/systems",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
