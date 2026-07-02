#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_SCHEMA_ADVISOR_EVIDENCE_VERSION,
  buildStorageSchemaAdvisorEvidence,
  writeStorageSchemaAdvisorEvidence
} from "./generate-file-storage-schema-advisor-evidence.mjs";
import { buildStorageSchemaPromotionGate } from "./generate-file-storage-schema-promotion-gate.mjs";
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

let tempRoot;

try {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-advisor-evidence-qc-"));
  const cleanSecurityPath = path.join(tempRoot, "security-clean.json");
  const cleanPerformancePath = path.join(tempRoot, "performance-clean.json");
  const securityFindingPath = path.join(tempRoot, "security-finding.json");
  const performanceFindingPath = path.join(tempRoot, "performance-finding.json");
  const secretMarkerPath = path.join(tempRoot, "secret-marker.json");
  const applyPath = path.join(tempRoot, "storage-schema-apply-gate.json");
  const verifyPath = path.join(tempRoot, "storage-schema-verify-gate.json");

  await writeJson(cleanSecurityPath, { findings: [] });
  await writeJson(cleanPerformancePath, { issues: [] });
  await writeJson(securityFindingPath, {
    findings: [
      {
        title: "RLS disabled on public.storage_objects",
        severity: "error",
        description: "Enable row level security before migration review"
      }
    ]
  });
  await writeJson(performanceFindingPath, {
    issues: [
      {
        name: "missing index",
        level: "warning",
        message: "storage_object_references.object_id may need an index"
      }
    ]
  });
  await writeJson(secretMarkerPath, {
    findings: [
      {
        title: "postgres://user:pass@example.supabase.co/postgres",
        severity: "service_role",
        message: "token=abc123 and X-Amz-Signature should not survive"
      }
    ]
  });
  await writeJson(applyPath, validApplyReport());
  await writeJson(verifyPath, validVerifyReport());

  const packageJson = readProjectFile(root, "package.json");
  const generatorSource = readProjectFile(root, "scripts/generate-file-storage-schema-advisor-evidence.mjs");
  const planSource = readProjectFile(root, ".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md");
  const devTaskSource = readProjectFile(root, ".ai-doc/dev_task.md");

  const missingReport = await buildStorageSchemaAdvisorEvidence({});
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-001 evidence version is stable", missingReport.evidenceVersion === STORAGE_SCHEMA_ADVISOR_EVIDENCE_VERSION);
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-002 missing exports block report", missingReport.summary.status === "blocked_missing_advisor_exports");
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-003 missing exports do not pass advisor checks", missingReport.security.status === "missing" && missingReport.performance.status === "missing");

  const cleanReport = await buildStorageSchemaAdvisorEvidence({
    targetName: "ai-pdm-disposable-shadow",
    securityReportPath: cleanSecurityPath,
    performanceReportPath: cleanPerformancePath
  });
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-004 clean exports pass", cleanReport.summary.status === "passed");
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-005 clean report is promotion compatible", cleanReport.security.status === "passed" && cleanReport.performance.status === "passed");
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-006 clean report keeps evidence-only assumptions", cleanReport.assumptions.noDatabaseConnection === true && cleanReport.assumptions.noProviderIo === true);

  const cleanOutputs = await writeStorageSchemaAdvisorEvidence(cleanReport, tempRoot);
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-007 output files are written", (await exists(cleanOutputs.jsonPath)) && (await exists(cleanOutputs.markdownPath)));

  const promotionReport = await buildStorageSchemaPromotionGate({
    applyReportPath: applyPath,
    verifyReportPath: verifyPath,
    advisorEvidencePath: cleanOutputs.jsonPath
  });
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-008 output can unlock promotion gate", promotionReport.summary.status === "ready_for_formal_migration_review");

  const securityFindingReport = await buildStorageSchemaAdvisorEvidence({
    targetName: "ai-pdm-staging",
    securityReportPath: securityFindingPath,
    performanceReportPath: cleanPerformancePath
  });
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-009 security findings fail report", securityFindingReport.security.status === "failed" && securityFindingReport.summary.status === "blocked_failed_advisor_exports");

  const performanceFindingReport = await buildStorageSchemaAdvisorEvidence({
    targetName: "ai-pdm-test",
    securityReportPath: cleanSecurityPath,
    performanceReportPath: performanceFindingPath
  });
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-010 performance findings fail report", performanceFindingReport.performance.status === "failed" && performanceFindingReport.summary.status === "blocked_failed_advisor_exports");

  const unsafeTargetReport = await buildStorageSchemaAdvisorEvidence({
    targetName: "ai-pdm-prod",
    securityReportPath: cleanSecurityPath,
    performanceReportPath: cleanPerformancePath
  });
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-011 production-like target fails report", unsafeTargetReport.summary.status === "blocked_failed_advisor_exports");

  const forbiddenTargetReport = await buildStorageSchemaAdvisorEvidence({
    targetName: "ProJED_TEST",
    securityReportPath: cleanSecurityPath,
    performanceReportPath: cleanPerformancePath
  });
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-012 known ProJED_TEST target fails report", forbiddenTargetReport.summary.status === "blocked_failed_advisor_exports");

  const redactedReport = await buildStorageSchemaAdvisorEvidence({
    targetName: "ai-pdm-shadow",
    securityReportPath: secretMarkerPath,
    performanceReportPath: cleanPerformancePath
  });
  const redactedSerialized = JSON.stringify(redactedReport);
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-013 report redacts database URLs", !redactedSerialized.includes("postgres://"));
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-014 report redacts credential markers", !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|token=abc123)/i.test(redactedSerialized));

  record(
    "STORAGE-SCHEMA-ADVISOR-EVIDENCE-015 package scripts are registered",
    packageJson.includes('"storage:schema-advisor-evidence"') && packageJson.includes('"qc:file-storage-schema-advisor-evidence"')
  );
  record(
    "STORAGE-SCHEMA-ADVISOR-EVIDENCE-016 PM evidence references advisor evidence lane",
    planSource.includes("Phase 4V") &&
      planSource.includes("storage:schema-advisor-evidence") &&
      planSource.includes("qc:file-storage-schema-advisor-evidence") &&
      devTaskSource.includes("DEV-STORAGE-COST-001") &&
      devTaskSource.includes("Storage governance and cost")
  );
  record(
    "STORAGE-SCHEMA-ADVISOR-EVIDENCE-017 generator does not write official migration directories",
    !generatorSource.includes("db/postgres") && !generatorSource.includes("supabase/migrations")
  );

  const outputBody = `${await fsp.readFile(cleanOutputs.jsonPath, "utf8")}\n${await fsp.readFile(cleanOutputs.markdownPath, "utf8")}`;
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-018 clean outputs do not expose credential markers", !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16}|postgres:\/\/)/i.test(outputBody));
  record("STORAGE-SCHEMA-ADVISOR-EVIDENCE-019 target safety accepts disposable staging names", cleanReport.target.safe === true);

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
} finally {
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
}
