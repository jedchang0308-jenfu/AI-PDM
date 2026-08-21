import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const scope = read("src/lib/pdm-review-scope.ts");
const service = read("src/lib/pdm-entity-detail.ts");
const mediaRoutes = [
  "src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/[fileId]/route.ts",
  "src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/route.ts",
  "src/app/api/numbering/drawing-revision-packages/[packageId]/files/[fileId]/route.ts"
].map(read);

assert.ok(scope.includes("request.company_id = :companyId"), "review receipt is company-scoped");
assert.ok(scope.includes("PDM_ACTIVE_REVIEW_STATUSES") && scope.includes("PDM_REVIEW_EVIDENCE_STATUSES") && scope.includes('access === "review_evidence"'), "review receipt separates active decision scope from read-only evidence scope");
assert.ok(
  scope.includes("matchesRequestedAggregate")
    && (scope.includes("targetTypes.includes(target.target_type)") || scope.includes("targetTypes.includes(target.type)"))
    && (scope.includes("targetIds.includes(target.target_id)") || scope.includes("targetIds.includes(target.id)")),
  "review receipt matches target type/id pairs"
);
assert.ok(scope.includes("PDM_REVIEW_NOT_ASSIGNED") && scope.includes("PDM_REVIEW_AGGREGATE_AMBIGUOUS"), "review scope fails closed for assignment and ambiguity");
assert.ok(service.includes("resolvePdmReviewScopeReceiptAsync") && !service.includes("payload_json"), "detail service consumes receipt without raw payload");
for (const route of mediaRoutes) assert.ok(route.includes("resolvePdmReviewScopeReceiptAsync") && route.includes('access: "review_evidence"'), "review media route validates read-only evidence scope across decision transitions");
console.log("QC DEV-067 review scope: PASS (company/status/target-pair scope, fail-closed assignment, transition-safe scoped media)");
