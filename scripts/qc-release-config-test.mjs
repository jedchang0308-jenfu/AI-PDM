import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-release-config-"));
const result = spawnSync(
  process.execPath,
  [
    "--experimental-transform-types",
    "--experimental-loader",
    "./scripts/qc-ts-path-loader.mjs",
    "scripts/qc-release-config-worker.mjs"
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: testRoot,
      PDM_REPOSITORY_DIR: path.join(testRoot, "repository"),
      PDM_STORAGE_PROVIDER: "google_cloud_storage",
      RELEASE_FUNCTION_URL: "",
      RELEASE_FUNCTION_TOKEN: "",
      GOOGLE_DRIVE_RELEASED_FOLDER_ID: ""
    },
    encoding: "utf8",
    windowsHide: true
  }
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

let cleanupError = "";
try {
  fs.rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch (error) {
  cleanupError = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ cleanup: "failed", testRoot, error: cleanupError }, null, 2));
}

if (result.error) {
  console.error(result.error);
  process.exitCode = 1;
} else {
  process.exitCode = result.status === 0 && cleanupError === "" ? 0 : 1;
}
