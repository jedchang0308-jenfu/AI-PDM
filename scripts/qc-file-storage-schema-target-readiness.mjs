#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_SCHEMA_TARGET_READINESS_VERSION,
  buildStorageSchemaTargetReadiness,
  writeStorageSchemaTargetReadiness
} from "./generate-file-storage-schema-target-readiness.mjs";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
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

const knownProjects = {
  projects: [
    {
      id: "knodlkxqpcqyrtgwpdst",
      ref: "knodlkxqpcqyrtgwpdst",
      name: "ProJED",
      region: "ap-southeast-1",
      status: "ACTIVE_HEALTHY",
      database: { host: "db.knodlkxqpcqyrtgwpdst.supabase.co" }
    },
    {
      id: "fhisnnufoeulxqrchldf",
      ref: "fhisnnufoeulxqrchldf",
      name: "ProJED_TEST",
      region: "ap-northeast-1",
      status: "ACTIVE_HEALTHY",
      database: { host: "db.fhisnnufoeulxqrchldf.supabase.co" }
    }
  ]
};

const dedicatedProjects = {
  projects: [
    ...knownProjects.projects,
    {
      id: "abcdefghijklmnopqrst",
      ref: "abcdefghijklmnopqrst",
      name: "AI_PDM_STAGING",
      region: "ap-southeast-1",
      status: "ACTIVE_HEALTHY",
      database: { host: "db.abcdefghijklmnopqrst.supabase.co" }
    }
  ]
};

let tempRoot;

try {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-target-readiness-qc-"));
  const knownProjectsPath = path.join(tempRoot, "known-projects.json");
  const dedicatedProjectsPath = path.join(tempRoot, "dedicated-projects.json");
  await writeJson(knownProjectsPath, knownProjects);
  await writeJson(dedicatedProjectsPath, dedicatedProjects);

  const packageJson = readProjectFile(root, "package.json");
  const generatorSource = readProjectFile(root, "scripts/generate-file-storage-schema-target-readiness.mjs");
  const planSource = readProjectFile(root, ".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md");
  const devTaskSource = readProjectFile(root, ".ai-doc/dev_task.md");

  const missingReport = await buildStorageSchemaTargetReadiness({});
  record("STORAGE-SCHEMA-TARGET-READINESS-001 gate version is stable", missingReport.gateVersion === STORAGE_SCHEMA_TARGET_READINESS_VERSION);
  record("STORAGE-SCHEMA-TARGET-READINESS-002 missing inventory blocks readiness", missingReport.summary.status === "blocked_missing_project_inventory");
  record("STORAGE-SCHEMA-TARGET-READINESS-003 missing inventory does not become ready", missingReport.readiness.readyForStorageSchemaApplyGate === false);

  const knownOnlyReport = await buildStorageSchemaTargetReadiness({
    projectsReportPath: knownProjectsPath,
    expectedTargetName: "AI_PDM_STAGING"
  });
  record("STORAGE-SCHEMA-TARGET-READINESS-004 known ProJED inventory is blocked", knownOnlyReport.summary.status === "blocked_no_approved_target");
  record("STORAGE-SCHEMA-TARGET-READINESS-005 known ProJED inventory counts forbidden targets", knownOnlyReport.summary.forbiddenProjectCount === 2);

  const unsafeExpectedReport = await buildStorageSchemaTargetReadiness({
    projectsReportPath: dedicatedProjectsPath,
    expectedTargetName: "ProJED_TEST"
  });
  record("STORAGE-SCHEMA-TARGET-READINESS-006 unsafe expected target is blocked", unsafeExpectedReport.summary.status === "blocked_unsafe_expected_target");

  const dedicatedReport = await buildStorageSchemaTargetReadiness({
    projectsReportPath: dedicatedProjectsPath,
    expectedTargetName: "AI_PDM_STAGING"
  });
  record("STORAGE-SCHEMA-TARGET-READINESS-007 dedicated staging target is ready", dedicatedReport.summary.status === "ready_for_storage_schema_apply_gate");
  record("STORAGE-SCHEMA-TARGET-READINESS-008 dedicated staging target has one ready candidate", dedicatedReport.summary.readyCandidateCount === 1);
  record("STORAGE-SCHEMA-TARGET-READINESS-009 readiness gate is evidence-only", dedicatedReport.assumptions.noDatabaseConnection === true && dedicatedReport.assumptions.noSupabaseProjectCreated === true);

  const prodOnlyReport = await buildStorageSchemaTargetReadiness({
    projectInventory: { projects: [{ name: "AI_PDM_PROD", ref: "prodref", database: { host: "db.prodref.supabase.co" } }] },
    expectedTargetName: "AI_PDM_PROD"
  });
  record("STORAGE-SCHEMA-TARGET-READINESS-010 production-like target is not apply-ready", prodOnlyReport.summary.status === "blocked_unsafe_expected_target");

  const outputs = await writeStorageSchemaTargetReadiness(dedicatedReport, tempRoot);
  record("STORAGE-SCHEMA-TARGET-READINESS-011 output files are written", (await exists(outputs.jsonPath)) && (await exists(outputs.markdownPath)));
  const outputBody = `${await fsp.readFile(outputs.jsonPath, "utf8")}\n${await fsp.readFile(outputs.markdownPath, "utf8")}`;
  record("STORAGE-SCHEMA-TARGET-READINESS-012 output does not print database URL", !outputBody.includes("postgres://"));

  record(
    "STORAGE-SCHEMA-TARGET-READINESS-013 package scripts are registered",
    packageJson.includes('"storage:schema-target-readiness"') && packageJson.includes('"qc:file-storage-schema-target-readiness"')
  );
  record(
    "STORAGE-SCHEMA-TARGET-READINESS-014 PM evidence references target readiness lane",
    planSource.includes("Phase 4X") &&
      planSource.includes("storage:schema-target-readiness") &&
      planSource.includes("qc:file-storage-schema-target-readiness") &&
      devTaskSource.includes("DEV-STORAGE-COST-001") &&
      devTaskSource.includes("Storage governance and cost")
  );
  record(
    "STORAGE-SCHEMA-TARGET-READINESS-015 generator does not write official migration directories",
    !generatorSource.includes("db/postgres") && !generatorSource.includes("supabase/migrations")
  );

  const serialized = JSON.stringify([missingReport, knownOnlyReport, unsafeExpectedReport, dedicatedReport, prodOnlyReport]) + outputBody;
  record(
    "STORAGE-SCHEMA-TARGET-READINESS-016 reports do not expose common cloud credential markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|postgres:\/\/)/i.test(serialized)
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
} finally {
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
}
