#!/usr/bin/env node

import "./retired-supabase-tooling-block.mjs";

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { getPostgresShadowHandoffsDir, resolveUserPath } from "./pdm-paths.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const handoffId = makeHandoffId();
const outputRoot = args.output ? resolveUserPath(root, args.output) : getPostgresShadowHandoffsDir(root);
const outputDir = path.join(outputRoot, handoffId);

function parseArgs(argv) {
  const parsed = { output: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") parsed.output = argv[++index] ?? "";
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return parsed;
}

function makeHandoffId(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function toPortableSlash(value) {
  return value.replaceAll(path.sep, "/");
}

function rel(filePath) {
  return toPortableSlash(path.relative(root, filePath));
}

function handoffRel(filePath) {
  return toPortableSlash(path.relative(outputDir, filePath));
}

async function sha256File(filePath) {
  return crypto.createHash("sha256").update(await fsp.readFile(filePath)).digest("hex");
}

function assertFile(filePath, message) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    console.error(message);
    process.exit(1);
  }
}

function copyFile(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function runGenerator() {
  const result = spawnSync(process.execPath, ["scripts/generate-postgres-migration.mjs"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || "Postgres migration generator failed.");
    process.exit(result.status ?? 1);
  }
}

function powershellSingleQuoted(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildCommands(paths) {
  const initialSql = rel(paths.initialCopy);
  const rlsSql = rel(paths.rlsCopy);
  return {
    preMigrationGuard: [
      '$ErrorActionPreference = "Stop"',
      'if (-not $env:PDM_POSTGRES_SHADOW_URL) { throw "Set PDM_POSTGRES_SHADOW_URL to the approved disposable AI_PDM shadow target before running this command." }',
      "npm.cmd run db:postgres:guard -- --phase pre-migration",
      ""
    ].join("\r\n"),
    applyMigration: [
      '$ErrorActionPreference = "Stop"',
      'if (-not $env:PDM_POSTGRES_SHADOW_URL) { throw "Set PDM_POSTGRES_SHADOW_URL to the approved disposable AI_PDM shadow target before running this command." }',
      "npm.cmd run db:postgres:guard -- --phase pre-migration",
      `psql $env:PDM_POSTGRES_SHADOW_URL -v ON_ERROR_STOP=1 -f ${powershellSingleQuoted(initialSql)}`,
      `psql $env:PDM_POSTGRES_SHADOW_URL -v ON_ERROR_STOP=1 -f ${powershellSingleQuoted(rlsSql)}`,
      "npm.cmd run db:postgres:guard -- --phase compare",
      ""
    ].join("\r\n"),
    compareShadow: [
      '$ErrorActionPreference = "Stop"',
      'if (-not $env:PDM_POSTGRES_SHADOW_URL) { throw "Set PDM_POSTGRES_SHADOW_URL to the approved disposable AI_PDM shadow target before running this command." }',
      "npm.cmd run db:postgres:compare -- --require-postgres",
      "npm.cmd run qc:postgres-shadow",
      ""
    ].join("\r\n"),
    finalReadiness: [
      '$ErrorActionPreference = "Stop"',
      "npm.cmd run qc:postgres-shadow-target-guard",
      "npm.cmd run qc:postgres-shadow",
      "npm.cmd run qa:dev-task:sync",
      "npm.cmd run qc:dev-task-completion-audit",
      "npm.cmd run qc:production-readiness:report",
      ""
    ].join("\r\n")
  };
}

function buildAdvisorChecklist(handoff) {
  return [
    "# Supabase Advisor / RLS Evidence Checklist",
    "",
    `Handoff ID: \`${handoff.handoffId}\``,
    "",
    "## Target Rule",
    "",
    "- Use only a disposable AI_PDM Supabase project or branch approved for this shadow test.",
    "- Do not use existing `ProJED` or `ProJED_TEST` projects for this gate.",
    "- Do not paste the Postgres connection string into this file or any committed document.",
    "",
    "## Required Advisor Evidence",
    "",
    "Record screenshots, exported findings, or connector output for:",
    "",
    "- Supabase security advisors after `001_initial_schema.sql` and `002_supabase_rls_plan.sql` are applied.",
    "- Supabase performance advisors after the compare command has passed.",
    "- Public schema table exposure review: RLS is enabled and forced on all generated AI_PDM public tables.",
    "- Direct `anon` and `authenticated` table privileges remain revoked until explicit policies are designed.",
    "- RLS or future policies do not use `user_metadata` or `raw_user_meta_data`; use `auth.uid()` or signed server-owned claims only.",
    "",
    "## Required Evidence Fields",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Supabase organization |  |",
    "| Disposable project / branch name |  |",
    "| Target approved by |  |",
    "| Cost confirmation reference |  |",
    "| Migration applied at |  |",
    "| Compare report path |  |",
    "| Security advisor evidence path |  |",
    "| Performance advisor evidence path |  |",
    "| Unresolved high-risk findings |  |",
    "| Accepted performance findings and rationale |  |",
    "",
    "## External Reference",
    "",
    "- Supabase API security guide: https://supabase.com/docs/guides/api/securing-your-api",
    ""
  ].join("\n");
}

function buildReadme(handoff) {
  return [
    "# AI PDM Postgres Shadow Handoff",
    "",
    `Handoff ID: \`${handoff.handoffId}\``,
    `Generated at: \`${handoff.generatedAt}\``,
    "",
    "## Purpose",
    "",
    "This package gives the database administrator a repeatable path for the `DEV-IND-007` disposable Supabase/Postgres shadow gate. It does not create a Supabase project, branch, or connection string.",
    "",
    "## Safety Rules",
    "",
    "- Use only a disposable AI_PDM target approved for this test.",
    "- Do not use existing `ProJED` or `ProJED_TEST` projects.",
    "- Do not run migration SQL until `commands/01-pre-migration-guard.ps1` confirms the public schema is empty.",
    "- Store `PDM_POSTGRES_SHADOW_URL` only in the operator shell/session; never write it into this package, task file, or docs.",
    "- Keep `DEV-IND-007` open until live compare, RLS/advisor evidence, and production readiness all pass.",
    "",
    "## Files",
    "",
    "- `postgres-shadow-handoff.json`: package manifest and source hash trace.",
    "- `db/schema.sql`: SQLite schema copy used for generation traceability.",
    "- `db/postgres/001_initial_schema.sql`: Postgres migration copy.",
    "- `db/postgres/002_supabase_rls_plan.sql`: baseline RLS deny-by-default plan.",
    "- `commands/01-pre-migration-guard.ps1`: fail-closed target guard before DDL.",
    "- `commands/02-apply-migration.ps1`: apply schema and RLS SQL to the approved target.",
    "- `commands/03-compare-shadow.ps1`: run live SQLite/Postgres compare with `--require-postgres`.",
    "- `commands/04-final-readiness.ps1`: local gate recheck after advisor evidence is recorded.",
    "- `supabase-advisor-checklist.md`: external advisor/RLS evidence fields.",
    "- `qc-checklist.ps1`: operator sequence after a disposable target exists.",
    "",
    "## Step 1: Approve Disposable Target",
    "",
    "Confirm organization, region, resource type, and cost before creating a new Supabase project or branch. Existing non-empty projects are not acceptable shadow targets.",
    "",
    "Set the target only in the current PowerShell session:",
    "",
    "```powershell",
    '$env:PDM_POSTGRES_SHADOW_URL = "<approved disposable target connection string>"',
    "```",
    "",
    "## Step 2: Guard Before Migration",
    "",
    "```powershell",
    `.\\${handoff.commands.preMigrationGuardFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "## Step 3: Apply Migration And RLS",
    "",
    "```powershell",
    `.\\${handoff.commands.applyMigrationFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "## Step 4: Run Live Compare",
    "",
    "```powershell",
    `.\\${handoff.commands.compareShadowFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "## Step 5: Record Advisor Evidence",
    "",
    "Fill `supabase-advisor-checklist.md` with Supabase security advisor, performance advisor, and RLS exposure evidence.",
    "",
    "## Step 6: Final QC",
    "",
    "```powershell",
    `.\\${handoff.commands.qcChecklistFromRoot.replaceAll("/", "\\")}`,
    "```",
    "",
    "Production readiness is expected to remain blocked until the disposable target live compare and advisor evidence are complete.",
    ""
  ].join("\n");
}

function buildQcChecklist(commandPaths) {
  return [
    '$ErrorActionPreference = "Stop"',
    `.\\${commandPaths.preMigrationGuardFromRoot.replaceAll("/", "\\")}`,
    `.\\${commandPaths.applyMigrationFromRoot.replaceAll("/", "\\")}`,
    `.\\${commandPaths.compareShadowFromRoot.replaceAll("/", "\\")}`,
    "npm.cmd run qc:postgres-shadow-target-guard",
    "npm.cmd run qc:postgres-shadow",
    "npm.cmd run qa:dev-task:sync",
    "npm.cmd run qc:dev-task-completion-audit",
    "npm.cmd run qc:production-readiness:report",
    ""
  ].join("\r\n");
}

runGenerator();

const sqliteSchemaPath = path.join(root, "db", "schema.sql");
const initialSchemaPath = path.join(root, "db", "postgres", "001_initial_schema.sql");
const rlsPlanPath = path.join(root, "db", "postgres", "002_supabase_rls_plan.sql");
assertFile(sqliteSchemaPath, "Missing db/schema.sql");
assertFile(initialSchemaPath, "Missing db/postgres/001_initial_schema.sql");
assertFile(rlsPlanPath, "Missing db/postgres/002_supabase_rls_plan.sql");

fs.mkdirSync(outputDir, { recursive: true });
const copiedSqlite = copyFile(sqliteSchemaPath, path.join(outputDir, "db", "schema.sql"));
const copiedInitial = copyFile(initialSchemaPath, path.join(outputDir, "db", "postgres", "001_initial_schema.sql"));
const copiedRls = copyFile(rlsPlanPath, path.join(outputDir, "db", "postgres", "002_supabase_rls_plan.sql"));

const commands = buildCommands({
  initialCopy: copiedInitial,
  rlsCopy: copiedRls
});
fs.mkdirSync(path.join(outputDir, "commands"), { recursive: true });
fs.writeFileSync(path.join(outputDir, "commands", "01-pre-migration-guard.ps1"), commands.preMigrationGuard, "utf8");
fs.writeFileSync(path.join(outputDir, "commands", "02-apply-migration.ps1"), commands.applyMigration, "utf8");
fs.writeFileSync(path.join(outputDir, "commands", "03-compare-shadow.ps1"), commands.compareShadow, "utf8");
fs.writeFileSync(path.join(outputDir, "commands", "04-final-readiness.ps1"), commands.finalReadiness, "utf8");

const commandPaths = {
  preMigrationGuard: "commands/01-pre-migration-guard.ps1",
  applyMigration: "commands/02-apply-migration.ps1",
  compareShadow: "commands/03-compare-shadow.ps1",
  finalReadiness: "commands/04-final-readiness.ps1",
  qcChecklist: "qc-checklist.ps1",
  preMigrationGuardFromRoot: rel(path.join(outputDir, "commands", "01-pre-migration-guard.ps1")),
  applyMigrationFromRoot: rel(path.join(outputDir, "commands", "02-apply-migration.ps1")),
  compareShadowFromRoot: rel(path.join(outputDir, "commands", "03-compare-shadow.ps1")),
  finalReadinessFromRoot: rel(path.join(outputDir, "commands", "04-final-readiness.ps1")),
  qcChecklistFromRoot: rel(path.join(outputDir, "qc-checklist.ps1"))
};

const handoff = {
  handoffId,
  generatedAt: new Date().toISOString(),
  outputDir,
  taskId: "DEV-IND-007",
  targetPolicy: {
    requiresDisposableTarget: true,
    forbiddenKnownProjects: ["ProJED", "ProJED_TEST"],
    connectionStringStorage: "operator shell only; do not write into package/.ai-doc/task"
  },
  sqlSources: {
    sqliteSchema: {
      source: rel(sqliteSchemaPath),
      copy: handoffRel(copiedSqlite),
      sha256: await sha256File(sqliteSchemaPath)
    },
    postgresSchema: {
      source: rel(initialSchemaPath),
      copy: handoffRel(copiedInitial),
      sha256: await sha256File(initialSchemaPath)
    },
    postgresRlsPlan: {
      source: rel(rlsPlanPath),
      copy: handoffRel(copiedRls),
      sha256: await sha256File(rlsPlanPath)
    }
  },
  commands: commandPaths,
  advisorChecklist: "supabase-advisor-checklist.md",
  externalReference: {
    supabaseApiSecurity: "https://supabase.com/docs/guides/api/securing-your-api"
  }
};

fs.writeFileSync(path.join(outputDir, "supabase-advisor-checklist.md"), buildAdvisorChecklist(handoff), "utf8");
fs.writeFileSync(path.join(outputDir, "qc-checklist.ps1"), buildQcChecklist(commandPaths), "utf8");
fs.writeFileSync(path.join(outputDir, "postgres-shadow-handoff.json"), `${JSON.stringify(handoff, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputDir, "README.md"), buildReadme(handoff), "utf8");

console.log(JSON.stringify({
  handoffId,
  outputDir,
  files: [
    rel(path.join(outputDir, "postgres-shadow-handoff.json")),
    rel(path.join(outputDir, "README.md")),
    rel(path.join(outputDir, "supabase-advisor-checklist.md")),
    rel(path.join(outputDir, "db", "schema.sql")),
    rel(path.join(outputDir, "db", "postgres", "001_initial_schema.sql")),
    rel(path.join(outputDir, "db", "postgres", "002_supabase_rls_plan.sql")),
    rel(path.join(outputDir, "commands", "01-pre-migration-guard.ps1")),
    rel(path.join(outputDir, "commands", "02-apply-migration.ps1")),
    rel(path.join(outputDir, "commands", "03-compare-shadow.ps1")),
    rel(path.join(outputDir, "commands", "04-final-readiness.ps1")),
    rel(path.join(outputDir, "qc-checklist.ps1"))
  ],
  sqlSources: handoff.sqlSources,
  commands: {
    preMigrationGuard: handoff.commands.preMigrationGuard,
    applyMigration: handoff.commands.applyMigration,
    compareShadow: handoff.commands.compareShadow,
    finalReadiness: handoff.commands.finalReadiness,
    finalQc: handoff.commands.qcChecklist
  }
}, null, 2));
