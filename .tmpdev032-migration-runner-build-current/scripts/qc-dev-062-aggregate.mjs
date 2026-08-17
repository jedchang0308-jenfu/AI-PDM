#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const startedAt = new Date().toISOString();
const runId = process.env.DEV062_RUN_ID ?? `DEV062-${startedAt.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "-")}-local-isolated`;
const evidenceDir = path.resolve(process.env.DEV062_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-062-unified-part-relation-workbench", runId));
const expectedRoot = path.resolve(root, "output", "qa", "dev-062-unified-part-relation-workbench");

if (!(evidenceDir === expectedRoot || evidenceDir.startsWith(`${expectedRoot}${path.sep}`))) {
  throw new Error(`DEV-062 evidence path must stay inside ${expectedRoot}`);
}
fs.mkdirSync(evidenceDir, { recursive: true });

const npmCommand = "npm";
const npxCommand = "npx";
const affectedFiles = [
  "src/lib/pdm-workbench-contract.ts",
  "src/lib/pdm-workbench-cursor.ts",
  "src/lib/repositories/pdm-workbench-read-snapshot.ts",
  "src/components/use-pdm-workbench-controller.ts",
  "src/components/pdm-workbench-list.tsx",
  "src/lib/drawing-workbench.ts",
  "src/lib/repositories/drawing-workbench-async-repository.ts",
  "src/components/drawing-workbench.tsx",
  "src/lib/part-workbench.ts",
  "src/lib/repositories/part-workbench-async-repository.ts",
  "src/app/api/parts/workbench/route.ts",
  "src/app/api/parts/workbench/[rowKey]/route.ts",
  "src/components/part-workbench.tsx",
  "src/components/part-detail-content.tsx",
  "src/components/part-module.tsx",
  "src/app/parts/page.tsx",
  "src/lib/relation-workbench.ts",
  "src/lib/repositories/relation-workbench-async-repository.ts",
  "src/app/api/numbering/relations/route.ts",
  "src/app/api/numbering/relations/[rowKey]/route.ts",
  "src/components/relation-workbench.tsx",
  "src/app/numbering/search/page.tsx",
  "src/lib/number-state-flow-feature.ts",
  "src/app/api/numbering/state-flow/status/route.ts",
  "src/lib/number-state-flow-legacy-route.ts",
  "src/middleware.ts",
  "scripts/qc-dev-062-workbench-core.mjs",
  "scripts/qc-dev-062-part-workbench.mjs",
  "scripts/qc-dev-062-relation-workbench.mjs",
  "scripts/qc-dev-062-compat.mjs",
  "scripts/qc-dev-062-real-operation.mjs",
  "scripts/qc-dev-062-aggregate.mjs"
];

const commands = [
  { id: "core", label: "Workbench Core", command: npmCommand, args: ["run", "qc:dev-062:core"] },
  { id: "part", label: "Part workbench", command: npmCommand, args: ["run", "qc:dev-062:part"] },
  { id: "relation", label: "Relation workbench", command: npmCommand, args: ["run", "qc:dev-062:relation"] },
  { id: "compat", label: "Compatibility", command: npmCommand, args: ["run", "qc:dev-062:compat"] },
  { id: "typecheck", label: "TypeScript", command: npmCommand, args: ["run", "typecheck"] },
  { id: "affected_lint", label: "Affected-file ESLint", command: npxCommand, args: ["eslint", "--max-warnings=0", ...affectedFiles] },
  { id: "drawing_read", label: "DEV-053 read model", command: npmCommand, args: ["run", "qc:dev-053:read-model"] },
  { id: "drawing_ui", label: "DEV-053 UI", command: npmCommand, args: ["run", "qc:dev-053:ui"] },
  { id: "number_state", label: "Number State Flow Phase 1D", command: npmCommand, args: ["run", "qc:pdm-number-state-flow-phase1d"] },
  { id: "relation_regression", label: "Relation isolated regression", command: npmCommand, args: ["run", "qc:pdm-drawing-part-relation-view:isolated"] },
  { id: "part_owner", label: "Part owner regression", command: npmCommand, args: ["run", "qc:part-number-module"] },
  { id: "entity_drawer", label: "Entity drawer regression", command: npmCommand, args: ["run", "qc:pdm-entity-detail-drawer"] },
  { id: "human_status", label: "DEV-055 human status", command: npmCommand, args: ["run", "qc:dev-055"] },
  { id: "isolated_build", label: "Isolated production build", command: npmCommand, args: ["run", "build:isolated"] },
  { id: "real_operation", label: "DEV-062 real operation", command: npmCommand, args: ["run", "qc:dev-062:real-operation"] }
];

const results = [];
const environment = {
  ...process.env,
  DEV062_RUN_ID: runId,
  DEV062_EVIDENCE_DIR: evidenceDir
};

function runCommand(entry) {
  return new Promise((resolve) => {
    const commandStarted = performance.now();
    process.stdout.write(`\n[DEV-062] ${entry.label}\n`);
    const executable = process.platform === "win32" ? (process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe") : entry.command;
    const executableArgs = process.platform === "win32"
      ? ["/d", "/s", "/c", [entry.command, ...entry.args].join(" ")]
      : entry.args;
    const child = spawn(executable, executableArgs, {
      cwd: root,
      env: environment,
      shell: false,
      windowsHide: true
    });
    let stdoutTail = "";
    let stderrTail = "";
    const appendTail = (current, chunk) => `${current}${chunk}`.slice(-12000);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdoutTail = appendTail(stdoutTail, text);
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrTail = appendTail(stderrTail, text);
      process.stderr.write(text);
    });
    child.on("error", (error) => resolve({
      ...entry,
      passed: false,
      exitCode: null,
      durationMs: Math.round(performance.now() - commandStarted),
      error: error.message,
      stdoutTail,
      stderrTail
    }));
    child.on("close", (code) => resolve({
      ...entry,
      passed: code === 0,
      exitCode: code,
      durationMs: Math.round(performance.now() - commandStarted),
      stdoutTail,
      stderrTail
    }));
  });
}

for (const entry of commands) {
  const result = await runCommand(entry);
  results.push(result);
  const interim = {
    task: "DEV-062 aggregate completion gate",
    runId,
    startedAt,
    updatedAt: new Date().toISOString(),
    sourceHead: process.env.GIT_COMMIT ?? null,
    results
  };
  fs.writeFileSync(path.join(evidenceDir, "aggregate-results.json"), `${JSON.stringify(interim, null, 2)}\n`, "utf8");
  if (!result.passed) break;
}

const failed = results.filter((result) => !result.passed);
const aggregate = {
  task: "DEV-062 aggregate completion gate",
  runId,
  startedAt,
  finishedAt: new Date().toISOString(),
  passed: failed.length === 0 && results.length === commands.length,
  completedCommands: results.length,
  expectedCommands: commands.length,
  results
};
fs.writeFileSync(path.join(evidenceDir, "aggregate-results.json"), `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");

const summaryHash = crypto.createHash("sha256").update(JSON.stringify(aggregate)).digest("hex");
process.stdout.write(`\n[DEV-062] aggregate ${aggregate.passed ? "PASS" : "FAIL"}; run=${runId}; evidence=${evidenceDir}; sha256=${summaryHash}\n`);
if (!aggregate.passed) process.exitCode = 1;
