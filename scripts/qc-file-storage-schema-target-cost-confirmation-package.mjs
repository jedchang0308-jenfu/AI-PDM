#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_SCHEMA_TARGET_COST_CONFIRMATION_PACKAGE_VERSION,
  buildStorageSchemaTargetCostConfirmationPackage,
  writeStorageSchemaTargetCostConfirmationPackage
} from "./generate-file-storage-schema-target-cost-confirmation-package.mjs";

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

try {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-target-cost-confirmation-qc-"));
  const packageJson = await fsp.readFile(path.resolve("package.json"), "utf8");
  const generatorSource = await fsp.readFile(path.resolve("scripts/generate-file-storage-schema-target-cost-confirmation-package.mjs"), "utf8");
  const planSource = await fsp.readFile(
    path.resolve(".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md"),
    "utf8"
  );
  const devTaskSource = await fsp.readFile(path.resolve(".ai-doc/dev_task.md"), "utf8");

  const missingReport = buildStorageSchemaTargetCostConfirmationPackage({});
  record("STORAGE-SCHEMA-TARGET-COST-001 package version is stable", missingReport.packageVersion === STORAGE_SCHEMA_TARGET_COST_CONFIRMATION_PACKAGE_VERSION);
  record("STORAGE-SCHEMA-TARGET-COST-002 missing resource choice blocks package", missingReport.summary.status === "blocked_unsafe_target");

  const unsafeTargetReport = buildStorageSchemaTargetCostConfirmationPackage({
    organizationId: "igzdpafkvqqpsyadmage",
    targetName: "ProJED_TEST",
    preferredResource: "project",
    projectCostAmount: 0,
    projectCostRecurrence: "monthly"
  });
  record("STORAGE-SCHEMA-TARGET-COST-003 known forbidden target blocks package", unsafeTargetReport.summary.status === "blocked_unsafe_target");

  const missingCostReport = buildStorageSchemaTargetCostConfirmationPackage({
    organizationId: "igzdpafkvqqpsyadmage",
    targetName: "AI_PDM_STAGING",
    preferredResource: "branch"
  });
  record("STORAGE-SCHEMA-TARGET-COST-004 missing selected cost evidence blocks package", missingCostReport.summary.status === "blocked_missing_cost_evidence");

  const projectReadyReport = buildStorageSchemaTargetCostConfirmationPackage({
    organizationId: "igzdpafkvqqpsyadmage",
    organizationName: "JED",
    targetName: "AI_PDM_STAGING",
    region: "ap-southeast-1",
    preferredResource: "project",
    projectCostAmount: 0,
    projectCostRecurrence: "monthly",
    branchCostAmount: 0.01344,
    branchCostRecurrence: "hourly"
  });
  record("STORAGE-SCHEMA-TARGET-COST-005 project cost package waits for user confirmation", projectReadyReport.summary.status === "ready_for_user_cost_confirmation");
  record("STORAGE-SCHEMA-TARGET-COST-006 project cost package records zero monthly cost", projectReadyReport.summary.selectedCostAmount === 0 && projectReadyReport.summary.selectedCostRecurrence === "monthly");
  record("STORAGE-SCHEMA-TARGET-COST-007 project package is not create-ready before confirmation", projectReadyReport.readiness.readyForSupabaseCreateCall === false);
  record("STORAGE-SCHEMA-TARGET-COST-008 project package includes confirmation text", projectReadyReport.handoff.confirmationText.includes("costs 0 monthly"));

  const branchReadyReport = buildStorageSchemaTargetCostConfirmationPackage({
    organizationId: "igzdpafkvqqpsyadmage",
    targetName: "AI_PDM_STAGING",
    region: "ap-southeast-1",
    preferredResource: "branch",
    projectCostAmount: 0,
    projectCostRecurrence: "monthly",
    branchCostAmount: 0.01344,
    branchCostRecurrence: "hourly"
  });
  record("STORAGE-SCHEMA-TARGET-COST-009 branch cost package records hourly cost", branchReadyReport.summary.status === "ready_for_user_cost_confirmation" && branchReadyReport.summary.selectedCostAmount === 0.01344);
  record("STORAGE-SCHEMA-TARGET-COST-010 branch package requires explicit confirmation", branchReadyReport.handoff.nextActions.some((item) => item.includes("explicitly confirm")));

  const outputs = await writeStorageSchemaTargetCostConfirmationPackage(projectReadyReport, tempRoot);
  record("STORAGE-SCHEMA-TARGET-COST-011 output files are written", (await exists(outputs.jsonPath)) && (await exists(outputs.markdownPath)));
  const outputBody = `${await fsp.readFile(outputs.jsonPath, "utf8")}\n${await fsp.readFile(outputs.markdownPath, "utf8")}`;
  record("STORAGE-SCHEMA-TARGET-COST-012 output does not print database URL", !outputBody.includes("postgres://"));

  record(
    "STORAGE-SCHEMA-TARGET-COST-013 package scripts are registered",
    packageJson.includes('"storage:schema-target-cost-confirmation-package"') &&
      packageJson.includes('"qc:file-storage-schema-target-cost-confirmation-package"')
  );
  record(
    "STORAGE-SCHEMA-TARGET-COST-014 PM evidence references Phase 4Z",
    planSource.includes("Phase 4Z") && devTaskSource.includes("Phase 4Z")
  );
  record(
    "STORAGE-SCHEMA-TARGET-COST-015 generator does not write official migration directories",
    !generatorSource.includes("db/postgres") && !generatorSource.includes("supabase/migrations")
  );
  record(
    "STORAGE-SCHEMA-TARGET-COST-016 generator does not call Supabase creation APIs",
    !generatorSource.includes("_create_project") &&
      !generatorSource.includes("_create_branch") &&
      !generatorSource.includes("_confirm_cost") &&
      !generatorSource.includes("mcp__codex_apps__supabase")
  );

  const serialized = JSON.stringify([missingReport, unsafeTargetReport, missingCostReport, projectReadyReport, branchReadyReport]) + outputBody;
  record(
    "STORAGE-SCHEMA-TARGET-COST-017 reports do not expose common cloud credential markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|postgres:\/\/)/i.test(serialized)
  );

  await fsp.rm(tempRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
