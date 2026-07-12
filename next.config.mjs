/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.PDM_NEXT_DIST_DIR?.trim() || ".next",
  devIndicators: false,
  outputFileTracingExcludes: {
    "/*": ["./data/**/*"],
    "/api/*": ["./data/**/*"]
  }
};

export default nextConfig;
