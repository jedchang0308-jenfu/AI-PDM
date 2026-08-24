#!/usr/bin/env node

import { projectFileExists, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const checks = [];

function assert(condition, message, detail = "") {
  checks.push({ message, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

const readRequired = (relativePath) => readProjectFile(root, relativePath);
const existsRequired = (relativePath) => projectFileExists(root, relativePath);

const policy = readRequired("src/lib/pdm-lifecycle-policy.ts");
const asyncRepository = readRequired("src/lib/repositories/master-attachment-async-repository.ts");
const asyncFacade = readRequired("src/lib/master-attachments-async.ts");
const response = readRequired("src/lib/master-attachment-response.ts");
const partListRoute = readRequired("src/app/api/parts/[partNumber]/attachments/route.ts");
const drawingListRoute = readRequired("src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts");
const lifecyclePolicyRoute = readRequired("src/app/api/lifecycle/policy/route.ts");
const partRestoreRoute = readRequired("src/app/api/parts/[partNumber]/attachments/[attachmentId]/restore/route.ts");
const drawingRestoreRoute = readRequired("src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/restore/route.ts");
const panel = readRequired("src/components/master-attachment-panel.tsx");
const partDraftListRoute = readRequired("src/app/api/numbering/part-number-drafts/route.ts");
const partDraftRestoreRoute = readRequired("src/app/api/numbering/part-number-drafts/[draftId]/restore/route.ts");
const numberStateWorkspace = readRequired("src/components/number-state-workspace.tsx");
const changeControlDomain = readRequired("src/lib/pdm-change-control-domain.ts");
const changeControlFacade = readRequired("src/lib/pdm-change-control.ts");
const numberingAsyncRepository = readRequired("src/lib/repositories/numbering-async-repository.ts");
const numberingRepository = readRequired("src/lib/repositories/numbering-repository.ts");
const numberingAsyncFacade = readRequired("src/lib/numbering-async.ts");
const dashboardPage = readRequired("src/components/dashboard.tsx");
const submissionLifecycleRepository = readRequired("src/lib/repositories/submission-lifecycle-async-repository.ts");
const submissionLifecycleFacade = readRequired("src/lib/submission-lifecycle-async.ts");
const submissionObsoleteRoute = readRequired("src/app/api/submissions/[id]/obsolete-request/route.ts");
const submissionObsoleteApproveRoute = readRequired("src/app/api/submission-lifecycle-requests/[requestId]/approve/route.ts");
const submissionObsoleteRejectRoute = readRequired("src/app/api/submission-lifecycle-requests/[requestId]/reject/route.ts");
const obsoleteRequestRoute = readRequired("src/app/api/lifecycle/obsolete-requests/route.ts");
const approvalRequestsRoute = readRequired("src/app/api/numbering/approval-requests/route.ts");
const approvalBatchesRoute = readRequired("src/app/api/numbering/approval-batches/route.ts");
const approvalsPage = readRequired("src/app/numbering/approvals/page.tsx");
const approvalWorkbenchPage = readRequired("src/app/approvals/page.tsx");
const approvalLegacyRedirect = readRequired("src/lib/approval-workbench-legacy-redirect.ts");
const dbSchema = readRequired("db/schema.sql");
const postgresInitialSchema = readRequired("db/postgres/001_initial_schema.sql");
const globalCss = readRequired("src/app/globals.css");
const responsiveCss = readRequired("src/app/styles/responsive.css");
const packageJson = readProjectJson(root, "package.json");
const uiQcScriptPath = "scripts/qc-pdm-lifecycle-actions-ui.mjs";
const draftUiQcScriptPath = "scripts/qc-pdm-lifecycle-draft-ui.mjs";
const obsoleteQcScriptPath = "scripts/qc-pdm-lifecycle-obsolete.mjs";
const submissionObsoleteQcScriptPath = "scripts/qc-pdm-lifecycle-submission-obsolete.mjs";
const gitBoundaryQcScriptPath = "scripts/qc-pdm-lifecycle-actions-git-boundary.mjs";

for (const route of [
  "src/app/api/lifecycle/policy/route.ts",
  "src/app/api/parts/[partNumber]/attachments/[attachmentId]/restore/route.ts",
  "src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/restore/route.ts"
]) {
  assert(existsRequired(route), `Lifecycle route exists: ${route}`);
}

for (const field of ["visibleStage", "stageLabel", "uiSurface", "traceabilityClass", "detailTags", "actions"]) {
  assert(policy.includes(field), `Lifecycle policy exposes ${field}`);
}

for (const value of ["work_list", "deleted_data", "controlled_history", "working", "uncontrolled_deleted", "controlled_history"]) {
  assert(policy.includes(`"${value}"`), `Lifecycle policy includes ${value}`);
}

for (const tag of ["可還原", "不可還原"]) {
  assert(policy.includes(`"${tag}"`), `Lifecycle policy includes detail tag ${tag}`);
}

for (const code of [
  "LIFE_UNSUPPORTED_ENTITY",
  "LIFE_PERMISSION_DENIED",
  "LIFE_ATTACHMENT_NOT_FOUND",
  "LIFE_ATTACHMENT_NOT_DELETED",
  "LIFE_ATTACHMENT_DUPLICATE_ACTIVE",
  "LIFE_ATTACHMENT_PARENT_INVALID",
  "LIFE_DRAFT_ALREADY_DELETED",
  "LIFE_DRAFT_NOT_DELETED",
  "LIFE_DRAFT_CONTROLLED_BOUNDARY",
  "LIFE_DRAFT_ALREADY_RECYCLED",
  "LIFE_DRAFT_NUMBER_REUSED",
  "LIFE_FORMAL_DELETE_BLOCKED",
  "LIFE_OBSOLETE_ALREADY_REQUESTED",
  "LIFE_OBSOLETE_ALREADY_APPROVED",
  "LIFE_OBSOLETE_NOT_FORMAL",
  "LIFE_OBSOLETE_FORMAL_RECORD",
  "LIFE_OBSOLETE_CONTROLLED_HISTORY",
  "LIFE_OBSOLETE_COMPANY_MISMATCH"
]) {
  assert(
    policy.includes(code) ||
      asyncRepository.includes(code) ||
      response.includes(code) ||
      changeControlDomain.includes(code) ||
      numberingAsyncRepository.includes(code),
    `Lifecycle reason code is wired: ${code}`
  );
}

assert(policy.includes('"part_number_draft"'), "Lifecycle policy supports part-number draft entity type");
assert(policy.includes("buildPartNumberDraftLifecyclePolicy"), "Lifecycle policy exposes part-number draft policy builder");
assert(policy.includes('"submission"'), "Lifecycle policy supports submission entity type");
assert(policy.includes("buildSubmissionLifecyclePolicy"), "Lifecycle policy exposes submission lifecycle policy builder");
assert(policy.includes('"numbering_part_number"'), "Lifecycle policy supports formal part-number entity type");
assert(policy.includes('"numbering_drawing_number"'), "Lifecycle policy supports formal drawing-number entity type");
assert(policy.includes("buildNumberingFormalRecordLifecyclePolicy"), "Lifecycle policy exposes formal numbering record policy builder");
assert(policy.includes("pendingObsoleteRequest"), "Lifecycle policy exposes pending obsolete state");

assert(asyncRepository.includes("SELECT_ASYNC_DELETED_MASTER_ATTACHMENTS_SQL"), "Async repository can list deleted attachments");
assert(asyncRepository.includes("SELECT_ASYNC_MASTER_ATTACHMENT_ANY_SQL"), "Async repository can read active or deleted attachment for policy");
assert(asyncRepository.includes("UPDATE_ASYNC_MASTER_ATTACHMENT_RESTORE_SQL"), "Async repository has restore update SQL");
assert(asyncRepository.includes("deleted_at = NULL"), "Restore clears deleted_at");
assert(asyncRepository.includes("deleted_by = NULL"), "Restore clears deleted_by");
assert(asyncRepository.includes("deleted_reason = NULL"), "Restore clears deleted_reason");
assert(asyncRepository.includes("findActiveDuplicate") && asyncRepository.includes("LIFE_ATTACHMENT_DUPLICATE_ACTIVE"), "Restore blocks active duplicate conflict");
assert(asyncRepository.includes("numbering.master_attachment.restore"), "Restore writes audit event");
assert(asyncRepository.includes("conflictCheckResult"), "Restore audit records conflict check result");

for (const exportedName of [
  "listDeletedMasterAttachmentsAsync",
  "getMasterAttachmentLifecyclePolicyAsync",
  "restoreMasterAttachmentAsync"
]) {
  assert(asyncFacade.includes(`export function ${exportedName}`), `Async facade exports ${exportedName}`);
}

for (const routeSource of [partRestoreRoute, drawingRestoreRoute]) {
  assert(routeSource.includes("numbering.attachments.manage"), "Restore route enforces attachment manage permission");
  assert(routeSource.includes("restoreMasterAttachmentAsync"), "Restore route calls restore service");
  assert(routeSource.includes("getMasterAttachmentLifecyclePolicyAsync"), "Restore route returns lifecycle policy");
  assert(routeSource.includes("masterAttachmentStatusFromError"), "Restore route uses stable error mapping");
}

for (const routeSource of [partListRoute, drawingListRoute]) {
  assert(routeSource.includes('surface === "deleted_data"'), "Attachment list route exposes deleted-data surface");
  assert(routeSource.includes("listDeletedMasterAttachmentsAsync"), "Attachment list route calls deleted attachment service");
}

assert(lifecyclePolicyRoute.includes('entityType !== "master_attachment"'), "Policy route rejects unsupported entity types");
assert(lifecyclePolicyRoute.includes("requireNumberingPageAsync"), "Policy route enforces read permission");
assert(lifecyclePolicyRoute.includes("getMasterAttachmentLifecyclePolicyAsync"), "Policy route returns master attachment policy");

assert(changeControlDomain.includes("listDeletedPartNumberDrafts"), "Change-control domain can list deleted part-number drafts");
assert(changeControlDomain.includes("restorePartNumberDraft"), "Change-control domain exposes part-number draft restore");
assert(changeControlDomain.includes("draft_reissued"), "Part-number draft restore writes retained event");
assert(changeControlDomain.includes("voided_at = NULL"), "Part-number draft restore clears voided_at");
assert(changeControlDomain.includes("recycle_available_at = NULL"), "Part-number draft restore clears recycle_available_at");
assert(changeControlDomain.includes("recycled_at = NULL"), "Part-number draft restore clears recycled_at");
assert(changeControlFacade.includes("listDeletedPartNumberDrafts"), "Change-control facade exports deleted part-number draft list");
assert(changeControlFacade.includes("restorePartNumberDraft"), "Change-control facade exports part-number draft restore");
assert(changeControlFacade.includes("getPartNumberDraftLifecyclePolicy"), "Change-control facade exports part-number draft lifecycle policy");

assert(partDraftListRoute.includes('surface === "deleted_data"'), "Part-number draft list route exposes deleted-data surface");
assert(partDraftListRoute.includes("listDeletedPartNumberDrafts"), "Part-number draft list route calls deleted draft service");
assert(partDraftListRoute.includes('draft.status !== "voided"'), "Part-number draft work list hides deleted drafts by default");
assert(partDraftRestoreRoute.includes("numbering.draft.obsolete"), "Part-number draft restore route enforces draft lifecycle permission");
assert(partDraftRestoreRoute.includes("restorePartNumberDraft"), "Part-number draft restore route calls restore service");
assert(partDraftRestoreRoute.includes("getPartNumberDraftLifecyclePolicy"), "Part-number draft restore route returns lifecycle policy");

assert(dbSchema.includes("CREATE TABLE IF NOT EXISTS submission_lifecycle_requests"), "SQLite schema stores submission lifecycle requests");
assert(postgresInitialSchema.includes("CREATE TABLE IF NOT EXISTS submission_lifecycle_requests"), "Postgres schema stores submission lifecycle requests");

assert(numberingRepository.includes('"obsolete_part_number"'), "Sync numbering repository supports obsolete part-number action code");
assert(numberingRepository.includes('"obsolete_ma_drawing"'), "Sync numbering repository supports obsolete drawing action code");
assert(numberingRepository.includes("RequestNumberingObsoleteApprovalInput"), "Numbering repository exports obsolete approval request input");
assert(numberingRepository.includes("NumberingObsoleteApprovalResult"), "Numbering repository exports obsolete approval result");
assert(numberingRepository.includes("lifecycle.obsolete.approved"), "Sync approval apply writes lifecycle obsolete audit");
assert(numberingAsyncRepository.includes("requestNumberingObsoleteApproval"), "Async numbering repository exposes obsolete approval request service");
assert(numberingAsyncRepository.includes("SELECT_ASYNC_PENDING_OBSOLETE_APPROVAL_SQL"), "Async numbering repository blocks duplicate pending obsolete requests");
assert(numberingAsyncRepository.includes("UPDATE_ASYNC_APPROVAL_OBSOLETE_PART_SQL"), "Async approval apply can mark part numbers obsolete");
assert(numberingAsyncRepository.includes("UPDATE_ASYNC_MAIN_DRAWING_OBSOLETE_SQL"), "Async approval apply can mark drawing numbers obsolete");
assert(numberingAsyncRepository.includes("UPDATE_ASYNC_PART_MAIN_DRAWING_INVALID_SQL"), "Async drawing obsolete invalidates impacted primary parts");
assert(numberingAsyncRepository.includes("lifecycle.obsolete.approved"), "Async approval apply writes lifecycle obsolete audit");
assert(numberingAsyncFacade.includes("requestNumberingObsoleteApprovalAsync"), "Numbering async facade exports obsolete approval request");
assert(obsoleteRequestRoute.includes("requestNumberingObsoleteApprovalAsync"), "Lifecycle obsolete route calls obsolete approval service");
assert(obsoleteRequestRoute.includes("buildNumberingFormalRecordLifecyclePolicy"), "Lifecycle obsolete route returns formal numbering lifecycle policy");
assert(obsoleteRequestRoute.includes("requireNumberingActionAsync"), "Lifecycle obsolete route enforces action permission");
assert(obsoleteRequestRoute.includes("obsolete_part_number") && obsoleteRequestRoute.includes("obsolete_ma_drawing"), "Lifecycle obsolete route maps formal entity types to approval actions");
assert(approvalRequestsRoute.includes("obsolete_part_number") && approvalRequestsRoute.includes("obsolete_ma_drawing"), "Generic approval request route allowlists obsolete actions");
assert(approvalBatchesRoute.includes("obsolete_part_number") && approvalBatchesRoute.includes("obsolete_ma_drawing"), "Approval batch route includes obsolete actions in default review scope");
assert(
  approvalsPage.includes("redirect(buildLegacyApprovalWorkbenchRedirect") && approvalsPage.includes('"numbering_approvals"'),
  "Legacy numbering approvals route redirects to approval workbench"
);
assert(
  approvalLegacyRedirect.includes("numbering_approvals") && approvalLegacyRedirect.includes('domain: "numbering"'),
  "Legacy numbering approvals redirect preserves numbering domain filter"
);
assert(approvalWorkbenchPage.includes("<h1>審核工作台"), "Approval workbench uses broad formal review vocabulary");
assert(
  approvalWorkbenchPage.includes("numbering.obsolete_part_number") &&
    approvalWorkbenchPage.includes("料號作廢審核") &&
    approvalWorkbenchPage.includes("numbering.obsolete_ma_drawing") &&
    approvalWorkbenchPage.includes("圖號作廢審核"),
  "Approval workbench labels obsolete actions in user vocabulary"
);

assert(response.includes("LIFE_PERMISSION_DENIED") && response.includes("403"), "Response mapper handles lifecycle permission denial");
assert(response.includes("LIFE_ATTACHMENT_NOT_DELETED") && response.includes("409"), "Response mapper handles not-deleted restore conflict");
assert(response.includes("LIFE_ATTACHMENT_PARENT_INVALID") && response.includes("409"), "Response mapper handles invalid parent conflict");

assert(panel.includes("DeletedMasterAttachment"), "Attachment panel models deleted attachment rows separately");
assert(panel.includes("loadDeletedAttachments"), "Attachment panel can load deleted-data surface");
assert(panel.includes('surface=deleted_data'), "Attachment panel loads deleted-data API surface");
assert(panel.includes("restoreAttachment"), "Attachment panel exposes restore action handler");
assert(panel.includes("/restore"), "Attachment panel calls restore subresource route");
assert(panel.includes("已刪除資料"), "Attachment panel labels deleted-data surface in user vocabulary");
assert(panel.includes("歷史"), "Attachment panel shows lifecycle history stage label");
assert(panel.includes("還原附件"), "Attachment panel exposes restore label");
assert(panel.includes("restoreState?.message"), "Attachment panel shows disabled restore reason");
assert(panel.includes("policy.detailTags.map"), "Attachment panel renders lifecycle detail tags");
assert(!panel.includes("soft delete") && !panel.includes("hard delete") && !panel.includes("purge"), "Attachment panel does not expose forbidden backend delete terms");
assert(!existsRequired("src/app/numbering/part-drafts/page.tsx"), "Retired part-number draft page stays physically absent");
assert(numberStateWorkspace.includes("取消圖號申請"), "Owner workspace exposes candidate cancellation in user vocabulary");
assert(numberStateWorkspace.includes('action === "cancel"'), "Owner workspace routes cancellation through the workspace action contract");
assert(numberStateWorkspace.includes("申請已取消；編號不再繼續處理。"), "Owner workspace confirms candidate cancellation in user vocabulary");
assert(!numberStateWorkspace.includes("surface=deleted_data"), "Owner workspace does not revive the legacy deleted-data workbench");
assert(!numberStateWorkspace.includes("作廢草稿"), "Owner workspace does not use formal obsolete wording for candidate cancellation");
assert(submissionLifecycleRepository.includes("submission_lifecycle_requests"), "Submission lifecycle repository persists obsolete requests");
assert(submissionLifecycleRepository.includes("requestObsoleteReview"), "Submission lifecycle repository exposes obsolete request service");
assert(submissionLifecycleRepository.includes("approveObsoleteReview"), "Submission lifecycle repository exposes obsolete approval service");
assert(submissionLifecycleRepository.includes("rejectObsoleteReview"), "Submission lifecycle repository exposes obsolete rejection service");
assert(submissionLifecycleRepository.includes("SELECT_ASYNC_PENDING_SUBMISSION_OBSOLETE_REQUEST_SQL"), "Submission obsolete request blocks duplicate pending requests");
assert(submissionLifecycleRepository.includes("OBSOLETE_ASYNC_SUBMISSION_SQL"), "Submission obsolete approval marks submission obsolete");
assert(submissionLifecycleRepository.includes("lifecycle.obsolete.requested"), "Submission obsolete request writes lifecycle audit");
assert(submissionLifecycleRepository.includes("lifecycle.obsolete.approved"), "Submission obsolete approval writes lifecycle audit");
assert(submissionLifecycleRepository.includes("lifecycle.obsolete.rejected"), "Submission obsolete rejection writes lifecycle audit");
assert(submissionLifecycleFacade.includes("requestSubmissionObsoleteReviewAsync"), "Submission lifecycle facade exports obsolete request service");
assert(submissionLifecycleFacade.includes("approveSubmissionObsoleteReviewAsync"), "Submission lifecycle facade exports obsolete approval service");
assert(submissionLifecycleFacade.includes("rejectSubmissionObsoleteReviewAsync"), "Submission lifecycle facade exports obsolete rejection service");
assert(submissionObsoleteRoute.includes("requestSubmissionObsoleteReviewAsync"), "Submission obsolete route calls obsolete request service");
assert(submissionObsoleteRoute.includes("buildSubmissionLifecyclePolicy"), "Submission obsolete route returns lifecycle policy");
assert(submissionObsoleteApproveRoute.includes("decideApprovalPlatformLegacySubmissionAsync"), "Submission obsolete approval route calls approval platform adapter");
assert(submissionObsoleteRejectRoute.includes("decideApprovalPlatformLegacySubmissionAsync"), "Submission obsolete rejection route calls approval platform adapter");
assert(dashboardPage.includes("申請作廢"), "Dashboard exposes submission formal obsolete request label");
assert(dashboardPage.includes("核准作廢"), "Dashboard exposes submission obsolete approval label");
assert(dashboardPage.includes("退回申請"), "Dashboard exposes submission obsolete rejection label");
assert(dashboardPage.includes("已作廢"), "Dashboard labels obsolete submission as already obsolete");
assert(globalCss.includes(".master-attachment-deleted"), "CSS styles deleted-data surface");
assert(globalCss.includes(".master-attachment-status.history"), "CSS styles history badge");
assert(globalCss.includes(".master-attachment-status.restorable"), "CSS styles restorable tag");
assert(globalCss.includes(".master-attachment-status.blocked"), "CSS styles blocked restore tag");
assert(responsiveCss.includes(".master-attachment-deleted-toolbar"), "Responsive CSS handles deleted-data toolbar");
assert(packageJson.scripts["qc:pdm-lifecycle-actions"] === "node scripts/qc-pdm-lifecycle-actions.mjs", "package script qc:pdm-lifecycle-actions is registered");
assert(existsRequired(uiQcScriptPath), "Lifecycle UI fixture QC script exists");
assert(packageJson.scripts["qc:pdm-lifecycle-actions-ui"] === "node scripts/qc-pdm-lifecycle-actions-ui.mjs", "package script qc:pdm-lifecycle-actions-ui is registered");
assert(existsRequired(draftUiQcScriptPath), "Lifecycle draft UI fixture QC script exists");
assert(packageJson.scripts["qc:pdm-lifecycle-draft-ui"] === "node scripts/qc-pdm-lifecycle-draft-ui.mjs", "package script qc:pdm-lifecycle-draft-ui is registered");
assert(existsRequired(obsoleteQcScriptPath), "Lifecycle obsolete approval QC script exists");
assert(packageJson.scripts["qc:pdm-lifecycle-obsolete"] === "node scripts/qc-pdm-lifecycle-obsolete.mjs", "package script qc:pdm-lifecycle-obsolete is registered");
assert(existsRequired(submissionObsoleteQcScriptPath), "Lifecycle submission obsolete flow QC script exists");
assert(packageJson.scripts["qc:pdm-lifecycle-submission-obsolete"] === "node scripts/qc-pdm-lifecycle-submission-obsolete.mjs", "package script qc:pdm-lifecycle-submission-obsolete is registered");
assert(existsRequired(gitBoundaryQcScriptPath), "Lifecycle git-boundary QC script exists");
assert(packageJson.scripts["qc:pdm-lifecycle-actions-git-boundary"] === "node scripts/qc-pdm-lifecycle-actions-git-boundary.mjs", "package script qc:pdm-lifecycle-actions-git-boundary is registered");

console.log(`qc:pdm-lifecycle-actions passed ${checks.length}/${checks.length} checks`);
