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

let exitCode = 1;
try {
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
  for (const [file, content] of snapshots) fs.writeFileSync(path.join(root, file), content, "utf8");
  const resolved = path.resolve(distDir);
  const tmpRoot = path.resolve(root, ".tmp");
  if (resolved.startsWith(`${tmpRoot}${path.sep}`)) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

process.exit(exitCode);
