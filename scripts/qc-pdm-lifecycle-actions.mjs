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
const bomWorkbenchRepository = readRequired("src/lib/repositories/bom-workbench-async-repository.ts");
const bomWorkbenchFacade = readRequired("src/lib/bom-workbench-async.ts");
const bomWorkbenchRoute = readRequired("src/app/api/bom/workbench/route.ts");
const bomDraftDeleteRoute = readRequired("src/app/api/bom/drafts/[draftId]/delete/route.ts");
const bomDraftRestoreRoute = readRequired("src/app/api/bom/drafts/[draftId]/restore/route.ts");
const bomDraftObsoleteRoute = readRequired("src/app/api/bom/drafts/[draftId]/obsolete-request/route.ts");
const bomWorkbenchPage = readRequired("src/app/bom/workbench/page.tsx");
const bomReviewsPage = readRequired("src/app/bom/reviews/page.tsx");
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
const bomDraftUiQcScriptPath = "scripts/qc-pdm-lifecycle-bom-draft-ui.mjs";
const obsoleteQcScriptPath = "scripts/qc-pdm-lifecycle-obsolete.mjs";
const bomObsoleteQcScriptPath = "scripts/qc-pdm-lifecycle-bom-obsolete.mjs";
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
  "LIFE_BOM_DRAFT_ALREADY_DELETED",
  "LIFE_BOM_DRAFT_NOT_DELETED",
  "LIFE_BOM_DRAFT_NOT_DELETABLE",
  "LIFE_BOM_DRAFT_IN_REVIEW",
  "LIFE_BOM_DRAFT_FORMAL",
  "LIFE_BOM_DRAFT_CONTROLLED_HISTORY",
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
      numberingAsyncRepository.includes(code) ||
      bomWorkbenchRepository.includes(code),
    `Lifecycle reason code is wired: ${code}`
  );
}

assert(policy.includes('"part_number_draft"'), "Lifecycle policy supports part-number draft entity type");
assert(policy.includes("buildPartNumberDraftLifecyclePolicy"), "Lifecycle policy exposes part-number draft policy builder");
assert(policy.includes('"bom_workbench_draft"'), "Lifecycle policy supports BOM workbench draft entity type");
assert(policy.includes("buildBomWorkbenchDraftLifecyclePolicy"), "Lifecycle policy exposes BOM workbench draft policy builder");
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

assert(bomWorkbenchRepository.includes("SELECT_ASYNC_DELETED_BOM_WORKBENCH_DRAFTS_SQL"), "BOM workbench repository can list deleted drafts");
assert(bomWorkbenchRepository.includes("status <> 'Archived'"), "BOM workbench work list hides archived drafts");
assert(bomWorkbenchRepository.includes("ARCHIVE_ASYNC_BOM_WORKBENCH_DRAFT_SQL"), "BOM workbench repository can archive draft as deleted");
assert(bomWorkbenchRepository.includes("RESTORE_ASYNC_BOM_WORKBENCH_DRAFT_SQL"), "BOM workbench repository can restore archived draft");
assert(bomWorkbenchRepository.includes("BomWorkbenchDraftDeleted"), "BOM workbench delete writes audit event");
assert(bomWorkbenchRepository.includes("BomWorkbenchDraftRestored"), "BOM workbench restore writes audit event");
assert(bomWorkbenchRepository.includes('before.status !== "Draft"'), "BOM workbench delete only allows uncontrolled Draft status");
assert(bomWorkbenchRepository.includes('before.status !== "Archived"'), "BOM workbench restore only allows archived deleted status");
assert(bomWorkbenchRepository.includes("BomWorkbenchLifecycleAction"), "BOM workbench review model has lifecycle action type");
assert(bomWorkbenchRepository.includes("requestObsoleteReview"), "BOM workbench repository exposes obsolete review request");
assert(bomWorkbenchRepository.includes("SELECT_ASYNC_BOM_WORKBENCH_EXISTING_PENDING_OBSOLETE_REVIEW_SQL"), "BOM obsolete request blocks duplicate pending reviews");
assert(bomWorkbenchRepository.includes("OBSOLETE_ASYNC_BOM_WORKBENCH_DRAFT_RELEASE_SNAPSHOTS_SQL"), "BOM obsolete approval marks release snapshots obsolete");
assert(bomWorkbenchRepository.includes("OBSOLETE_ASYNC_BOM_WORKBENCH_DRAFT_SQL"), "BOM obsolete approval marks released draft obsolete");
assert(bomWorkbenchRepository.includes("lifecycle.obsolete.requested"), "BOM obsolete request writes lifecycle audit");
assert(bomWorkbenchRepository.includes("lifecycle.obsolete.approved"), "BOM obsolete approval writes lifecycle audit");
assert(bomWorkbenchRepository.includes("lifecycle.obsolete.rejected"), "BOM obsolete rejection writes lifecycle audit");
assert(bomWorkbenchRepository.includes("approve_obsolete"), "BOM obsolete approval writes edit event");
assert(bomWorkbenchRepository.includes("reject_obsolete"), "BOM obsolete rejection writes edit event");
assert(bomWorkbenchRepository.includes('lifecycleAction: "obsolete"'), "BOM obsolete requests are inserted with obsolete lifecycle action");
assert(bomWorkbenchFacade.includes("listDeletedBomWorkbenchDraftsBySubmissionIdAsync"), "BOM workbench facade exports deleted draft list");
assert(bomWorkbenchFacade.includes("deleteBomWorkbenchDraftAsync"), "BOM workbench facade exports draft delete");
assert(bomWorkbenchFacade.includes("restoreBomWorkbenchDraftAsync"), "BOM workbench facade exports draft restore");
assert(bomWorkbenchFacade.includes("requestBomWorkbenchObsoleteReviewAsync"), "BOM workbench facade exports obsolete review request");
assert(bomWorkbenchRoute.includes('surface") === "deleted_data"'), "BOM workbench route exposes deleted-data surface");
assert(bomWorkbenchRoute.includes("listDeletedBomWorkbenchDraftsBySubmissionIdAsync"), "BOM workbench route lists deleted drafts");
assert(bomWorkbenchRoute.includes("buildBomWorkbenchDraftLifecyclePolicy"), "BOM workbench route returns lifecycle policy for deleted drafts");
assert(bomDraftDeleteRoute.includes("canReadBomDraftAsync"), "BOM draft delete route enforces BOM draft permission");
assert(bomDraftDeleteRoute.includes("deleteBomWorkbenchDraftAsync"), "BOM draft delete route calls lifecycle delete service");
assert(bomDraftRestoreRoute.includes("canReadBomDraftAsync"), "BOM draft restore route enforces BOM draft permission");
assert(bomDraftRestoreRoute.includes("restoreBomWorkbenchDraftAsync"), "BOM draft restore route calls lifecycle restore service");
assert(bomDraftObsoleteRoute.includes("canReadBomDraftAsync"), "BOM obsolete request route enforces BOM draft permission");
assert(bomDraftObsoleteRoute.includes("requestBomWorkbenchObsoleteReviewAsync"), "BOM obsolete request route calls obsolete review service");
assert(bomDraftObsoleteRoute.includes("buildBomWorkbenchDraftLifecyclePolicy"), "BOM obsolete request route returns lifecycle policy");
assert(bomDraftObsoleteRoute.includes("pendingObsoleteRequest: true"), "BOM obsolete request route returns review-stage policy after request");
assert(dbSchema.includes("lifecycle_action TEXT NOT NULL DEFAULT 'release'"), "SQLite schema stores BOM review lifecycle action");
assert(postgresInitialSchema.includes("lifecycle_action TEXT NOT NULL DEFAULT 'release'"), "Postgres initial schema stores BOM review lifecycle action");
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
assert(numberStateWorkspace.includes("取消申請並釋出保留號碼"), "Owner workspace exposes candidate cancellation in user vocabulary");
assert(numberStateWorkspace.includes('action === "cancel"'), "Owner workspace routes cancellation through the workspace action contract");
assert(numberStateWorkspace.includes("歷史保留號碼 ${candidateCode}（已釋出）"), "Owner workspace displays released candidate history");
assert(!numberStateWorkspace.includes("surface=deleted_data"), "Owner workspace does not revive the legacy deleted-data workbench");
assert(!numberStateWorkspace.includes("作廢草稿"), "Owner workspace does not use formal obsolete wording for candidate cancellation");
assert(bomWorkbenchPage.includes("DeletedBomWorkbenchDraft"), "BOM workbench page models deleted drafts separately");
assert(bomWorkbenchPage.includes("loadDeletedDrafts"), "BOM workbench page can load deleted-data surface");
assert(bomWorkbenchPage.includes("surface=deleted_data"), "BOM workbench page loads deleted-data API surface");
assert(bomWorkbenchPage.includes("deleteDraft"), "BOM workbench page exposes delete action handler");
assert(bomWorkbenchPage.includes("restoreDeletedDraft"), "BOM workbench page exposes restore action handler");
assert(bomWorkbenchPage.includes("/delete"), "BOM workbench page calls delete subresource route");
assert(bomWorkbenchPage.includes("/restore"), "BOM workbench page calls restore subresource route");
assert(!bomWorkbenchPage.includes("已刪除資料"), "BOM editor does not expose the deleted-data recovery surface");
assert(bomWorkbenchPage.includes("draftStageLabel"), "BOM workbench maps backend draft statuses to lifecycle stage labels");
assert(bomWorkbenchPage.includes("刪除"), "BOM workbench page uses delete label for working BOM drafts");
assert(bomWorkbenchPage.includes("/obsolete-request"), "BOM workbench page can request formal obsolete review");
assert(bomWorkbenchPage.includes('selectedDraft?.status === "Released"'), "BOM workbench page shows obsolete action only for released drafts");
assert(bomWorkbenchPage.includes("作廢原因"), "BOM workbench page collects obsolete reason");
assert(bomWorkbenchPage.includes("申請作廢"), "BOM workbench page uses formal obsolete action label");
assert(
  bomReviewsPage.includes("redirect(buildLegacyApprovalWorkbenchRedirect") && bomReviewsPage.includes('"bom_reviews"'),
  "Legacy BOM review page redirects to approval workbench"
);
assert(
  approvalLegacyRedirect.includes("bom_reviews") && approvalLegacyRedirect.includes('domain: "bom"'),
  "Legacy BOM review redirect preserves BOM domain filter"
);
assert(
  approvalWorkbenchPage.includes("bom.obsolete_review") && approvalWorkbenchPage.includes("BOM 作廢審核"),
  "Approval workbench labels BOM obsolete reviews"
);
assert(!bomWorkbenchPage.includes("作廢草稿"), "BOM workbench page does not expose obsolete wording for draft delete");
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
assert(existsRequired(bomDraftUiQcScriptPath), "Lifecycle BOM draft UI fixture QC script exists");
assert(packageJson.scripts["qc:pdm-lifecycle-bom-draft-ui"] === "node scripts/qc-pdm-lifecycle-bom-draft-ui.mjs", "package script qc:pdm-lifecycle-bom-draft-ui is registered");
assert(existsRequired(obsoleteQcScriptPath), "Lifecycle obsolete approval QC script exists");
assert(packageJson.scripts["qc:pdm-lifecycle-obsolete"] === "node scripts/qc-pdm-lifecycle-obsolete.mjs", "package script qc:pdm-lifecycle-obsolete is registered");
assert(existsRequired(bomObsoleteQcScriptPath), "Lifecycle BOM obsolete flow QC script exists");
assert(packageJson.scripts["qc:pdm-lifecycle-bom-obsolete"] === "node scripts/qc-pdm-lifecycle-bom-obsolete.mjs", "package script qc:pdm-lifecycle-bom-obsolete is registered");
assert(existsRequired(submissionObsoleteQcScriptPath), "Lifecycle submission obsolete flow QC script exists");
assert(packageJson.scripts["qc:pdm-lifecycle-submission-obsolete"] === "node scripts/qc-pdm-lifecycle-submission-obsolete.mjs", "package script qc:pdm-lifecycle-submission-obsolete is registered");
assert(existsRequired(gitBoundaryQcScriptPath), "Lifecycle git-boundary QC script exists");
assert(packageJson.scripts["qc:pdm-lifecycle-actions-git-boundary"] === "node scripts/qc-pdm-lifecycle-actions-git-boundary.mjs", "package script qc:pdm-lifecycle-actions-git-boundary is registered");

console.log(`qc:pdm-lifecycle-actions passed ${checks.length}/${checks.length} checks`);
