#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-relation-view-"));
const distRelative = `.tmp/qc-relation-view-${crypto.randomUUID().slice(0, 8)}`;
const distPath = path.join(root, ...distRelative.split("/"));
const trackedFiles = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
let app = null;

function runFocusedQc(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "qc-pdm-drawing-part-relation-view.mjs")], {
      cwd: root,
      env,
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0
      ? resolve()
      : reject(new Error(`Relation view QC failed with ${signal ? `signal ${signal}` : `exit ${code}`}`)));
  });
}

try {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "demo",
    PDM_DEMO_USERS: "1",
    PDM_DEMO_PASSWORD: "pdm-demo",
    PDM_DATA_DIR: tempRoot,
    PDM_REPOSITORY_DIR: path.join(tempRoot, "repository"),
    PDM_DB_PROVIDER: "sqlite",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: "",
    PDM_STORAGE_PROVIDER: "local_repository",
    PDM_SUPABASE_STORAGE_LIVE_ENABLED: "0",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_RELEASE_MODE: "local_stub",
    PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "false",
    PDM_NEXT_DIST_DIR: distRelative,
    PDM_QC_ISOLATED_TARGET: "1",
    PDM_BASE_URL: baseUrl
  });
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  const bootstrap = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "pdm-demo" })
  });
  if (!bootstrap.ok) throw new Error(`Unable to initialize isolated managed-auth fixture: HTTP ${bootstrap.status}`);
  await runFocusedQc({ ...process.env, PDM_BASE_URL: baseUrl });
} finally {
  try { if (app) await stopNextApp(app.child); } catch {}
  for (const [file, content] of trackedFiles) {
    try { if (fs.readFileSync(path.join(root, file), "utf8") !== content) fs.writeFileSync(path.join(root, file), content, "utf8"); } catch {}
  }
  if (path.resolve(distPath).startsWith(path.resolve(root, ".tmp") + path.sep)) fs.rmSync(distPath, { recursive: true, force: true });
  if (path.resolve(tempRoot).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(tempRoot, { recursive: true, force: true });
}
