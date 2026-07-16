/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.PDM_NEXT_DIST_DIR?.trim() || ".next",
  devIndicators: false,
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Vary", value: "Cookie, Authorization" }
        ]
      }
    ];
  },
  outputFileTracingExcludes: {
    "/*": ["./data/**/*"],
    "/api/*": ["./data/**/*"]
  },
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/gcp-metadata/**/*",
      "./node_modules/gaxios/**/*",
      "./node_modules/google-logging-utils/**/*",
      "./node_modules/json-bigint/**/*",
      "./node_modules/bignumber.js/**/*"
    ]
  }
};

export default nextConfig;
