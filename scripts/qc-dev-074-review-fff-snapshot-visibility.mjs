#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const repository = fs.readFileSync("src/lib/repositories/approval-platform-async-repository.ts", "utf8");
const approvalPage = fs.readFileSync("src/app/approvals/page.tsx", "utf8");
const entityDetail = fs.readFileSync("src/lib/pdm-entity-detail.ts", "utf8");
const reviewProjection = fs.readFileSync("src/components/review-context-projection.tsx", "utf8");

assert.match(repository, /FROM submission_part_scopes[\s\S]*WHERE submission_id = :submissionId/);
assert.match(repository, /parts,[\s\S]*fff:\s*\{[\s\S]*formState: header\.form_state/);
assert.match(repository, /detectedPartNumber: header\.detected_part_number/);
assert.match(repository, /correctedPartNumber: header\.corrected_part_number/);

assert.match(approvalPage, /\{ label: "FFF 結論", value: approvalImpactStateLabel/);
assert.match(approvalPage, /\{ label: "Form", value: approvalImpactStateLabel/);
assert.match(approvalPage, /\{ label: "Fit", value: approvalImpactStateLabel/);
assert.match(approvalPage, /\{ label: "Function", value: approvalImpactStateLabel/);
assert.match(approvalPage, /suspected_impact:\s*"疑似影響"/);
assert.match(approvalPage, /confirmed_impact:\s*"確認影響"/);

assert.match(entityDetail, /AsyncApprovalPlatformRepository[\s\S]*drawingRevisionEvidence/);
assert.match(entityDetail, /scope\.actionCode === "numbering\.drawing_revision_impact_review"/);
assert.match(entityDetail, /parts:\s*parts\.map[\s\S]*formState:[\s\S]*fitState:[\s\S]*functionState:/);
assert.match(reviewProjection, /data-component="DrawingRevisionReviewEvidence"/);
assert.match(reviewProjection, />FFF 結論</);
assert.match(reviewProjection, />Form</);
assert.match(reviewProjection, />Fit</);
assert.match(reviewProjection, />Function</);
assert.match(reviewProjection, />受影響料號</);
assert.match(reviewProjection, />送審附件</);

console.log("QC DEV-074 review FFF snapshot visibility: PASS (legacy and unified reviewer drawers expose part scope and frozen FFF states)");
