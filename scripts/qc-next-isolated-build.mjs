import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const runId = crypto.randomUUID();
const distDirRelative = `.tmp/next-qc-build-${runId}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const tsconfigFile = `.tsconfig.qc-build-${runId}.json`;
const tsconfigPath = path.join(root, tsconfigFile);
const trackedGeneratedFiles = ["next-env.d.ts"];
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function restoreTrackedGeneratedFiles() {
  for (const [file, content] of snapshots) {
    let lastError;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      try {
        fs.writeFileSync(path.join(root, file), content, "utf8");
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        await delay(attempt * 100);
      }
    }
    if (lastError) throw lastError;
  }
}

async function writeIsolatedTsconfig() {
  let lastError;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      fs.writeFileSync(tsconfigPath, `${JSON.stringify(isolatedTsconfig, null, 2)}\n`, "utf8");
      return;
    } catch (error) {
      lastError = error;
      await delay(attempt * 100);
    }
  }
  throw lastError;
}

let exitCode = 1;
try {
  await writeIsolatedTsconfig();
  exitCode = await new Promise((resolve, reject) => {
    const buildArgs = [nextCli, "build", ...(process.env.PDM_NEXT_BUILD_WEBPACK === "1" ? ["--webpack"] : [])];
    const child = spawn(process.execPath, buildArgs, {
      cwd: root,
      env: { ...process.env, PDM_NEXT_DIST_DIR: distDirRelative, PDM_NEXT_TSCONFIG_PATH: tsconfigFile },
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await restoreTrackedGeneratedFiles();
  if (fs.existsSync(tsconfigPath)) fs.rmSync(tsconfigPath, { force: true });
  const resolved = path.resolve(distDir);
  const tmpRoot = path.resolve(root, ".tmp");
  if (resolved.startsWith(`${tmpRoot}${path.sep}`)) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

process.exit(exitCode);
