#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const commands = [
  "qc:dev-088:contract",
  "qc:dev-088:repository",
  "qc:dev-088:http",
  "qc:dev-088:browser",
  "qc:pdm-change-control",
  "typecheck:app",
  "build:isolated"
];

const results = [];
for (const script of commands) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("DEV088_NPM_EXEC_PATH_MISSING");
  const result = spawnSync(process.execPath, [npmCli, "run", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 20 * 1024 * 1024
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  results.push({
    script,
    status: result.status === 0 ? "PASS" : "FAIL",
    exitCode: result.status,
    error: result.error?.message ?? null
  });
  if (result.status !== 0) break;
}

const failed = results.filter((item) => item.status === "FAIL");
const manifest = {
  devId: "DEV-088",
  status: failed.length === 0 && results.length === commands.length ? "PASS" : "FAIL",
  expected: commands.length,
  executed: results.length,
  results
};
console.log(JSON.stringify(manifest, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
