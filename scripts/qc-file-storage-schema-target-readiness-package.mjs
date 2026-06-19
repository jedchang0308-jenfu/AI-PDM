#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_SCHEMA_TARGET_READINESS_PACKAGE_VERSION,
  buildStorageSchemaTargetReadinessPackage,
  writeStorageSchemaTargetReadinessPackage
} from "./generate-file-storage-schema-target-readiness-package.mjs";

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(filePath, value) {
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const forbiddenInventory = {
  projects: [
    { name: "ProJED", ref: "knodlkxqpcqyrtgwpdst", database: { host: "db.knodlkxqpcqyrtgwpdst.supabase.co" } },
    { name: "ProJED_TEST", ref: "fhisnnufoeulxqrchldf", database: { host: "db.fhisnnufoeulxqrchldf.supabase.co" } }
  ]
};

const readyInventory = {
  projects: [
    ...forbiddenInventory.projects,
    { name: "AI_PDM_STAGING", ref: "aiabcdefghijklmnop", database: { host: "db.aiabcdefghijklmnop.supabase.co" } }
  ]
};

try {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-target-readiness-package-qc-"));
  const forbiddenInventoryPath = path.join(tempRoot, "forbidden-inventory.json");
  const readyInventoryPath = path.join(tempRoot, "ready-inventory.json");
  await writeJson(forbiddenInventoryPath, forbiddenInventory);
  await writeJson(readyInventoryPath, readyInventory);

  const packageJson = await fsp.readFile(path.resolve("package.json"), "utf8");
  const generatorSource = await fsp.readFile(path.resolve("scripts/generate-file-storage-schema-target-readiness-package.mjs"), "utf8");
  const planSource = await fsp.readFile(
    path.resolve(".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md"),
    "utf8"
  );
  const devTaskSource = await fsp.readFile(path.resolve(".ai-doc/dev_task.md"), "utf8");

  const missingReport = await buildStorageSchemaTargetReadinessPackage({});
  record("STORAGE-SCHEMA-TARGET-PACKAGE-001 package version is stable", missingReport.packageVersion === STORAGE_SCHEMA_TARGET_READINESS_PACKAGE_VERSION);
  record("STORAGE-SCHEMA-TARGET-PACKAGE-002 missing inventory blocks handoff", missingReport.summary.status === "blocked_target_readiness");
  record("STORAGE-SCHEMA-TARGET-PACKAGE-003 missing inventory includes export action", missingReport.handoff.blockedActions.some((item) => item.includes("Export Supabase project inventory")));

  const forbiddenReport = await buildStorageSchemaTargetReadinessPackage({
    projectsReportPath: forbiddenInventoryPath,
    expectedTargetName: "AI_PDM_STAGING"
  });
  record("STORAGE-SCHEMA-TARGET-PACKAGE-004 forbidden inventory blocks handoff", forbiddenReport.summary.status === "blocked_target_readiness");
  record("STORAGE-SCHEMA-TARGET-PACKAGE-005 forbidden inventory tells user not to use ProJED", forbiddenReport.handoff.blockedActions.some((item) => item.includes("ProJED")));

  const readyReport = await buildStorageSchemaTargetReadinessPackage({
    projectsReportPath: readyInventoryPath,
    expectedTargetName: "AI_PDM_STAGING"
  });
  record("STORAGE-SCHEMA-TARGET-PACKAGE-006 ready inventory creates apply handoff", readyReport.summary.status === "ready_for_schema_apply_handoff");
  record("STORAGE-SCHEMA-TARGET-PACKAGE-007 ready handoff includes apply verify advisor promotion commands", ["storage:schema-apply-gate", "storage:schema-verify-gate", "storage:schema-advisor-evidence", "storage:schema-promotion-gate"].every((needle) => readyReport.handoff.nextCommands.some((command) => command.includes(needle))));
  record("STORAGE-SCHEMA-TARGET-PACKAGE-008 package is evidence-only", readyReport.assumptions.noDatabaseConnection === true && readyReport.assumptions.noSupabaseProjectCreated === true);

  const outputs = await writeStorageSchemaTargetReadinessPackage(readyReport, tempRoot);
  record(
    "STORAGE-SCHEMA-TARGET-PACKAGE-009 output files are written",
    (await exists(outputs.jsonPath)) &&
      (await exists(outputs.markdownPath)) &&
      (await exists(outputs.readinessJsonPath)) &&
      (await exists(outputs.readinessMarkdownPath))
  );
  const outputBody = [
    await fsp.readFile(outputs.jsonPath, "utf8"),
    await fsp.readFile(outputs.markdownPath, "utf8"),
    await fsp.readFile(outputs.readinessJsonPath, "utf8"),
    await fsp.readFile(outputs.readinessMarkdownPath, "utf8")
  ].join("\n");
  record("STORAGE-SCHEMA-TARGET-PACKAGE-010 output does not print database URL", !outputBody.includes("postgres://"));

  record(
    "STORAGE-SCHEMA-TARGET-PACKAGE-011 package scripts are registered",
    packageJson.includes('"storage:schema-target-readiness-package"') &&
      packageJson.includes('"qc:file-storage-schema-target-readiness-package"')
  );
  record(
    "STORAGE-SCHEMA-TARGET-PACKAGE-012 PM evidence references Phase 4Y",
    planSource.includes("Phase 4Y") && devTaskSource.includes("Phase 4Y")
  );
  record(
    "STORAGE-SCHEMA-TARGET-PACKAGE-013 generator does not write official migration directories",
    !generatorSource.includes("db/postgres") && !generatorSource.includes("supabase/migrations")
  );
  record(
    "STORAGE-SCHEMA-TARGET-PACKAGE-014 generator does not call project creation tools",
    !generatorSource.includes("create_project") && !generatorSource.includes("create_branch")
  );

  const serialized = JSON.stringify([missingReport, forbiddenReport, readyReport]) + outputBody;
  record(
    "STORAGE-SCHEMA-TARGET-PACKAGE-015 reports do not expose common cloud credential markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|postgres:\/\/)/i.test(serialized)
  );

  await fsp.rm(tempRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
