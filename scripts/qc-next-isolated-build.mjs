import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const distDirRelative = `.tmp/next-qc-build-${crypto.randomUUID()}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const trackedGeneratedFiles = ["next-env.d.ts", "tsconfig.json"];
const snapshots = new Map(trackedGeneratedFiles.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");

const isolatedTsconfig = {
  compilerOptions: {
    target: "ES2022",
    lib: ["dom", "dom.iterable", "es2022"],
    allowJs: false,
    skipLibCheck: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    module: "esnext",
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    isolatedModules: true,
    jsx: "react-jsx",
    incremental: true,
    plugins: [{ name: "next" }],
    paths: { "@/*": ["./src/*"] }
  },
  include: ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx"],
  exclude: ["node_modules", "output", ".tmp", ".next*", "backups"]
};

function restoreTrackedGeneratedFiles() {
  for (const [file, content] of snapshots) fs.writeFileSync(path.join(root, file), content, "utf8");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let exitCode = 1;
try {
  fs.writeFileSync(path.join(root, "tsconfig.json"), `${JSON.stringify(isolatedTsconfig, null, 2)}\n`, "utf8");
  exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextCli, "build"], {
      cwd: root,
      env: { ...process.env, PDM_NEXT_DIST_DIR: distDirRelative },
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  restoreTrackedGeneratedFiles();
  await delay(250);
  restoreTrackedGeneratedFiles();
  const resolved = path.resolve(distDir);
  const tmpRoot = path.resolve(root, ".tmp");
  if (resolved.startsWith(`${tmpRoot}${path.sep}`)) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

process.exit(exitCode);
