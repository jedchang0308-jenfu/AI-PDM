/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  outputFileTracingExcludes: {
    "/*": ["./data/**/*"],
    "/api/*": ["./data/**/*"]
  }
};

export default nextConfig;
