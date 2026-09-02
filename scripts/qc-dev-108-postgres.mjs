#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const output = path.join(root, "output", "qa", "dev-108", "postgres");
fs.mkdirSync(output, { recursive: true });
const configured = Boolean(process.env.PDM_POSTGRES_URL?.trim());
const report = {
  status: configured ? "NOT_RUN" : "NOT_RUN",
  reason: configured ? "PostgreSQL endpoint is configured; execute this provider gate in the disposable shadow database job." : "PDM_POSTGRES_URL is not configured; no primary or shared database was touched.",
  runtimeDeclaration: { project: root, purpose: "DEV-108 PostgreSQL provider gate", port: null, owningProcessTree: "this Node runner only", cleanupCondition: "no runtime started", PDM_DATA_DIR: null, PDM_REPOSITORY_DIR: null, mutationScope: "read-only report directory" },
  checks: ["R04", "R05", "R06", "R11", "R12", "R13", "R14"]
};
fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`DEV-108 PostgreSQL: NOT RUN (${report.reason})`);
