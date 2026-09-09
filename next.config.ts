import type { NextConfig } from "next";

const noIndexHeaders = [
  {
    key: "X-Robots-Tag",
    value: "noindex, nofollow, noarchive",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.jsdelivr.net",
        pathname: "/gh/prasangapokharel/crypto-icons@v1.0.0/binance/**",
      },
    ],
  },
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/platform/tenders/boq-extract": ["./node_modules/pdfjs-dist/**/*", "./node_modules/pdf-parse/**/*"],
    "/api/tenders/boq-analyze": ["./node_modules/pdfjs-dist/**/*", "./node_modules/pdf-parse/**/*"],
  },
  async headers() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "labnarrative.com" }],
        headers: [{ key: "Link", value: '<https://labnarrative.com/>; rel="canonical"' }],
      },
      {
        source: "/pricing",
        has: [{ type: "host", value: "labnarrative.com" }],
        headers: [{ key: "Link", value: '<https://labnarrative.com/pricing>; rel="canonical"' }],
      },
      {
        source: "/affiliate",
        has: [{ type: "host", value: "labnarrative.com" }],
        headers: [{ key: "Link", value: '<https://labnarrative.com/affiliate>; rel="canonical"' }],
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "app.labnarrative.com" }],
        headers: noIndexHeaders,
      },
      { source: "/admin/:path*", headers: noIndexHeaders },
      { source: "/api/:path*", headers: noIndexHeaders },
      { source: "/client/:path*", headers: noIndexHeaders },
      { source: "/workspace/:path*", headers: noIndexHeaders },
      { source: "/login", headers: noIndexHeaders },
      { source: "/activate", headers: noIndexHeaders },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/health",
          has: [{ type: "host", value: "trader-gateway.labnarrative.com" }],
          destination: "http://84.13.156.194:8080/health",
        },
        {
          source: "/relay",
          has: [{ type: "host", value: "trader-gateway.labnarrative.com" }],
          destination: "http://84.13.156.194:8080/relay",
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
