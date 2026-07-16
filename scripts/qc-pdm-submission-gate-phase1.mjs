#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function readRequired(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    results.push({ name: `READ ${relativePath}`, passed: false, detail: "missing" });
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function appearsBefore(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

const gate = readRequired("src/lib/submission-gate.ts");
const activeRulesRoute = readRequired("src/app/api/submission-rules/active/route.ts");
const readinessRoute = readRequired("src/app/api/submission-readiness/resolve/route.ts");
const drawingSubmissionRoute = readRequired("src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts");
const uploadPage = readRequired("src/app/upload/page.tsx");
const transferPackagePage = readRequired("src/app/transfer-packages/new/page.tsx");
const transferPackageContextRoute = readRequired("src/app/api/transfer-packages/workbench-context/route.ts");
const packageJson = readRequired("package.json");

record("GATE-001 active rule set is versioned and Phase 1 scoped", gate.includes("submission-gate-v1.2026-07-10.phase1") && gate.includes("phase1_local_slice"));
record("GATE-002 UI/API modes are explicit", gate.includes('"research"') && gate.includes('"technical_transfer"') && uploadPage.includes("研發送審") && uploadPage.includes("技術移轉送審"));
record("GATE-003 field states cover required/warning/optional/not_applicable", ["required", "warning", "optional", "not_applicable"].every((state) => gate.includes(`"${state}"`)));
record("GATE-004 technical transfer requires package context", gate.includes("technical_transfer_requires_package") && gate.includes("packageRequired") && gate.includes("transfer_package_builder"));
record("GATE-005 direct technical transfer submit is fail-closed before mutation", appearsBefore(drawingSubmissionRoute, 'submissionMode === "technical_transfer"', "const result = await createDrawingSourceSubmission"));
record("GATE-006 direct technical transfer response carries recovery href and blocker payload", drawingSubmissionRoute.includes("recoveryHref") && drawingSubmissionRoute.includes("readiness.blockers") && drawingSubmissionRoute.includes("status: 409"));
record("GATE-007 blocker payload includes field/owner/code/route", ["field:", "ownerRole:", "blockerCode:", "remediationRoute:"].every((token) => gate.includes(token)));
record("GATE-008 research standard cost is warning with exception review route", gate.includes("standard_cost_warning_for_research") && gate.includes("research_exception_review"));
record("GATE-009 technical transfer standard cost is hard blocker", gate.includes("standard_cost_missing_for_transfer") && gate.includes("技術移轉送審缺少標準成本"));
record("GATE-010 active rule API uses the shared rule resolver", activeRulesRoute.includes("getActiveSubmissionRuleSet") && activeRulesRoute.includes("requireAuthAsync"));
record("GATE-011 readiness API uses the shared readiness resolver", readinessRoute.includes("resolveSubmissionReadiness") && readinessRoute.includes("requireAuthAsync"));
record("GATE-012 workbench exposes mode selector and package CTA", uploadPage.includes('data-submission-mode-selector="true"') && uploadPage.includes("setSubmissionMode(\"technical_transfer\")") && uploadPage.includes("buildTransferPackageHref") && uploadPage.includes("transferPackageHref"));
record("GATE-013 workbench does not allow technical transfer through direct submit", uploadPage.includes("isTechnicalTransferMode") && uploadPage.includes("不能從單一圖號直接建立正式送審"));
record(
  "GATE-014 transfer package create route remains non-mutating on GET",
  transferPackagePage.includes("TransferPackageWorkbenchShell") &&
    !transferPackagePage.includes("fetch(") &&
    transferPackageContextRoute.includes("getTransferPackageWorkbenchContext") &&
    !transferPackageContextRoute.includes("createTransferPackageDraft")
);
record("GATE-015 package script is registered", packageJson.includes('"qc:pdm-submission-gate-phase1": "node scripts/qc-pdm-submission-gate-phase1.mjs"'));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
