#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];

function record(name, passed, detail = {}) {
  checks.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}: ${JSON.stringify(detail)}`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const engine = await import("@/lib/revision-policy-engine");
const revisionPolicy = await import("@/lib/revision-policy");

const emptyRd = engine.createRevisionSuggestion({
  companyId: "company-qc",
  drawingNumber: "D-QC-MA1",
  workflowIntent: "rd_workspace",
  revisions: [],
  generatedAt: "2026-07-17T00:00:00.000Z"
});
record("SUG-001 RD before first major suggests 0.1", emptyRd.suggestedRevision === "0.1", emptyRd);

const nextRd = engine.createRevisionSuggestion({
  companyId: "company-qc",
  drawingNumber: "D-QC-MA1",
  workflowIntent: "rd_workspace",
  revisions: [{ revision: "0.1", status: "Pending", createdAt: "2026-07-17T00:01:00.000Z" }],
  generatedAt: "2026-07-17T00:02:00.000Z"
});
record("SUG-002 RD increments existing 0.x", nextRd.suggestedRevision === "0.2", nextRd);

const initialRelease = engine.createRevisionSuggestion({
  companyId: "company-qc",
  drawingNumber: "D-QC-MA1",
  workflowIntent: "release_area",
  revisions: [{ revision: "0.2", status: "Pending" }],
  generatedAt: "2026-07-17T00:03:00.000Z"
});
record("SUG-003 release area before first major suggests 1", initialRelease.suggestedRevision === "1", initialRelease);

const postMajor = engine.createRevisionSuggestion({
  companyId: "company-qc",
  drawingNumber: "D-QC-MA1",
  workflowIntent: "design_change_workspace",
  revisions: [
    { revision: "1", status: "Released", releasedAt: "2026-07-17T01:00:00.000Z" },
    { revision: "1.1", status: "Pending", createdAt: "2026-07-17T01:05:00.000Z" }
  ],
  generatedAt: "2026-07-17T01:06:00.000Z"
});
record("SUG-004 design-change after major suggests next N.x", postMajor.suggestedRevision === "1.2", postMajor);

const nextMajor = engine.createRevisionSuggestion({
  companyId: "company-qc",
  drawingNumber: "D-QC-MA1",
  workflowIntent: "release_area",
  revisions: [
    { revision: "1", status: "Released", releasedAt: "2026-07-17T01:00:00.000Z" },
    { revision: "1.1", status: "Pending", createdAt: "2026-07-17T01:05:00.000Z" }
  ],
  generatedAt: "2026-07-17T01:07:00.000Z"
});
record("SUG-005 release area after major suggests N+1", nextMajor.suggestedRevision === "2", nextMajor);

record(
  "SUG-006 low-level helper follows same release policy",
  revisionPolicy.suggestRevisionCode([{ revision: "1.1", status: "Pending" }], "release_area") === "1",
  {}
);

record("SUG-007 basis hash changes when basis changes", emptyRd.basisHash !== nextRd.basisHash, {
  empty: emptyRd.basisHash,
  next: nextRd.basisHash
});

const acceptedSnapshot = engine.buildRevisionPolicySnapshot({
  suggestion: nextRd,
  selectedRevision: "0.2",
  acceptedOrOverriddenAt: "2026-07-17T00:03:00.000Z"
});
record(
  "SUG-008 accepted snapshot stores policy metadata",
  acceptedSnapshot.suggested_revision === "0.2" &&
    acceptedSnapshot.selected_revision === "0.2" &&
    acceptedSnapshot.override_reason === null &&
    acceptedSnapshot.policy_version === engine.REVISION_POLICY_VERSION &&
    acceptedSnapshot.suggestion_basis_hash === nextRd.basisHash,
  acceptedSnapshot
);

const overrideSnapshot = engine.buildRevisionPolicySnapshot({
  suggestion: nextRd,
  selectedRevision: "0.3",
  overrideReason: "Backfill skipped 0.2 in source drawing log",
  acceptedOrOverriddenAt: "2026-07-17T00:04:00.000Z"
});
record(
  "SUG-009 override snapshot stores selected revision and reason",
  overrideSnapshot.suggested_revision === "0.2" &&
    overrideSnapshot.selected_revision === "0.3" &&
    overrideSnapshot.override_reason === "Backfill skipped 0.2 in source drawing log",
  overrideSnapshot
);

const suggestionRoute = read("src/app/api/submissions/revision-suggestion/route.ts");
record(
  "SUG-010 suggestion API supports server policy response and compatibility field",
  suggestionRoute.includes("POST(request: Request)") &&
    suggestionRoute.includes("suggestedRevisionCode") &&
    suggestionRoute.includes("revisionPolicySuggestion") &&
    suggestionRoute.includes("basisHash"),
  {}
);

const submissionWorkbench = read("src/lib/drawing-submission-workbench.ts");
record(
  "SUG-011 submission creation snapshots stale and override policy fields",
  submissionWorkbench.includes("revision_policy_snapshot") &&
    submissionWorkbench.includes("revision_policy_basis_stale") &&
    submissionWorkbench.includes("revision_policy_override_reason_required") &&
    submissionWorkbench.includes("buildRevisionPolicySnapshot"),
  {}
);
record("SUG-012 no independent revision policy decision table is introduced", !submissionWorkbench.includes("revision_policy_decisions"), {});

const drawingSubmissionRoute = read("src/app/api/numbering/drawing-revisions/submissions/route.ts");
const drawingWorkbenchRoute = read("src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts");
record(
  "SUG-013 both controlled package create routes accept suggestion metadata",
  drawingSubmissionRoute.includes("revisionPolicySuggestionFromBody") &&
    drawingWorkbenchRoute.includes("revisionPolicySuggestionFromBody") &&
    drawingSubmissionRoute.includes("revisionOverrideReason") &&
    drawingWorkbenchRoute.includes("revisionOverrideReason"),
  {}
);

const packageJson = JSON.parse(read("package.json"));
record(
  "SUG-014 package script is registered",
  packageJson.scripts["qc:pdm-revision-policy-suggestion"]?.includes("qc-pdm-revision-policy-suggestion.mjs"),
  packageJson.scripts["qc:pdm-revision-policy-suggestion"]
);

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: checks.length, checks }, null, 2));
