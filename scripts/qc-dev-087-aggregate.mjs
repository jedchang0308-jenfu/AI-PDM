#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const runId = `DEV087-aggregate-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const evidenceDir = resolve(process.cwd(), "output", "qa", "dev-087-aggregate", runId);

const commands = [
  ["qc:dev-094:capa"],
  ["qc:dev-094:browser"],
  ["qc:dev-087:contract"],
  ["qc:dev-087:repository"],
  ["qc:dev-087:commands"],
  ["qc:dev-087:migration"],
  ["qc:dev-092:work-file-snapshot"],
  ["qc:dev-092:runtime-invariant"],
  ["qc:dev-092:recognition-context"],
  ["qc:dev-092:browser"],
  ["qc:dev-087:zero-loss"],
  ["qc:dev-087:retirement"],
  ["qc:dev-087:file-read-retirement"],
  ["qc:dev-087:browser"],
  ["typecheck:app"],
  ["build:isolated"]
];
const results = [];
for (const [script] of commands) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("DEV087_NPM_EXEC_PATH_MISSING");
  const result = spawnSync(process.execPath, [npmCli, "run", script], { cwd: process.cwd(), encoding: "utf8", stdio: "pipe", maxBuffer: 20 * 1024 * 1024 });
  process.stdout.write(result.stdout || ""); process.stderr.write(result.stderr || "");
  results.push({ script, status: result.status === 0 ? "PASS" : "FAIL", exitCode: result.status, error: result.error?.message ?? null });
  if (result.status !== 0) break;
}
const failed = results.filter((item) => item.status === "FAIL");
const manifest = {
  devId: "DEV-087",
  runId,
  generatedAt: new Date().toISOString(),
  productionConnected: false,
  productionMigrationExecuted: false,
  status: failed.length === 0 && results.length === commands.length ? "PASS" : "FAIL",
  expected: commands.length,
  executed: results.length,
  results
};
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(resolve(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
