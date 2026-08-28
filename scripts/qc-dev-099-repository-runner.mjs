import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runId = `DEV099-repository-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceRoot = path.resolve(process.env.DEV099_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-099", runId));
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev099-repository-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
const env = { ...process.env, PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, PDM_DB_PROVIDER: "sqlite", DEV099_EVIDENCE_DIR: evidenceRoot };
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  return result.status ?? 1;
}
let status = 1;
try {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const initStatus = run(["scripts/init-db.mjs"]);
  status = initStatus === 0
    ? run(["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-099-repository.mjs"])
    : initStatus;
} finally {
  fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
}
if (status !== 0) process.exitCode = status;
