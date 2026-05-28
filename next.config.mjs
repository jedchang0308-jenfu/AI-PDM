/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  outputFileTracingExcludes: {
    "/*": [
      "./data/backups/**/*",
      "./data/restore-drills/**/*",
      "./data/restore-targets/**/*",
      "./data/retention-drills/**/*"
    ],
    "/api/*": [
      "./data/backups/**/*",
      "./data/restore-drills/**/*",
      "./data/restore-targets/**/*",
      "./data/retention-drills/**/*"
    ]
  }
};

export default nextConfig;
