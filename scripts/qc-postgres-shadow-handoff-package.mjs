#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { sha256File } from "./qc-file-hash-utils.mjs";
import { projectPath, readProjectFile, readProjectFileIfExists, readProjectJson } from "./qc-project-file-utils.mjs";
import { getPostgresShadowHandoffsDir } from "./pdm-paths.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function findLatestHandoff() {
  const handoffDir = getPostgresShadowHandoffsDir(root);
  if (!fs.existsSync(handoffDir)) return null;
  const entries = fs
    .readdirSync(handoffDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(handoffDir, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return entries[0] ?? null;
}

function assertFile(baseDir, relativePath, label = relativePath) {
  const filePath = path.join(baseDir, relativePath);
  record(`PG-HANDOFF file exists: ${label}`, fs.existsSync(filePath) && fs.statSync(filePath).isFile(), relative(filePath));
}

function assertTextIncludes(label, content, expected) {
  record(`${label} includes: ${expected}`, content.includes(expected), expected);
}

const latest = findLatestHandoff();
record("PG-HANDOFF-001 latest handoff package exists", Boolean(latest), latest ? relative(latest) : "missing");

if (latest) {
  const latestRelative = relative(latest);
  const manifestPath = path.join(latest, "postgres-shadow-handoff.json");
  const manifest = fs.existsSync(manifestPath) ? readProjectJson(root, relative(manifestPath)) : {};
  const readme = readProjectFileIfExists(root, relative(path.join(latest, "README.md")));
  const advisorChecklist = readProjectFileIfExists(root, relative(path.join(latest, "supabase-advisor-checklist.md")));
  const qcChecklist = readProjectFileIfExists(root, relative(path.join(latest, "qc-checklist.ps1")));
  const preMigrationGuard = readProjectFileIfExists(root, relative(path.join(latest, "commands", "01-pre-migration-guard.ps1")));
  const applyMigration = readProjectFileIfExists(root, relative(path.join(latest, "commands", "02-apply-migration.ps1")));
  const compareShadow = readProjectFileIfExists(root, relative(path.join(latest, "commands", "03-compare-shadow.ps1")));
  const finalReadiness = readProjectFileIfExists(root, relative(path.join(latest, "commands", "04-final-readiness.ps1")));
  const rlsPlanCopy = readProjectFileIfExists(root, relative(path.join(latest, "db", "postgres", "002_supabase_rls_plan.sql")));
  const packageJson = readProjectJson(root, "package.json");

  for (const filePath of [
    "postgres-shadow-handoff.json",
    "README.md",
    "supabase-advisor-checklist.md",
    "qc-checklist.ps1",
    "db/schema.sql",
    "db/postgres/001_initial_schema.sql",
    "db/postgres/002_supabase_rls_plan.sql",
    "commands/01-pre-migration-guard.ps1",
    "commands/02-apply-migration.ps1",
    "commands/03-compare-shadow.ps1",
    "commands/04-final-readiness.ps1"
  ]) {
    assertFile(latest, filePath);
  }

  record("PG-HANDOFF-002 manifest has handoffId", /^\d{8}-\d{6}$/u.test(String(manifest.handoffId ?? "")), String(manifest.handoffId ?? ""));
  record("PG-HANDOFF-003 manifest has generatedAt", Boolean(Date.parse(String(manifest.generatedAt ?? ""))), String(manifest.generatedAt ?? ""));
  record("PG-HANDOFF-004 manifest is tied to DEV-IND-007", manifest.taskId === "DEV-IND-007", String(manifest.taskId ?? ""));
  record("PG-HANDOFF-005 manifest forbids known non-disposable projects", ["ProJED", "ProJED_TEST"].every((name) => manifest.targetPolicy?.forbiddenKnownProjects?.includes(name)), JSON.stringify(manifest.targetPolicy ?? null));

  for (const [key, commandPath] of Object.entries(manifest.commands ?? {})) {
    if (!key.endsWith("FromRoot")) continue;
    const absoluteCommandPath = path.resolve(root, String(commandPath));
    record(`PG-HANDOFF command exists: ${key}`, fs.existsSync(absoluteCommandPath), relative(absoluteCommandPath));
  }

  const sourceChecks = [
    ["sqliteSchema", "db/schema.sql"],
    ["postgresSchema", "db/postgres/001_initial_schema.sql"],
    ["postgresRlsPlan", "db/postgres/002_supabase_rls_plan.sql"]
  ];
  for (const [key, sourceRelativePath] of sourceChecks) {
    const sourcePath = projectPath(root, sourceRelativePath);
    const copyPath = path.join(latest, manifest.sqlSources?.[key]?.copy ?? "");
    const sourceHash = await sha256File(sourcePath);
    record(`PG-HANDOFF source hash matches manifest: ${key}`, manifest.sqlSources?.[key]?.sha256 === sourceHash, sourceRelativePath);
    record(
      `PG-HANDOFF source copy hash matches source: ${key}`,
      fs.existsSync(copyPath) && (await sha256File(copyPath)) === sourceHash,
      relative(copyPath)
    );
  }

  assertTextIncludes("PG-HANDOFF README", readme, "disposable AI_PDM");
  assertTextIncludes("PG-HANDOFF README", readme, "ProJED");
  assertTextIncludes("PG-HANDOFF README", readme, "ProJED_TEST");
  assertTextIncludes("PG-HANDOFF README", readme, "PDM_POSTGRES_SHADOW_URL");
  assertTextIncludes("PG-HANDOFF README", readme, "Supabase");

  assertTextIncludes("PG-HANDOFF advisor checklist", advisorChecklist, "security advisors");
  assertTextIncludes("PG-HANDOFF advisor checklist", advisorChecklist, "performance advisors");
  assertTextIncludes("PG-HANDOFF advisor checklist", advisorChecklist, "RLS");
  assertTextIncludes("PG-HANDOFF advisor checklist", advisorChecklist, "anon");
  assertTextIncludes("PG-HANDOFF advisor checklist", advisorChecklist, "authenticated");
  assertTextIncludes("PG-HANDOFF advisor checklist", advisorChecklist, "user_metadata");
  assertTextIncludes("PG-HANDOFF advisor checklist", advisorChecklist, "https://supabase.com/docs/guides/api/securing-your-api");

  assertTextIncludes("PG-HANDOFF pre-migration command", preMigrationGuard, "PDM_POSTGRES_SHADOW_URL");
  assertTextIncludes("PG-HANDOFF pre-migration command", preMigrationGuard, "db:postgres:guard -- --phase pre-migration");
  assertTextIncludes("PG-HANDOFF apply command", applyMigration, "db:postgres:guard -- --phase pre-migration");
  assertTextIncludes("PG-HANDOFF apply command", applyMigration, "psql");
  assertTextIncludes("PG-HANDOFF apply command", applyMigration, "001_initial_schema.sql");
  assertTextIncludes("PG-HANDOFF apply command", applyMigration, "002_supabase_rls_plan.sql");
  assertTextIncludes("PG-HANDOFF apply command", applyMigration, "db:postgres:guard -- --phase compare");
  assertTextIncludes("PG-HANDOFF compare command", compareShadow, "db:postgres:compare -- --require-postgres");
  assertTextIncludes("PG-HANDOFF compare command", compareShadow, "qc:postgres-shadow");
  assertTextIncludes("PG-HANDOFF final readiness command", finalReadiness, "qa:dev-task:sync");
  assertTextIncludes("PG-HANDOFF final readiness command", finalReadiness, "qc:production-readiness:report");

  for (const expected of [
    "01-pre-migration-guard.ps1",
    "02-apply-migration.ps1",
    "03-compare-shadow.ps1",
    "qc:postgres-shadow-target-guard",
    "qc:postgres-shadow",
    "qc:production-readiness:report"
  ]) {
    assertTextIncludes("PG-HANDOFF QC checklist", qcChecklist, expected);
  }

  record("PG-HANDOFF RLS copy forces RLS", /ENABLE ROW LEVEL SECURITY/u.test(rlsPlanCopy) && /FORCE ROW LEVEL SECURITY/u.test(rlsPlanCopy), "db/postgres/002_supabase_rls_plan.sql");
  record("PG-HANDOFF RLS copy revokes direct anon/authenticated table access", /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated/u.test(rlsPlanCopy), "db/postgres/002_supabase_rls_plan.sql");

  const packageTexts = fs
    .readdirSync(latest, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath ?? latest, entry.name))
    .filter((filePath) => /\.(json|md|ps1|sql)$/iu.test(filePath))
    .map((filePath) => [filePath, readProjectFileIfExists(root, relative(filePath))]);
  const hardcodedUrls = packageTexts
    .flatMap(([filePath, content]) => [...content.matchAll(/postgres(?:ql)?:\/\/[^\s'"`]+/giu)].map((match) => `${relative(filePath)}:${match[0]}`));
  record("PG-HANDOFF package does not hardcode Postgres URLs", hardcodedUrls.length === 0, JSON.stringify(hardcodedUrls));

  record("PG-HANDOFF package script exists", packageJson.scripts?.["postgres-shadow:handoff"] === "node scripts/prepare-postgres-shadow-handoff.mjs", "package.json");
  record("PG-HANDOFF QC script exists", packageJson.scripts?.["qc:postgres-shadow-handoff-package"] === "node scripts/qc-postgres-shadow-handoff-package.mjs", "package.json");

  for (const docPath of [
    ".ai-doc/reports/pm/external-evidence-handoff-checklist-2026-05-27.md",
    ".ai-doc/reports/industrialization/external-validation-handoff-2026-05-28.md",
    ".ai-doc/qc/qc-active-goal-remaining-blockers-report-2026-06-02.md"
  ]) {
    const content = readProjectFile(root, docPath);
    const referencedHandoffs = [...content.matchAll(/data[\\/]+postgres-shadow-handoffs[\\/]+(\d{8}-\d{6})/gu)].map((match) => match[1]);
    const staleHandoffs = referencedHandoffs.filter((id) => id !== path.basename(latest));
    record(`PG-HANDOFF doc references latest package: ${docPath}`, content.includes(latestRelative), docPath);
    record(`PG-HANDOFF doc has no stale package id: ${docPath}`, staleHandoffs.length === 0, JSON.stringify(staleHandoffs));
  }
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
