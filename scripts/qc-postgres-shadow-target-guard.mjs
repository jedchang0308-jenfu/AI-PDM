#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { evaluateShadowTarget, getExpectedAiPdmTables } from "./postgres-shadow-target-guard-utils.mjs";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const expectedTables = getExpectedAiPdmTables(root);
const results = [];
const read = (relativePath) => readProjectFile(root, relativePath);

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function runGuard(args = [], env = {}) {
  return spawnSync(process.execPath, ["scripts/guard-postgres-shadow-target.mjs", ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    windowsHide: true
  });
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

const emptyPreMigration = evaluateShadowTarget({
  publicTables: [],
  expectedTables,
  phase: "pre-migration"
});
record("PG-GUARD-001 empty public schema is safe before migration", emptyPreMigration.safe === true, JSON.stringify(emptyPreMigration.issues));

const nonAiPdmPreMigration = evaluateShadowTarget({
  publicTables: ["profiles", "documents", "wbs_items"],
  expectedTables,
  phase: "pre-migration"
});
record("PG-GUARD-002 non-empty public schema is blocked before migration", nonAiPdmPreMigration.safe === false && nonAiPdmPreMigration.issues.some((issue) => issue.type === "target_not_empty"), JSON.stringify(nonAiPdmPreMigration.issues));

const rlsRows = expectedTables.map((table) => ({ table, rowSecurity: true, forceRowSecurity: true }));
const migratedCompare = evaluateShadowTarget({
  publicTables: expectedTables,
  expectedTables,
  rlsRows,
  phase: "compare"
});
record("PG-GUARD-003 complete AI_PDM schema with forced RLS is safe for compare", migratedCompare.safe === true, JSON.stringify(migratedCompare.issues));

const partialCompare = evaluateShadowTarget({
  publicTables: expectedTables.slice(0, 3),
  expectedTables,
  phase: "compare"
});
record("PG-GUARD-004 partial AI_PDM schema is blocked for compare", partialCompare.safe === false && partialCompare.issues.some((issue) => issue.type === "partial_ai_pdm_schema"), JSON.stringify(partialCompare.issues));

const weakRlsCompare = evaluateShadowTarget({
  publicTables: expectedTables,
  expectedTables,
  rlsRows: expectedTables.map((table, index) => ({ table, rowSecurity: true, forceRowSecurity: index !== 0 })),
  phase: "compare"
});
record("PG-GUARD-005 AI_PDM schema without forced RLS is blocked", weakRlsCompare.safe === false && weakRlsCompare.issues.some((issue) => issue.type === "rls_not_forced"), JSON.stringify(weakRlsCompare.issues));

const existingProjectCompare = evaluateShadowTarget({
  publicTables: ["profiles", "tenants", "projects", "wbs_items", "documents"],
  expectedTables,
  phase: "compare"
});
record("PG-GUARD-006 existing non-AI_PDM project shape is blocked", existingProjectCompare.safe === false && existingProjectCompare.unknownTables.includes("profiles"), JSON.stringify(existingProjectCompare.issues));

const mockGuard = runGuard([
  "--phase",
  "compare",
  "--mock-public-tables",
  expectedTables.join(","),
  "--mock-rls-tables",
  expectedTables.join(",")
]);
const mockGuardBody = parseJson(mockGuard.stdout);
record("PG-GUARD-007 CLI mock compare exits 0 for safe schema", mockGuard.status === 0 && mockGuardBody?.safe === true, mockGuard.stderr || mockGuard.stdout);

const unconfiguredGuard = runGuard(["--phase", "compare"], { PDM_POSTGRES_SHADOW_URL: "" });
const unconfiguredBody = parseJson(unconfiguredGuard.stdout);
record("PG-GUARD-008 CLI fails closed when target URL is missing", unconfiguredGuard.status !== 0 && unconfiguredBody?.issues?.some((issue) => issue.type === "target_unavailable"), unconfiguredGuard.stderr || unconfiguredGuard.stdout);

const forbiddenProjectGuard = runGuard(["--phase", "pre-migration"], {
  PDM_POSTGRES_SHADOW_URL: "postgresql://postgres:secret@db.knodlkxqpcqyrtgwpdst.supabase.co:5432/postgres"
});
const forbiddenProjectBody = parseJson(forbiddenProjectGuard.stdout);
record(
  "PG-GUARD-008A CLI fails closed for known non-AI_PDM Supabase project refs",
  forbiddenProjectGuard.status !== 0 &&
    forbiddenProjectBody?.issues?.some((issue) => issue.type === "forbidden_supabase_project"),
  forbiddenProjectGuard.stderr || forbiddenProjectGuard.stdout
);

const compareScript = read("scripts/compare-sqlite-postgres-shadow.mjs");
record("PG-GUARD-009 compare script invokes target guard before live stats", compareScript.includes("collectPostgresTargetSnapshot") && compareScript.includes("postgresTargetGuard"), "scripts/compare-sqlite-postgres-shadow.mjs");

const readme = read("db/postgres/README.md");
record("PG-GUARD-010 README documents pre-migration and compare guards", readme.includes("db:postgres:guard") && readme.includes("--phase pre-migration"), "db/postgres/README.md");

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
