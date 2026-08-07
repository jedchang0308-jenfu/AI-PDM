#!/usr/bin/env node

import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function read(relativePath) {
  return readProjectFile(root, relativePath);
}

const legacyNumberingApprovalsPage = read("src/app/numbering/approvals/page.tsx");
const legacyRedirect = read("src/lib/approval-workbench-legacy-redirect.ts");
const approvalWorkbenchPage = read("src/app/approvals/page.tsx");
const approvalPlatformQc = read("scripts/qc-pdm-approval-platform.mjs");
const packageJson = JSON.parse(read("package.json"));

record(
  "Legacy numbering approvals route redirects to approval workbench",
  legacyNumberingApprovalsPage.includes("redirect(buildLegacyApprovalWorkbenchRedirect") &&
    legacyNumberingApprovalsPage.includes('"numbering_approvals"')
);
record(
  "Legacy numbering approvals route is no longer an independent client inbox",
  !legacyNumberingApprovalsPage.includes('"use client"')
);
record(
  "Legacy redirect preserves numbering domain filter",
  legacyRedirect.includes("numbering_approvals") && legacyRedirect.includes('domain: "numbering"')
);
record(
  "Legacy redirect preserves request deep-link aliases",
  legacyRedirect.includes("requestId") && legacyRedirect.includes("approvalRequestId") && legacyRedirect.includes("reviewId")
);
record(
  "Approval workbench is the canonical reviewer surface",
  approvalWorkbenchPage.includes("<h1>審核工作台") && approvalWorkbenchPage.includes("legacyRedirectMessages")
);
record(
  "Approval workbench exposes numbering approval filters",
  approvalWorkbenchPage.includes("numbering.release") &&
    approvalWorkbenchPage.includes("numbering.drawing_revision_impact_review") &&
    approvalWorkbenchPage.includes("numbering.obsolete_part_number") &&
    approvalWorkbenchPage.includes("numbering.obsolete_ma_drawing")
);
record(
  "Approval workbench supports detail decisions",
  approvalWorkbenchPage.includes("allowedDecisionsForDetail") &&
    approvalWorkbenchPage.includes("/api/approvals/requests/") &&
    approvalWorkbenchPage.includes("/decisions")
);
record(
  "Approval workbench supports filtered deep links",
  approvalWorkbenchPage.includes("buildInboxUrl") && approvalWorkbenchPage.includes("syncFilterQuery")
);
record(
  "Focused approval platform QC covers legacy numbering redirect",
  approvalPlatformQc.includes("Phase 1C-B numbering approvals route redirects to workbench")
);
record(
  "Package keeps compatibility QC command registered",
  packageJson.scripts?.["qc:pdm-numbering-approval-review-ui"] === "node scripts/qc-pdm-numbering-approval-review-ui.mjs"
);

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      results
    },
    null,
    2
  )
);
