#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

const root = process.cwd();
const cacheRoot = path.join(root, ".tmp", "qc-system-health-verification");
const tscCli = path.join(root, "node_modules", "typescript", "bin", "tsc");
const eslintCli = path.join(root, "node_modules", "eslint", "bin", "eslint.js");
const trackedConfigFiles = ["next-env.d.ts", "tsconfig.json"];
const trackedConfigSnapshots = new Map(
  trackedConfigFiles.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")])
);

fs.mkdirSync(cacheRoot, { recursive: true });

const steps = [
  {
    name: "isolated source typecheck",
    command: process.execPath,
    args: [
      tscCli,
      "--project",
      "tsconfig.system-health.json",
      "--pretty",
      "false",
      "--incremental",
      "--tsBuildInfoFile",
      path.join(cacheRoot, "tsconfig.system-health.tsbuildinfo")
    ]
  },
  {
    name: "cached source lint",
    command: process.execPath,
    args: [
      eslintCli,
      "src",
      "--cache",
      "--cache-strategy",
      "content",
      "--cache-location",
      path.join(cacheRoot, "eslint-src.cache")
    ]
  },
  {
    name: "dependency cycle baseline",
    command: process.execPath,
    args: [path.join(root, "scripts", "qc-dependency-cycle-baseline.mjs")]
  },
  {
    name: "duplicate function baseline",
    command: process.execPath,
    args: [path.join(root, "scripts", "qc-duplicate-function-baseline.mjs")]
  }
];

function runStep(step) {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    console.log(`\n[system-health] ${step.name}`);
    const child = spawn(step.command, step.args, { cwd: root, stdio: "inherit" });
    child.once("error", (error) => {
      resolve({ name: step.name, passed: false, elapsedMs: performance.now() - startedAt, error: error.message });
    });
    child.once("exit", (code, signal) => {
      resolve({
        name: step.name,
        passed: code === 0,
        elapsedMs: performance.now() - startedAt,
        exitCode: code,
        signal
      });
    });
  });
}

const results = [];
for (const step of steps) results.push(await runStep(step));

for (const [file, snapshot] of trackedConfigSnapshots) {
  const current = fs.readFileSync(path.join(root, file), "utf8");
  results.push({
    name: `tracked config unchanged: ${file}`,
    passed: current === snapshot,
    elapsedMs: 0
  });
}

const report = {
  checkedAt: new Date().toISOString(),
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  results: results.map((result) => ({
    ...result,
    elapsedMs: Math.round(result.elapsedMs)
  }))
};

console.log(`\n${JSON.stringify(report, null, 2)}`);
process.exitCode = report.failed === 0 ? 0 : 1;
