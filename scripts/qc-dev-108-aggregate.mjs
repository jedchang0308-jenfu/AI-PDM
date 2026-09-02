#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const root = process.cwd();
const commands = [
  ["qc-dev-108-contract.mjs", true],
  ["qc-dev-108-repository.mjs", true],
  ["qc-dev-108-postgres.mjs", true],
  ["qc-dev-108-browser-real.mjs", true]
];
let failed = false;
for (const [script, transform] of commands) {
  const args = transform ? ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", `scripts/${script}`] : [`scripts/${script}`];
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) failed = true;
}
if (failed) process.exit(1);
console.log("DEV-108 aggregate: PASS/NOT RUN gates completed (primary denominator 62; browser/PostgreSQL preserve explicit Not Run when unavailable)");
