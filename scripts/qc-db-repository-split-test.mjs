#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, ...relativePath.split("/")));
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

const db = read("src/lib/db.ts");
const packageJson = JSON.parse(read("package.json"));
const repositories = {
  dashboard: "src/lib/repositories/dashboard-repository.ts",
  ai: "src/lib/repositories/ai-repository.ts",
  system: "src/lib/repositories/system-repository.ts",
  contracts: "src/lib/repositories/contracts.ts"
};

for (const [name, relativePath] of Object.entries(repositories)) {
  record(`REPO-001 ${name} repository file exists`, exists(relativePath), relativePath);
}

record("REPO-002 db.ts re-exports dashboard repository", db.includes("@/lib/repositories/dashboard-repository"), "src/lib/db.ts");
record("REPO-003 db.ts re-exports ai repository", db.includes("@/lib/repositories/ai-repository"), "src/lib/db.ts");
record("REPO-004 db.ts re-exports system repository", db.includes("@/lib/repositories/system-repository"), "src/lib/db.ts");

for (const symbol of [
  "getDashboardMetrics",
  "createLlmConversation",
  "getLlmConversation",
  "addLlmMessage",
  "getSystemSetting",
  "setSystemSetting",
  "getAllSystemSettings"
]) {
  record(`REPO-005 db.ts no longer owns ${symbol}`, !new RegExp(`export function ${symbol}\\b`, "u").test(db), "src/lib/db.ts");
}

const aiRepository = read(repositories.ai);
const dashboardRepository = read(repositories.dashboard);
const systemRepository = read(repositories.system);
record("REPO-006 ai repository owns LLM persistence", /llm_conversations/u.test(aiRepository) && /llm_messages/u.test(aiRepository), repositories.ai);
record("REPO-007 dashboard repository owns metrics query", /GROUP BY status/u.test(dashboardRepository), repositories.dashboard);
record("REPO-008 system repository owns settings upsert", /ON CONFLICT\(key\)/u.test(systemRepository), repositories.system);
record("REPO-009 package exposes repository split QC", packageJson.scripts?.["qc:db-repository-split"] === "node scripts/qc-db-repository-split-test.mjs", "package.json");

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);

process.exitCode = failed.length === 0 ? 0 : 1;
