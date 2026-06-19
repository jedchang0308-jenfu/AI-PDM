#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_SCHEMA_PROMOTION_GATE_VERSION,
  buildStorageSchemaPromotionGate,
  writeStorageSchemaPromotionGate
} from "./generate-file-storage-schema-promotion-gate.mjs";

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

function validApplyReport() {
  return {
    reportType: "file-storage-schema-apply-gate",
    assumptions: {
      noProviderIo: true,
      noOfficialMigrationFilesWritten: true
    },
    inputs: {
      targetName: "ai-pdm-disposable-shadow"
    },
    summary: {
      status: "applied_to_disposable",
      disallowedGrantCount: 0
    }
  };
}

function validVerifyReport() {
  return {
    reportType: "file-storage-schema-verify-gate",
    assumptions: {
      readOnlyVerification: true,
      noSqlApplied: true
    },
    inputs: {
      targetName: "ai-pdm-disposable-shadow"
    },
    readiness: {
      readyToPromoteSchema: true
    },
    summary: {
      status: "verified",
      providersVerifiedCount: 4,
      disallowedGrantCount: 0
    },
    findings: []
  };
}

function validAdvisorEvidence() {
  return {
    reportType: "supabase-advisor-evidence",
    security: {
      status: "passed",
      findings: []
    },
    performance: {
      status: "passed",
      findings: []
    }
  };
}

try {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-schema-promotion-gate-qc-"));
  const applyPath = path.join(tempRoot, "storage-schema-apply-gate.json");
  const verifyPath = path.join(tempRoot, "storage-schema-verify-gate.json");
  const advisorPath = path.join(tempRoot, "supabase-advisor-evidence.json");
  await writeJson(applyPath, validApplyReport());
  await writeJson(verifyPath, validVerifyReport());
  await writeJson(advisorPath, validAdvisorEvidence());

  const packageJson = await fsp.readFile(path.resolve("package.json"), "utf8");
  const gateSource = await fsp.readFile(path.resolve("scripts/generate-file-storage-schema-promotion-gate.mjs"), "utf8");
  const planSource = await fsp.readFile(
    path.resolve(".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md"),
    "utf8"
  );
  const devTaskSource = await fsp.readFile(path.resolve(".ai-doc/dev_task.md"), "utf8");

  const missingReport = await buildStorageSchemaPromotionGate({});
  record("STORAGE-SCHEMA-PROMOTION-GATE-001 gate version is stable", missingReport.gateVersion === STORAGE_SCHEMA_PROMOTION_GATE_VERSION);
  record("STORAGE-SCHEMA-PROMOTION-GATE-002 missing evidence blocks promotion", missingReport.summary.status === "blocked_missing_evidence");
  record("STORAGE-SCHEMA-PROMOTION-GATE-003 missing evidence does not become ready", missingReport.readiness.readyForFormalMigrationReview === false);

  const readyReport = await buildStorageSchemaPromotionGate({
    applyReportPath: applyPath,
    verifyReportPath: verifyPath,
    advisorEvidencePath: advisorPath
  });
  record("STORAGE-SCHEMA-PROMOTION-GATE-004 clean evidence is ready for formal review", readyReport.summary.status === "ready_for_formal_migration_review");
  record("STORAGE-SCHEMA-PROMOTION-GATE-005 ready report has no blockers", readyReport.summary.blockerCount === 0 && readyReport.blockers.length === 0);
  record("STORAGE-SCHEMA-PROMOTION-GATE-006 ready report validates apply evidence", readyReport.sourceEvidence.apply.status === "applied_to_disposable");
  record("STORAGE-SCHEMA-PROMOTION-GATE-007 ready report validates verify evidence", readyReport.sourceEvidence.verify.status === "verified");
  record("STORAGE-SCHEMA-PROMOTION-GATE-008 ready report validates advisors", readyReport.sourceEvidence.advisors.securityStatus === "passed" && readyReport.sourceEvidence.advisors.performanceStatus === "passed");
  record("STORAGE-SCHEMA-PROMOTION-GATE-009 promotion gate is evidence-only", readyReport.assumptions.noDatabaseConnection === true && readyReport.assumptions.noSqlApplied === true);

  const badApplyPath = path.join(tempRoot, "bad-apply.json");
  await writeJson(badApplyPath, { ...validApplyReport(), summary: { status: "disabled", disallowedGrantCount: 0 } });
  const badApplyReport = await buildStorageSchemaPromotionGate({
    applyReportPath: badApplyPath,
    verifyReportPath: verifyPath,
    advisorEvidencePath: advisorPath
  });
  record("STORAGE-SCHEMA-PROMOTION-GATE-010 failed apply evidence blocks promotion", badApplyReport.summary.status === "blocked_failed_evidence");

  const badVerifyPath = path.join(tempRoot, "bad-verify.json");
  await writeJson(badVerifyPath, { ...validVerifyReport(), summary: { status: "verified_with_findings", providersVerifiedCount: 3, disallowedGrantCount: 1 }, findings: ["disallowed grant"] });
  const badVerifyReport = await buildStorageSchemaPromotionGate({
    applyReportPath: applyPath,
    verifyReportPath: badVerifyPath,
    advisorEvidencePath: advisorPath
  });
  record("STORAGE-SCHEMA-PROMOTION-GATE-011 verify findings block promotion", badVerifyReport.summary.status === "blocked_failed_evidence");

  const badAdvisorPath = path.join(tempRoot, "bad-advisor.json");
  await writeJson(badAdvisorPath, {
    reportType: "supabase-advisor-evidence",
    security: { status: "failed", findings: ["RLS disabled"] },
    performance: { status: "passed", findings: [] }
  });
  const badAdvisorReport = await buildStorageSchemaPromotionGate({
    applyReportPath: applyPath,
    verifyReportPath: verifyPath,
    advisorEvidencePath: badAdvisorPath
  });
  record("STORAGE-SCHEMA-PROMOTION-GATE-012 advisor findings block promotion", badAdvisorReport.summary.status === "blocked_failed_evidence");

  const outputs = await writeStorageSchemaPromotionGate(readyReport, tempRoot);
  record("STORAGE-SCHEMA-PROMOTION-GATE-013 output files are written", (await exists(outputs.jsonPath)) && (await exists(outputs.markdownPath)));
  const outputBody = `${await fsp.readFile(outputs.jsonPath, "utf8")}\n${await fsp.readFile(outputs.markdownPath, "utf8")}`;
  record("STORAGE-SCHEMA-PROMOTION-GATE-014 output does not print database URL", !outputBody.includes("postgres://"));

  record(
    "STORAGE-SCHEMA-PROMOTION-GATE-015 package scripts are registered",
    packageJson.includes('"storage:schema-promotion-gate"') && packageJson.includes('"qc:file-storage-schema-promotion-gate"')
  );
  record(
    "STORAGE-SCHEMA-PROMOTION-GATE-016 PM evidence references Phase 4U",
    planSource.includes("Phase 4U") && devTaskSource.includes("Phase 4U")
  );
  record(
    "STORAGE-SCHEMA-PROMOTION-GATE-017 gate does not write official migration directories",
    !gateSource.includes("db/postgres") && !gateSource.includes("supabase/migrations")
  );

  const serialized = JSON.stringify([missingReport, readyReport, badApplyReport, badVerifyReport, badAdvisorReport]) + outputBody;
  record(
    "STORAGE-SCHEMA-PROMOTION-GATE-018 reports do not expose common cloud credential markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16})/i.test(serialized)
  );

  await fsp.rm(tempRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
