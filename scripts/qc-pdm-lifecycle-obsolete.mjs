#!/usr/bin/env node

import { projectFileExists, readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const checks = [];

function assert(condition, message, detail = "") {
  checks.push({ message, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

function source(relativePath) {
  assert(projectFileExists(root, relativePath), `Required file exists: ${relativePath}`);
  return readProjectFile(root, relativePath);
}

const policy = source("src/lib/pdm-lifecycle-policy.ts");
const numberingRepository = source("src/lib/repositories/numbering-repository.ts");
const asyncRepository = source("src/lib/repositories/numbering-async-repository.ts");
const asyncFacade = source("src/lib/numbering-async.ts");
const obsoleteRoute = source("src/app/api/lifecycle/obsolete-requests/route.ts");
const approvalRequestsRoute = source("src/app/api/numbering/approval-requests/route.ts");
const approvalBatchesRoute = source("src/app/api/numbering/approval-batches/route.ts");
const approvalsPage = source("src/app/numbering/approvals/page.tsx");
const approvalWorkbenchPage = source("src/app/approvals/page.tsx");
const approvalLegacyRedirect = source("src/lib/approval-workbench-legacy-redirect.ts");
const dashboardPage = source("src/components/dashboard.tsx");
const submissionRepository = source("src/lib/repositories/submission-lifecycle-async-repository.ts");
const submissionFacade = source("src/lib/submission-lifecycle-async.ts");
const submissionObsoleteRoute = source("src/app/api/submissions/[id]/obsolete-request/route.ts");
const submissionObsoleteApproveRoute = source("src/app/api/submission-lifecycle-requests/[requestId]/approve/route.ts");
const submissionObsoleteRejectRoute = source("src/app/api/submission-lifecycle-requests/[requestId]/reject/route.ts");
const dbSchema = source("db/schema.sql");
const postgresInitialSchema = source("db/postgres/001_initial_schema.sql");

for (const entityType of ['"numbering_part_number"', '"numbering_drawing_number"']) {
  assert(policy.includes(entityType), `Formal lifecycle policy supports ${entityType}`);
}
assert(policy.includes("buildNumberingFormalRecordLifecyclePolicy"), "Formal numbering lifecycle policy builder exists");
assert(policy.includes("pendingObsoleteRequest"), "Formal policy has pending obsolete review state");
assert(policy.includes('"controlled_history"'), "Obsolete formal records use controlled history surface");
assert(policy.includes("LIFE_FORMAL_DELETE_BLOCKED"), "Formal records block direct delete");
assert(policy.includes("LIFE_OBSOLETE_ALREADY_REQUESTED"), "Formal policy blocks duplicate obsolete request");
assert(policy.includes("LIFE_OBSOLETE_ALREADY_APPROVED"), "Formal policy blocks already obsolete records");
assert(policy.includes("LIFE_OBSOLETE_NOT_FORMAL"), "Formal policy rejects draft/review records");

for (const actionCode of ['"obsolete_part_number"', '"obsolete_ma_drawing"']) {
  assert(numberingRepository.includes(actionCode), `Sync repository action code exists: ${actionCode}`);
  assert(asyncRepository.includes(actionCode), `Async repository action code exists: ${actionCode}`);
  assert(obsoleteRoute.includes(actionCode.replaceAll('"', "")), `Lifecycle obsolete API maps ${actionCode}`);
  assert(approvalRequestsRoute.includes(actionCode.replaceAll('"', "")), `Approval request API allowlists ${actionCode}`);
  assert(approvalBatchesRoute.includes(actionCode.replaceAll('"', "")), `Approval batch API lists ${actionCode}`);
}

assert(numberingRepository.includes("RequestNumberingObsoleteApprovalInput"), "Obsolete approval input type is exported");
assert(numberingRepository.includes("NumberingObsoleteApprovalResult"), "Obsolete approval result type is exported");
assert(asyncRepository.includes("requestNumberingObsoleteApproval"), "Async repository exposes obsolete approval request service");
assert(asyncFacade.includes("requestNumberingObsoleteApprovalAsync"), "Async facade exposes obsolete approval request service");
assert(asyncRepository.includes("SELECT_ASYNC_PENDING_OBSOLETE_APPROVAL_SQL"), "Duplicate pending obsolete request is blocked");
assert(asyncRepository.includes("createNumberingApprovalBatchInClient"), "Obsolete request creates an approval batch immediately");
assert(asyncRepository.includes("UPDATE_ASYNC_APPROVAL_OBSOLETE_PART_SQL"), "Approved part obsolete mutates part status");
assert(asyncRepository.includes("UPDATE_ASYNC_MAIN_DRAWING_OBSOLETE_SQL"), "Approved drawing obsolete mutates drawing status");
assert(asyncRepository.includes("UPDATE_ASYNC_PART_MAIN_DRAWING_INVALID_SQL"), "Approved MA drawing obsolete invalidates impacted parts");
assert(asyncRepository.includes("markRootClosedIfNoOpenParts"), "Approved part obsolete closes root only when no open parts remain");
assert(asyncRepository.includes("lifecycle.obsolete.approved"), "Approved obsolete action writes lifecycle audit");
assert(asyncRepository.includes("previousRecordStatus") && asyncRepository.includes("newRecordStatus"), "Obsolete audit keeps before/after status evidence");

assert(obsoleteRoute.includes("requireNumberingActionAsync"), "Lifecycle obsolete API enforces action permission");
assert(obsoleteRoute.includes("resolveNumberingCompanyContextAsync"), "Lifecycle obsolete API enforces PDM company context");
assert(obsoleteRoute.includes("requestNumberingObsoleteApprovalAsync"), "Lifecycle obsolete API calls service");
assert(obsoleteRoute.includes("buildNumberingFormalRecordLifecyclePolicy"), "Lifecycle obsolete API returns updated policy");
assert(obsoleteRoute.includes("pendingObsoleteRequest: true"), "Lifecycle obsolete API returns review-stage policy after request");

assert(
  approvalsPage.includes("redirect(buildLegacyApprovalWorkbenchRedirect") && approvalsPage.includes('"numbering_approvals"'),
  "Legacy numbering approvals route redirects to approval workbench"
);
assert(
  approvalLegacyRedirect.includes("numbering_approvals") && approvalLegacyRedirect.includes('domain: "numbering"'),
  "Legacy numbering approvals redirect preserves numbering domain filter"
);
assert(approvalWorkbenchPage.includes("<h1>審核工作台"), "Approval workbench title covers obsolete approvals");
assert(approvalWorkbenchPage.includes("料號作廢審核"), "Approval workbench labels part obsolete action");
assert(approvalWorkbenchPage.includes("圖號作廢審核"), "Approval workbench labels drawing obsolete action");
assert(approvalWorkbenchPage.includes("const actionFilters"), "Approval workbench exposes explicit action filters");

assert(policy.includes('"submission"'), "Lifecycle policy supports formal submission records");
assert(policy.includes("buildSubmissionLifecyclePolicy"), "Submission lifecycle policy builder exists");
assert(policy.includes("input.status === \"Released\" && input.pendingObsoleteRequest"), "Submission policy has released pending-obsolete branch");
assert(dbSchema.includes("CREATE TABLE IF NOT EXISTS submission_lifecycle_requests"), "SQLite schema stores submission obsolete requests");
assert(postgresInitialSchema.includes("CREATE TABLE IF NOT EXISTS submission_lifecycle_requests"), "Postgres schema stores submission obsolete requests");
assert(submissionRepository.includes("SELECT_ASYNC_PENDING_SUBMISSION_OBSOLETE_REQUEST_SQL"), "Submission repository blocks duplicate obsolete requests");
assert(submissionRepository.includes("OBSOLETE_ASYNC_SUBMISSION_SQL"), "Submission approval marks formal record obsolete");
assert(submissionRepository.includes("lifecycle.obsolete.requested"), "Submission obsolete request writes audit");
assert(submissionRepository.includes("lifecycle.obsolete.approved"), "Submission obsolete approval writes audit");
assert(submissionRepository.includes("lifecycle.obsolete.rejected"), "Submission obsolete rejection writes audit");
assert(submissionFacade.includes("requestSubmissionObsoleteReviewAsync"), "Submission facade exports obsolete request service");
assert(submissionObsoleteRoute.includes("requestSubmissionObsoleteReviewAsync"), "Submission obsolete API calls request service");
assert(submissionObsoleteRoute.includes("buildSubmissionLifecyclePolicy"), "Submission obsolete API returns policy");
assert(submissionObsoleteApproveRoute.includes("decideApprovalPlatformLegacySubmissionAsync"), "Submission obsolete approval API calls approval platform adapter");
assert(submissionObsoleteRejectRoute.includes("decideApprovalPlatformLegacySubmissionAsync"), "Submission obsolete rejection API calls approval platform adapter");
assert(dashboardPage.includes("申請作廢"), "Dashboard uses formal obsolete request label");
assert(dashboardPage.includes("核准作廢"), "Dashboard uses formal obsolete approval label");
assert(dashboardPage.includes("退回申請"), "Dashboard uses formal obsolete rejection label");
assert(dashboardPage.includes("已作廢"), "Dashboard shows approved obsolete state");

console.log(`qc:pdm-lifecycle-obsolete passed ${checks.length}/${checks.length} checks`);
