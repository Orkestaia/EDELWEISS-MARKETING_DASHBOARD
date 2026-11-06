import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
    ] }];
  },
  outputFileTracingIncludes: {
    "/api/stock": ["./docs/stock-par-seed.csv"],
    "/api/stock/sync": ["./docs/stock-par-seed.csv"],
    "/api/cron/stock-snapshot": ["./docs/stock-par-seed.csv"],
  },
};

export default nextConfig;
