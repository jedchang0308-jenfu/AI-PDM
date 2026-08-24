import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.env.PDM_NEXT_DIST_DIR?.trim() || ".next";
const outputFileTracingExcludes = [
  "./data/**/*",
  "./output/**/*",
  "./backups/**/*",
  "./tmp/**/*",
  "./.tmp/**/*"
];

// Keep every temporary Next runtime from rewriting the canonical TypeScript configs.
function ensureIsolatedNextTsconfig(customDistDir) {
  const resolvedDistDir = path.resolve(projectRoot, customDistDir);
  const temporaryRoot = path.resolve(projectRoot, ".tmp");
  if (!resolvedDistDir.startsWith(`${temporaryRoot}${path.sep}`)) {
    throw new Error("Custom PDM_NEXT_DIST_DIR must stay under .tmp or provide PDM_NEXT_TSCONFIG_PATH.");
  }

  const configDir = path.join(temporaryRoot, "next-tsconfig");
  const configKey = crypto.createHash("sha256").update(customDistDir).digest("hex").slice(0, 16);
  const configPath = path.join(configDir, `${configKey}.json`);
  const normalizedDistDir = customDistDir.replaceAll("\\", "/");
  const config = {
    extends: "../../tsconfig.next.json",
    compilerOptions: {
      incremental: false
    },
    include: [
      "../../next-env.d.ts",
      "../../src/**/*.ts",
      "../../src/**/*.tsx",
      `../../${normalizedDistDir}/types/**/*.ts`,
      `../../${normalizedDistDir}/dev/types/**/*.ts`
    ],
    exclude: [
      "../../node_modules",
      "../../output",
      "../../backups"
    ]
  };

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return path.relative(projectRoot, configPath).replaceAll("\\", "/");
}

function resolveNextTsconfigPath() {
  const explicitPath = process.env.PDM_NEXT_TSCONFIG_PATH?.trim();
  if (explicitPath) return explicitPath;
  return distDir === ".next" ? "tsconfig.next.json" : ensureIsolatedNextTsconfig(distDir);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir,
  typescript: {
    tsconfigPath: resolveNextTsconfigPath()
  },
  devIndicators: false,
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/generated/dev-082-ocr/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" }
        ]
      },
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
    "/*": outputFileTracingExcludes,
    "/api/*": outputFileTracingExcludes
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
