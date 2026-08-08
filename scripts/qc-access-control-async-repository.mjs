#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const sourcePath = path.join(root, "src", "lib", "repositories", "access-control-async-repository.ts");
const userSourcePath = path.join(root, "src", "lib", "repositories", "user-async-repository.ts");
const auditSourcePath = path.join(root, "src", "lib", "repositories", "audit-async-repository.ts");
const itemLockAsyncSourcePath = path.join(root, "src", "lib", "repositories", "item-lock-async-repository.ts");
const itemInsightSourcePath = path.join(root, "src", "lib", "repositories", "item-insight-async-repository.ts");
const dashboardAsyncSourcePath = path.join(root, "src", "lib", "repositories", "dashboard-async-repository.ts");
const submissionListAsyncSourcePath = path.join(root, "src", "lib", "repositories", "submission-list-async-repository.ts");
const submissionSimilarityPath = path.join(root, "src", "lib", "submission-similarity.ts");
const submissionRepositoryPath = path.join(root, "src", "lib", "repositories", "submission-repository.ts");
const submissionWriteAsyncSourcePath = path.join(root, "src", "lib", "repositories", "submission-write-async-repository.ts");
const submissionFileAsyncSourcePath = path.join(root, "src", "lib", "repositories", "submission-file-async-repository.ts");
const bomAsyncSourcePath = path.join(root, "src", "lib", "repositories", "bom-async-repository.ts");
const sandboxAsyncSourcePath = path.join(root, "src", "lib", "repositories", "sandbox-async-repository.ts");
const numberingAsyncSourcePath = path.join(root, "src", "lib", "repositories", "numbering-async-repository.ts");
const masterAttachmentAsyncSourcePath = path.join(root, "src", "lib", "repositories", "master-attachment-async-repository.ts");
const bomWorkbenchAsyncSourcePath = path.join(root, "src", "lib", "repositories", "bom-workbench-async-repository.ts");
const collaborationAsyncSourcePath = path.join(root, "src", "lib", "repositories", "collaboration-async-repository.ts");
const approvalAsyncSourcePath = path.join(root, "src", "lib", "repositories", "approval-async-repository.ts");
const submissionStatusAsyncSourcePath = path.join(root, "src", "lib", "repositories", "submission-status-async-repository.ts");
const releaseAsyncSourcePath = path.join(root, "src", "lib", "repositories", "release-async-repository.ts");
const notificationAsyncSourcePath = path.join(root, "src", "lib", "repositories", "notification-async-repository.ts");
const handoffAsyncSourcePath = path.join(root, "src", "lib", "repositories", "handoff-async-repository.ts");
const aiAsyncSourcePath = path.join(root, "src", "lib", "repositories", "ai-async-repository.ts");
const servicePath = path.join(root, "src", "lib", "numbering-permission-async.ts");
const itemLocksAsyncPath = path.join(root, "src", "lib", "item-locks-async.ts");
const itemInsightsAsyncPath = path.join(root, "src", "lib", "item-insights-async.ts");
const dashboardMetricsAsyncPath = path.join(root, "src", "lib", "dashboard-metrics-async.ts");
const submissionsAsyncPath = path.join(root, "src", "lib", "submissions-async.ts");
const submissionFilesAsyncPath = path.join(root, "src", "lib", "submission-files-async.ts");
const bomAsyncPath = path.join(root, "src", "lib", "bom-async.ts");
const sandboxAsyncPath = path.join(root, "src", "lib", "sandbox-async.ts");
const numberingAsyncPath = path.join(root, "src", "lib", "numbering-async.ts");
const masterAttachmentsAsyncPath = path.join(root, "src", "lib", "master-attachments-async.ts");
const bomWorkbenchAsyncPath = path.join(root, "src", "lib", "bom-workbench-async.ts");
const bomWorkbenchDiffPath = path.join(root, "src", "lib", "bom-workbench-diff.ts");
const numberingHardApprovalRulesPath = path.join(root, "src", "lib", "numbering-hard-approval-rules.ts");
const numberingPartCostPath = path.join(root, "src", "lib", "numbering-part-cost.ts");
const bomReleaseGateQueryBudgetPath = path.join(root, "scripts", "qc-bom-release-gate-query-budget.mjs");
const approvalPlatformAsyncSourcePath = path.join(root, "src", "lib", "repositories", "approval-platform-async-repository.ts");
const approvalInboxQueryBudgetPath = path.join(root, "scripts", "qc-approval-inbox-query-budget.mjs");
const numberingApprovalBatchesQueryBudgetPath = path.join(root, "scripts", "qc-numbering-approval-batches-query-budget.mjs");
const numberingImportBatchesQueryBudgetPath = path.join(root, "scripts", "qc-numbering-import-batches-query-budget.mjs");
const bomWorkbenchDiffQcPath = path.join(root, "scripts", "qc-bom-workbench-diff.mjs");
const numberingHardApprovalRulesQcPath = path.join(root, "scripts", "qc-numbering-hard-approval-rules.mjs");
const numberingPartCostQcPath = path.join(root, "scripts", "qc-numbering-part-cost.mjs");
const drawingWorkbenchAsyncSourcePath = path.join(root, "src", "lib", "repositories", "drawing-workbench-async-repository.ts");
const drawingWorkbenchQueryBudgetPath = path.join(root, "scripts", "qc-drawing-workbench-query-budget.mjs");
const numberStateFlowQueryBudgetPath = path.join(root, "scripts", "qc-number-state-flow-query-budget.mjs");
const numberStateFlowApprovalWriteBudgetPath = path.join(root, "scripts", "qc-number-state-flow-approval-write-budget.mjs");
const dependencyCycleBaselinePath = path.join(root, "scripts", "qc-dependency-cycle-baseline.mjs");
const duplicateFunctionBaselinePath = path.join(root, "scripts", "qc-duplicate-function-baseline.mjs");
const collaborationAsyncPath = path.join(root, "src", "lib", "collaboration-async.ts");
const approvalAsyncPath = path.join(root, "src", "lib", "approval-async.ts");
const submissionStatusAsyncPath = path.join(root, "src", "lib", "submission-status-async.ts");
const releaseRecordsAsyncPath = path.join(root, "src", "lib", "release-records-async.ts");
const releaseAsyncPath = path.join(root, "src", "lib", "release-async.ts");
const releasePackageAsyncPath = path.join(root, "src", "lib", "release-package-async.ts");
const submissionReleaseWorkflowPath = path.join(root, "src", "lib", "submission-release-workflow.ts");
const notificationsAsyncPath = path.join(root, "src", "lib", "notifications-async.ts");
const handoffAsyncPath = path.join(root, "src", "lib", "handoff-async.ts");
const aiAsyncPath = path.join(root, "src", "lib", "ai-async.ts");
const readonlyShareAsyncPath = path.join(root, "src", "lib", "readonly-share-async.ts");
const fileResponsePath = path.join(root, "src", "lib", "file-response.ts");
const authAsyncPath = path.join(root, "src", "lib", "auth-async.ts");
const auditAsyncPath = path.join(root, "src", "lib", "audit-async.ts");
const guardPath = path.join(root, "src", "lib", "numbering-permission-guard.ts");
const loginRoutePath = path.join(root, "src", "app", "api", "auth", "login", "route.ts");
const tokenRoutePath = path.join(root, "src", "app", "api", "auth", "token", "route.ts");
const meRoutePath = path.join(root, "src", "app", "api", "auth", "me", "route.ts");
const logoutRoutePath = path.join(root, "src", "app", "api", "auth", "logout", "route.ts");
const chatRoutePath = path.join(root, "src", "app", "api", "chat", "route.ts");
const fileMetadataDetectRoutePath = path.join(root, "src", "app", "api", "file-metadata", "detect", "route.ts");
const submissionsRoutePath = path.join(root, "src", "app", "api", "submissions", "route.ts");
const submissionDetailRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "route.ts");
const submissionFileRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "files", "[...filePath]", "route.ts");
const submissionPreflightLockRoutePath = path.join(root, "src", "app", "api", "submissions", "preflight-lock", "route.ts");
const submissionCheckoutRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "checkout", "route.ts");
const submissionApproveRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "approve", "route.ts");
const submissionRejectRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "reject", "route.ts");
const submissionReleasePackageRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "release-package", "route.ts");
const submissionSharesRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "shares", "route.ts");
const submissionShareRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "shares", "[shareId]", "route.ts");
const submissionSupplierResponsesRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "supplier-responses", "route.ts");
const submissionSupplierResponseRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "supplier-responses", "[responseId]", "route.ts");
const submissionAiSummaryRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "ai-summary", "route.ts");
const submissionAiRisksRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "ai-risks", "route.ts");
const submissionBomRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "bom", "route.ts");
const submissionBomDiffRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "bom", "diff", "route.ts");
const submissionBomExportRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "bom", "export", "route.ts");
const bomWorkbenchRoutePath = path.join(root, "src", "app", "api", "bom", "workbench", "route.ts");
const bomDraftFromAssemblyRoutePath = path.join(root, "src", "app", "api", "bom", "drafts", "from-assembly", "route.ts");
const bomDraftImportXlsRoutePath = path.join(root, "src", "app", "api", "bom", "drafts", "import-xls", "route.ts");
const bomDraftRoutePath = path.join(root, "src", "app", "api", "bom", "drafts", "[draftId]", "route.ts");
const bomDraftActiveRoutePath = path.join(root, "src", "app", "api", "bom", "drafts", "[draftId]", "active", "route.ts");
const bomDraftDiffRoutePath = path.join(root, "src", "app", "api", "bom", "drafts", "[draftId]", "diff", "route.ts");
const bomDraftSubmitReviewRoutePath = path.join(root, "src", "app", "api", "bom", "drafts", "[draftId]", "submit-review", "route.ts");
const bomReviewsPendingRoutePath = path.join(root, "src", "app", "api", "bom", "reviews", "pending", "route.ts");
const bomReviewApproveRoutePath = path.join(root, "src", "app", "api", "bom", "reviews", "[reviewId]", "approve", "route.ts");
const bomReviewRejectRoutePath = path.join(root, "src", "app", "api", "bom", "reviews", "[reviewId]", "reject", "route.ts");
const bomReleaseExportRoutePath = path.join(root, "src", "app", "api", "bom", "releases", "[releaseId]", "export", "route.ts");
const submissionReuseCandidatesRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "reuse-candidates", "route.ts");
const submissionDuplicateGeometryRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "duplicate-geometry", "route.ts");
const submissionRetryUploadRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "retry-upload", "route.ts");
const submissionBackgroundUploadPath = path.join(root, "src", "lib", "submission-background-upload.ts");
const drawingRevisionSubmissionsRoutePath = path.join(
  root,
  "src",
  "app",
  "api",
  "numbering",
  "drawing-revisions",
  "submissions",
  "route.ts"
);
const numberingDrawingSubmissionsRoutePath = path.join(
  root,
  "src",
  "app",
  "api",
  "numbering",
  "drawings",
  "[drawingNumber]",
  "submissions",
  "route.ts"
);
const submissionSandboxRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "sandbox", "route.ts");
const submissionSandboxBranchRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "sandbox", "[branchId]", "route.ts");
const numberingDuplicateCheckRoutePath = path.join(root, "src", "app", "api", "numbering", "duplicate-check", "route.ts");
const numberingTaskDetailRoutePath = path.join(root, "src", "app", "api", "numbering", "tasks", "[taskId]", "route.ts");
const numberingNotificationsRoutePath = path.join(root, "src", "app", "api", "numbering", "notifications", "route.ts");
const numberingNotificationReadRoutePath = path.join(root, "src", "app", "api", "numbering", "notifications", "[notificationId]", "read", "route.ts");
const numberingNotificationHandledRoutePath = path.join(
  root,
  "src",
  "app",
  "api",
  "numbering",
  "notifications",
  "[notificationId]",
  "handled",
  "route.ts"
);
const numberingExportJobsRoutePath = path.join(root, "src", "app", "api", "numbering", "export-jobs", "route.ts");
const numberingExportJobRoutePath = path.join(root, "src", "app", "api", "numbering", "export-jobs", "[jobId]", "route.ts");
const numberingMonthlyAuditReportsRoutePath = path.join(root, "src", "app", "api", "numbering", "monthly-audit-reports", "route.ts");
const numberingMonthlyAuditReportRoutePath = path.join(root, "src", "app", "api", "numbering", "monthly-audit-reports", "[reportId]", "route.ts");
const numberingDraftsOverdueRoutePath = path.join(root, "src", "app", "api", "numbering", "drafts", "overdue", "route.ts");
const numberingRootDetailRoutePath = path.join(root, "src", "app", "api", "numbering", "roots", "[rootCode]", "route.ts");
const numberingRecordsRoutePath = path.join(root, "src", "app", "api", "numbering", "records", "route.ts");
const numberingRecordDetailRoutePath = path.join(root, "src", "app", "api", "numbering", "records", "[rootCode]", "route.ts");
const numberingRecordObsoleteRoutePath = path.join(root, "src", "app", "api", "numbering", "records", "[rootCode]", "obsolete", "route.ts");
const submissionPdfMarkupsRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "pdf-markups", "route.ts");
const submissionPdfMarkupRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "pdf-markups", "[markupId]", "route.ts");
const submissionDiscussionsRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "discussions", "route.ts");
const submissionDiscussionRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "discussions", "[commentId]", "route.ts");
const submissionIssuesRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "issues", "route.ts");
const submissionIssueRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "issues", "[issueId]", "route.ts");
const submissionChangesRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "changes", "route.ts");
const submissionChangeRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "changes", "[changeId]", "route.ts");
const submissionApprovalMatrixRoutePath = path.join(root, "src", "app", "api", "submissions", "[id]", "approval-matrix", "route.ts");
const submissionApprovalMatrixRequirementRoutePath = path.join(
  root,
  "src",
  "app",
  "api",
  "submissions",
  "[id]",
  "approval-matrix",
  "[requirementId]",
  "route.ts"
);
const handoffRoutePath = path.join(root, "src", "app", "api", "handoff", "route.ts");
const handoffExportRoutePath = path.join(root, "src", "app", "api", "handoff", "export", "route.ts");
const searchApiRoutePath = path.join(root, "src", "app", "api", "search", "route.ts");
const notificationsRoutePath = path.join(root, "src", "app", "api", "notifications", "route.ts");
const itemRevisionsRoutePath = path.join(root, "src", "app", "api", "items", "[partNumber]", "revisions", "route.ts");
const itemWhereUsedRoutePath = path.join(root, "src", "app", "api", "items", "[partNumber]", "where-used", "route.ts");
const procurementReleasesRoutePath = path.join(root, "src", "app", "api", "integrations", "procurement", "releases", "route.ts");
const procurementSyncRunsRoutePath = path.join(root, "src", "app", "api", "integrations", "procurement", "sync-runs", "route.ts");
const procurementSyncRunRoutePath = path.join(root, "src", "app", "api", "integrations", "procurement", "sync-runs", "[runId]", "route.ts");
const publicShareRoutePath = path.join(root, "src", "app", "api", "public", "shares", "[token]", "route.ts");
const publicSharePackageRoutePath = path.join(root, "src", "app", "api", "public", "shares", "[token]", "package", "route.ts");
const publicShareResponsesRoutePath = path.join(root, "src", "app", "api", "public", "shares", "[token]", "responses", "route.ts");
const routePath = path.join(root, "src", "app", "api", "numbering", "permissions", "route.ts");
const searchRoutePath = path.join(root, "src", "app", "api", "numbering", "search", "route.ts");
const numberingTasksRoutePath = path.join(root, "src", "app", "api", "numbering", "tasks", "route.ts");
const numberingApprovalBatchesRoutePath = path.join(root, "src", "app", "api", "numbering", "approval-batches", "route.ts");
const numberingApprovalBatchDetailRoutePath = path.join(root, "src", "app", "api", "numbering", "approval-batches", "[batchId]", "route.ts");
const numberingApprovalDecisionsRoutePath = path.join(root, "src", "app", "api", "numbering", "approval-decisions", "route.ts");
const numberingApprovalRequestsRoutePath = path.join(root, "src", "app", "api", "numbering", "approval-requests", "route.ts");
const numberingImportBatchesRoutePath = path.join(root, "src", "app", "api", "numbering", "import-batches", "route.ts");
const numberingImportBatchRoutePath = path.join(root, "src", "app", "api", "numbering", "import-batches", "[batchId]", "route.ts");
const numberingImportBatchConfirmRoutePath = path.join(
  root,
  "src",
  "app",
  "api",
  "numbering",
  "import-batches",
  "[batchId]",
  "confirm",
  "route.ts"
);
const numberingAdminMatrixRoutePath = path.join(root, "src", "app", "api", "numbering", "admin", "matrix", "route.ts");
const numberingImpactAnalysisRoutePath = path.join(root, "src", "app", "api", "numbering", "impact-analysis", "route.ts");
const numberingRuleSimulatorRoutePath = path.join(root, "src", "app", "api", "numbering", "rule-simulator", "route.ts");
const numberingVariantsRoutePath = path.join(root, "src", "app", "api", "numbering", "variants", "route.ts");
const readOnlyRouteChecks = [
  {
    label: "numbering/search/route.ts",
    path: searchRoutePath,
    permissionCode: "numbering.search"
  },
  {
    label: "numbering/tasks/route.ts",
    path: path.join(root, "src", "app", "api", "numbering", "tasks", "route.ts"),
    permissionCode: "numbering.tasks"
  },
  {
    label: "numbering/notifications/route.ts",
    path: path.join(root, "src", "app", "api", "numbering", "notifications", "route.ts"),
    permissionCode: "numbering.tasks"
  },
  {
    label: "parts/route.ts",
    path: path.join(root, "src", "app", "api", "parts", "route.ts"),
    permissionCode: "numbering.search"
  },
  {
    label: "numbering/drawings/route.ts",
    path: path.join(root, "src", "app", "api", "numbering", "drawings", "route.ts"),
    permissionCode: "numbering.drawings.view"
  }
];

function listRouteFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listRouteFiles(entryPath);
    return entry.isFile() && entry.name === "route.ts" ? [entryPath] : [];
  });
}

function readProjectPath(filePath) {
  return readProjectFile(root, path.relative(root, filePath).replaceAll(path.sep, "/"));
}

const source = readProjectPath(sourcePath);
const userSource = readProjectPath(userSourcePath);
const auditSource = readProjectPath(auditSourcePath);
const itemLockAsyncSource = readProjectPath(itemLockAsyncSourcePath);
const itemInsightSource = readProjectPath(itemInsightSourcePath);
const dashboardAsyncSource = readProjectPath(dashboardAsyncSourcePath);
const submissionListAsyncSource = readProjectPath(submissionListAsyncSourcePath);
const submissionSimilaritySource = readProjectPath(submissionSimilarityPath);
const submissionRepositorySource = readProjectPath(submissionRepositoryPath);
const submissionWriteAsyncSource = readProjectPath(submissionWriteAsyncSourcePath);
const submissionFileAsyncSource = readProjectPath(submissionFileAsyncSourcePath);
const bomAsyncSource = readProjectPath(bomAsyncSourcePath);
const sandboxAsyncSource = readProjectPath(sandboxAsyncSourcePath);
const numberingAsyncSource = readProjectPath(numberingAsyncSourcePath);
const masterAttachmentAsyncSource = readProjectPath(masterAttachmentAsyncSourcePath);
const bomWorkbenchAsyncSource = readProjectPath(bomWorkbenchAsyncSourcePath);
const bomWorkbenchReleaseGateSource = bomWorkbenchAsyncSource.match(/private async evaluateReleaseGate[\s\S]*?(?=\n  private normalizeWorkbenchTreeLines)/)?.[0] ?? "";
const collaborationAsyncSource = readProjectPath(collaborationAsyncSourcePath);
const approvalAsyncSource = readProjectPath(approvalAsyncSourcePath);
const submissionStatusAsyncSource = readProjectPath(submissionStatusAsyncSourcePath);
const releaseAsyncSource = readProjectPath(releaseAsyncSourcePath);
const notificationAsyncSource = readProjectPath(notificationAsyncSourcePath);
const handoffAsyncSource = readProjectPath(handoffAsyncSourcePath);
const aiAsyncSource = readProjectPath(aiAsyncSourcePath);
const serviceSource = readProjectPath(servicePath);
const itemLocksAsyncSource = readProjectPath(itemLocksAsyncPath);
const itemInsightsAsyncSource = readProjectPath(itemInsightsAsyncPath);
const dashboardMetricsAsyncSource = readProjectPath(dashboardMetricsAsyncPath);
const submissionsAsyncSource = readProjectPath(submissionsAsyncPath);
const submissionFilesAsyncSource = readProjectPath(submissionFilesAsyncPath);
const bomAsyncHelperSource = readProjectPath(bomAsyncPath);
const sandboxAsyncHelperSource = readProjectPath(sandboxAsyncPath);
const numberingAsyncHelperSource = readProjectPath(numberingAsyncPath);
const masterAttachmentsAsyncHelperSource = readProjectPath(masterAttachmentsAsyncPath);
const bomWorkbenchAsyncHelperSource = readProjectPath(bomWorkbenchAsyncPath);
const bomWorkbenchDiffSource = readProjectPath(bomWorkbenchDiffPath);
const numberingHardApprovalRulesSource = readProjectPath(numberingHardApprovalRulesPath);
const numberingPartCostSource = readProjectPath(numberingPartCostPath);
const bomReleaseGateQueryBudgetSource = readProjectPath(bomReleaseGateQueryBudgetPath);
const approvalPlatformAsyncSource = readProjectPath(approvalPlatformAsyncSourcePath);
const approvalInboxQueryBudgetSource = readProjectPath(approvalInboxQueryBudgetPath);
const numberingApprovalBatchesQueryBudgetSource = readProjectPath(numberingApprovalBatchesQueryBudgetPath);
const numberingImportBatchesQueryBudgetSource = readProjectPath(numberingImportBatchesQueryBudgetPath);
const bomWorkbenchDiffQcSource = readProjectPath(bomWorkbenchDiffQcPath);
const numberingHardApprovalRulesQcSource = readProjectPath(numberingHardApprovalRulesQcPath);
const numberingPartCostQcSource = readProjectPath(numberingPartCostQcPath);
const drawingWorkbenchAsyncSource = readProjectPath(drawingWorkbenchAsyncSourcePath);
const drawingWorkbenchQueryBudgetSource = readProjectPath(drawingWorkbenchQueryBudgetPath);
const numberStateFlowQueryBudgetSource = readProjectPath(numberStateFlowQueryBudgetPath);
const numberStateFlowApprovalWriteBudgetSource = readProjectPath(numberStateFlowApprovalWriteBudgetPath);
const dependencyCycleBaselineSource = readProjectPath(dependencyCycleBaselinePath);
const duplicateFunctionBaselineSource = readProjectPath(duplicateFunctionBaselinePath);
const drawingWorkbenchOverlaySource = drawingWorkbenchAsyncSource.match(/private async overlayLifecycle[\s\S]*?(?=\n  }\n})/)?.[0] ?? "";
const approvalInboxSourceBlock = approvalPlatformAsyncSource.match(/private async listNativeInbox[\s\S]*?(?=\n  private statusWhereClause)/)?.[0] ?? "";
const collaborationAsyncHelperSource = readProjectPath(collaborationAsyncPath);
const approvalAsyncHelperSource = readProjectPath(approvalAsyncPath);
const submissionStatusAsyncHelperSource = readProjectPath(submissionStatusAsyncPath);
const releaseRecordsAsyncHelperSource = readProjectPath(releaseRecordsAsyncPath);
const releaseServiceAsyncSource = readProjectPath(releaseAsyncPath);
const releasePackageAsyncSource = readProjectPath(releasePackageAsyncPath);
const submissionReleaseWorkflowSource = readProjectPath(submissionReleaseWorkflowPath);
const notificationsAsyncSource = readProjectPath(notificationsAsyncPath);
const handoffAsyncHelperSource = readProjectPath(handoffAsyncPath);
const aiAsyncHelperSource = readProjectPath(aiAsyncPath);
const readonlyShareAsyncSource = readProjectPath(readonlyShareAsyncPath);
const fileResponseSource = readProjectPath(fileResponsePath);
const authAsyncSource = readProjectPath(authAsyncPath);
const auditAsyncSource = readProjectPath(auditAsyncPath);
const guardSource = readProjectPath(guardPath);
const loginRouteSource = readProjectPath(loginRoutePath);
const tokenRouteSource = readProjectPath(tokenRoutePath);
const meRouteSource = readProjectPath(meRoutePath);
const logoutRouteSource = readProjectPath(logoutRoutePath);
const chatRouteSource = readProjectPath(chatRoutePath);
const fileMetadataDetectRouteSource = readProjectPath(fileMetadataDetectRoutePath);
const submissionsRouteSource = readProjectPath(submissionsRoutePath);
const submissionDetailRouteSource = readProjectPath(submissionDetailRoutePath);
const submissionFileRouteSource = readProjectPath(submissionFileRoutePath);
const submissionPreflightLockRouteSource = readProjectPath(submissionPreflightLockRoutePath);
const submissionCheckoutRouteSource = readProjectPath(submissionCheckoutRoutePath);
const submissionApproveRouteSource = readProjectPath(submissionApproveRoutePath);
const submissionRejectRouteSource = readProjectPath(submissionRejectRoutePath);
const submissionReleasePackageRouteSource = readProjectPath(submissionReleasePackageRoutePath);
const submissionSharesRouteSource = readProjectPath(submissionSharesRoutePath);
const submissionShareRouteSource = readProjectPath(submissionShareRoutePath);
const submissionSupplierResponsesRouteSource = readProjectPath(submissionSupplierResponsesRoutePath);
const submissionSupplierResponseRouteSource = readProjectPath(submissionSupplierResponseRoutePath);
const submissionAiSummaryRouteSource = readProjectPath(submissionAiSummaryRoutePath);
const submissionAiRisksRouteSource = readProjectPath(submissionAiRisksRoutePath);
const submissionBomRouteSource = readProjectPath(submissionBomRoutePath);
const submissionBomDiffRouteSource = readProjectPath(submissionBomDiffRoutePath);
const submissionBomExportRouteSource = readProjectPath(submissionBomExportRoutePath);
const bomWorkbenchRouteSource = readProjectPath(bomWorkbenchRoutePath);
const bomDraftFromAssemblyRouteSource = readProjectPath(bomDraftFromAssemblyRoutePath);
const bomDraftImportXlsRouteSource = readProjectPath(bomDraftImportXlsRoutePath);
const bomDraftRouteSource = readProjectPath(bomDraftRoutePath);
const bomDraftActiveRouteSource = readProjectPath(bomDraftActiveRoutePath);
const bomDraftDiffRouteSource = readProjectPath(bomDraftDiffRoutePath);
const bomDraftSubmitReviewRouteSource = readProjectPath(bomDraftSubmitReviewRoutePath);
const bomReviewsPendingRouteSource = readProjectPath(bomReviewsPendingRoutePath);
const bomReviewApproveRouteSource = readProjectPath(bomReviewApproveRoutePath);
const bomReviewRejectRouteSource = readProjectPath(bomReviewRejectRoutePath);
const bomReleaseExportRouteSource = readProjectPath(bomReleaseExportRoutePath);
const submissionReuseCandidatesRouteSource = readProjectPath(submissionReuseCandidatesRoutePath);
const submissionDuplicateGeometryRouteSource = readProjectPath(submissionDuplicateGeometryRoutePath);
const submissionRetryUploadRouteSource = readProjectPath(submissionRetryUploadRoutePath);
const submissionBackgroundUploadSource = readProjectPath(submissionBackgroundUploadPath);
const drawingRevisionSubmissionsRouteSource = readProjectPath(drawingRevisionSubmissionsRoutePath);
const numberingDrawingSubmissionsRouteSource = readProjectPath(numberingDrawingSubmissionsRoutePath);
const submissionSandboxRouteSource = readProjectPath(submissionSandboxRoutePath);
const submissionSandboxBranchRouteSource = readProjectPath(submissionSandboxBranchRoutePath);
const numberingDuplicateCheckRouteSource = readProjectPath(numberingDuplicateCheckRoutePath);
const numberingTaskDetailRouteSource = readProjectPath(numberingTaskDetailRoutePath);
const numberingNotificationsRouteSource = readProjectPath(numberingNotificationsRoutePath);
const numberingNotificationReadRouteSource = readProjectPath(numberingNotificationReadRoutePath);
const numberingNotificationHandledRouteSource = readProjectPath(numberingNotificationHandledRoutePath);
const numberingExportJobsRouteSource = readProjectPath(numberingExportJobsRoutePath);
const numberingExportJobRouteSource = readProjectPath(numberingExportJobRoutePath);
const numberingMonthlyAuditReportsRouteSource = readProjectPath(numberingMonthlyAuditReportsRoutePath);
const numberingMonthlyAuditReportRouteSource = readProjectPath(numberingMonthlyAuditReportRoutePath);
const numberingDraftsOverdueRouteSource = readProjectPath(numberingDraftsOverdueRoutePath);
const numberingRootDetailRouteSource = readProjectPath(numberingRootDetailRoutePath);
const numberingRecordsRouteSource = readProjectPath(numberingRecordsRoutePath);
const numberingRecordDetailRouteSource = readProjectPath(numberingRecordDetailRoutePath);
const numberingRecordObsoleteRouteSource = readProjectPath(numberingRecordObsoleteRoutePath);
const numberingSearchRouteSource = readProjectPath(searchRoutePath);
const numberingDrawingsRouteSource = readProjectPath(path.join(root, "src", "app", "api", "numbering", "drawings", "route.ts"));
const partsRouteSource = readProjectPath(path.join(root, "src", "app", "api", "parts", "route.ts"));
const partsDetailRouteSource = readProjectPath(path.join(root, "src", "app", "api", "parts", "[partNumber]", "route.ts"));
const partsVariantRouteSource = readProjectPath(path.join(root, "src", "app", "api", "parts", "[partNumber]", "variant", "route.ts"));
const partsCostProfilesRouteSource = readProjectPath(path.join(root, "src", "app", "api", "parts", "[partNumber]", "cost-profiles", "route.ts"));
const partsCostChangeRequestRouteSource = readProjectPath(
  path.join(root, "src", "app", "api", "parts", "[partNumber]", "cost-change-requests", "[requestId]", "route.ts"),
);
const partsCostResolutionRouteSource = readProjectPath(path.join(root, "src", "app", "api", "parts", "[partNumber]", "cost-resolution", "route.ts"));
const partsAttachmentsRouteSource = readProjectPath(path.join(root, "src", "app", "api", "parts", "[partNumber]", "attachments", "route.ts"));
const partsAttachmentDetailRouteSource = readProjectPath(
  path.join(root, "src", "app", "api", "parts", "[partNumber]", "attachments", "[attachmentId]", "route.ts"),
);
const drawingAttachmentsRouteSource = readProjectPath(
  path.join(root, "src", "app", "api", "numbering", "drawings", "[drawingNumber]", "attachments", "route.ts"),
);
const drawingAttachmentDetailRouteSource = readProjectPath(
  path.join(root, "src", "app", "api", "numbering", "drawings", "[drawingNumber]", "attachments", "[attachmentId]", "route.ts"),
);
const submissionPdfMarkupsRouteSource = readProjectPath(submissionPdfMarkupsRoutePath);
const submissionPdfMarkupRouteSource = readProjectPath(submissionPdfMarkupRoutePath);
const submissionDiscussionsRouteSource = readProjectPath(submissionDiscussionsRoutePath);
const submissionDiscussionRouteSource = readProjectPath(submissionDiscussionRoutePath);
const submissionIssuesRouteSource = readProjectPath(submissionIssuesRoutePath);
const submissionIssueRouteSource = readProjectPath(submissionIssueRoutePath);
const submissionChangesRouteSource = readProjectPath(submissionChangesRoutePath);
const submissionChangeRouteSource = readProjectPath(submissionChangeRoutePath);
const submissionApprovalMatrixRouteSource = readProjectPath(submissionApprovalMatrixRoutePath);
const submissionApprovalMatrixRequirementRouteSource = readProjectPath(submissionApprovalMatrixRequirementRoutePath);
const handoffRouteSource = readProjectPath(handoffRoutePath);
const handoffExportRouteSource = readProjectPath(handoffExportRoutePath);
const searchApiRouteSource = readProjectPath(searchApiRoutePath);
const notificationsRouteSource = readProjectPath(notificationsRoutePath);
const itemRevisionsRouteSource = readProjectPath(itemRevisionsRoutePath);
const itemWhereUsedRouteSource = readProjectPath(itemWhereUsedRoutePath);
const procurementReleasesRouteSource = readProjectPath(procurementReleasesRoutePath);
const procurementSyncRunsRouteSource = readProjectPath(procurementSyncRunsRoutePath);
const procurementSyncRunRouteSource = readProjectPath(procurementSyncRunRoutePath);
const publicShareRouteSource = readProjectPath(publicShareRoutePath);
const publicSharePackageRouteSource = readProjectPath(publicSharePackageRoutePath);
const publicShareResponsesRouteSource = readProjectPath(publicShareResponsesRoutePath);
const routeSource = readProjectPath(routePath);
const numberingTasksRouteSource = readProjectPath(numberingTasksRoutePath);
const numberingApprovalBatchesRouteSource = readProjectPath(numberingApprovalBatchesRoutePath);
const numberingApprovalBatchDetailRouteSource = readProjectPath(numberingApprovalBatchDetailRoutePath);
const numberingApprovalDecisionsRouteSource = readProjectPath(numberingApprovalDecisionsRoutePath);
const numberingApprovalRequestsRouteSource = readProjectPath(numberingApprovalRequestsRoutePath);
const numberingImportBatchesRouteSource = readProjectPath(numberingImportBatchesRoutePath);
const numberingImportBatchRouteSource = readProjectPath(numberingImportBatchRoutePath);
const numberingImportBatchConfirmRouteSource = readProjectPath(numberingImportBatchConfirmRoutePath);
const numberingAdminMatrixRouteSource = readProjectPath(numberingAdminMatrixRoutePath);
const numberingImpactAnalysisRouteSource = readProjectPath(numberingImpactAnalysisRoutePath);
const numberingRuleSimulatorRouteSource = readProjectPath(numberingRuleSimulatorRoutePath);
const numberingVariantsRouteSource = readProjectPath(numberingVariantsRoutePath);
const readOnlyRouteSources = readOnlyRouteChecks.map((route) => ({
  ...route,
  source: readProjectPath(route.path)
}));
const numberingApiRouteSources = listRouteFiles(path.join(root, "src", "app", "api", "numbering")).map((routePath) => ({
  label: path.relative(root, routePath),
  source: readProjectPath(routePath)
}));
const partsApiRouteSources = listRouteFiles(path.join(root, "src", "app", "api", "parts")).map((routePath) => ({
  label: path.relative(root, routePath),
  source: readProjectPath(routePath)
}));
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function extractSqlConstant(name, sourceText = source) {
  const stringMatch = sourceText.match(new RegExp(`export const ${name} = "([^"]+)"`, "u"));
  if (stringMatch) return stringMatch[1];
  const templateMatch = sourceText.match(new RegExp(`export const ${name} = ` + "`" + `([\\s\\S]*?)` + "`", "u"));
  return templateMatch?.[1] ?? "";
}

record("ACCESS-ASYNC-001 repository imports AsyncDatabaseClient", source.includes("AsyncDatabaseClient"), "access-control-async-repository.ts");
record("ACCESS-ASYNC-002 repository avoids sync getDb", !source.includes("getDb("), "access-control-async-repository.ts");
record("ACCESS-ASYNC-003 repository avoids better-sqlite3 import", !source.includes("better-sqlite3"), "access-control-async-repository.ts");
record("ACCESS-ASYNC-004 repository defines async class", source.includes("export class AsyncAccessControlRepository"), "access-control-async-repository.ts");
record(
  "ACCESS-ASYNC-005 repository exposes portable SQL constants",
  [
    "SELECT_ACCESS_CONTROL_ROLES_SQL",
    "SELECT_ACCESS_CONTROL_USERS_SQL",
    "SELECT_ACCESS_CONTROL_ROLE_BY_CODE_SQL",
    "SELECT_ACCESS_CONTROL_ROLE_PERMISSION_SQL",
    "SELECT_ACCESS_CONTROL_ROLE_PERMISSIONS_SQL",
    "SELECT_ACCESS_CONTROL_ASSIGNED_ROLE_CODES_SQL",
    "SELECT_ACCESS_CONTROL_ACTIVE_ROLE_PRIORITY_SQL",
    "SELECT_ACCESS_CONTROL_ACTIVE_DELEGATIONS_SQL",
    "SELECT_ACCESS_CONTROL_ENABLED_ROLES_SQL",
    "SELECT_ACCESS_CONTROL_PERMISSIONS_BY_CODE_SQL",
    "UPSERT_ACCESS_CONTROL_ROLE_PERMISSION_SQL"
  ].every((name) => source.includes(name)),
  "access-control-async-repository.ts"
);

const listRolesSql = extractSqlConstant("SELECT_ACCESS_CONTROL_ROLES_SQL");
const listUsersSql = extractSqlConstant("SELECT_ACCESS_CONTROL_USERS_SQL");
const selectRoleSql = extractSqlConstant("SELECT_ACCESS_CONTROL_ROLE_BY_CODE_SQL");
const selectPermissionSql = extractSqlConstant("SELECT_ACCESS_CONTROL_ROLE_PERMISSION_SQL");
const listPermissionsSql = extractSqlConstant("SELECT_ACCESS_CONTROL_ROLE_PERMISSIONS_SQL");
const assignedRolesSql = extractSqlConstant("SELECT_ACCESS_CONTROL_ASSIGNED_ROLE_CODES_SQL");
const activeRolePrioritySql = extractSqlConstant("SELECT_ACCESS_CONTROL_ACTIVE_ROLE_PRIORITY_SQL");
const activeDelegationsSql = extractSqlConstant("SELECT_ACCESS_CONTROL_ACTIVE_DELEGATIONS_SQL");
const enabledRolesSql = extractSqlConstant("SELECT_ACCESS_CONTROL_ENABLED_ROLES_SQL");
const permissionsByCodeSql = extractSqlConstant("SELECT_ACCESS_CONTROL_PERMISSIONS_BY_CODE_SQL");
const upsertPermissionSql = extractSqlConstant("UPSERT_ACCESS_CONTROL_ROLE_PERMISSION_SQL");

record(
  "ACCESS-ASYNC-006 extracted role/user/permission SQL",
  Boolean(
    listRolesSql &&
      listUsersSql &&
      selectRoleSql &&
      selectPermissionSql &&
      listPermissionsSql &&
      assignedRolesSql &&
      activeRolePrioritySql &&
      activeDelegationsSql &&
      enabledRolesSql &&
      permissionsByCodeSql &&
      upsertPermissionSql
  ),
  "access-control-async-repository.ts"
);
record(
  "ACCESS-ASYNC-007 permission SQL uses named params",
  [":roleCode", ":permissionKind", ":permissionCode"].every((param) => selectPermissionSql.includes(param)) &&
    [":id", ":roleId", ":allowed", ":now"].every((param) => upsertPermissionSql.includes(param)),
  upsertPermissionSql
);
record(
  "ACCESS-ASYNC-008 permission upsert uses portable conflict target",
  upsertPermissionSql.includes("ON CONFLICT(role_id, permission_kind, permission_code) DO UPDATE"),
  upsertPermissionSql
);
record(
  "ACCESS-ASYNC-009 repository keeps role missing fail-closed",
  source.includes("ACCESS_CONTROL_ROLE_NOT_FOUND") && source.includes("ACCESS_CONTROL_ROLE_PERMISSION_UPSERT_FAILED"),
  "access-control-async-repository.ts"
);
record(
  "ACCESS-ASYNC-010 repository exposes async permission check",
  source.includes("async checkPermission(input: AccessControlPermissionCheckInput)") &&
    source.includes("delegationMatchesPermissionScope") &&
    source.includes("system_admin_default"),
  "access-control-async-repository.ts"
);
record(
  "ACCESS-ASYNC-011 service uses runtime async provider selector",
  serviceSource.includes("getAsyncDatabaseClient") &&
    serviceSource.includes("AsyncAccessControlRepository") &&
    serviceSource.includes("checkNumberingPermissionAsync") &&
    !serviceSource.includes("SQLiteAsyncDatabaseClient") &&
    !serviceSource.includes("getDb("),
  "numbering-permission-async.ts"
);
record(
  "ACCESS-ASYNC-012 permissions route uses async auth and permission service",
  routeSource.includes("requireAuthAsync") &&
    routeSource.includes("await requireAuthAsync(request)") &&
  routeSource.includes("checkNumberingPermissionAsync") &&
    !routeSource.includes("checkNumberingPermission({") &&
    !routeSource.includes("requireAuth(request") &&
    !routeSource.includes('from "@/lib/auth"') &&
    routeSource.includes("await Promise.all"),
  "permissions/route.ts"
);
record(
  "ACCESS-ASYNC-013 guard exposes async page/action helpers without removing sync guard",
  guardSource.includes("export async function requireNumberingPermissionAsync") &&
    guardSource.includes("export function requireNumberingPageAsync") &&
    guardSource.includes("export function requireNumberingActionAsync") &&
    guardSource.includes("export function canUserUseNumberingActionAsync") &&
    guardSource.includes("export function requireNumberingPermission(") &&
    guardSource.includes("checkNumberingPermissionAsync"),
  "numbering-permission-guard.ts"
);
record(
  "ACCESS-ASYNC-014 read-only routes use async page guard",
  readOnlyRouteSources.every(
    (route) =>
      route.source.includes("requireNumberingPageAsync") &&
      route.source.includes(`await requireNumberingPageAsync(request, "${route.permissionCode}")`) &&
      !route.source.includes("requireNumberingPage(request")
  ),
  readOnlyRouteSources
    .map((route) => `${route.label}:${route.source.includes("requireNumberingPageAsync") ? "async" : "sync"}`)
    .join(", ")
);
record(
  "AUTH-ASYNC-001 user repository imports AsyncDatabaseClient and avoids sync DB",
  userSource.includes("AsyncDatabaseClient") && !userSource.includes("getDb(") && !userSource.includes("better-sqlite3"),
  "user-async-repository.ts"
);
record(
  "AUTH-ASYNC-002 user repository exposes portable SQL constants",
  [
    "SELECT_ASYNC_USER_BY_ID_SQL",
    "SELECT_ASYNC_USER_BY_EMAIL_SQL",
    "SELECT_ASYNC_USER_BY_EMAIL_WITH_PASSWORD_SQL",
    "UPSERT_ASYNC_USER_SQL",
    "INSERT_ASYNC_USER_SQL",
    "UPDATE_ASYNC_USER_PASSWORD_SQL"
  ].every((name) => userSource.includes(name)),
  "user-async-repository.ts"
);
record(
  "AUTH-ASYNC-003 auth async parses session and uses async user repository",
  authAsyncSource.includes("getSessionUserId") &&
    authAsyncSource.includes("getSessionUserAsync") &&
    authAsyncSource.includes("requireAuthAsync") &&
    authAsyncSource.includes("export type AsyncAuthResult") &&
    authAsyncSource.includes("export type AsyncRoleResult") &&
    authAsyncSource.includes("AsyncUserRepository") &&
    authAsyncSource.includes("getAsyncDatabaseClient") &&
    !authAsyncSource.includes("SQLiteAsyncDatabaseClient") &&
    !authAsyncSource.includes("getDb(") &&
    !authAsyncSource.includes("import { getUserById") &&
    !authAsyncSource.includes("import { getUserById,"),
  "auth-async.ts"
);
record(
  "AUTH-ASYNC-004 async permission guard uses async auth",
  guardSource.includes("requireAuthAsync") &&
    guardSource.includes("const auth = await requireAuthAsync(request)") &&
    guardSource.includes("const auth = requireAuth(request)"),
  "numbering-permission-guard.ts"
);
record(
  "AUTH-ASYNC-005 auth async resolves local-password identities through the async identity repository",
  authAsyncSource.includes("export async function getLocalPasswordIdentityAsync") &&
    authAsyncSource.includes("new AsyncAuthIdentityRepository(client).resolveLocalPassword(email)") &&
    authAsyncSource.includes("export async function getUserByEmailWithPasswordAsync") &&
    authAsyncSource.includes("await getLocalPasswordIdentityAsync(email)"),
  "auth-async.ts"
);
record(
  "AUTH-ASYNC-006 login and token routes use async identity lookup and record successful identity login",
  [loginRouteSource, tokenRouteSource].every(
    (routeSource) =>
      routeSource.includes("getLocalPasswordIdentityAsync") &&
      routeSource.includes("await getLocalPasswordIdentityAsync(email)") &&
      routeSource.includes("recordIdentityLoginAsync") &&
      routeSource.includes("await recordIdentityLoginAsync(identity.identityId, user.email)") &&
      !routeSource.includes("getUserByEmailWithPassword }") &&
      !routeSource.includes("getUserByEmailWithPassword,")
  ),
  "auth/login route.ts, auth/token route.ts"
);
record(
  "AUTH-ASYNC-007 auth async exposes async user write helpers",
  authAsyncSource.includes("export async function ensureDemoUserAsync") &&
    authAsyncSource.includes("export async function createUserAsync") &&
    authAsyncSource.includes("export async function updateUserPasswordAsync") &&
    authAsyncSource.includes("repository.upsertUser") &&
    authAsyncSource.includes("repository.createUser") &&
    authAsyncSource.includes("repository.updateUserPassword"),
  "auth-async.ts"
);
record(
  "AUTH-ASYNC-008 login and token routes use async demo user seed",
  [loginRouteSource, tokenRouteSource].every(
    (routeSource) =>
      routeSource.includes("ensureDemoUserAsync") &&
      routeSource.includes("await ensureDemoUserAsync") &&
      !routeSource.includes("ensureDemoUser,") &&
      !routeSource.includes("ensureDemoUser }")
  ),
  "auth/login route.ts, auth/token route.ts"
);
record(
  "AUTH-ASYNC-009 auth routes read mode without sync DB aggregate import",
  [loginRouteSource, tokenRouteSource].every(
    (routeSource) =>
      routeSource.includes('getAuthMode } from "@/lib/auth-config"') &&
      !routeSource.includes('from "@/lib/db"')
  ),
  "auth/login route.ts, auth/token route.ts"
);
record(
  "AUTH-ASYNC-010 auth me route uses async session lookup",
  ((meRouteSource.includes("getSessionUserAsync") &&
    meRouteSource.includes("await getSessionUserAsync(request)")) ||
    (meRouteSource.includes("requireAuthAsync") &&
      meRouteSource.includes("await requireAuthAsync(request)"))) &&
    !meRouteSource.includes("getSessionUser(request)") &&
    !meRouteSource.includes('from "@/lib/db"'),
  "auth/me route.ts"
);
record(
  "AUTH-ASYNC-011 auth logout route uses async session and audit",
  logoutRouteSource.includes("getSessionUserAsync") &&
    logoutRouteSource.includes("await getSessionUserAsync(request)") &&
    logoutRouteSource.includes("createAuditLogAsync") &&
    logoutRouteSource.includes("await createAuditLogAsync") &&
    !logoutRouteSource.includes("getSessionUser(request)") &&
    !logoutRouteSource.includes("createAuditLog(") &&
    !logoutRouteSource.includes('from "@/lib/db"'),
  "auth/logout route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-001 file metadata detect route uses async role guard",
  fileMetadataDetectRouteSource.includes("requireRoleAsync") &&
    fileMetadataDetectRouteSource.includes('await requireRoleAsync(request, ["Engineer", "Admin"])') &&
    !fileMetadataDetectRouteSource.includes("requireRole(request") &&
    !fileMetadataDetectRouteSource.includes('from "@/lib/auth"') &&
    !fileMetadataDetectRouteSource.includes('from "@/lib/db"'),
  "file-metadata/detect route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-002 handoff routes use async auth guard",
  [handoffRouteSource, handoffExportRouteSource].every(
    (routeSource) =>
      routeSource.includes("requireAuthAsync") &&
      routeSource.includes("await requireAuthAsync(request)") &&
      !routeSource.includes("requireAuth(request") &&
      !routeSource.includes('from "@/lib/auth"')
  ),
  "handoff route.ts, handoff/export route.ts"
);
record(
  "HANDOFF-ASYNC-001 repository exposes provider-neutral latest released handoff SQL",
  handoffAsyncSource.includes("SELECT_ASYNC_MANUFACTURING_HANDOFF_SUBMISSION_IDS_SQL") &&
    handoffAsyncSource.includes("export class AsyncHandoffRepository") &&
    handoffAsyncSource.includes("listManufacturingHandoffSubmissionIds") &&
    handoffAsyncSource.includes(":submittedBy") &&
    handoffAsyncSource.includes(":limit") &&
    handoffAsyncSource.includes("COALESCE(newer.released_at, newer.updated_at, newer.created_at)") &&
    !handoffAsyncSource.includes("datetime("),
  "handoff-async-repository.ts"
);
record(
  "HANDOFF-ASYNC-002 repository and helper avoid sync DB imports",
  handoffAsyncSource.includes("AsyncDatabaseClient") &&
    handoffAsyncHelperSource.includes("getAsyncDatabaseClient") &&
    handoffAsyncHelperSource.includes("AsyncHandoffRepository") &&
    handoffAsyncHelperSource.includes("AsyncSubmissionListRepository") &&
    handoffAsyncHelperSource.includes("listManufacturingHandoffEntriesAsync") &&
    !handoffAsyncSource.includes("getDb(") &&
    !handoffAsyncSource.includes("better-sqlite3") &&
    !handoffAsyncSource.includes('from "@/lib/db"') &&
    !handoffAsyncHelperSource.includes("getDb(") &&
    !handoffAsyncHelperSource.includes('from "@/lib/db"'),
  "handoff-async-repository.ts, handoff-async.ts"
);
record(
  "HANDOFF-ASYNC-003 handoff and procurement release routes use async helper",
  [handoffRouteSource, handoffExportRouteSource, procurementReleasesRouteSource].every(
    (routeSource) =>
      routeSource.includes("listManufacturingHandoffEntriesAsync") &&
      routeSource.includes("@/lib/handoff-async") &&
      !routeSource.includes('from "@/lib/db"') &&
      !routeSource.includes("listManufacturingHandoffEntries(")
  ),
  "handoff route.ts, handoff/export route.ts, integrations/procurement/releases route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-003 search and notifications routes use async auth guard",
  [searchApiRouteSource, notificationsRouteSource].every(
    (routeSource) =>
      routeSource.includes("requireAuthAsync") &&
      routeSource.includes("await requireAuthAsync(request)") &&
      !routeSource.includes("requireAuth(request") &&
      !routeSource.includes('from "@/lib/auth"')
  ),
  "search route.ts, notifications route.ts"
);
record(
  "NOTIFICATION-ASYNC-001 repository exposes provider-neutral notification SQL constants",
  [
    "SELECT_ASYNC_RELEASE_FAILED_NOTIFICATIONS_SQL",
    "SELECT_ASYNC_PENDING_REVIEW_NOTIFICATIONS_SQL",
    "SELECT_ASYNC_UPLOAD_FAILED_NOTIFICATIONS_SQL",
    "SELECT_ASYNC_MISSING_RELEASE_PACKAGE_NOTIFICATIONS_SQL",
    "SELECT_ASYNC_ACTIVE_LOCK_NOTIFICATIONS_SQL"
  ].every((constant) => notificationAsyncSource.includes(constant)) &&
    notificationAsyncSource.includes("export class AsyncNotificationRepository") &&
    notificationAsyncSource.includes("summarizeNotifications"),
  "notification-async-repository.ts"
);
record(
  "NOTIFICATION-ASYNC-002 repository avoids sync DB imports and SQLite-only now",
  notificationAsyncSource.includes("AsyncDatabaseClient") &&
    notificationAsyncSource.includes("listNotifications") &&
    notificationAsyncSource.includes(":scopeEngineer") &&
    notificationAsyncSource.includes(":userId") &&
    notificationAsyncSource.includes(":now") &&
    !notificationAsyncSource.includes("getDb(") &&
    !notificationAsyncSource.includes("better-sqlite3") &&
    !notificationAsyncSource.includes('from "@/lib/db"') &&
    !notificationAsyncSource.includes("datetime(") &&
    !notificationAsyncSource.includes("datetime('now')"),
  "notification-async-repository.ts"
);
record(
  "NOTIFICATION-ASYNC-003 route uses async notification helper and avoids sync DB imports",
  notificationsAsyncSource.includes("getAsyncDatabaseClient") &&
    notificationsAsyncSource.includes("AsyncNotificationRepository") &&
    notificationsAsyncSource.includes("listNotificationsAsync") &&
    notificationsRouteSource.includes("listNotificationsAsync") &&
    notificationsRouteSource.includes("await listNotificationsAsync(auth.user)") &&
    notificationsRouteSource.includes("summarizeNotifications") &&
    !notificationsRouteSource.includes('from "@/lib/db"') &&
    !notificationsRouteSource.includes("listNotifications("),
  "notifications-async.ts, api/notifications/route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-004 item revisions and where-used routes use async auth guard",
  [itemRevisionsRouteSource, itemWhereUsedRouteSource].every(
    (routeSource) =>
      routeSource.includes("requireAuthAsync") &&
      routeSource.includes("await requireAuthAsync(request)") &&
      !routeSource.includes("requireAuth(request") &&
      !routeSource.includes('from "@/lib/auth"')
  ),
  "items/[partNumber]/revisions route.ts, items/[partNumber]/where-used route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-025 item insight routes use async provider-neutral repository helpers",
  itemRevisionsRouteSource.includes("listItemRevisionHistoryAsync") &&
    itemRevisionsRouteSource.includes("await listItemRevisionHistoryAsync") &&
    itemWhereUsedRouteSource.includes("listWhereUsedAsync") &&
    itemWhereUsedRouteSource.includes("await listWhereUsedAsync") &&
    [itemRevisionsRouteSource, itemWhereUsedRouteSource].every(
      (routeSource) =>
        routeSource.includes("@/lib/item-insights-async") &&
        !routeSource.includes('from "@/lib/db"') &&
        !routeSource.includes("listItemRevisionHistory({") &&
        !routeSource.includes("listWhereUsed({")
    ),
  "items/[partNumber]/revisions route.ts, items/[partNumber]/where-used route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-026 submissions GET metrics uses async provider-neutral repository helper",
  submissionsRouteSource.includes("getDashboardMetricsAsync") &&
    submissionsRouteSource.includes("await getDashboardMetricsAsync({ submittedBy, companyId: companyResult.company.companyId })") &&
    !submissionsRouteSource.includes("getDashboardMetrics,") &&
    !submissionsRouteSource.includes("getDashboardMetrics(submittedBy)"),
  "submissions route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-027 submissions GET list uses async provider-neutral repository helper",
  submissionsRouteSource.includes("listSubmissionsAsync") &&
    submissionsRouteSource.includes("await listSubmissionsAsync") &&
    submissionsRouteSource.includes("@/lib/submissions-async") &&
    !submissionsRouteSource.includes("listSubmissions,") &&
    !submissionsRouteSource.includes("listSubmissions(status"),
  "submissions route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-028 search route uses async provider-neutral repository helper",
  searchApiRouteSource.includes("searchSubmissionsAsync") &&
    searchApiRouteSource.includes("await searchSubmissionsAsync") &&
    searchApiRouteSource.includes("@/lib/submissions-async") &&
    !searchApiRouteSource.includes('from "@/lib/db"') &&
    !searchApiRouteSource.includes("searchSubmissions({"),
  "search route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-029 submission detail GET uses async provider-neutral repository helper",
  submissionDetailRouteSource.includes("getSubmissionAsync") &&
    submissionDetailRouteSource.includes("await getSubmissionAsync") &&
    submissionDetailRouteSource.includes("@/lib/submissions-async") &&
    !submissionDetailRouteSource.includes('from "@/lib/db"') &&
    !submissionDetailRouteSource.includes("getSubmission(id)"),
  "submissions/[id] route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-005 procurement releases route uses async role guard",
  procurementReleasesRouteSource.includes("requireRoleAsync") &&
    procurementReleasesRouteSource.includes('await requireRoleAsync(request, ["R&D Manager", "Admin"])') &&
    !procurementReleasesRouteSource.includes("requireAuth(request") &&
    !procurementReleasesRouteSource.includes("requireRole(request") &&
    !procurementReleasesRouteSource.includes('from "@/lib/auth"'),
  "integrations/procurement/releases route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-006 procurement sync run routes use async role guard",
  [procurementSyncRunsRouteSource, procurementSyncRunRouteSource].every(
    (routeSource) =>
      routeSource.includes("requireRoleAsync") &&
      routeSource.includes('await requireRoleAsync(request, ["R&D Manager", "Admin"])') &&
      !routeSource.includes("requireAuth(request") &&
      !routeSource.includes("requireRole(request") &&
      !routeSource.includes("canManageProcurementSync") &&
      !routeSource.includes('from "@/lib/auth"')
  ),
  "integrations/procurement/sync-runs route.ts, integrations/procurement/sync-runs/[runId] route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-007 chat route uses async auth guard",
  chatRouteSource.includes("requireAuthAsync") &&
    chatRouteSource.includes("await requireAuthAsync(request)") &&
    chatRouteSource.includes("forbidden()") &&
    !chatRouteSource.includes("requireAuth(request") &&
    !chatRouteSource.includes("requireRole(request") &&
    !chatRouteSource.includes('from "@/lib/auth"'),
  "chat route.ts"
);
record(
  "AI-CHAT-ASYNC-001 repository exposes provider-neutral LLM conversation SQL",
  [
    "INSERT_ASYNC_LLM_CONVERSATION_SQL",
    "SELECT_ASYNC_LLM_CONVERSATION_SQL",
    "INSERT_ASYNC_LLM_MESSAGE_SQL",
    "UPDATE_ASYNC_LLM_CONVERSATION_UPDATED_AT_SQL"
  ].every((constant) => aiAsyncSource.includes(constant)) &&
    aiAsyncSource.includes("export class AsyncAiRepository") &&
    aiAsyncSource.includes("createLlmConversation") &&
    aiAsyncSource.includes("getLlmConversation") &&
    aiAsyncSource.includes("addLlmMessage") &&
    !aiAsyncSource.includes("getDb(") &&
    !aiAsyncSource.includes("better-sqlite3") &&
    !aiAsyncSource.includes('from "@/lib/db"'),
  "ai-async-repository.ts"
);
record(
  "AI-CHAT-ASYNC-002 runtime helper exposes LLM conversation operations",
  aiAsyncHelperSource.includes("getAsyncDatabaseClient") &&
    aiAsyncHelperSource.includes("AsyncAiRepository") &&
    aiAsyncHelperSource.includes("createLlmConversationAsync") &&
    aiAsyncHelperSource.includes("getLlmConversationAsync") &&
    aiAsyncHelperSource.includes("addLlmMessageAsync") &&
    !aiAsyncHelperSource.includes("getDb(") &&
    !aiAsyncHelperSource.includes('from "@/lib/db"'),
  "ai-async.ts"
);
record(
  "AI-CHAT-ASYNC-003 chat route persists conversations through async helper",
  chatRouteSource.includes("@/lib/ai-async") &&
    chatRouteSource.includes("createLlmConversationAsync") &&
    chatRouteSource.includes("getLlmConversationAsync") &&
    chatRouteSource.includes("addLlmMessageAsync") &&
    chatRouteSource.includes("await resolveConversationId") &&
    chatRouteSource.includes("await addLlmMessageAsync") &&
    !chatRouteSource.includes('from "@/lib/db"') &&
    !chatRouteSource.includes("createLlmConversation(") &&
    !chatRouteSource.includes("getLlmConversation(") &&
    !chatRouteSource.includes("addLlmMessage("),
  "chat route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-008 submission file routes use async auth guard",
  submissionFileRouteSource.includes("requireAuthAsync") &&
    submissionFileRouteSource.includes("await requireAuthAsync(request)") &&
    submissionFileRouteSource.includes("getStoredSubmissionFile") &&
    submissionFileRouteSource.includes('filePath[0] === "preview"') &&
    submissionFileRouteSource.includes('disposition: "attachment"') &&
    submissionFileRouteSource.includes('disposition: "inline"') &&
    submissionFileRouteSource.includes("isPdfFile") &&
    !submissionFileRouteSource.includes("requireAuth(request") &&
    !submissionFileRouteSource.includes("requireRole(request") &&
    !submissionFileRouteSource.includes('from "@/lib/auth"'),
  "submissions/[id]/files/[...filePath] route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-009 discussion and issue routes use async auth guard",
  [
    {
      source: submissionDiscussionsRouteSource,
      helpers: ["listDiscussionCommentsAsync", "createDiscussionCommentAsync"]
    },
    {
      source: submissionDiscussionRouteSource,
      helpers: ["getDiscussionCommentAsync", "resolveDiscussionCommentAsync"]
    },
    {
      source: submissionIssuesRouteSource,
      helpers: ["listReviewIssuesAsync", "createReviewIssueAsync", "getUserByIdAsync"]
    },
    {
      source: submissionIssueRouteSource,
      helpers: ["getReviewIssueAsync", "resolveReviewIssueAsync"]
    }
  ].every(
    ({ source: routeSource, helpers }) =>
      routeSource.includes("requireAuthAsync") &&
      routeSource.includes("await requireAuthAsync(request)") &&
      routeSource.includes("canReadSubmission") &&
      helpers.every((helper) => routeSource.includes(helper)) &&
      !routeSource.includes("requireAuth(request") &&
      !routeSource.includes("requireRole(request") &&
      !routeSource.includes('from "@/lib/db"') &&
      !routeSource.includes('from "@/lib/auth"')
  ),
  "submissions/[id]/discussions route.ts, submissions/[id]/discussions/[commentId] route.ts, submissions/[id]/issues route.ts, submissions/[id]/issues/[issueId] route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-010 change routes use async auth and role guards",
    submissionChangesRouteSource.includes("requireAuthAsync") &&
    submissionChangesRouteSource.includes("await requireAuthAsync(request)") &&
    submissionChangesRouteSource.includes("requireRoleAsync") &&
    submissionChangesRouteSource.includes('await requireRoleAsync(request, ["Engineer", "R&D Manager", "Admin"])') &&
    submissionChangesRouteSource.includes("listChangeRequestsAsync") &&
    submissionChangesRouteSource.includes("createChangeRequestAsync") &&
    submissionChangesRouteSource.includes("getSubmissionAsync") &&
    submissionChangesRouteSource.includes("canReadSubmission") &&
    submissionChangeRouteSource.includes("requireRoleAsync") &&
    submissionChangeRouteSource.includes('await requireRoleAsync(request, ["R&D Manager", "Admin"])') &&
    submissionChangeRouteSource.includes("getChangeRequestAsync") &&
    submissionChangeRouteSource.includes("decideChangeRequestAsync") &&
    submissionChangeRouteSource.includes("getSubmissionAsync") &&
    submissionChangeRouteSource.includes("canReadSubmission") &&
    [submissionChangesRouteSource, submissionChangeRouteSource].every(
      (routeSource) =>
        !routeSource.includes("requireAuth(request") &&
        !routeSource.includes("requireRole(request") &&
        !routeSource.includes('from "@/lib/db"') &&
        !routeSource.includes('from "@/lib/auth"')
  ),
  "submissions/[id]/changes route.ts, submissions/[id]/changes/[changeId] route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-012 approval matrix routes use async auth and role guards",
  submissionApprovalMatrixRouteSource.includes("requireAuthAsync") &&
    submissionApprovalMatrixRouteSource.includes("await requireAuthAsync(request)") &&
    submissionApprovalMatrixRouteSource.includes("requireRoleAsync") &&
    submissionApprovalMatrixRouteSource.includes('await requireRoleAsync(request, ["R&D Manager", "Admin"])') &&
    submissionApprovalMatrixRouteSource.includes("refreshApprovalMatrixRequirementsAsync") &&
    submissionApprovalMatrixRouteSource.includes("initializeApprovalMatrixRequirementsAsync") &&
    submissionApprovalMatrixRouteSource.includes("getSubmissionAsync") &&
    submissionApprovalMatrixRouteSource.includes("buildApprovalMatrixSummary") &&
    submissionApprovalMatrixRouteSource.includes("parseRequirements") &&
    submissionApprovalMatrixRouteSource.includes("canReadSubmission") &&
    submissionApprovalMatrixRequirementRouteSource.includes("requireRoleAsync") &&
    submissionApprovalMatrixRequirementRouteSource.includes('await requireRoleAsync(request, ["R&D Manager", "Admin"])') &&
    submissionApprovalMatrixRequirementRouteSource.includes("getApprovalMatrixRequirementAsync") &&
    submissionApprovalMatrixRequirementRouteSource.includes("waiveApprovalMatrixRequirementAsync") &&
    submissionApprovalMatrixRequirementRouteSource.includes("getSubmissionAsync") &&
    submissionApprovalMatrixRequirementRouteSource.includes("canReadSubmission") &&
    [submissionApprovalMatrixRouteSource, submissionApprovalMatrixRequirementRouteSource].every(
      (routeSource) =>
        !routeSource.includes("requireAuth(request") &&
        !routeSource.includes("requireRole(request") &&
        !routeSource.includes('from "@/lib/db"') &&
        !routeSource.includes('from "@/lib/auth"')
    ),
  "submissions/[id]/approval-matrix route.ts, submissions/[id]/approval-matrix/[requirementId] route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-013 submission preflight lock route uses async role guard",
  submissionPreflightLockRouteSource.includes("requireRoleAsync") &&
    submissionPreflightLockRouteSource.includes('await requireRoleAsync(request, ["Engineer", "Admin"])') &&
    submissionPreflightLockRouteSource.includes("findActiveItemLockForSubmissionIdentifiersAsync") &&
    submissionPreflightLockRouteSource.includes("lockedByCurrentUser") &&
    !submissionPreflightLockRouteSource.includes("requireAuth(request") &&
    !submissionPreflightLockRouteSource.includes("requireRole(request") &&
    !submissionPreflightLockRouteSource.includes('from "@/lib/auth"') &&
    !submissionPreflightLockRouteSource.includes('from "@/lib/db"') &&
    !submissionPreflightLockRouteSource.includes("findActiveItemLockForSubmissionIdentifiers("),
  "submissions/preflight-lock route.ts"
);
record(
  "ITEM-LOCK-ASYNC-001 repository exposes provider-neutral active lock SQL",
  itemLockAsyncSource.includes("EXPIRE_ASYNC_ITEM_LOCKS_SQL") &&
    itemLockAsyncSource.includes("SELECT_ASYNC_ACTIVE_ITEM_LOCK_BY_IDENTIFIERS_SQL") &&
    itemLockAsyncSource.includes("SELECT_ASYNC_ACTIVE_ITEM_LOCK_BY_ITEM_ID_SQL") &&
    itemLockAsyncSource.includes("INSERT_ASYNC_ITEM_LOCK_SQL") &&
    itemLockAsyncSource.includes("RELEASE_ASYNC_ITEM_LOCK_SQL") &&
    itemLockAsyncSource.includes("AsyncItemLockRepository") &&
    itemLockAsyncSource.includes("findActiveItemLockForSubmissionIdentifiers") &&
    itemLockAsyncSource.includes("createItemLock") &&
    itemLockAsyncSource.includes("releaseItemLock") &&
    !itemLockAsyncSource.includes("datetime(") &&
    !itemLockAsyncSource.includes("datetime('now')") &&
    !itemLockAsyncSource.includes("getDb(") &&
    !itemLockAsyncSource.includes("better-sqlite3"),
  "item-lock-async-repository.ts"
);
record(
  "ITEM-LOCK-ASYNC-002 runtime helper and preflight route use async lock lookup",
  itemLocksAsyncSource.includes("findActiveItemLockForSubmissionIdentifiersAsync") &&
    itemLocksAsyncSource.includes("createItemLockAsync") &&
    itemLocksAsyncSource.includes("releaseItemLockAsync") &&
    itemLocksAsyncSource.includes("getAsyncDatabaseClient") &&
    submissionPreflightLockRouteSource.includes("findActiveItemLockForSubmissionIdentifiersAsync") &&
    !itemLocksAsyncSource.includes("getDb(") &&
    !itemLocksAsyncSource.includes('from "@/lib/db"') &&
    !submissionPreflightLockRouteSource.includes('from "@/lib/db"'),
  "item-locks-async.ts, submissions/preflight-lock route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-014 submission checkout route uses async role guard",
  submissionCheckoutRouteSource.includes("requireRoleAsync") &&
    (submissionCheckoutRouteSource.match(/await requireRoleAsync\(request, \["Engineer", "Admin"\]\)/gu)?.length ?? 0) === 2 &&
    submissionCheckoutRouteSource.includes("getSubmissionAsync") &&
    submissionCheckoutRouteSource.includes("createItemLockAsync") &&
    submissionCheckoutRouteSource.includes("releaseItemLockAsync") &&
    submissionCheckoutRouteSource.includes("canReadSubmission") &&
    submissionCheckoutRouteSource.includes("forbidden()") &&
    !submissionCheckoutRouteSource.includes("requireAuth(request") &&
    !submissionCheckoutRouteSource.includes("requireRole(request") &&
    !submissionCheckoutRouteSource.includes('from "@/lib/auth"') &&
    !submissionCheckoutRouteSource.includes('from "@/lib/db"') &&
    !submissionCheckoutRouteSource.includes("createItemLock(") &&
    !submissionCheckoutRouteSource.includes("releaseItemLock(") &&
    !submissionCheckoutRouteSource.includes("getSubmission("),
  "submissions/[id]/checkout route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-015 submission approve and reject routes use async role guard",
  submissionApproveRouteSource.includes("requireRoleAsync") &&
  submissionApproveRouteSource.includes('await requireRoleAsync(request, ["R&D Manager", "Admin"])') &&
    submissionApproveRouteSource.includes("listOpenApprovalMatrixRequirementsAsync") &&
    submissionApproveRouteSource.includes("executeSubmissionReleaseWorkflowAsync") &&
    submissionApproveRouteSource.includes("await executeSubmissionReleaseWorkflowAsync") &&
    submissionRejectRouteSource.includes("requireRoleAsync") &&
    submissionRejectRouteSource.includes('await requireRoleAsync(request, ["R&D Manager", "Admin"])') &&
    submissionRejectRouteSource.includes("addApprovalAsync") &&
    submissionRejectRouteSource.includes("rejectSubmissionAsync") &&
    submissionRejectRouteSource.includes("createAuditLogAsync") &&
    [submissionApproveRouteSource, submissionRejectRouteSource].every(
      (routeSource) =>
        !routeSource.includes("requireAuth(request") &&
        !routeSource.includes("requireRole(request") &&
        !routeSource.includes('from "@/lib/auth"')
    ),
  "submissions/[id]/approve route.ts, submissions/[id]/reject route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-016 release package, share, and supplier response routes use async guards",
  submissionReleasePackageRouteSource.includes("requireAuthAsync") &&
    submissionReleasePackageRouteSource.includes("await requireAuthAsync(request)") &&
    submissionReleasePackageRouteSource.includes("getSubmissionAsync") &&
    submissionReleasePackageRouteSource.includes("readReleasePackage") &&
    submissionReleasePackageRouteSource.includes("canReadSubmission") &&
    [
      {
        source: submissionSharesRouteSource,
        helpers: ["createReadonlyShare", "listReadonlyShares", "generateShareToken", "hashShareToken"]
      },
      {
        source: submissionShareRouteSource,
        helpers: ["revokeReadonlyShare"]
      },
      {
        source: submissionSupplierResponsesRouteSource,
        helpers: ["listSupplierPortalResponses"]
      },
      {
        source: submissionSupplierResponseRouteSource,
        helpers: ["closeSupplierPortalResponse"]
      }
    ].every(
      ({ source: routeSource, helpers }) =>
        routeSource.includes("requireRoleAsync") &&
        routeSource.includes('await requireRoleAsync(request, ["R&D Manager", "Admin"])') &&
        routeSource.includes("canReadSubmission") &&
        routeSource.includes("forbidden()") &&
        helpers.every((helper) => routeSource.includes(helper)) &&
        !routeSource.includes("canManageShares") &&
        !routeSource.includes("canManageSupplierPortal")
    ) &&
    [
      submissionReleasePackageRouteSource,
      submissionSharesRouteSource,
      submissionShareRouteSource,
      submissionSupplierResponsesRouteSource,
      submissionSupplierResponseRouteSource
    ].every(
      (routeSource) =>
        !routeSource.includes("requireAuth(request") &&
        !routeSource.includes("requireRole(request") &&
        !routeSource.includes('from "@/lib/auth"') &&
        !routeSource.includes('from "@/lib/db"') &&
        !routeSource.includes("getSubmission(")
    ),
  "submissions/[id]/release-package route.ts, shares route.ts, shares/[shareId] route.ts, supplier-responses route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-017 AI summary and risk routes use async auth guard",
  [
    {
      source: submissionAiSummaryRouteSource,
      helpers: ["buildAiSubmissionSummary", "getSubmissionAsync", "canReadSubmission", "scopedSubmittedBy"]
    },
    {
      source: submissionAiRisksRouteSource,
      helpers: ["buildAiRiskReport", "getSubmissionAsync", "canReadSubmission", "scopedSubmittedBy"]
    }
  ].every(
    ({ source: routeSource, helpers }) =>
      routeSource.includes("requireAuthAsync") &&
      routeSource.includes("await requireAuthAsync(request)") &&
      routeSource.includes("forbidden()") &&
      helpers.every((helper) => routeSource.includes(helper)) &&
      !routeSource.includes("requireAuth(request") &&
      !routeSource.includes("requireRole(request") &&
      !routeSource.includes('from "@/lib/auth"') &&
      !routeSource.includes('from "@/lib/db"') &&
      !routeSource.includes("getSubmission(")
  ),
  "submissions/[id]/ai-summary route.ts, submissions/[id]/ai-risks route.ts"
);
record(
  "AI-ROUTE-ASYNC-001 AI summary and risk routes use async submission detail and avoid sync DB imports",
  submissionAiSummaryRouteSource.includes("getSubmissionAsync") &&
    submissionAiRisksRouteSource.includes("getSubmissionAsync") &&
    submissionAiSummaryRouteSource.includes("buildAiSubmissionSummary") &&
    submissionAiRisksRouteSource.includes("buildAiRiskReport") &&
    [submissionAiSummaryRouteSource, submissionAiRisksRouteSource].every(
      (routeSource) => !routeSource.includes('from "@/lib/db"') && !routeSource.includes("getSubmission(")
    ),
  "submissions/[id]/ai-summary route.ts, submissions/[id]/ai-risks route.ts"
);
record(
  "SUBMISSION-UPLOAD-001 shared background upload helper preserves route ownership and status transitions",
  submissionBackgroundUploadSource.includes("export async function triggerBackgroundUpload") &&
    ["getFilesNeedingUpload", "updateFileGDriveStatus", "uploadFile", '"uploading"', '"uploaded"', '"failed"'].every((token) =>
      submissionBackgroundUploadSource.includes(token)
    ) &&
    [submissionsRouteSource, drawingRevisionSubmissionsRouteSource, numberingDrawingSubmissionsRouteSource].every(
      (routeSource) =>
        routeSource.includes('import { triggerBackgroundUpload } from "@/lib/submission-background-upload"') &&
        !routeSource.includes("async function triggerBackgroundUpload") &&
        !routeSource.includes("uploadFileToDrive")
    ),
  "submission-background-upload.ts and three submission routes"
);
record(
  "ROUTE-AUTH-ASYNC-018 submission list, create, and detail routes use async guards",
  submissionsRouteSource.includes("requireAuthAsync") &&
    submissionsRouteSource.includes("await requireAuthAsync(request)") &&
    submissionsRouteSource.includes("requireRoleAsync") &&
    submissionsRouteSource.includes('await requireRoleAsync(request, ["Engineer", "Admin"])') &&
    [
      "listSubmissionsAsync",
      "getDashboardMetrics",
      "scopedSubmittedBy",
      "validateSubmissionInput",
      "validateUploadedFiles",
      "submissionRevisionExistsAsync",
      "saveUploadedFiles",
      "createSubmissionRecordAsync",
      "getSystemSettingAsync",
      "triggerBackgroundUpload"
    ].every((helper) => submissionsRouteSource.includes(helper)) &&
    submissionDetailRouteSource.includes("requireAuthAsync") &&
    submissionDetailRouteSource.includes("await requireAuthAsync(request)") &&
    submissionDetailRouteSource.includes("getSubmission") &&
    submissionDetailRouteSource.includes("canReadSubmission") &&
    submissionDetailRouteSource.includes("forbidden()") &&
    [submissionsRouteSource, submissionDetailRouteSource].every(
      (routeSource) =>
        !routeSource.includes("requireAuth(request") &&
        !routeSource.includes("requireRole(request") &&
        !routeSource.includes('from "@/lib/auth"')
    ),
  "submissions route.ts, submissions/[id] route.ts"
);
record(
  "ROUTE-AUTH-ASYNC-019 submission BOM routes use async auth guard",
  [
    {
      source: submissionBomRouteSource,
      helpers: ["getBomBySubmissionIdAsync", "materializeBomDraftFromReferencesAsync", "getSubmissionAsync", "canReadSubmission"]
    },
    {
      source: submissionBomDiffRouteSource,
      helpers: [
        "findPreviousBomSubmissionIdAsync",
        "getBomBySubmissionIdAsync",
        "getBomDiffBetweenSubmissionsAsync",
        "getSubmissionAsync",
        "buildBomDiffRows",
        "toCsv",
        "toExcelXml",
        "canReadSubmission"
      ]
    },
    {
      source: submissionBomExportRouteSource,
      helpers: ["getBomBySubmissionIdAsync", "getSubmissionAsync", "buildBomRows", "buildSpreadsheetXml", "parseFormat", "canReadSubmission"]
    }
  ].every(
    ({ source: routeSource, helpers }) =>
      routeSource.includes("requireAuthAsync") &&
      routeSource.includes("await requireAuthAsync(request)") &&
      routeSource.includes("forbidden()") &&
      helpers.every((helper) => routeSource.includes(helper)) &&
      !routeSource.includes("requireAuth(request") &&
      !routeSource.includes("requireRole(request") &&
      !routeSource.includes('from "@/lib/auth"') &&
      !routeSource.includes('from "@/lib/db"') &&
      !routeSource.includes("getSubmission(") &&
      !routeSource.includes("getBomBySubmissionId(") &&
      !routeSource.includes("materializeBomDraftFromReferences(") &&
      !routeSource.includes("findPreviousBomSubmissionId(") &&
      !routeSource.includes("getBomDiffBetweenSubmissions(")
  ),
  "submissions/[id]/bom route.ts, bom/diff route.ts, bom/export route.ts"
);
record(
  "BOM-ASYNC-001 repository and helper expose provider-neutral submission BOM operations",
  bomAsyncSource.includes("AsyncDatabaseClient") &&
    [
      "SELECT_ASYNC_BOM_HEADER_SQL",
      "SELECT_ASYNC_BOM_LINES_SQL",
      "SELECT_ASYNC_BOM_SUBMISSION_SQL",
      "SELECT_ASYNC_ASSEMBLY_FILE_REFERENCES_SQL",
      "UPSERT_ASYNC_BOM_HEADER_SQL",
      "DELETE_ASYNC_BOM_LINES_SQL",
      "INSERT_ASYNC_BOM_LINE_SQL",
      "SELECT_ASYNC_PREVIOUS_BOM_SUBMISSIONS_SQL"
    ].every((constant) => bomAsyncSource.includes(constant)) &&
    bomAsyncSource.includes("export class AsyncBomRepository") &&
    [
      "getBomBySubmissionId",
      "materializeBomDraftFromReferences",
      "findPreviousBomSubmissionId",
      "getBomDiffBetweenSubmissions"
    ].every((method) => bomAsyncSource.includes(method)) &&
    [
      "getBomBySubmissionIdAsync",
      "materializeBomDraftFromReferencesAsync",
      "findPreviousBomSubmissionIdAsync",
      "getBomDiffBetweenSubmissionsAsync"
    ].every((helper) => bomAsyncHelperSource.includes(helper)) &&
    !bomAsyncSource.includes("datetime(") &&
    !bomAsyncSource.includes("rowid") &&
    !bomAsyncSource.includes("getDb(") &&
    !bomAsyncSource.includes("better-sqlite3") &&
    !bomAsyncSource.includes('from "@/lib/db"') &&
    !bomAsyncHelperSource.includes("getDb(") &&
    !bomAsyncHelperSource.includes('from "@/lib/db"'),
  "bom-async-repository.ts, bom-async.ts"
);
record(
  "ROUTE-AUTH-ASYNC-020 BOM workbench, draft, review, and release export routes use async guards",
  [
    {
      source: bomWorkbenchRouteSource,
      helpers: ["getBomWorkbenchBySubmissionIdAsync", "getSubmissionAsync", "canReadBomDraft"]
    },
    {
      source: bomDraftFromAssemblyRouteSource,
      helpers: ["createBomWorkbenchDraftFromAssemblyAsync", "getSubmissionAsync", "canReadBomDraft"]
    },
    {
      source: bomDraftImportXlsRouteSource,
      helpers: ["createBomWorkbenchDraftFromSolidWorksXlsAsync", "BomXlsImportError", "getSubmissionAsync", "readImportPayload", "canReadBomDraft"]
    },
      {
        source: bomDraftRouteSource,
        helpers: ["getBomWorkbenchDraftByIdAsync", "saveBomWorkbenchDraftTreeAsync", "normalizeLineInput", "getSubmissionAsync", "canReadBomDraft"]
      },
    {
      source: bomDraftActiveRouteSource,
      helpers: ["setBomWorkbenchActiveDraft", "canReadBomDraft"]
    },
    {
      source: bomDraftDiffRouteSource,
      helpers: ["getBomWorkbenchDraftDiff", "canReadBomDraft"]
    },
      {
        source: bomDraftSubmitReviewRouteSource,
        helpers: ["submitBomWorkbenchDraftReviewAsync", "getBomWorkbenchDraftByIdAsync", "getSubmissionAsync", "canReadBomDraft"]
      },
    {
      source: bomReleaseExportRouteSource,
      helpers: ["getBomReleaseSnapshotByIdAsync", "getSubmissionAsync", "canReadBomReleasedSnapshot", "buildXlsxWorkbook", "buildZip"]
    }
  ].every(
    ({ source: routeSource, helpers }) =>
      routeSource.includes("requireAuthAsync") &&
      routeSource.includes("await requireAuthAsync(request)") &&
      routeSource.includes("forbidden()") &&
      helpers.every((helper) => routeSource.includes(helper)) &&
      !routeSource.includes("requireAuth(request") &&
      !routeSource.includes("requireRole(request") &&
      !routeSource.includes('from "@/lib/auth"')
  ) &&
    [
      {
        source: bomReviewsPendingRouteSource,
        helpers: ["listPendingBomWorkbenchReviews"]
      },
      {
        source: bomReviewApproveRouteSource,
        helpers: [
          "decideApprovalPlatformLegacyBomAsync",
          "BomReleaseGateError",
          "getBomWorkbenchReviewByIdAsync",
          "getBomWorkbenchDraftByIdAsync",
          "getSubmissionAsync",
          "canReadSubmission"
        ]
      },
      {
        source: bomReviewRejectRouteSource,
        helpers: ["decideApprovalPlatformLegacyBomAsync", "getBomWorkbenchReviewByIdAsync", "getBomWorkbenchDraftByIdAsync", "canReadSubmission"]
      }
    ].every(
      ({ source: routeSource, helpers }) =>
        routeSource.includes("requireRoleAsync") &&
        routeSource.includes('await requireRoleAsync(request, ["R&D Manager", "Admin"])') &&
        helpers.every((helper) => routeSource.includes(helper)) &&
        !routeSource.includes("auth.user.role !==") &&
        !routeSource.includes("requireAuth(request") &&
        !routeSource.includes("requireRole(request") &&
        !routeSource.includes('from "@/lib/auth"')
  ),
  "bom/workbench, bom/drafts, bom/reviews, bom/releases export routes"
);
record(
  "ROUTE-AUTH-ASYNC-021 submission auxiliary routes use async guards",
  [
    {
      source: submissionReuseCandidatesRouteSource,
      auth: "auth",
      helpers: ["getSubmissionAsync", "listDesignReuseCandidatesAsync", "scopedSubmittedBy", "canReadSubmission"]
    },
    {
      source: submissionDuplicateGeometryRouteSource,
      auth: "auth",
      helpers: ["getSubmissionAsync", "listDuplicateGeometryCandidatesAsync", "scopedSubmittedBy", "canReadSubmission"]
    },
    {
      source: submissionPdfMarkupsRouteSource,
      auth: "auth",
      helpers: ["listPdfMarkupsAsync", "createPdfMarkupAsync", "getSubmissionFileAsync", "isPdfFile", "canReadSubmission"]
    },
    {
      source: submissionPdfMarkupRouteSource,
      auth: "auth",
      helpers: ["getPdfMarkupAsync", "resolvePdfMarkupAsync", "canReadSubmission"]
    }
  ].every(
    ({ source: routeSource, helpers }) =>
      routeSource.includes("requireAuthAsync") &&
      routeSource.includes("await requireAuthAsync(request)") &&
      routeSource.includes("forbidden()") &&
      helpers.every((helper) => routeSource.includes(helper)) &&
      !routeSource.includes('from "@/lib/db"') &&
      !routeSource.includes("getSubmission(") &&
      !routeSource.includes("listDesignReuseCandidates(") &&
      !routeSource.includes("listDuplicateGeometryCandidates(") &&
      !routeSource.includes("requireAuth(request") &&
      !routeSource.includes("requireRole(request") &&
      !routeSource.includes('from "@/lib/auth"')
  ) &&
    submissionRetryUploadRouteSource.includes("requireRoleAsync") &&
    submissionRetryUploadRouteSource.includes('await requireRoleAsync(request, ["R&D Manager", "Admin"])') &&
    submissionRetryUploadRouteSource.includes("getSystemSettingAsync") &&
    submissionRetryUploadRouteSource.includes("await getSystemSettingAsync") &&
    submissionRetryUploadRouteSource.includes("createAuditLogAsync") &&
    submissionRetryUploadRouteSource.includes("await createAuditLogAsync") &&
    ["getFilesNeedingUploadAsync", "updateFileGDriveStatusAsync", "uploadFileToDrive"].every((helper) =>
      submissionRetryUploadRouteSource.includes(helper)
    ) &&
    submissionSandboxRouteSource.includes("requireAuthAsync") &&
    submissionSandboxRouteSource.includes("await requireAuthAsync(request)") &&
    submissionSandboxRouteSource.includes("requireRoleAsync") &&
    submissionSandboxRouteSource.includes('await requireRoleAsync(request, ["Engineer", "Admin"])') &&
    ["getSubmissionAsync", "listSandboxBranchesForSubmissionAsync", "createSandboxBranchAsync", "canReadSubmission"].every((helper) =>
      submissionSandboxRouteSource.includes(helper)
    ) &&
    submissionSandboxBranchRouteSource.includes("requireRoleAsync") &&
    submissionSandboxBranchRouteSource.includes('await requireRoleAsync(request, ["Engineer", "R&D Manager", "Admin"])') &&
    submissionSandboxBranchRouteSource.includes('await requireRoleAsync(request, ["Engineer", "Admin"])') &&
    [
      "getSubmissionAsync",
      "getSandboxBranchByIdAsync",
      "getSandboxMergePreviewAsync",
      "mergeSandboxBranchAsync",
      "updateSandboxBranchStatusAsync",
      "canReadSubmission"
    ].every((helper) => submissionSandboxBranchRouteSource.includes(helper)) &&
    [
      submissionRetryUploadRouteSource,
      submissionSandboxRouteSource,
      submissionSandboxBranchRouteSource
    ].every(
      (routeSource) =>
        !routeSource.includes("requireAuth(request") &&
        !routeSource.includes("requireRole(request") &&
        !routeSource.includes("createAuditLog({") &&
        !routeSource.includes("getSystemSetting(") &&
        !routeSource.includes('from "@/lib/auth"') &&
        !routeSource.includes('from "@/lib/db"') &&
        !routeSource.includes("getSubmission(") &&
        !routeSource.includes("listSandboxBranchesForSubmission(") &&
        !routeSource.includes("createSandboxBranch(") &&
        !routeSource.includes("getSandboxBranchById(") &&
        !routeSource.includes("getSandboxMergePreview(") &&
        !routeSource.includes("mergeSandboxBranch(") &&
        !routeSource.includes("updateSandboxBranchStatus(")
    ),
  "submissions/[id]/reuse-candidates, duplicate-geometry, retry-upload, sandbox, pdf-markups routes"
);
record(
  "SANDBOX-ASYNC-001 repository and helper expose provider-neutral sandbox operations",
  sandboxAsyncSource.includes("AsyncDatabaseClient") &&
    [
      "SELECT_ASYNC_SANDBOX_BRANCHES_FOR_SUBMISSION_SQL",
      "SELECT_ASYNC_SANDBOX_BRANCH_BY_ID_SQL",
      "SELECT_ASYNC_ACTIVE_SANDBOX_BRANCH_BY_SOURCE_SQL",
      "SELECT_ASYNC_SANDBOX_BRANCH_DUPLICATE_NAME_SQL",
      "INSERT_ASYNC_SANDBOX_SUBMISSION_SQL",
      "INSERT_ASYNC_SANDBOX_FILE_SQL",
      "INSERT_ASYNC_SANDBOX_FILE_REFERENCE_SQL",
      "INSERT_ASYNC_SANDBOX_BRANCH_SQL",
      "PROMOTE_ASYNC_SANDBOX_BRANCH_SQL",
      "CLOSE_ASYNC_SANDBOX_BRANCH_SQL",
      "MERGE_ASYNC_SANDBOX_BRANCH_SQL"
    ].every((constant) => sandboxAsyncSource.includes(constant)) &&
    sandboxAsyncSource.includes("export class AsyncSandboxRepository") &&
    [
      "listSandboxBranchesForSubmission",
      "getSandboxBranchById",
      "getSandboxMergePreview",
      "createSandboxBranch",
      "updateSandboxBranchStatus",
      "mergeSandboxBranch"
    ].every((method) => sandboxAsyncSource.includes(method)) &&
    [
      "listSandboxBranchesForSubmissionAsync",
      "getSandboxBranchByIdAsync",
      "getSandboxMergePreviewAsync",
      "createSandboxBranchAsync",
      "updateSandboxBranchStatusAsync",
      "mergeSandboxBranchAsync"
    ].every((helper) => sandboxAsyncHelperSource.includes(helper)) &&
    !sandboxAsyncSource.includes("getDb(") &&
    !sandboxAsyncSource.includes("better-sqlite3") &&
    !sandboxAsyncSource.includes('from "@/lib/db"') &&
    !sandboxAsyncSource.includes("datetime(") &&
    !sandboxAsyncSource.includes("rowid") &&
    !sandboxAsyncHelperSource.includes("getDb(") &&
    !sandboxAsyncHelperSource.includes('from "@/lib/db"'),
  "sandbox-async-repository.ts, sandbox-async.ts"
);
record(
  "NUMBERING-DUPLICATE-ASYNC-001 repository and helper expose provider-neutral duplicate check",
  numberingAsyncSource.includes("AsyncDatabaseClient") &&
    [
      "SELECT_ASYNC_PART_ROOT_BY_CODE_SQL",
      "SELECT_ASYNC_PART_NUMBER_BY_NUMBER_SQL",
      "SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_SQL",
      "SELECT_ASYNC_NUMBERING_SEQUENCE_SQL",
      "INSERT_ASYNC_NUMBERING_SEQUENCE_SQL",
      "UPDATE_ASYNC_NUMBERING_SEQUENCE_SQL",
      "INSERT_ASYNC_PART_ROOT_SQL",
      "INSERT_ASYNC_PART_NUMBER_SQL",
      "INSERT_ASYNC_DRAWING_NUMBER_SQL",
      "INSERT_ASYNC_DRAWING_PART_LINK_SQL",
      "SELECT_ASYNC_PART_ROOTS_FOR_DUPLICATE_SIMILARITY_SQL",
      "SELECT_ASYNC_PART_NUMBERS_FOR_DUPLICATE_SIMILARITY_SQL",
      "INSERT_ASYNC_NUMBERING_WARNING_EVENT_SQL",
      "INSERT_ASYNC_DUPLICATE_CHECK_EVENT_SQL",
      "INSERT_ASYNC_NUMBERING_AUDIT_SQL",
      "UPDATE_ASYNC_NUMBERING_TASK_STATUS_SQL",
      "SELECT_ASYNC_NUMBERING_TASK_BY_ID_SQL",
      "SELECT_ASYNC_NUMBERING_ASSIGNED_ROLE_CODES_SQL",
      "SELECT_ASYNC_NUMBERING_ALLOWED_ROLE_SCOPES_SQL",
      "SELECT_ASYNC_NUMBERING_ACTIVE_DELEGATIONS_SQL",
      "SELECT_ASYNC_NUMBERING_TASKS_BASE_SQL",
      "SELECT_ASYNC_NUMBERING_NOTIFICATIONS_BASE_SQL",
      "SELECT_ASYNC_NUMBERING_NOTIFICATION_BY_ID_SQL",
      "UPDATE_ASYNC_NUMBERING_NOTIFICATION_STATE_SQL",
      "SELECT_ASYNC_NUMBERING_EXPORT_ROOTS_SQL",
      "SELECT_ASYNC_NUMBERING_EXPORT_PARTS_SQL",
      "SELECT_ASYNC_NUMBERING_EXPORT_DRAWINGS_SQL",
      "SELECT_ASYNC_NUMBERING_EXPORT_AUDIT_SQL",
      "INSERT_ASYNC_NUMBERING_EXPORT_JOB_SQL",
      "SELECT_ASYNC_NUMBERING_EXPORT_JOB_BY_ID_SQL",
      "SELECT_ASYNC_NUMBERING_EXPORT_JOBS_SQL",
      "SELECT_ASYNC_MONTHLY_AUDIT_COUNT_ROOTS_SQL",
      "SELECT_ASYNC_MONTHLY_AUDIT_COUNT_PARTS_SQL",
      "SELECT_ASYNC_MONTHLY_AUDIT_COUNT_DRAWINGS_SQL",
      "SELECT_ASYNC_MONTHLY_AUDIT_COUNT_OPEN_TASKS_SQL",
      "SELECT_ASYNC_MONTHLY_AUDIT_OPEN_TASKS_FOR_TWO_ROLES_SQL",
      "SELECT_ASYNC_MONTHLY_AUDIT_APPROVAL_RULES_FOR_TWO_ROLES_SQL",
      "SELECT_ASYNC_MONTHLY_AUDIT_PROJECT_BUCKETS_SQL",
      "INSERT_ASYNC_MONTHLY_AUDIT_REPORT_SQL",
      "SELECT_ASYNC_MONTHLY_AUDIT_REPORT_BY_ID_SQL",
      "SELECT_ASYNC_MONTHLY_AUDIT_REPORTS_SQL",
      "SELECT_ASYNC_MONTHLY_AUDIT_REPORTS_BY_MONTH_SQL",
      "SELECT_ASYNC_OVERDUE_DRAFT_ROOTS_SQL",
      "SELECT_ASYNC_DRAFT_ROOT_PARTS_SQL",
      "SELECT_ASYNC_DRAFT_ROOT_DRAWINGS_SQL",
      "UPDATE_ASYNC_OVERDUE_DRAFT_DRAWINGS_SQL",
      "UPDATE_ASYNC_OVERDUE_DRAFT_PARTS_SQL",
      "UPDATE_ASYNC_OVERDUE_DRAFT_ROOT_SQL",
      "INSERT_ASYNC_NUMBERING_TASK_ITEM_SQL",
      "INSERT_ASYNC_NUMBERING_NOTIFICATION_SQL",
      "SELECT_ASYNC_ROOT_PART_NUMBERS_SQL",
      "SELECT_ASYNC_ROOT_DRAWING_NUMBERS_SQL",
      "SELECT_ASYNC_FIRST_PART_NUMBER_FOR_ROOT_SQL",
      "SELECT_ASYNC_FIRST_DRAWING_NUMBER_FOR_ROOT_SQL",
      "UPDATE_ASYNC_PART_ROOT_CORE_NAME_SQL",
      "UPDATE_ASYNC_PART_NUMBER_DRAFT_SQL",
      "UPDATE_ASYNC_DRAWING_PURPOSE_DESCRIPTION_SQL",
      "UPDATE_ASYNC_ROOT_DRAWINGS_OBSOLETE_SQL",
      "UPDATE_ASYNC_ROOT_PARTS_OBSOLETE_SQL",
      "UPDATE_ASYNC_ROOT_OBSOLETE_SQL",
      "SELECT_ASYNC_NUMBERING_LINKS_FOR_ROOT_SQL",
      "SELECT_ASYNC_NUMBERING_VARIANTS_FOR_ROOT_SQL",
      "SELECT_ASYNC_NUMBERING_WARNINGS_BASE_SQL",
      "SELECT_ASYNC_NUMBERING_AUDIT_TRAIL_SQL",
      "SELECT_ASYNC_NUMBERING_SEARCH_ROOTS_BASE_SQL",
      "SELECT_ASYNC_NUMBERING_SEARCH_PARTS_BASE_SQL",
      "SELECT_ASYNC_NUMBERING_SEARCH_DRAWINGS_BASE_SQL",
      "SELECT_ASYNC_DRAWING_MODULE_RECORDS_BASE_SQL",
      "SELECT_ASYNC_DRAWING_MODULE_LINKED_PART_NUMBERS_SQL",
      "SELECT_ASYNC_DRAWING_MODULE_LINKED_PARTS_BY_ROOT_SQL",
      "SELECT_ASYNC_PART_MODULE_RECORDS_BASE_SQL",
      "SELECT_ASYNC_PART_DETAIL_LINKED_DRAWINGS_SQL",
      "SELECT_ASYNC_PART_DETAIL_SAME_DRAWING_VARIANTS_SQL",
      "SELECT_ASYNC_PART_DETAIL_COST_PROFILES_SQL",
      "SELECT_ASYNC_PART_DETAIL_COST_TIERS_BASE_SQL",
      "SELECT_ASYNC_PART_DETAIL_COST_CHANGE_REQUESTS_SQL",
      "SELECT_ASYNC_PART_VARIANT_ATTRIBUTES_BY_PART_ID_SQL",
      "UPDATE_ASYNC_PART_VARIANT_ATTRIBUTES_SQL",
      "INSERT_ASYNC_PART_VARIANT_ATTRIBUTES_SQL",
      "INSERT_ASYNC_PART_COST_PROFILE_SQL",
      "INSERT_ASYNC_PART_COST_TIER_SQL",
      "INSERT_ASYNC_PART_COST_CHANGE_REQUEST_SQL",
      "SELECT_ASYNC_PART_COST_CHANGE_REQUEST_BY_ID_SQL",
      "SELECT_ASYNC_PART_COST_PROFILE_BY_ID_SQL",
      "SELECT_ASYNC_APPROVED_PART_COST_PROFILE_BY_TYPE_SQL",
      "SELECT_ASYNC_APPROVED_STANDARD_PART_COST_PROFILE_SQL",
      "UPDATE_ASYNC_PART_COST_CHANGE_REQUEST_DECISION_SQL",
      "UPDATE_ASYNC_PART_COST_PROFILE_REJECTED_SQL",
      "UPDATE_ASYNC_PART_COST_PROFILE_APPROVED_SQL",
      "UPDATE_ASYNC_ACTIVE_PART_STANDARD_COST_END_SQL",
      "INSERT_ASYNC_PART_STANDARD_COST_SQL",
      "SELECT_ASYNC_IMPORT_BATCH_BY_ID_SQL",
      "SELECT_ASYNC_IMPORT_BATCHES_SQL",
      "SELECT_ASYNC_IMPORT_STAGING_ROWS_BY_BATCH_SQL",
      "SELECT_ASYNC_VALID_IMPORT_STAGING_ROWS_BY_BATCH_SQL",
      "INSERT_ASYNC_IMPORT_BATCH_SQL",
      "INSERT_ASYNC_IMPORT_STAGING_ROW_SQL",
      "UPDATE_ASYNC_IMPORT_STAGING_ROW_LEGACY_KEEP_SQL",
      "UPDATE_ASYNC_IMPORT_BATCH_CONFIRMED_SQL",
      "SELECT_ASYNC_ADMIN_ROLES_SQL",
      "SELECT_ASYNC_ADMIN_USERS_SQL",
      "SELECT_ASYNC_ADMIN_ROLE_PERMISSIONS_SQL",
      "SELECT_ASYNC_ADMIN_ROLE_SCOPES_SQL",
      "SELECT_ASYNC_ADMIN_ROLE_ASSIGNMENTS_SQL",
      "SELECT_ASYNC_ADMIN_ROLE_PRIORITY_VERSIONS_SQL",
      "SELECT_ASYNC_ADMIN_APPROVAL_DELEGATIONS_SQL",
      "SELECT_ASYNC_ADMIN_APPROVAL_RULES_SQL",
      "SELECT_ASYNC_ADMIN_APPROVAL_RULES_BY_ACTION_SQL",
      "SELECT_ASYNC_ADMIN_RULE_TEMPLATES_SQL",
      "SELECT_ASYNC_ADMIN_RULE_VERSIONS_SQL",
      "SELECT_ASYNC_APPROVED_NUMBERING_APPROVAL_SQL",
      "SELECT_ASYNC_DRAWING_NUMBERS_FOR_ROOT_SQL",
      "SELECT_ASYNC_PRIMARY_PARTS_BY_DRAWING_SQL",
      "UPDATE_ASYNC_MAIN_DRAWING_OBSOLETE_SQL",
      "UPDATE_ASYNC_PART_MAIN_DRAWING_INVALID_SQL",
      "UPDATE_ASYNC_ROOT_MAIN_DRAWING_INVALID_SQL"
    ].every((constant) => numberingAsyncSource.includes(constant)) &&
    numberingAsyncSource.includes("export class AsyncNumberingRepository") &&
    numberingAsyncSource.includes("createNumberingRecord") &&
    numberingAsyncSource.includes("updateDraftNumberingRecord") &&
    numberingAsyncSource.includes("obsoleteDraftNumberingRecord") &&
    numberingAsyncSource.includes("checkNumberingDuplicates") &&
    numberingAsyncSource.includes("listNumberingTasks") &&
    numberingAsyncSource.includes("updateNumberingTaskStatus") &&
    numberingAsyncSource.includes("listNumberingNotifications") &&
    numberingAsyncSource.includes("updateNumberingNotificationState") &&
    numberingAsyncSource.includes("createNumberingExportJob") &&
    numberingAsyncSource.includes("getNumberingExportJob") &&
    numberingAsyncSource.includes("listNumberingExportJobs") &&
    numberingAsyncSource.includes("generateMonthlyNumberingAuditReport") &&
    numberingAsyncSource.includes("getMonthlyNumberingAuditReport") &&
    numberingAsyncSource.includes("listMonthlyNumberingAuditReports") &&
    numberingAsyncSource.includes("markOverdueDraftNumberingRecords") &&
    numberingAsyncSource.includes("getNumberingRootDetail") &&
    numberingAsyncSource.includes("searchNumberingRecords") &&
    numberingAsyncSource.includes("listDrawingModuleRecords") &&
    numberingAsyncSource.includes("listPartModuleRecords") &&
    numberingAsyncSource.includes("getPartModuleDetail") &&
    numberingAsyncSource.includes("upsertPartVariantAttributes") &&
    numberingAsyncSource.includes("createPartCostProfile") &&
    numberingAsyncSource.includes("decidePartCostChangeRequest") &&
    numberingAsyncSource.includes("resolvePartCost") &&
    numberingAsyncSource.includes("requestNumberingApproval") &&
    numberingAsyncSource.includes("requestSameDrawingVariantApproval") &&
    numberingAsyncSource.includes("requestMainDrawingRestoreApproval") &&
    numberingAsyncSource.includes("decideNumberingApproval") &&
    numberingAsyncSource.includes("getNumberingApprovalBatch") &&
    numberingAsyncSource.includes("listNumberingApprovalBatches") &&
    numberingAsyncSource.includes("createNumberingApprovalBatch") &&
    numberingAsyncSource.includes("decideNumberingApprovalBatch") &&
    numberingAsyncSource.includes("resubmitRejectedNumberingApprovalBatchItems") &&
    numberingAsyncSource.includes("createNumberingImportBatch") &&
    numberingAsyncSource.includes("getNumberingImportBatch") &&
    numberingAsyncSource.includes("listNumberingImportBatches") &&
    numberingAsyncSource.includes("confirmNumberingImportBatch") &&
    numberingAsyncSource.includes("analyzeNumberingImportRow") &&
    numberingAsyncSource.includes("listNumberingAdminMatrix") &&
    numberingAsyncSource.includes("upsertNumberingAdminRole") &&
    numberingAsyncSource.includes("upsertNumberingRolePermission") &&
    numberingAsyncSource.includes("upsertNumberingRoleScope") &&
    numberingAsyncSource.includes("upsertNumberingUserRoleAssignment") &&
    numberingAsyncSource.includes("revokeNumberingUserRoleAssignment") &&
    numberingAsyncSource.includes("saveNumberingRolePriority") &&
    numberingAsyncSource.includes("upsertNumberingApprovalDelegation") &&
    numberingAsyncSource.includes("revokeNumberingApprovalDelegation") &&
    numberingAsyncSource.includes("upsertNumberingApprovalRule") &&
    numberingAsyncSource.includes("applyNumberingRuleTemplate") &&
    numberingAsyncSource.includes("evaluateApprovalRules") &&
    numberingAsyncSource.includes("evaluateNumberingGate") &&
    numberingAsyncSource.includes("analyzeMainDrawingObsolescence") &&
    numberingAsyncSource.includes("linkPartNumberToDrawing") &&
    numberingAsyncSource.includes("insertNumberingApprovalRequest") &&
    numberingAsyncSource.includes("applyApprovedNumberingRequest") &&
    numberingAsyncSource.includes("refreshApprovalBatchStatus") &&
    numberingAsyncHelperSource.includes("createNumberingRecordAsync") &&
    numberingAsyncHelperSource.includes("updateDraftNumberingRecordAsync") &&
    numberingAsyncHelperSource.includes("obsoleteDraftNumberingRecordAsync") &&
    numberingAsyncHelperSource.includes("checkNumberingDuplicatesAsync") &&
    numberingAsyncHelperSource.includes("requestNumberingApprovalAsync") &&
    numberingAsyncHelperSource.includes("requestSameDrawingVariantApprovalAsync") &&
    numberingAsyncHelperSource.includes("requestMainDrawingRestoreApprovalAsync") &&
    numberingAsyncHelperSource.includes("decideNumberingApprovalAsync") &&
    numberingAsyncHelperSource.includes("getNumberingApprovalBatchAsync") &&
    numberingAsyncHelperSource.includes("listNumberingApprovalBatchesAsync") &&
    numberingAsyncHelperSource.includes("createNumberingApprovalBatchAsync") &&
    numberingAsyncHelperSource.includes("decideNumberingApprovalBatchAsync") &&
    numberingAsyncHelperSource.includes("resubmitRejectedNumberingApprovalBatchItemsAsync") &&
    numberingAsyncHelperSource.includes("createNumberingImportBatchAsync") &&
    numberingAsyncHelperSource.includes("getNumberingImportBatchAsync") &&
    numberingAsyncHelperSource.includes("listNumberingImportBatchesAsync") &&
    numberingAsyncHelperSource.includes("confirmNumberingImportBatchAsync") &&
    numberingAsyncHelperSource.includes("listNumberingAdminMatrixAsync") &&
    numberingAsyncHelperSource.includes("upsertNumberingAdminRoleAsync") &&
    numberingAsyncHelperSource.includes("upsertNumberingRolePermissionAsync") &&
    numberingAsyncHelperSource.includes("upsertNumberingRoleScopeAsync") &&
    numberingAsyncHelperSource.includes("upsertNumberingUserRoleAssignmentAsync") &&
    numberingAsyncHelperSource.includes("revokeNumberingUserRoleAssignmentAsync") &&
    numberingAsyncHelperSource.includes("saveNumberingRolePriorityAsync") &&
    numberingAsyncHelperSource.includes("upsertNumberingApprovalDelegationAsync") &&
    numberingAsyncHelperSource.includes("revokeNumberingApprovalDelegationAsync") &&
    numberingAsyncHelperSource.includes("upsertNumberingApprovalRuleAsync") &&
    numberingAsyncHelperSource.includes("applyNumberingRuleTemplateAsync") &&
    numberingAsyncHelperSource.includes("evaluateApprovalRulesAsync") &&
    numberingAsyncHelperSource.includes("evaluateNumberingGateAsync") &&
    numberingAsyncHelperSource.includes("analyzeMainDrawingObsolescenceAsync") &&
    numberingAsyncHelperSource.includes("linkPartNumberToDrawingAsync") &&
    numberingAsyncHelperSource.includes("listNumberingTasksAsync") &&
    numberingAsyncHelperSource.includes("updateNumberingTaskStatusAsync") &&
    numberingAsyncHelperSource.includes("listNumberingNotificationsAsync") &&
    numberingAsyncHelperSource.includes("updateNumberingNotificationStateAsync") &&
    numberingAsyncHelperSource.includes("createNumberingExportJobAsync") &&
    numberingAsyncHelperSource.includes("getNumberingExportJobAsync") &&
    numberingAsyncHelperSource.includes("listNumberingExportJobsAsync") &&
    numberingAsyncHelperSource.includes("generateMonthlyNumberingAuditReportAsync") &&
    numberingAsyncHelperSource.includes("getMonthlyNumberingAuditReportAsync") &&
    numberingAsyncHelperSource.includes("listMonthlyNumberingAuditReportsAsync") &&
    numberingAsyncHelperSource.includes("markOverdueDraftNumberingRecordsAsync") &&
    numberingAsyncHelperSource.includes("getNumberingRootDetailAsync") &&
    numberingAsyncHelperSource.includes("searchNumberingRecordsAsync") &&
    numberingAsyncHelperSource.includes("listDrawingModuleRecordsAsync") &&
    numberingAsyncHelperSource.includes("listPartModuleRecordsAsync") &&
    numberingAsyncHelperSource.includes("getPartModuleDetailAsync") &&
    numberingAsyncHelperSource.includes("upsertPartVariantAttributesAsync") &&
    numberingAsyncHelperSource.includes("createPartCostProfileAsync") &&
    numberingAsyncHelperSource.includes("decidePartCostChangeRequestAsync") &&
    numberingAsyncHelperSource.includes("resolvePartCostAsync") &&
    numberingDuplicateCheckRouteSource.includes("checkNumberingDuplicatesAsync") &&
    !numberingDuplicateCheckRouteSource.includes("checkNumberingDuplicates(") &&
    !numberingDuplicateCheckRouteSource.includes('from "@/lib/db"') &&
    numberingTasksRouteSource.includes("listNumberingTasksAsync") &&
    !numberingTasksRouteSource.includes("listNumberingTasks(") &&
    !numberingTasksRouteSource.includes('from "@/lib/db"') &&
    numberingTaskDetailRouteSource.includes("updateNumberingTaskStatusAsync") &&
    !numberingTaskDetailRouteSource.includes("updateNumberingTaskStatus(") &&
    !numberingTaskDetailRouteSource.includes('from "@/lib/db"') &&
    numberingApprovalBatchesRouteSource.includes("listNumberingApprovalBatchesAsync") &&
    numberingApprovalBatchesRouteSource.includes("createNumberingApprovalBatchAsync") &&
    !numberingApprovalBatchesRouteSource.includes("listNumberingApprovalBatches(") &&
    !numberingApprovalBatchesRouteSource.includes("createNumberingApprovalBatch(") &&
    !numberingApprovalBatchesRouteSource.includes('from "@/lib/db"') &&
    numberingApprovalBatchDetailRouteSource.includes("getNumberingApprovalBatchAsync") &&
    numberingApprovalBatchDetailRouteSource.includes("decideApprovalPlatformLegacyNumberingBatchAsync") &&
    numberingApprovalBatchDetailRouteSource.includes("resubmitRejectedNumberingApprovalBatchItemsAsync") &&
    !numberingApprovalBatchDetailRouteSource.includes("getNumberingApprovalBatch(") &&
    !numberingApprovalBatchDetailRouteSource.includes("decideNumberingApprovalBatch(") &&
    !numberingApprovalBatchDetailRouteSource.includes("resubmitRejectedNumberingApprovalBatchItems(") &&
    !numberingApprovalBatchDetailRouteSource.includes('from "@/lib/db"') &&
    numberingApprovalDecisionsRouteSource.includes("decideApprovalPlatformLegacyNumberingAsync") &&
    !numberingApprovalDecisionsRouteSource.includes("decideNumberingApproval(") &&
    !numberingApprovalDecisionsRouteSource.includes('from "@/lib/db"') &&
    numberingApprovalRequestsRouteSource.includes("requestNumberingApprovalAsync") &&
    numberingApprovalRequestsRouteSource.includes("requestSameDrawingVariantApprovalAsync") &&
    numberingApprovalRequestsRouteSource.includes("requestMainDrawingRestoreApprovalAsync") &&
    !numberingApprovalRequestsRouteSource.includes("requestNumberingApproval(") &&
    !numberingApprovalRequestsRouteSource.includes("requestSameDrawingVariantApproval(") &&
    !numberingApprovalRequestsRouteSource.includes("requestMainDrawingRestoreApproval(") &&
    !numberingApprovalRequestsRouteSource.includes('from "@/lib/db"') &&
    numberingImportBatchesRouteSource.includes("listNumberingImportBatchesAsync") &&
    numberingImportBatchesRouteSource.includes("createNumberingImportBatchAsync") &&
    !numberingImportBatchesRouteSource.includes("listNumberingImportBatches(") &&
    !numberingImportBatchesRouteSource.includes("createNumberingImportBatch(") &&
    !numberingImportBatchesRouteSource.includes('from "@/lib/db"') &&
    numberingImportBatchRouteSource.includes("getNumberingImportBatchAsync") &&
    !numberingImportBatchRouteSource.includes("getNumberingImportBatch(") &&
    !numberingImportBatchRouteSource.includes('from "@/lib/db"') &&
    numberingImportBatchConfirmRouteSource.includes("confirmNumberingImportBatchAsync") &&
    !numberingImportBatchConfirmRouteSource.includes("confirmNumberingImportBatch(") &&
    !numberingImportBatchConfirmRouteSource.includes('from "@/lib/db"') &&
    numberingAdminMatrixRouteSource.includes("listNumberingAdminMatrixAsync") &&
    numberingAdminMatrixRouteSource.includes("upsertNumberingAdminRoleAsync") &&
    numberingAdminMatrixRouteSource.includes("upsertNumberingRolePermissionAsync") &&
    numberingAdminMatrixRouteSource.includes("upsertNumberingRoleScopeAsync") &&
    numberingAdminMatrixRouteSource.includes("upsertNumberingUserRoleAssignmentAsync") &&
    numberingAdminMatrixRouteSource.includes("revokeNumberingUserRoleAssignmentAsync") &&
    numberingAdminMatrixRouteSource.includes("saveNumberingRolePriorityAsync") &&
    numberingAdminMatrixRouteSource.includes("upsertNumberingApprovalDelegationAsync") &&
    numberingAdminMatrixRouteSource.includes("revokeNumberingApprovalDelegationAsync") &&
    numberingAdminMatrixRouteSource.includes("upsertNumberingApprovalRuleAsync") &&
    numberingAdminMatrixRouteSource.includes("applyNumberingRuleTemplateAsync") &&
    !numberingAdminMatrixRouteSource.includes("listNumberingAdminMatrix(") &&
    !numberingAdminMatrixRouteSource.includes("upsertNumberingAdminRole(") &&
    !numberingAdminMatrixRouteSource.includes("upsertNumberingRolePermission(") &&
    !numberingAdminMatrixRouteSource.includes("upsertNumberingRoleScope(") &&
    !numberingAdminMatrixRouteSource.includes("upsertNumberingUserRoleAssignment(") &&
    !numberingAdminMatrixRouteSource.includes("revokeNumberingUserRoleAssignment(") &&
    !numberingAdminMatrixRouteSource.includes("saveNumberingRolePriority(") &&
    !numberingAdminMatrixRouteSource.includes("upsertNumberingApprovalDelegation(") &&
    !numberingAdminMatrixRouteSource.includes("revokeNumberingApprovalDelegation(") &&
    !numberingAdminMatrixRouteSource.includes("upsertNumberingApprovalRule(") &&
    !numberingAdminMatrixRouteSource.includes("applyNumberingRuleTemplate(") &&
    !numberingAdminMatrixRouteSource.includes('from "@/lib/db"') &&
    numberingImpactAnalysisRouteSource.includes("analyzeMainDrawingObsolescenceAsync") &&
    !numberingImpactAnalysisRouteSource.includes("analyzeMainDrawingObsolescence(") &&
    !numberingImpactAnalysisRouteSource.includes('from "@/lib/db"') &&
    numberingRuleSimulatorRouteSource.includes("evaluateApprovalRulesAsync") &&
    numberingRuleSimulatorRouteSource.includes("evaluateNumberingGateAsync") &&
    !numberingRuleSimulatorRouteSource.includes("evaluateApprovalRules(") &&
    !numberingRuleSimulatorRouteSource.includes("evaluateNumberingGate(") &&
    !numberingRuleSimulatorRouteSource.includes('from "@/lib/db"') &&
    numberingVariantsRouteSource.includes("linkPartNumberToDrawingAsync") &&
    !numberingVariantsRouteSource.includes("linkPartNumberToDrawing(") &&
    !numberingVariantsRouteSource.includes('from "@/lib/db"') &&
    numberingNotificationsRouteSource.includes("listNumberingNotificationsAsync") &&
    !numberingNotificationsRouteSource.includes("listNumberingNotifications(") &&
    !numberingNotificationsRouteSource.includes('from "@/lib/db"') &&
    numberingNotificationReadRouteSource.includes("updateNumberingNotificationStateAsync") &&
    !numberingNotificationReadRouteSource.includes("updateNumberingNotificationState(") &&
    !numberingNotificationReadRouteSource.includes('from "@/lib/db"') &&
    numberingNotificationHandledRouteSource.includes("updateNumberingNotificationStateAsync") &&
    !numberingNotificationHandledRouteSource.includes("updateNumberingNotificationState(") &&
    !numberingNotificationHandledRouteSource.includes('from "@/lib/db"') &&
    numberingExportJobsRouteSource.includes("listNumberingExportJobsAsync") &&
    numberingExportJobsRouteSource.includes("createNumberingExportJobAsync") &&
    !numberingExportJobsRouteSource.includes("listNumberingExportJobs(") &&
    !numberingExportJobsRouteSource.includes("createNumberingExportJob(") &&
    !numberingExportJobsRouteSource.includes('from "@/lib/db"') &&
    numberingExportJobRouteSource.includes("getNumberingExportJobAsync") &&
    !numberingExportJobRouteSource.includes("getNumberingExportJob(") &&
    !numberingExportJobRouteSource.includes('from "@/lib/db"') &&
    numberingMonthlyAuditReportsRouteSource.includes("listMonthlyNumberingAuditReportsAsync") &&
    numberingMonthlyAuditReportsRouteSource.includes("generateMonthlyNumberingAuditReportAsync") &&
    !numberingMonthlyAuditReportsRouteSource.includes("listMonthlyNumberingAuditReports(") &&
    !numberingMonthlyAuditReportsRouteSource.includes("generateMonthlyNumberingAuditReport(") &&
    !numberingMonthlyAuditReportsRouteSource.includes('from "@/lib/db"') &&
    numberingMonthlyAuditReportRouteSource.includes("getMonthlyNumberingAuditReportAsync") &&
    !numberingMonthlyAuditReportRouteSource.includes("getMonthlyNumberingAuditReport(") &&
    !numberingMonthlyAuditReportRouteSource.includes('from "@/lib/db"') &&
    numberingDraftsOverdueRouteSource.includes("markOverdueDraftNumberingRecordsAsync") &&
    !numberingDraftsOverdueRouteSource.includes("markOverdueDraftNumberingRecords(") &&
    !numberingDraftsOverdueRouteSource.includes('from "@/lib/db"') &&
    numberingRootDetailRouteSource.includes("getNumberingRootDetailAsync") &&
    !numberingRootDetailRouteSource.includes("getNumberingRootDetail(") &&
    !numberingRootDetailRouteSource.includes('from "@/lib/db"') &&
    numberingRecordsRouteSource.includes("createNumberingRecordAsync") &&
    !numberingRecordsRouteSource.includes("createNumberingRecord(") &&
    !numberingRecordsRouteSource.includes('from "@/lib/db"') &&
    numberingRecordDetailRouteSource.includes("updateDraftNumberingRecordAsync") &&
    !numberingRecordDetailRouteSource.includes("updateDraftNumberingRecord(") &&
    !numberingRecordDetailRouteSource.includes('from "@/lib/db"') &&
    numberingRecordObsoleteRouteSource.includes("obsoleteDraftNumberingRecordAsync") &&
    !numberingRecordObsoleteRouteSource.includes("obsoleteDraftNumberingRecord(") &&
    !numberingRecordObsoleteRouteSource.includes('from "@/lib/db"') &&
    numberingSearchRouteSource.includes("searchNumberingRecordsAsync") &&
    !numberingSearchRouteSource.includes("searchNumberingRecords(") &&
    !numberingSearchRouteSource.includes('from "@/lib/db"') &&
    numberingDrawingsRouteSource.includes("listDrawingModuleRecordsAsync") &&
    !numberingDrawingsRouteSource.includes("listDrawingModuleRecords(") &&
    !numberingDrawingsRouteSource.includes('from "@/lib/db"') &&
    partsRouteSource.includes("listPartModuleRecordsAsync") &&
    !partsRouteSource.includes("listPartModuleRecords(") &&
    !partsRouteSource.includes('from "@/lib/db"') &&
    partsDetailRouteSource.includes("getPartModuleDetailAsync") &&
    !partsDetailRouteSource.includes("getPartModuleDetail(") &&
    !partsDetailRouteSource.includes('from "@/lib/db"') &&
    partsVariantRouteSource.includes("upsertPartVariantAttributesAsync") &&
    !partsVariantRouteSource.includes("upsertPartVariantAttributes(") &&
    !partsVariantRouteSource.includes('from "@/lib/db"') &&
    partsCostProfilesRouteSource.includes("createPartCostProfileAsync") &&
    !partsCostProfilesRouteSource.includes("createPartCostProfile(") &&
    !partsCostProfilesRouteSource.includes('from "@/lib/db"') &&
    partsCostChangeRequestRouteSource.includes("decideApprovalPlatformLegacyPartCostAsync") &&
    !partsCostChangeRequestRouteSource.includes("decidePartCostChangeRequest(") &&
    !partsCostChangeRequestRouteSource.includes('from "@/lib/db"') &&
    partsCostResolutionRouteSource.includes("resolvePartCostAsync") &&
    !partsCostResolutionRouteSource.includes("resolvePartCost(") &&
    !partsCostResolutionRouteSource.includes('from "@/lib/db"') &&
    !numberingAsyncSource.includes("getDb(") &&
    !numberingAsyncSource.includes("better-sqlite3") &&
    !numberingAsyncSource.includes('from "@/lib/db"') &&
    !numberingAsyncSource.includes("datetime(") &&
    !numberingAsyncSource.includes("rowid") &&
    !numberingAsyncHelperSource.includes("getDb(") &&
    !numberingAsyncHelperSource.includes('from "@/lib/db"'),
  "numbering-async-repository.ts, numbering-async.ts, numbering/duplicate-check route.ts"
);
record(
  "MASTER-ATTACHMENT-ASYNC-001 repository helper and attachment routes use async provider access",
  masterAttachmentAsyncSource.includes("AsyncDatabaseClient") &&
    [
      "SELECT_ASYNC_PART_ATTACHMENT_ENTITY_SQL",
      "SELECT_ASYNC_DRAWING_ATTACHMENT_ENTITY_SQL",
      "SELECT_ASYNC_PART_ATTACHMENT_ENTITY_BY_ID_SQL",
      "SELECT_ASYNC_DRAWING_ATTACHMENT_ENTITY_BY_ID_SQL",
      "SELECT_ASYNC_MASTER_ATTACHMENTS_SQL",
      "SELECT_ASYNC_MASTER_ATTACHMENT_SQL",
      "SELECT_ASYNC_MASTER_ATTACHMENT_BY_ID_SQL",
      "SELECT_ASYNC_MASTER_ATTACHMENT_DUPLICATE_SQL",
      "INSERT_ASYNC_MASTER_ATTACHMENT_SQL",
      "UPDATE_ASYNC_MASTER_ATTACHMENT_DELETE_SQL",
      "UPDATE_ASYNC_MASTER_ATTACHMENT_GDRIVE_UPLOADING_SQL",
      "UPDATE_ASYNC_MASTER_ATTACHMENT_GDRIVE_UPLOADED_SQL",
      "UPDATE_ASYNC_MASTER_ATTACHMENT_GDRIVE_FAILED_SQL",
      "SELECT_ASYNC_MASTER_ATTACHMENT_GDRIVE_FOLDER_SQL"
    ].every((constant) => masterAttachmentAsyncSource.includes(constant)) &&
    masterAttachmentAsyncSource.includes("export class AsyncMasterAttachmentRepository") &&
    masterAttachmentAsyncSource.includes("listMasterAttachments") &&
    masterAttachmentAsyncSource.includes("createMasterAttachment") &&
    masterAttachmentAsyncSource.includes("getMasterAttachment") &&
    masterAttachmentAsyncSource.includes("getMasterAttachmentBytes") &&
    masterAttachmentAsyncSource.includes("softDeleteMasterAttachment") &&
    masterAttachmentAsyncSource.includes("syncMasterAttachmentToDrive") &&
    [
      "listMasterAttachmentsAsync",
      "createMasterAttachmentAsync",
      "getMasterAttachmentAsync",
      "getMasterAttachmentBytesAsync",
      "softDeleteMasterAttachmentAsync",
      "syncMasterAttachmentToDriveAsync"
    ].every((helper) => masterAttachmentsAsyncHelperSource.includes(helper)) &&
    partsAttachmentsRouteSource.includes("listMasterAttachmentsAsync") &&
    partsAttachmentsRouteSource.includes("createMasterAttachmentAsync") &&
    !partsAttachmentsRouteSource.includes("listMasterAttachments(") &&
    !partsAttachmentsRouteSource.includes("createMasterAttachment(") &&
    !partsAttachmentsRouteSource.includes('from "@/lib/db"') &&
    partsAttachmentDetailRouteSource.includes("getMasterAttachmentAsync") &&
    partsAttachmentDetailRouteSource.includes("getMasterAttachmentBytesAsync") &&
    partsAttachmentDetailRouteSource.includes("softDeleteMasterAttachmentAsync") &&
    partsAttachmentDetailRouteSource.includes("syncMasterAttachmentToDriveAsync") &&
    !partsAttachmentDetailRouteSource.includes("getMasterAttachment(") &&
    !partsAttachmentDetailRouteSource.includes("getMasterAttachmentBytes(") &&
    !partsAttachmentDetailRouteSource.includes("softDeleteMasterAttachment(") &&
    !partsAttachmentDetailRouteSource.includes("syncMasterAttachmentToDrive(") &&
    !partsAttachmentDetailRouteSource.includes('from "@/lib/db"') &&
    drawingAttachmentsRouteSource.includes("listMasterAttachmentsAsync") &&
    drawingAttachmentsRouteSource.includes("createMasterAttachmentAsync") &&
    !drawingAttachmentsRouteSource.includes("listMasterAttachments(") &&
    !drawingAttachmentsRouteSource.includes("createMasterAttachment(") &&
    !drawingAttachmentsRouteSource.includes('from "@/lib/db"') &&
    drawingAttachmentDetailRouteSource.includes("getMasterAttachmentAsync") &&
    drawingAttachmentDetailRouteSource.includes("getMasterAttachmentBytesAsync") &&
    drawingAttachmentDetailRouteSource.includes("softDeleteMasterAttachmentAsync") &&
    drawingAttachmentDetailRouteSource.includes("syncMasterAttachmentToDriveAsync") &&
    !drawingAttachmentDetailRouteSource.includes("getMasterAttachment(") &&
    !drawingAttachmentDetailRouteSource.includes("getMasterAttachmentBytes(") &&
    !drawingAttachmentDetailRouteSource.includes("softDeleteMasterAttachment(") &&
    !drawingAttachmentDetailRouteSource.includes("syncMasterAttachmentToDrive(") &&
    !drawingAttachmentDetailRouteSource.includes('from "@/lib/db"') &&
    !masterAttachmentAsyncSource.includes("getDb(") &&
    !masterAttachmentAsyncSource.includes("better-sqlite3") &&
    !masterAttachmentAsyncSource.includes('from "@/lib/db"') &&
    !masterAttachmentAsyncSource.includes("datetime(") &&
    !masterAttachmentsAsyncHelperSource.includes("getDb(") &&
    !masterAttachmentsAsyncHelperSource.includes('from "@/lib/db"'),
  "master-attachment-async-repository.ts, master-attachments-async.ts, parts and drawing attachments routes"
);
record(
  "SUBMISSION-CANDIDATE-ASYNC-001 repository and helper expose async reuse and duplicate candidate lookup",
  submissionListAsyncSource.includes("SELECT_ASYNC_DESIGN_REUSE_CANDIDATES_SQLITE") &&
    submissionListAsyncSource.includes("SELECT_ASYNC_DESIGN_REUSE_CANDIDATES_POSTGRES") &&
    submissionListAsyncSource.includes("SELECT_ASYNC_DUPLICATE_GEOMETRY_CANDIDATES_SQLITE") &&
    submissionListAsyncSource.includes("SELECT_ASYNC_DUPLICATE_GEOMETRY_CANDIDATES_POSTGRES") &&
    submissionListAsyncSource.includes("listDesignReuseCandidates") &&
    submissionListAsyncSource.includes("listDuplicateGeometryCandidates") &&
    submissionListAsyncSource.includes("scoreDesignReuseCandidate") &&
    submissionListAsyncSource.includes("scoreDuplicateGeometryCandidate") &&
    submissionsAsyncSource.includes("listDesignReuseCandidatesAsync") &&
    submissionsAsyncSource.includes("listDuplicateGeometryCandidatesAsync") &&
    !submissionListAsyncSource.includes("datetime(") &&
    !submissionListAsyncSource.includes("getDb(") &&
    !submissionListAsyncSource.includes("better-sqlite3"),
  "submission-list-async-repository.ts, submissions-async.ts"
);
record(
  "SUBMISSION-CANDIDATE-ASYNC-002 shared reuse scoring helper preserves pure boundary",
  submissionSimilaritySource.includes("export function scoreDesignReuseCandidate") &&
    !submissionSimilaritySource.includes("getDb(") &&
    !submissionSimilaritySource.includes("query(") &&
    submissionListAsyncSource.includes("scoreDesignReuseCandidate as scoreDesignReuseCandidateShared") &&
    !submissionListAsyncSource.includes("function scoreDesignReuseCandidate(") &&
    !submissionRepositorySource.includes("function scoreDesignReuseCandidate(") &&
    submissionRepositorySource.includes("scoreDesignReuseCandidate as scoreDesignReuseCandidateShared"),
  "submission-similarity.ts, submission-repository.ts, submission-list-async-repository.ts"
);
record(
  "ROUTE-AUTH-ASYNC-022 numbering approval batch detail route uses async guards",
  numberingApprovalBatchDetailRouteSource.includes("requireNumberingPageAsync") &&
    (numberingApprovalBatchDetailRouteSource.match(/await requireNumberingPageAsync\(request, "numbering\.approvals"\)/gu)?.length ?? 0) === 2 &&
    numberingApprovalBatchDetailRouteSource.includes("canUserUseNumberingActionAsync") &&
    (numberingApprovalBatchDetailRouteSource.match(/await canUserUseNumberingActionAsync/gu)?.length ?? 0) === 2 &&
    numberingApprovalBatchDetailRouteSource.includes("getNumberingApprovalBatchAsync") &&
    numberingApprovalBatchDetailRouteSource.includes("decideApprovalPlatformLegacyNumberingBatchAsync") &&
    numberingApprovalBatchDetailRouteSource.includes("resubmitRejectedNumberingApprovalBatchItemsAsync") &&
    !numberingApprovalBatchDetailRouteSource.includes('from "@/lib/db"') &&
    !numberingApprovalBatchDetailRouteSource.includes("requireAuth(request") &&
    !numberingApprovalBatchDetailRouteSource.includes("requireRole(request") &&
    !numberingApprovalBatchDetailRouteSource.includes("requireNumberingPage(request") &&
    !numberingApprovalBatchDetailRouteSource.includes("canUserUseNumberingAction(") &&
    !numberingApprovalBatchDetailRouteSource.includes('from "@/lib/auth"'),
  "numbering/approval-batches/[batchId] route.ts"
);
const numberingApiRoutesWithSyncPermissionGuard = numberingApiRouteSources.filter(
  ({ source: routeSource }) =>
    routeSource.includes("requireNumberingPage(request") ||
    routeSource.includes("requireNumberingAction(request") ||
    routeSource.includes("canUserUseNumberingAction(") ||
    /import\s*\{[^}]*\brequireNumberingPage\b(?!Async)[^}]*\}\s*from\s*["']@\/lib\/numbering-permission-guard["']/u.test(routeSource) ||
    /import\s*\{[^}]*\brequireNumberingAction\b(?!Async)[^}]*\}\s*from\s*["']@\/lib\/numbering-permission-guard["']/u.test(routeSource) ||
    /import\s*\{[^}]*\bcanUserUseNumberingAction\b(?!Async)[^}]*\}\s*from\s*["']@\/lib\/numbering-permission-guard["']/u.test(routeSource)
);
const numberingApiRoutesWithDirectSyncAuthImport = numberingApiRouteSources.filter(({ source: routeSource }) =>
  routeSource.includes('from "@/lib/auth"')
);
record(
  "ROUTE-AUTH-ASYNC-023 numbering API routes use async permission guards",
  numberingApiRouteSources.some(({ source: routeSource }) => routeSource.includes("@/lib/numbering-permission-guard")) &&
    numberingApiRouteSources.some(({ source: routeSource }) => routeSource.includes("requireNumberingActionAsync")) &&
    numberingApiRouteSources.some(({ source: routeSource }) => routeSource.includes("requireNumberingPageAsync")) &&
    numberingApiRouteSources.some(({ source: routeSource }) => routeSource.includes("canUserUseNumberingActionAsync")) &&
    numberingApiRoutesWithSyncPermissionGuard.length === 0 &&
    numberingApiRoutesWithDirectSyncAuthImport.length === 0,
  JSON.stringify({
    syncPermissionGuardRoutes: numberingApiRoutesWithSyncPermissionGuard.map((route) => route.label),
    directSyncAuthImportRoutes: numberingApiRoutesWithDirectSyncAuthImport.map((route) => route.label)
  })
);
const partsApiRoutesWithSyncPermissionGuard = partsApiRouteSources.filter(
  ({ source: routeSource }) =>
    routeSource.includes("requireNumberingPage(request") ||
    routeSource.includes("requireNumberingAction(request") ||
    routeSource.includes("canUserUseNumberingAction(") ||
    /import\s*\{[^}]*\brequireNumberingPage\b(?!Async)[^}]*\}\s*from\s*["']@\/lib\/numbering-permission-guard["']/u.test(routeSource) ||
    /import\s*\{[^}]*\brequireNumberingAction\b(?!Async)[^}]*\}\s*from\s*["']@\/lib\/numbering-permission-guard["']/u.test(routeSource) ||
    /import\s*\{[^}]*\bcanUserUseNumberingAction\b(?!Async)[^}]*\}\s*from\s*["']@\/lib\/numbering-permission-guard["']/u.test(routeSource)
);
record(
  "ROUTE-AUTH-ASYNC-024 parts API numbering-adjacent routes use async permission guards",
  partsApiRouteSources.some(({ source: routeSource }) => routeSource.includes("@/lib/numbering-permission-guard")) &&
    partsApiRouteSources.some(({ source: routeSource }) => routeSource.includes("requireNumberingActionAsync")) &&
    partsApiRouteSources.some(({ source: routeSource }) => routeSource.includes("requireNumberingPageAsync")) &&
    partsApiRoutesWithSyncPermissionGuard.length === 0,
  JSON.stringify({
    syncPermissionGuardRoutes: partsApiRoutesWithSyncPermissionGuard.map((route) => route.label)
  })
);
record(
  "AUDIT-ASYNC-001 audit repository imports AsyncDatabaseClient and avoids sync DB",
  auditSource.includes("AsyncDatabaseClient") && !auditSource.includes("getDb(") && !auditSource.includes("better-sqlite3"),
  "audit-async-repository.ts"
);
record(
  "AUDIT-ASYNC-002 audit repository exposes portable insert SQL",
  auditSource.includes("INSERT_ASYNC_AUDIT_LOG_SQL") &&
    [":id", ":submissionId", ":actorId", ":action", ":detailJson", ":createdAt"].every((param) => auditSource.includes(param)),
  "audit-async-repository.ts"
);
record(
  "AUDIT-ASYNC-003 audit async helper uses runtime async provider selector",
  auditAsyncSource.includes("getAsyncDatabaseClient") &&
    auditAsyncSource.includes("AsyncAuditRepository") &&
    auditAsyncSource.includes("createAuditLogAsync") &&
    !auditAsyncSource.includes("SQLiteAsyncDatabaseClient") &&
    !auditAsyncSource.includes("getDb("),
  "audit-async.ts"
);
record(
  "AUDIT-ASYNC-004 login and token routes use async audit helper",
  [loginRouteSource, tokenRouteSource].every(
    (routeSource) =>
      routeSource.includes("createAuditLogAsync") &&
      routeSource.includes("await createAuditLogAsync") &&
      !routeSource.includes("createAuditLog,") &&
      !routeSource.includes("createAuditLog }")
  ),
  "auth/login route.ts, auth/token route.ts"
);
record(
  "ITEM-INSIGHT-ASYNC-001 repository imports AsyncDatabaseClient and avoids sync DB",
  itemInsightSource.includes("AsyncDatabaseClient") &&
    !itemInsightSource.includes("getDb(") &&
    !itemInsightSource.includes("better-sqlite3") &&
    !itemInsightSource.includes('from "@/lib/db"'),
  "item-insight-async-repository.ts"
);
record(
  "ITEM-INSIGHT-ASYNC-002 repository exposes portable SQL constants",
  itemInsightSource.includes("SELECT_ASYNC_ITEM_REVISION_HISTORY_SQL") &&
    itemInsightSource.includes("SELECT_ASYNC_WHERE_USED_SQL") &&
    [":partNumber", ":submittedBy"].every((param) => itemInsightSource.includes(param)),
  "item-insight-async-repository.ts"
);
record(
  "ITEM-INSIGHT-ASYNC-003 where-used SQL avoids SQLite-only datetime and rowid ordering",
  !itemInsightSource.includes("datetime(") &&
    !itemInsightSource.includes(".rowid") &&
    itemInsightSource.includes("COALESCE(cs.released_at, cs.updated_at, cs.created_at)") &&
    itemInsightSource.includes("COALESCE(lr.released_at, lr.updated_at, lr.created_at)") &&
    itemInsightSource.includes("COALESCE(s.released_at, s.updated_at, s.created_at)"),
  "item-insight-async-repository.ts"
);
record(
  "ITEM-INSIGHT-ASYNC-004 runtime helper uses async provider selector",
  itemInsightsAsyncSource.includes("getAsyncDatabaseClient") &&
    itemInsightsAsyncSource.includes("AsyncItemInsightRepository") &&
    itemInsightsAsyncSource.includes("listItemRevisionHistoryAsync") &&
    itemInsightsAsyncSource.includes("listWhereUsedAsync") &&
    !itemInsightsAsyncSource.includes("SQLiteAsyncDatabaseClient") &&
    !itemInsightsAsyncSource.includes("getDb("),
  "item-insights-async.ts"
);
record(
  "DASHBOARD-METRICS-ASYNC-001 repository imports AsyncDatabaseClient and avoids sync DB",
  dashboardAsyncSource.includes("AsyncDatabaseClient") &&
    !dashboardAsyncSource.includes("getDb(") &&
    !dashboardAsyncSource.includes("better-sqlite3") &&
    !dashboardAsyncSource.includes('from "@/lib/db"'),
  "dashboard-async-repository.ts"
);
record(
  "DASHBOARD-METRICS-ASYNC-002 repository exposes portable scoped status count SQL",
  dashboardAsyncSource.includes("SELECT_ASYNC_DASHBOARD_STATUS_COUNTS_SQL") &&
    dashboardAsyncSource.includes("CAST(:submittedBy AS text) IS NULL") &&
    dashboardAsyncSource.includes("submitted_by = CAST(:submittedBy AS text)") &&
    dashboardAsyncSource.includes("company_id = CAST(:companyId AS text)") &&
    dashboardAsyncSource.includes("GROUP BY status"),
  "dashboard-async-repository.ts"
);
record(
  "DASHBOARD-METRICS-ASYNC-003 runtime helper uses async provider selector",
  dashboardMetricsAsyncSource.includes("getAsyncDatabaseClient") &&
    dashboardMetricsAsyncSource.includes("AsyncDashboardRepository") &&
    dashboardMetricsAsyncSource.includes("getDashboardMetricsAsync") &&
    !dashboardMetricsAsyncSource.includes("SQLiteAsyncDatabaseClient") &&
    !dashboardMetricsAsyncSource.includes("getDb("),
  "dashboard-metrics-async.ts"
);
record(
  "SUBMISSION-LIST-ASYNC-001 repository imports AsyncDatabaseClient and avoids sync DB",
  submissionListAsyncSource.includes("AsyncDatabaseClient") &&
    !submissionListAsyncSource.includes("getDb(") &&
    !submissionListAsyncSource.includes("better-sqlite3") &&
    !submissionListAsyncSource.includes('from "@/lib/db"'),
  "submission-list-async-repository.ts"
);
record(
  "SUBMISSION-LIST-ASYNC-002 repository exposes SQLite and Postgres portable SQL constants",
  submissionListAsyncSource.includes("SELECT_ASYNC_SUBMISSION_SUMMARIES_SQLITE") &&
    submissionListAsyncSource.includes("SELECT_ASYNC_SUBMISSION_SUMMARIES_POSTGRES") &&
    submissionListAsyncSource.includes("GROUP_CONCAT(DISTINCT f.file_role)") &&
    submissionListAsyncSource.includes("STRING_AGG(DISTINCT f.file_role, ',')") &&
    [":now", ":status", ":submittedBy", ":limit", ":offset"].every((param) => submissionListAsyncSource.includes(param)),
  "submission-list-async-repository.ts"
);
record(
  "SUBMISSION-LIST-ASYNC-003 runtime helper uses async provider selector",
  submissionsAsyncSource.includes("getAsyncDatabaseClient") &&
    submissionsAsyncSource.includes("AsyncSubmissionListRepository") &&
    submissionsAsyncSource.includes("listSubmissionsAsync") &&
    !submissionsAsyncSource.includes("SQLiteAsyncDatabaseClient") &&
    !submissionsAsyncSource.includes("getDb("),
  "submissions-async.ts"
);
record(
  "SUBMISSION-SEARCH-ASYNC-001 repository exposes SQLite and Postgres portable search SQL constants",
  submissionListAsyncSource.includes("SELECT_ASYNC_SUBMISSION_SEARCH_SQLITE") &&
    submissionListAsyncSource.includes("SELECT_ASYNC_SUBMISSION_SEARCH_POSTGRES") &&
    submissionListAsyncSource.includes("__SEARCH_WHERE__") &&
    submissionListAsyncSource.includes("LEFT JOIN file_references r") &&
    submissionListAsyncSource.includes("STRING_AGG(DISTINCT f.file_role, ',')"),
  "submission-list-async-repository.ts"
);
record(
  "SUBMISSION-SEARCH-ASYNC-002 search builder keeps filters provider-neutral",
  submissionListAsyncSource.includes("searchSubmissions(input") &&
    submissionListAsyncSource.includes("buildSearchWhere") &&
    submissionListAsyncSource.includes(":queryLike") &&
    submissionListAsyncSource.includes("COALESCE(cs.released_at, cs.updated_at, cs.created_at) DESC") &&
    !submissionListAsyncSource.includes("datetime(") &&
    !submissionListAsyncSource.includes("rowid"),
  "submission-list-async-repository.ts"
);
record(
  "SUBMISSION-SEARCH-ASYNC-003 runtime helper exposes searchSubmissionsAsync through async provider selector",
  submissionsAsyncSource.includes("searchSubmissionsAsync") &&
    submissionsAsyncSource.includes("SearchSubmissionsAsyncInput") &&
    submissionsAsyncSource.includes(".searchSubmissions(input)") &&
    !submissionsAsyncSource.includes("getDb("),
  "submissions-async.ts"
);
record(
  "SUBMISSION-DETAIL-ASYNC-001 repository exposes provider-neutral detail SQL constants",
  [
    "SELECT_ASYNC_SUBMISSION_DETAIL_SQL",
    "SELECT_ASYNC_SUBMISSION_FILES_SQL",
    "SELECT_ASYNC_SUBMISSION_REFERENCES_SQL",
    "SELECT_ASYNC_SUBMISSION_APPROVALS_SQL",
    "SELECT_ASYNC_SUBMISSION_AUDIT_LOGS_SQL",
    "SELECT_ASYNC_SUBMISSION_ACTIVE_LOCK_SQL",
    "SELECT_ASYNC_SUBMISSION_RELEASE_PACKAGE_SQL",
    "SELECT_ASYNC_SUBMISSION_BOM_HEADER_SQL",
    "SELECT_ASYNC_SUBMISSION_BOM_LINES_SQL"
  ].every((constant) => submissionListAsyncSource.includes(constant)),
  "submission-list-async-repository.ts"
);
record(
  "SUBMISSION-DETAIL-ASYNC-002 detail BOM and lock SQL avoids SQLite-only datetime and rowid",
  submissionListAsyncSource.includes("async getSubmission(id") &&
    submissionListAsyncSource.includes("getSubmissionBom") &&
    submissionListAsyncSource.includes("COALESCE(cs.released_at, cs.updated_at, cs.created_at) DESC") &&
    submissionListAsyncSource.includes("l.expires_at > :now") &&
    !submissionListAsyncSource.includes("datetime(") &&
    !submissionListAsyncSource.includes("rowid"),
  "submission-list-async-repository.ts"
);
record(
  "SUBMISSION-DETAIL-ASYNC-003 runtime helper exposes getSubmissionAsync through async provider selector",
  submissionsAsyncSource.includes("getSubmissionAsync") &&
    submissionsAsyncSource.includes(".getSubmission(id)") &&
    !submissionsAsyncSource.includes("getDb("),
  "submissions-async.ts"
);
record(
  "SUBMISSION-WRITE-ASYNC-001 repository exposes provider-neutral submission create SQL constants",
  [
    "SELECT_ASYNC_SUBMISSION_REVISION_EXISTS_SQL",
    "UPSERT_ASYNC_SUBMISSION_ITEM_SQL",
    "INSERT_ASYNC_SUBMISSION_RECORD_SQL",
    "INSERT_ASYNC_SUBMISSION_FILE_SQL",
    "INSERT_ASYNC_FILE_REFERENCE_SQL",
    "UPSERT_ASYNC_SUBMISSION_BOM_HEADER_SQL",
    "INSERT_ASYNC_SUBMISSION_BOM_LINE_SQL",
    "INSERT_ASYNC_SUBMISSION_WRITE_AUDIT_LOG_SQL"
  ].every((constant) => submissionWriteAsyncSource.includes(constant)) &&
    submissionWriteAsyncSource.includes("export class AsyncSubmissionWriteRepository"),
  "submission-write-async-repository.ts"
);
record(
  "SUBMISSION-WRITE-ASYNC-002 repository avoids sync DB imports and preserves create lifecycle behavior",
  submissionWriteAsyncSource.includes("AsyncDatabaseClient") &&
    submissionWriteAsyncSource.includes("submissionRevisionExists") &&
    submissionWriteAsyncSource.includes("createSubmissionRecord") &&
    submissionWriteAsyncSource.includes("materializeBomFromReferences") &&
    submissionWriteAsyncSource.includes("BomDraftMaterialized") &&
    submissionWriteAsyncSource.includes("Submit") &&
    !submissionWriteAsyncSource.includes("getDb(") &&
    !submissionWriteAsyncSource.includes("better-sqlite3") &&
    !submissionWriteAsyncSource.includes('from "@/lib/db"') &&
    !submissionWriteAsyncSource.includes("materializeBomDraftFromReferences"),
  "submission-write-async-repository.ts"
);
record(
  "SUBMISSION-WRITE-ASYNC-003 runtime helper exposes create operations through async provider selector",
  submissionsAsyncSource.includes("AsyncSubmissionWriteRepository") &&
    submissionsAsyncSource.includes("submissionRevisionExistsAsync") &&
    submissionsAsyncSource.includes("createSubmissionRecordAsync") &&
    submissionsAsyncSource.includes(".submissionRevisionExists(input)") &&
    submissionsAsyncSource.includes(".createSubmissionRecord(input)") &&
    !submissionsAsyncSource.includes("getDb("),
  "submissions-async.ts"
);
record(
  "SUBMISSION-WRITE-ASYNC-004 retired generic submissions POST remains authenticated and fail-closed",
  submissionsRouteSource.includes('await requireRoleAsync(request, ["Engineer", "Admin"])') &&
    submissionsRouteSource.includes('error: "GENERIC_SUBMISSION_RETIRED"') &&
    submissionsRouteSource.includes("{ status: 410 }") &&
    !submissionsRouteSource.includes('from "@/lib/db"') &&
    !submissionsRouteSource.includes("getDb("),
  "submissions route.ts"
);
record(
  "SUBMISSION-WRITE-ASYNC-005 create SQL keeps Postgres-compatible named parameters and conflict handling",
  submissionWriteAsyncSource.includes("ON CONFLICT(company_id, part_number)") &&
    submissionWriteAsyncSource.includes("ON CONFLICT(parent_submission_id)") &&
    submissionWriteAsyncSource.includes("RETURNING id") &&
    [":companyId", ":drawingNumber", ":revision", ":submissionId", ":sourceReferenceId", ":detailJson"].every((param) =>
      submissionWriteAsyncSource.includes(param)
    ) &&
    !submissionWriteAsyncSource.includes("datetime(") &&
    !submissionWriteAsyncSource.includes("rowid"),
  "submission-write-async-repository.ts"
);
record(
  "SUBMISSION-FILE-ASYNC-001 repository exposes provider-neutral file SQL constants",
  [
    "SELECT_ASYNC_SUBMISSION_FILE_SQL",
    "SELECT_ASYNC_FILES_NEEDING_UPLOAD_SQL",
    "UPDATE_ASYNC_FILE_GDRIVE_STATUS_SQL",
    "UPDATE_ASYNC_FILE_GDRIVE_STATUS_WITH_ID_SQL"
  ].every((constant) => submissionFileAsyncSource.includes(constant)) &&
    submissionFileAsyncSource.includes("export class AsyncSubmissionFileRepository"),
  "submission-file-async-repository.ts"
);
record(
  "SUBMISSION-FILE-ASYNC-002 repository avoids sync database access",
  submissionFileAsyncSource.includes("AsyncDatabaseClient") &&
    !submissionFileAsyncSource.includes("getDb(") &&
    !submissionFileAsyncSource.includes("better-sqlite3") &&
    !submissionFileAsyncSource.includes("SELECT * FROM submission_files WHERE submission_id = ?"),
  "submission-file-async-repository.ts"
);
record(
  "SUBMISSION-FILE-ASYNC-003 runtime helper exposes file operations through async provider selector",
  submissionFilesAsyncSource.includes("getAsyncDatabaseClient") &&
    submissionFilesAsyncSource.includes("getSubmissionFileAsync") &&
    submissionFilesAsyncSource.includes("getFilesNeedingUploadAsync") &&
    submissionFilesAsyncSource.includes("updateFileGDriveStatusAsync") &&
    !submissionFilesAsyncSource.includes("getDb("),
  "submission-files-async.ts"
);
record(
  "SUBMISSION-FILE-ASYNC-004 file response uses async submission and file metadata helpers",
  fileResponseSource.includes("getSubmissionAsync") &&
    fileResponseSource.includes("await getSubmissionAsync") &&
    fileResponseSource.includes("getSubmissionFileAsync") &&
    fileResponseSource.includes("await getSubmissionFileAsync") &&
    fileResponseSource.includes('import type { DbUser } from "@/lib/db"') &&
    !fileResponseSource.includes("getSubmission(") &&
    !fileResponseSource.includes("getSubmissionFile({") &&
    !/^import \{.*\} from "@\/lib\/db";$/mu.test(fileResponseSource),
  "file-response.ts"
);
record(
  "SUBMISSION-FILE-ASYNC-005 file-adjacent routes use async file helpers",
  submissionRetryUploadRouteSource.includes("getSubmissionAsync") &&
    submissionRetryUploadRouteSource.includes("await getSubmissionAsync") &&
    submissionRetryUploadRouteSource.includes("getFilesNeedingUploadAsync") &&
    submissionRetryUploadRouteSource.includes("await getFilesNeedingUploadAsync") &&
    submissionRetryUploadRouteSource.includes("updateFileGDriveStatusAsync") &&
    submissionPdfMarkupsRouteSource.includes("getSubmissionFileAsync") &&
    submissionDiscussionsRouteSource.includes("getSubmissionFileAsync") &&
    submissionIssuesRouteSource.includes("getSubmissionFileAsync") &&
    [submissionRetryUploadRouteSource, submissionPdfMarkupsRouteSource, submissionDiscussionsRouteSource, submissionIssuesRouteSource].every(
      (routeSource) => !routeSource.includes("getSubmissionFile({") && !routeSource.includes("getSubmission(id)")
  ),
  "retry-upload, pdf-markups, discussions, and issues routes"
);
record(
  "COLLABORATION-ASYNC-001 repository exposes provider-neutral collaboration SQL constants",
  [
    "SELECT_ASYNC_DISCUSSION_COMMENTS_SQL",
    "INSERT_ASYNC_DISCUSSION_COMMENT_SQL",
    "RESOLVE_ASYNC_DISCUSSION_COMMENT_SQL",
    "SELECT_ASYNC_REVIEW_ISSUES_SQL",
    "INSERT_ASYNC_REVIEW_ISSUE_SQL",
    "RESOLVE_ASYNC_REVIEW_ISSUE_SQL",
    "SELECT_ASYNC_PDF_MARKUPS_SQL",
    "INSERT_ASYNC_PDF_MARKUP_SQL",
    "RESOLVE_ASYNC_PDF_MARKUP_SQL"
  ].every((constant) => collaborationAsyncSource.includes(constant)) &&
    collaborationAsyncSource.includes("export class AsyncCollaborationRepository"),
  "collaboration-async-repository.ts"
);
record(
  "COLLABORATION-ASYNC-002 repository avoids sync database access and SQLite-only ordering",
  collaborationAsyncSource.includes("AsyncDatabaseClient") &&
    collaborationAsyncSource.includes("AsyncAuditRepository") &&
    !collaborationAsyncSource.includes("getDb(") &&
    !collaborationAsyncSource.includes("better-sqlite3") &&
    !collaborationAsyncSource.includes("datetime(") &&
    !collaborationAsyncSource.includes("rowid"),
  "collaboration-async-repository.ts"
);
record(
  "COLLABORATION-ASYNC-003 runtime helper exposes collaboration operations through async provider selector",
  collaborationAsyncHelperSource.includes("getAsyncDatabaseClient") &&
    [
      "listDiscussionCommentsAsync",
      "createDiscussionCommentAsync",
      "resolveDiscussionCommentAsync",
      "listReviewIssuesAsync",
      "createReviewIssueAsync",
      "resolveReviewIssueAsync",
      "listPdfMarkupsAsync",
      "createPdfMarkupAsync",
      "resolvePdfMarkupAsync"
    ].every((helper) => collaborationAsyncHelperSource.includes(helper)) &&
    !collaborationAsyncHelperSource.includes("getDb("),
  "collaboration-async.ts"
);
record(
  "COLLABORATION-ASYNC-004 collaboration routes use async helpers and avoid sync DB imports",
  [
    submissionDiscussionsRouteSource,
    submissionDiscussionRouteSource,
    submissionIssuesRouteSource,
    submissionIssueRouteSource,
    submissionPdfMarkupsRouteSource,
    submissionPdfMarkupRouteSource
  ].every((routeSource) => routeSource.includes('from "@/lib/collaboration-async"') && !routeSource.includes('from "@/lib/db"')) &&
    submissionIssuesRouteSource.includes("getUserByIdAsync") &&
    !submissionIssuesRouteSource.includes("getUserById("),
  "discussion, issue, and pdf markup routes"
);
record(
  "CHANGE-REQUEST-ASYNC-001 repository exposes provider-neutral change request SQL constants",
  [
    "SELECT_ASYNC_CHANGE_REQUESTS_SQL",
    "INSERT_ASYNC_CHANGE_REQUEST_SQL",
    "DECIDE_ASYNC_CHANGE_REQUEST_SQL"
  ].every((constant) => collaborationAsyncSource.includes(constant)) &&
    collaborationAsyncSource.includes("listChangeRequests") &&
    collaborationAsyncSource.includes("createChangeRequest") &&
    collaborationAsyncSource.includes("decideChangeRequest"),
  "collaboration-async-repository.ts"
);
record(
  "CHANGE-REQUEST-ASYNC-002 repository avoids sync database access and SQLite-only ordering",
  collaborationAsyncSource.includes("AsyncDatabaseClient") &&
    collaborationAsyncSource.includes("AsyncAuditRepository") &&
    !collaborationAsyncSource.includes("getDb(") &&
    !collaborationAsyncSource.includes("better-sqlite3") &&
    !collaborationAsyncSource.includes("datetime(") &&
    !collaborationAsyncSource.includes("rowid"),
  "collaboration-async-repository.ts"
);
record(
  "CHANGE-REQUEST-ASYNC-003 runtime helper exposes change request operations through async provider selector",
  collaborationAsyncHelperSource.includes("getAsyncDatabaseClient") &&
    [
      "listChangeRequestsAsync",
      "getChangeRequestAsync",
      "createChangeRequestAsync",
      "decideChangeRequestAsync"
    ].every((helper) => collaborationAsyncHelperSource.includes(helper)) &&
    !collaborationAsyncHelperSource.includes("getDb("),
  "collaboration-async.ts"
);
record(
  "CHANGE-REQUEST-ASYNC-004 change request routes use async helpers and avoid sync DB imports",
  [submissionChangesRouteSource, submissionChangeRouteSource].every(
    (routeSource) => routeSource.includes('from "@/lib/collaboration-async"') && !routeSource.includes('from "@/lib/db"')
  ) &&
    submissionChangesRouteSource.includes("listChangeRequestsAsync") &&
    submissionChangesRouteSource.includes("createChangeRequestAsync") &&
    submissionChangeRouteSource.includes("getChangeRequestAsync") &&
    submissionChangeRouteSource.includes("decideChangeRequestAsync"),
  "change request routes"
);
record(
  "APPROVAL-MATRIX-ASYNC-001 repository exposes provider-neutral approval matrix SQL constants",
  [
    "SELECT_ASYNC_APPROVAL_MATRIX_REQUIREMENTS_SQL",
    "INSERT_ASYNC_APPROVAL_MATRIX_REQUIREMENT_SQL",
    "SATISFY_ASYNC_APPROVAL_MATRIX_REQUIREMENT_SQL",
    "WAIVE_ASYNC_APPROVAL_MATRIX_REQUIREMENT_SQL",
    "DEFAULT_ASYNC_APPROVAL_MATRIX_REQUIREMENTS"
  ].every((constant) => approvalAsyncSource.includes(constant)) &&
    approvalAsyncSource.includes("export class AsyncApprovalRepository") &&
    approvalAsyncSource.includes("refreshApprovalMatrixRequirements") &&
    approvalAsyncSource.includes("waiveApprovalMatrixRequirement"),
  "approval-async-repository.ts"
);
record(
  "APPROVAL-MATRIX-ASYNC-002 repository avoids sync database access and SQLite-only ordering",
  approvalAsyncSource.includes("AsyncDatabaseClient") &&
    approvalAsyncSource.includes("AsyncAuditRepository") &&
    !approvalAsyncSource.includes("getDb(") &&
    !approvalAsyncSource.includes("better-sqlite3") &&
    !approvalAsyncSource.includes("datetime(") &&
    !approvalAsyncSource.includes("rowid"),
  "approval-async-repository.ts"
);
record(
  "APPROVAL-MATRIX-ASYNC-003 runtime helper exposes approval matrix operations through async provider selector",
  approvalAsyncHelperSource.includes("getAsyncDatabaseClient") &&
    [
      "listApprovalMatrixRequirementsAsync",
      "getApprovalMatrixRequirementAsync",
      "initializeApprovalMatrixRequirementsAsync",
      "refreshApprovalMatrixRequirementsAsync",
      "waiveApprovalMatrixRequirementAsync",
      "listOpenApprovalMatrixRequirementsAsync"
    ].every((helper) => approvalAsyncHelperSource.includes(helper)) &&
    !approvalAsyncHelperSource.includes("getDb("),
  "approval-async.ts"
);
record(
  "APPROVAL-MATRIX-ASYNC-004 approval matrix routes use async helpers and avoid sync DB imports",
  [submissionApprovalMatrixRouteSource, submissionApprovalMatrixRequirementRouteSource].every(
    (routeSource) => routeSource.includes('from "@/lib/approval-async"') && !routeSource.includes('from "@/lib/db"')
  ) &&
    submissionApprovalMatrixRouteSource.includes("refreshApprovalMatrixRequirementsAsync") &&
    submissionApprovalMatrixRouteSource.includes("initializeApprovalMatrixRequirementsAsync") &&
    submissionApprovalMatrixRequirementRouteSource.includes("getApprovalMatrixRequirementAsync") &&
    submissionApprovalMatrixRequirementRouteSource.includes("waiveApprovalMatrixRequirementAsync"),
  "approval matrix routes"
);
record(
  "APPROVAL-DECISION-ASYNC-001 repository exposes provider-neutral approval decision SQL constants",
  [
    "INSERT_ASYNC_APPROVAL_STEP_SQL",
    "SELECT_ASYNC_REVIEWER_DECISION_SQL",
    "SELECT_ASYNC_APPROVAL_SUMMARY_SQL"
  ].every((constant) => approvalAsyncSource.includes(constant)) &&
    approvalAsyncSource.includes("async addApproval") &&
    approvalAsyncSource.includes("async reviewerHasDecision") &&
    approvalAsyncSource.includes("async getApprovalSummary"),
  "approval-async-repository.ts"
);
record(
  "APPROVAL-DECISION-ASYNC-002 runtime helper exposes approval decision operations through async provider selector",
  approvalAsyncHelperSource.includes("getAsyncDatabaseClient") &&
    ["addApprovalAsync", "reviewerHasDecisionAsync", "getApprovalSummaryAsync"].every((helper) =>
      approvalAsyncHelperSource.includes(helper)
    ) &&
    !approvalAsyncHelperSource.includes("getDb("),
  "approval-async.ts"
);
record(
  "SUBMISSION-STATUS-ASYNC-001 repository exposes provider-neutral reject status SQL",
  submissionStatusAsyncSource.includes("REJECT_ASYNC_SUBMISSION_SQL") &&
    submissionStatusAsyncSource.includes("AsyncDatabaseClient") &&
    submissionStatusAsyncSource.includes("async rejectSubmission") &&
    !submissionStatusAsyncSource.includes("getDb(") &&
    !submissionStatusAsyncSource.includes("better-sqlite3"),
  "submission-status-async-repository.ts"
);
record(
  "SUBMISSION-STATUS-ASYNC-002 runtime helper exposes reject status operation through async provider selector",
  submissionStatusAsyncHelperSource.includes("getAsyncDatabaseClient") &&
    submissionStatusAsyncHelperSource.includes("rejectSubmissionAsync") &&
    !submissionStatusAsyncHelperSource.includes("getDb("),
  "submission-status-async.ts"
);
record(
  "APPROVAL-DECISION-ASYNC-003 reject route uses async helpers and avoids sync DB imports",
  submissionRejectRouteSource.includes("requireRoleAsync") &&
    submissionRejectRouteSource.includes('await requireRoleAsync(request, ["R&D Manager", "Admin"])') &&
    submissionRejectRouteSource.includes("getSubmissionAsync") &&
    submissionRejectRouteSource.includes("reviewerHasDecisionAsync") &&
    submissionRejectRouteSource.includes("addApprovalAsync") &&
    submissionRejectRouteSource.includes("rejectSubmissionAsync") &&
    submissionRejectRouteSource.includes("createAuditLogAsync") &&
    !submissionRejectRouteSource.includes('from "@/lib/db"') &&
    !submissionRejectRouteSource.includes("getSubmission(") &&
    !submissionRejectRouteSource.includes("addApproval(") &&
    !submissionRejectRouteSource.includes("updateSubmissionStatus(") &&
    !submissionRejectRouteSource.includes("createAuditLog("),
  "submissions/[id]/reject route.ts"
);
record(
  "RELEASE-DECISION-ASYNC-001 submission status repository exposes approve release lifecycle SQL",
  [
    "SELECT_ASYNC_ACTIVE_SANDBOX_BRANCH_SQL",
    "MARK_ASYNC_SUBMISSION_RELEASING_SQL",
    "MARK_ASYNC_SUBMISSION_RELEASE_FAILED_SQL",
    "SELECT_ASYNC_RELEASE_LIFECYCLE_SUBMISSION_SQL",
    "SELECT_ASYNC_RELEASE_LIFECYCLE_OBSOLETE_SUBMISSIONS_SQL",
    "MARK_ASYNC_SUBMISSION_RELEASED_SQL",
    "UPDATE_ASYNC_ITEM_CURRENT_REVISION_SQL",
    "MARK_ASYNC_PREVIOUS_SUBMISSION_OBSOLETE_SQL"
  ].every((constant) => submissionStatusAsyncSource.includes(constant)) &&
    submissionStatusAsyncSource.includes("markSubmissionReleasedAndObsoletePrevious") &&
    !submissionStatusAsyncSource.includes("getDb(") &&
    !submissionStatusAsyncSource.includes("better-sqlite3"),
  "submission-status-async-repository.ts"
);
record(
  "RELEASE-DECISION-ASYNC-002 release repository exposes provider-neutral package and conflict SQL",
  [
    "SELECT_ASYNC_RELEASE_PACKAGE_BY_SUBMISSION_SQL",
    "UPSERT_ASYNC_RELEASE_PACKAGE_SQL",
    "SELECT_ASYNC_RELEASED_FILENAME_CONFLICT_SQL"
  ].every((constant) => releaseAsyncSource.includes(constant)) &&
    releaseAsyncSource.includes("AsyncReleaseRepository") &&
    releaseAsyncSource.includes("findReleasedFilenameConflicts") &&
    !releaseAsyncSource.includes("getDb(") &&
    !releaseAsyncSource.includes("better-sqlite3"),
  "release-async-repository.ts"
);
record(
  "RELEASE-DECISION-ASYNC-003 runtime helpers expose release records and lifecycle operations",
  releaseRecordsAsyncHelperSource.includes("getAsyncDatabaseClient") &&
    ["upsertReleasePackageRecordAsync", "findReleasedFilenameConflictsAsync"].every((helper) =>
      releaseRecordsAsyncHelperSource.includes(helper)
    ) &&
    submissionStatusAsyncHelperSource.includes("getActiveSandboxBranchForSubmissionAsync") &&
    submissionStatusAsyncHelperSource.includes("markSubmissionReleasingAsync") &&
    submissionStatusAsyncHelperSource.includes("markSubmissionReleaseFailedAsync") &&
    submissionStatusAsyncHelperSource.includes("markSubmissionReleasedAndObsoletePreviousAsync") &&
    !releaseRecordsAsyncHelperSource.includes("getDb(") &&
    !submissionStatusAsyncHelperSource.includes("getDb("),
  "release-records-async.ts, submission-status-async.ts"
);
record(
  "RELEASE-DECISION-ASYNC-004 release services use async DB helpers",
  releaseServiceAsyncSource.includes("findReleasedFilenameConflictsAsync") &&
    releaseServiceAsyncSource.includes("getSystemSettingAsync") &&
    releaseServiceAsyncSource.includes("updateFileGDriveStatusAsync") &&
    releasePackageAsyncSource.includes("upsertReleasePackageRecordAsync") &&
    releasePackageAsyncSource.includes("createAuditLogAsync") &&
    !releaseServiceAsyncSource.includes('from "@/lib/db"') &&
    !releasePackageAsyncSource.includes('from "@/lib/db"'),
  "release-async.ts, release-package-async.ts"
);
record(
  "RELEASE-DECISION-ASYNC-005 approve route delegates to the async release workflow without sync DB imports",
  submissionApproveRouteSource.includes("getSubmissionAsync") &&
    submissionApproveRouteSource.includes("getActiveSandboxBranchForSubmissionAsync") &&
    submissionApproveRouteSource.includes("reviewerHasDecisionAsync") &&
    submissionApproveRouteSource.includes("addApprovalAsync") &&
    submissionApproveRouteSource.includes("getApprovalSummaryAsync") &&
    submissionApproveRouteSource.includes("listOpenApprovalMatrixRequirementsAsync") &&
    submissionApproveRouteSource.includes("executeSubmissionReleaseWorkflowAsync") &&
    submissionApproveRouteSource.includes("await executeSubmissionReleaseWorkflowAsync") &&
    submissionApproveRouteSource.includes("createAuditLogAsync") &&
    !submissionApproveRouteSource.includes('from "@/lib/db"') &&
    !submissionApproveRouteSource.includes("getSubmission(") &&
    !submissionApproveRouteSource.includes("updateSubmissionStatus(") &&
    !submissionApproveRouteSource.includes("createAuditLog(") &&
    submissionReleaseWorkflowSource.includes("markSubmissionReleasingAsync") &&
    submissionReleaseWorkflowSource.includes("releaseSubmissionViaCloudFunctionAsync") &&
    submissionReleaseWorkflowSource.includes("createReleasePackageAsync") &&
    submissionReleaseWorkflowSource.includes("markSubmissionReleasedAndObsoletePreviousAsync") &&
    submissionReleaseWorkflowSource.includes("markSubmissionReleaseFailedAsync") &&
    submissionReleaseWorkflowSource.includes("createAuditLogAsync") &&
    !submissionReleaseWorkflowSource.includes('from "@/lib/db"') &&
    !submissionReleaseWorkflowSource.includes("getDb("),
  "submissions/[id]/approve route.ts, submission-release-workflow.ts"
);
record(
  "RELEASE-PACKAGE-ASYNC-001 release package download route uses async submission detail and avoids sync DB imports",
  submissionReleasePackageRouteSource.includes("getSubmissionAsync") &&
    submissionReleasePackageRouteSource.includes("auditStorageAccess") &&
    submissionReleasePackageRouteSource.includes("createReleasePackageStorageService") &&
    submissionReleasePackageRouteSource.includes("readReleasePackage") &&
    !submissionReleasePackageRouteSource.includes('from "@/lib/db"') &&
    !submissionReleasePackageRouteSource.includes("getSubmission("),
  "submissions/[id]/release-package route.ts"
);
record(
  "PROCUREMENT-SYNC-ASYNC-001 release repository exposes provider-neutral procurement sync SQL",
  [
    "SELECT_ASYNC_PROCUREMENT_SYNC_RUNS_SQL",
    "SELECT_ASYNC_PROCUREMENT_SYNC_RUN_BY_ID_SQL",
    "INSERT_ASYNC_PROCUREMENT_SYNC_RUN_SQL",
    "DECIDE_ASYNC_PROCUREMENT_SYNC_RUN_SQL"
  ].every((constant) => releaseAsyncSource.includes(constant)) &&
    releaseAsyncSource.includes("listProcurementSyncRuns") &&
    releaseAsyncSource.includes("createProcurementSyncRun") &&
    releaseAsyncSource.includes("decideProcurementSyncRun") &&
    releaseAsyncSource.includes("AsyncAuditRepository") &&
    !releaseAsyncSource.includes("datetime(") &&
    !releaseAsyncSource.includes("rowid") &&
    !releaseAsyncSource.includes("getDb(") &&
    !releaseAsyncSource.includes("better-sqlite3"),
  "release-async-repository.ts"
);
record(
  "PROCUREMENT-SYNC-ASYNC-002 runtime helper exposes procurement sync operations",
  releaseRecordsAsyncHelperSource.includes("listProcurementSyncRunsAsync") &&
    releaseRecordsAsyncHelperSource.includes("createProcurementSyncRunAsync") &&
    releaseRecordsAsyncHelperSource.includes("decideProcurementSyncRunAsync") &&
    releaseRecordsAsyncHelperSource.includes("getAsyncDatabaseClient") &&
    !releaseRecordsAsyncHelperSource.includes("getDb(") &&
    !releaseRecordsAsyncHelperSource.includes('from "@/lib/db"'),
  "release-records-async.ts"
);
record(
  "PROCUREMENT-SYNC-ASYNC-003 procurement sync-run routes use async helpers and avoid sync DB imports",
  procurementSyncRunsRouteSource.includes("listProcurementSyncRunsAsync") &&
    procurementSyncRunsRouteSource.includes("createProcurementSyncRunAsync") &&
    procurementSyncRunsRouteSource.includes("getSubmissionAsync") &&
    procurementSyncRunRouteSource.includes("decideProcurementSyncRunAsync") &&
    [procurementSyncRunsRouteSource, procurementSyncRunRouteSource].every(
      (routeSource) =>
        routeSource.includes("@/lib/release-records-async") &&
        !routeSource.includes('from "@/lib/db"') &&
        !routeSource.includes("listProcurementSyncRuns(") &&
        !routeSource.includes("createProcurementSyncRun(") &&
        !routeSource.includes("decideProcurementSyncRun(") &&
        !routeSource.includes("getSubmission(")
    ),
  "integrations/procurement/sync-runs routes"
);
record(
  "READONLY-SHARE-ASYNC-001 release repository exposes provider-neutral readonly share SQL",
  [
    "SELECT_ASYNC_READONLY_SHARES_SQL",
    "SELECT_ASYNC_READONLY_SHARE_BY_TOKEN_HASH_SQL",
    "INSERT_ASYNC_READONLY_SHARE_SQL",
    "REVOKE_ASYNC_READONLY_SHARE_SQL"
  ].every((constant) => releaseAsyncSource.includes(constant)) &&
    releaseAsyncSource.includes("listReadonlyShares") &&
    releaseAsyncSource.includes("createReadonlyShare") &&
    releaseAsyncSource.includes("revokeReadonlyShare") &&
    releaseAsyncSource.includes("AsyncAuditRepository") &&
    !releaseAsyncSource.includes("datetime(") &&
    !releaseAsyncSource.includes("rowid") &&
    !releaseAsyncSource.includes("getDb(") &&
    !releaseAsyncSource.includes("better-sqlite3"),
  "release-async-repository.ts"
);
record(
  "READONLY-SHARE-ASYNC-002 runtime helpers expose readonly share operations",
  releaseRecordsAsyncHelperSource.includes("listReadonlySharesAsync") &&
    releaseRecordsAsyncHelperSource.includes("createReadonlyShareAsync") &&
    releaseRecordsAsyncHelperSource.includes("revokeReadonlyShareAsync") &&
    readonlyShareAsyncSource.includes("generateShareTokenAsync") &&
    readonlyShareAsyncSource.includes("hashShareTokenAsync") &&
    readonlyShareAsyncSource.includes("buildPublicShareUrlAsync") &&
    !releaseRecordsAsyncHelperSource.includes("getDb(") &&
    !releaseRecordsAsyncHelperSource.includes('from "@/lib/db"') &&
    !readonlyShareAsyncSource.includes("getDb(") &&
    !readonlyShareAsyncSource.includes('from "@/lib/db"') &&
    !readonlyShareAsyncSource.includes("@/lib/readonly-share"),
  "release-records-async.ts, readonly-share-async.ts"
);
record(
  "READONLY-SHARE-ASYNC-003 share routes use async helpers and avoid sync DB imports",
  submissionSharesRouteSource.includes("listReadonlySharesAsync") &&
    submissionSharesRouteSource.includes("createReadonlyShareAsync") &&
    submissionSharesRouteSource.includes("getSubmissionAsync") &&
    submissionSharesRouteSource.includes("generateShareTokenAsync") &&
    submissionSharesRouteSource.includes("hashShareTokenAsync") &&
    submissionSharesRouteSource.includes("buildPublicShareUrlAsync") &&
    submissionShareRouteSource.includes("revokeReadonlyShareAsync") &&
    submissionShareRouteSource.includes("getSubmissionAsync") &&
    [submissionSharesRouteSource, submissionShareRouteSource].every(
      (routeSource) =>
        !routeSource.includes('from "@/lib/db"') &&
        !routeSource.includes("getSubmission(") &&
        !routeSource.includes("listReadonlyShares(") &&
        !routeSource.includes("createReadonlyShare(") &&
        !routeSource.includes("revokeReadonlyShare(") &&
        !routeSource.includes('from "@/lib/readonly-share"') &&
        !routeSource.includes("from '@/lib/readonly-share'")
    ),
  "submission share routes"
);
record(
  "SUPPLIER-RESPONSE-ASYNC-001 release repository exposes provider-neutral supplier response SQL",
  [
    "SELECT_ASYNC_READONLY_SHARE_BY_TOKEN_HASH_SQL",
    "SELECT_ASYNC_SUPPLIER_PORTAL_RESPONSES_SQL",
    "SELECT_ASYNC_SUPPLIER_PORTAL_RESPONSE_SQL",
    "INSERT_ASYNC_SUPPLIER_PORTAL_RESPONSE_SQL",
    "CLOSE_ASYNC_SUPPLIER_PORTAL_RESPONSE_SQL"
  ].every((constant) => releaseAsyncSource.includes(constant)) &&
    releaseAsyncSource.includes("getReadonlyShareByTokenHash") &&
    releaseAsyncSource.includes("listSupplierPortalResponses") &&
    releaseAsyncSource.includes("createSupplierPortalResponse") &&
    releaseAsyncSource.includes("closeSupplierPortalResponse") &&
    releaseAsyncSource.includes("AsyncAuditRepository") &&
    !releaseAsyncSource.includes("datetime(") &&
    !releaseAsyncSource.includes("rowid") &&
    !releaseAsyncSource.includes("getDb(") &&
    !releaseAsyncSource.includes("better-sqlite3"),
  "release-async-repository.ts"
);
record(
  "SUPPLIER-RESPONSE-ASYNC-002 runtime helpers expose supplier response operations",
  releaseRecordsAsyncHelperSource.includes("getReadonlyShareByTokenHashAsync") &&
    releaseRecordsAsyncHelperSource.includes("listSupplierPortalResponsesAsync") &&
    releaseRecordsAsyncHelperSource.includes("createSupplierPortalResponseAsync") &&
    releaseRecordsAsyncHelperSource.includes("closeSupplierPortalResponseAsync") &&
    readonlyShareAsyncSource.includes("getPublicShareAsync") &&
    readonlyShareAsyncSource.includes("getSubmissionAsync") &&
    !readonlyShareAsyncSource.includes("@/lib/readonly-share") &&
    !releaseRecordsAsyncHelperSource.includes("getDb(") &&
    !releaseRecordsAsyncHelperSource.includes('from "@/lib/db"') &&
    !readonlyShareAsyncSource.includes("getDb(") &&
    !readonlyShareAsyncSource.includes('from "@/lib/db"'),
  "release-records-async.ts, readonly-share-async.ts"
);
record(
  "SUPPLIER-RESPONSE-ASYNC-003 supplier response routes use async helpers and avoid sync DB imports",
  submissionSupplierResponsesRouteSource.includes("listSupplierPortalResponsesAsync") &&
    submissionSupplierResponsesRouteSource.includes("getSubmissionAsync") &&
    submissionSupplierResponseRouteSource.includes("closeSupplierPortalResponseAsync") &&
    submissionSupplierResponseRouteSource.includes("getSubmissionAsync") &&
    publicShareResponsesRouteSource.includes("getPublicShareAsync") &&
    publicShareResponsesRouteSource.includes("createSupplierPortalResponseAsync") &&
    [submissionSupplierResponsesRouteSource, submissionSupplierResponseRouteSource, publicShareResponsesRouteSource].every(
      (routeSource) =>
        !routeSource.includes('from "@/lib/db"') &&
        !routeSource.includes("getSubmission(") &&
        !routeSource.includes("listSupplierPortalResponses(") &&
        !routeSource.includes("createSupplierPortalResponse(") &&
        !routeSource.includes("closeSupplierPortalResponse(")
    ),
  "supplier response routes"
);
record(
  "PUBLIC-SHARE-ASYNC-001 release repository exposes provider-neutral readonly share access SQL",
  releaseAsyncSource.includes("UPDATE_ASYNC_READONLY_SHARE_ACCESS_SQL") &&
    releaseAsyncSource.includes("recordReadonlyShareAccess") &&
    !releaseAsyncSource.includes("datetime(") &&
    !releaseAsyncSource.includes("rowid") &&
    !releaseAsyncSource.includes("getDb(") &&
    !releaseAsyncSource.includes("better-sqlite3"),
  "release-async-repository.ts"
);
record(
  "PUBLIC-SHARE-ASYNC-002 readonly share async helper serializes public share without sync DB imports",
  readonlyShareAsyncSource.includes("getPublicShareAsync") &&
    readonlyShareAsyncSource.includes("recordPublicShareAccessAsync") &&
    readonlyShareAsyncSource.includes("serializePublicShareAsync") &&
    readonlyShareAsyncSource.includes("listSupplierPortalResponsesAsync") &&
    readonlyShareAsyncSource.includes("recordReadonlyShareAccessAsync") &&
    !readonlyShareAsyncSource.includes("getDb(") &&
    !readonlyShareAsyncSource.includes('from "@/lib/db"') &&
    !readonlyShareAsyncSource.includes('from "@/lib/readonly-share"') &&
    !readonlyShareAsyncSource.includes("from '@/lib/readonly-share'"),
  "readonly-share-async.ts"
);
record(
  "PUBLIC-SHARE-ASYNC-003 public share routes use async helpers and avoid sync readonly-share imports",
  publicShareRouteSource.includes("getPublicShareAsync") &&
    publicShareRouteSource.includes("recordPublicShareAccessAsync") &&
    publicShareRouteSource.includes("serializePublicShareAsync") &&
    publicSharePackageRouteSource.includes("getPublicShareAsync") &&
    publicSharePackageRouteSource.includes("recordPublicShareAccessAsync") &&
    [publicShareRouteSource, publicSharePackageRouteSource].every(
      (routeSource) =>
        !routeSource.includes('from "@/lib/db"') &&
        !routeSource.includes('from "@/lib/readonly-share"') &&
        !routeSource.includes("from '@/lib/readonly-share'") &&
        !routeSource.includes("getPublicShare(") &&
        !routeSource.includes("recordPublicShareAccess(") &&
        !routeSource.includes("serializePublicShare(")
    ),
  "public share routes"
);
record(
  "BOM-WORKBENCH-ASYNC-001 repository exposes provider-neutral workbench read SQL constants",
  [
    "SELECT_ASYNC_BOM_WORKBENCH_PARENT_SQL",
    "SELECT_ASYNC_BOM_WORKBENCH_DRAFTS_SQL",
    "SELECT_ASYNC_BOM_WORKBENCH_DRAFT_SQL",
    "SELECT_ASYNC_BOM_WORKBENCH_DRAFT_LINES_SQL",
    "SELECT_ASYNC_BOM_WORKBENCH_ITEM_BY_PART_NUMBER_SQL",
    "SELECT_ASYNC_BOM_WORKBENCH_ASSEMBLY_REFERENCES_SQL",
    "INSERT_ASYNC_BOM_WORKBENCH_DRAFT_SQL",
    "DELETE_ASYNC_BOM_WORKBENCH_DRAFT_LINES_SQL",
    "INSERT_ASYNC_BOM_WORKBENCH_DRAFT_LINE_SQL",
    "SELECT_ASYNC_BOM_IMPORT_PROFILE_SQL",
    "UPDATE_ASYNC_BOM_IMPORT_PROFILE_SQL",
    "INSERT_ASYNC_BOM_IMPORT_PROFILE_SQL",
    "SELECT_ASYNC_BOM_IMPORT_JOB_SQL",
    "INSERT_ASYNC_BOM_IMPORT_JOB_SQL",
    "INSERT_ASYNC_FILE_ASSET_SQL",
    "UPDATE_ASYNC_BOM_WORKBENCH_DRAFT_AFTER_SAVE_SQL",
    "SELECT_ASYNC_BOM_WORKBENCH_LATEST_RELEASE_SNAPSHOT_SQL",
    "SELECT_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOT_SQL",
    "SELECT_ASYNC_BOM_WORKBENCH_PENDING_REVIEWS_SQL",
    "SELECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL",
    "SELECT_ASYNC_BOM_WORKBENCH_EXISTING_PENDING_REVIEW_SQL",
    "SUBMIT_ASYNC_BOM_WORKBENCH_DRAFT_REVIEW_SQL",
    "INSERT_ASYNC_BOM_WORKBENCH_REVIEW_SQL",
    "REJECT_ASYNC_BOM_WORKBENCH_DRAFT_SQL",
    "REJECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL",
    "SELECT_ASYNC_BOM_WORKBENCH_RELEASE_GATE_SUBMISSION_SQL",
    "SELECT_ASYNC_BOM_WORKBENCH_LATEST_RELEASED_REVISION_SQL",
    "OBSOLETE_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOTS_SQL",
    "OBSOLETE_ASYNC_BOM_WORKBENCH_RELEASED_DRAFTS_SQL",
    "INSERT_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOT_SQL",
    "RELEASE_ASYNC_BOM_WORKBENCH_DRAFT_SQL",
    "APPROVE_ASYNC_BOM_WORKBENCH_REVIEW_SQL"
  ].every((constant) => bomWorkbenchAsyncSource.includes(constant)) &&
    bomWorkbenchAsyncSource.includes("export class AsyncBomWorkbenchRepository"),
  "bom-workbench-async-repository.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-002 repository avoids sync DB imports and SQLite-only ordering",
  bomWorkbenchAsyncSource.includes("AsyncDatabaseClient") &&
    bomWorkbenchAsyncSource.includes("getWorkbenchBySubmissionId") &&
    bomWorkbenchAsyncSource.includes("listDraftsBySubmissionId") &&
    bomWorkbenchAsyncSource.includes("getDraftById") &&
    bomWorkbenchAsyncSource.includes("getDraftDiff") &&
    bomWorkbenchAsyncSource.includes("createDraftFromAssembly") &&
    bomWorkbenchAsyncSource.includes("mergeAssemblyReferences") &&
    bomWorkbenchAsyncSource.includes("createDraftFromSolidWorksXls") &&
    bomWorkbenchAsyncSource.includes("parseSolidWorksBomImport") &&
    bomWorkbenchAsyncSource.includes("ensureSolidWorksBomImportProfile") &&
    bomWorkbenchAsyncSource.includes("saveDraftTree") &&
    bomWorkbenchAsyncSource.includes("normalizeWorkbenchTreeLines") &&
    bomWorkbenchAsyncSource.includes("mergeDuplicateSiblingItems") &&
    bomWorkbenchAsyncSource.includes("validateTreeDepthAndCycles") &&
    bomWorkbenchAsyncSource.includes("getReleaseSnapshotById") &&
    bomWorkbenchAsyncSource.includes("listPendingReviews") &&
    bomWorkbenchAsyncSource.includes("getReviewById") &&
    bomWorkbenchAsyncSource.includes("submitReview") &&
    bomWorkbenchAsyncSource.includes("rejectReview") &&
    bomWorkbenchAsyncSource.includes("approveReview") &&
    bomWorkbenchAsyncSource.includes("evaluateReleaseGate") &&
    bomWorkbenchAsyncSource.includes("diffBomWorkbenchLines") &&
    !bomWorkbenchAsyncSource.includes("getDb(") &&
    !bomWorkbenchAsyncSource.includes("better-sqlite3") &&
    !bomWorkbenchAsyncSource.includes('from "@/lib/db"') &&
    !bomWorkbenchAsyncSource.includes("datetime(") &&
    !bomWorkbenchAsyncSource.includes("rowid"),
  "bom-workbench-async-repository.ts"
);
record(
  "BOM-WORKBENCH-DIFF-ASYNC-001 shared diff helper preserves pure boundary",
  bomWorkbenchDiffSource.includes("export function diffBomWorkbenchLines") &&
    !bomWorkbenchDiffSource.includes("getDb(") &&
    !bomWorkbenchDiffSource.includes("query(") &&
    bomWorkbenchAsyncSource.includes("diffBomWorkbenchLines as diffBomWorkbenchLinesShared") &&
    !bomWorkbenchAsyncSource.includes("function diffBomWorkbenchLines("),
  "bom-workbench-diff.ts and bom-workbench-async-repository.ts"
);
record(
  "NUMBERING-HARD-RULE-ASYNC-001 shared pure approval helper preserves repository boundary",
  numberingHardApprovalRulesSource.includes("export function evaluateHardApprovalRules") &&
    !numberingHardApprovalRulesSource.includes("getDb(") &&
    !numberingHardApprovalRulesSource.includes("query(") &&
    numberingAsyncSource.includes("evaluateHardApprovalRules as evaluateHardApprovalRulesShared") &&
    !numberingAsyncSource.includes("function evaluateHardApprovalRules("),
  "numbering-hard-approval-rules.ts and numbering-async-repository.ts"
);
record(
  "NUMBERING-PART-COST-ASYNC-001 shared pure tier helper preserves repository boundary",
  numberingPartCostSource.includes("export function normalizePartCostTiers") &&
    numberingPartCostSource.includes("export function normalizePositiveInteger") &&
    !numberingPartCostSource.includes("getDb(") &&
    !numberingPartCostSource.includes("query(") &&
    numberingAsyncSource.includes("normalizePartCostTiers, normalizePositiveInteger") &&
    !numberingAsyncSource.includes("function normalizePartCostTiers("),
  "numbering-part-cost.ts and numbering-async-repository.ts"
);
record(
  "BOM-RELEASE-GATE-ASYNC-001 batch query budget has parity characterization",
  bomReleaseGateQueryBudgetSource.includes("legacy 9 queries") === false &&
    bomReleaseGateQueryBudgetSource.includes("assert.equal(legacyClient.queryCount, 9") &&
    bomReleaseGateQueryBudgetSource.includes("assert.equal(batchedClient.queryCount, 2") &&
    bomWorkbenchAsyncSource.includes("FROM items") &&
    bomWorkbenchAsyncSource.includes("FROM submissions") &&
    !bomWorkbenchReleaseGateSource.includes("queryOne"),
  "qc-bom-release-gate-query-budget.mjs and bom-workbench-async-repository.ts"
);
record(
  "APPROVAL-INBOX-ASYNC-001 native target query budget has parity characterization",
  approvalInboxQueryBudgetSource.includes("assert.equal(legacyClient.queryCount, 3") &&
    approvalInboxQueryBudgetSource.includes("assert.equal(batchedClient.queryCount, 2") &&
    approvalInboxSourceBlock.includes("request_id IN") &&
    !approvalInboxSourceBlock.includes("await this.listTargets("),
  "qc-approval-inbox-query-budget.mjs and approval-platform-async-repository.ts"
);
record(
  "NUMBERING-APPROVAL-BATCH-ASYNC-001 review mapper query budget has parity characterization",
  numberingApprovalBatchesQueryBudgetSource.includes("assert.equal(legacyClient.queryCount, 20") &&
    numberingApprovalBatchesQueryBudgetSource.includes("assert.equal(batchedClient.queryCount, 17") &&
    numberingAsyncSource.includes("preloadApprovalReviewBatches") &&
    numberingAsyncSource.includes("WHERE batch_id IN (${batchList.sql})") &&
    numberingAsyncSource.includes("WHERE id IN (${requestList.sql})"),
  "qc-numbering-approval-batches-query-budget.mjs and numbering-async-repository.ts"
);
record(
  "NUMBERING-IMPORT-BATCH-ASYNC-001 list staging rows query budget has parity characterization",
  numberingImportBatchesQueryBudgetSource.includes("assert.equal(legacyClient.queryCount, 4") &&
    numberingImportBatchesQueryBudgetSource.includes("assert.equal(batchedClient.queryCount, 2") &&
    numberingAsyncSource.includes("preloadImportBatchRows") &&
    numberingAsyncSource.includes("WHERE import_batch_id IN (${batchListSql})"),
  "qc-numbering-import-batches-query-budget.mjs and numbering-async-repository.ts"
);
record(
  "QC-AST-001 BOM diff QC uses AST/export contract instead of source-string helper assertions",
  bomWorkbenchDiffQcSource.includes('import * as ts from "typescript"') &&
    bomWorkbenchDiffQcSource.includes("ts.createSourceFile") &&
    bomWorkbenchDiffQcSource.includes("hasSharedHelperImport") &&
    !bomWorkbenchDiffQcSource.includes("assert.match(helperSource"),
  "qc-bom-workbench-diff.mjs"
);
record(
  "QC-AST-002 numbering hard-rule QC uses AST/export contract instead of source-string helper assertions",
  numberingHardApprovalRulesQcSource.includes('import * as ts from "typescript"') &&
    numberingHardApprovalRulesQcSource.includes("ts.createSourceFile") &&
    numberingHardApprovalRulesQcSource.includes("hasSharedHelperImport") &&
    !numberingHardApprovalRulesQcSource.includes("assert.match(helperSource") &&
    !numberingHardApprovalRulesQcSource.includes("assert.doesNotMatch(helperSource"),
  "qc-numbering-hard-approval-rules.mjs"
);
record(
  "QC-AST-003 numbering part-cost QC uses AST/export contract instead of source-string helper assertions",
  numberingPartCostQcSource.includes('import * as ts from "typescript"') &&
    numberingPartCostQcSource.includes("ts.createSourceFile") &&
    numberingPartCostQcSource.includes("hasSharedHelperImport") &&
    !numberingPartCostQcSource.includes("assert.match(helperSource") &&
    !numberingPartCostQcSource.includes("assert.doesNotMatch(helperSource"),
  "qc-numbering-part-cost.mjs"
);
record(
  "QC-AST-004 numbering approval-batch query QC uses AST method/SQL contract instead of regex source slicing",
  numberingApprovalBatchesQueryBudgetSource.includes('import * as ts from "typescript"') &&
    numberingApprovalBatchesQueryBudgetSource.includes("findMethod") &&
    numberingApprovalBatchesQueryBudgetSource.includes("hasSqlText") &&
    !numberingApprovalBatchesQueryBudgetSource.includes("source.match(/async listNumberingApprovalBatches"),
  "qc-numbering-approval-batches-query-budget.mjs"
);
record(
  "QC-AST-005 numbering import-batch query QC uses AST method/SQL contract instead of regex source slicing",
  numberingImportBatchesQueryBudgetSource.includes('import * as ts from "typescript"') &&
    numberingImportBatchesQueryBudgetSource.includes("findMethod") &&
    numberingImportBatchesQueryBudgetSource.includes("hasSqlText") &&
    !numberingImportBatchesQueryBudgetSource.includes("source.match(/async listNumberingImportBatches"),
  "qc-numbering-import-batches-query-budget.mjs"
);
record(
  "QC-AST-006 drawing-workbench query QC uses AST method/SQL contract instead of regex source slicing",
  drawingWorkbenchQueryBudgetSource.includes('import * as ts from "typescript"') &&
    drawingWorkbenchQueryBudgetSource.includes("findMethod") &&
    drawingWorkbenchQueryBudgetSource.includes("hasSqlText") &&
    !drawingWorkbenchQueryBudgetSource.includes("source.match(/private async overlayLifecycle"),
  "qc-drawing-workbench-query-budget.mjs"
);
record(
  "NUMBER-STATE-BUDGET-001 query characterization uses isolated fixture and compares read growth per added item",
  numberStateFlowQueryBudgetSource.includes("PDM_DATA_DIR") &&
  numberStateFlowQueryBudgetSource.includes("smallReadQueries") &&
    numberStateFlowQueryBudgetSource.includes("largeReadQueries") &&
    numberStateFlowQueryBudgetSource.includes("readQueriesPerAdditionalItem") &&
    numberStateFlowQueryBudgetSource.includes("NUMBER-STATE-BUDGET-002") &&
    numberStateFlowQueryBudgetSource.includes("SQLITE_CONSTRAINT_UNIQUE") &&
    numberStateFlowQueryBudgetSource.includes("collisionReadQueries") &&
    numberStateFlowQueryBudgetSource.includes("fs.rmSync(fixtureRoot"),
  "qc-number-state-flow-query-budget.mjs"
);
record(
  "APPROVAL-WRITE-BUDGET-001 approval target/event write characterization preserves output and ordering",
  numberStateFlowApprovalWriteBudgetSource.includes("APPROVAL-WRITE-BUDGET-001") &&
    numberStateFlowApprovalWriteBudgetSource.includes("targetInsertCount") &&
    numberStateFlowApprovalWriteBudgetSource.includes("candidateEventInsertCount") &&
    numberStateFlowApprovalWriteBudgetSource.includes("APPROVAL-WRITE-BUDGET-002") &&
    numberStateFlowApprovalWriteBudgetSource.includes("order preserved"),
  "qc-number-state-flow-approval-write-budget.mjs"
);
record(
  "ARCH-BASELINE-003 dependency cycle baseline analyzer keeps reproducible SCC guard",
  dependencyCycleBaselineSource.includes("BASELINE_MAX_CYCLE_COUNT = 6") &&
    dependencyCycleBaselineSource.includes("lowLinks") &&
    dependencyCycleBaselineSource.includes("cycles.length <= BASELINE_MAX_CYCLE_COUNT") &&
    dependencyCycleBaselineSource.includes("process.exitCode = report.failed === 0 ? 0 : 1"),
  "qc-dependency-cycle-baseline.mjs"
);
record(
  "ARCH-BASELINE-004 duplicate function baseline analyzer keeps AST body and non-increasing guard",
  duplicateFunctionBaselineSource.includes("BASELINE_MAX_DUPLICATE_FUNCTION_GROUPS = 62") &&
    duplicateFunctionBaselineSource.includes("BASELINE_MAX_DUPLICATE_FUNCTION_PAIRS = 60") &&
    duplicateFunctionBaselineSource.includes("isFunctionLike") &&
    duplicateFunctionBaselineSource.includes("duplicateFunctionGroupCount <= BASELINE_MAX_DUPLICATE_FUNCTION_GROUPS") &&
    duplicateFunctionBaselineSource.includes("duplicateFunctionPairCount <= BASELINE_MAX_DUPLICATE_FUNCTION_PAIRS"),
  "qc-duplicate-function-baseline.mjs"
);
record(
  "DRAWING-WORKBENCH-ASYNC-001 lifecycle overlay query budget has parity characterization",
  drawingWorkbenchQueryBudgetSource.includes("assert.equal(legacyClient.queryCount, 7") &&
    drawingWorkbenchQueryBudgetSource.includes("assert.equal(batchedClient.queryCount, 3") &&
    drawingWorkbenchOverlaySource.includes("drawing_number_id IN") &&
    drawingWorkbenchOverlaySource.includes("workflow_id IN") &&
    drawingWorkbenchOverlaySource.includes("request_id IN") &&
    !drawingWorkbenchOverlaySource.includes("queryOne"),
  "qc-drawing-workbench-query-budget.mjs and drawing-workbench-async-repository.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-003 runtime helper exposes workbench reads through async provider selector",
  bomWorkbenchAsyncHelperSource.includes("getAsyncDatabaseClient") &&
    bomWorkbenchAsyncHelperSource.includes("AsyncBomWorkbenchRepository") &&
    bomWorkbenchAsyncHelperSource.includes("getBomWorkbenchBySubmissionIdAsync") &&
    bomWorkbenchAsyncHelperSource.includes("listBomWorkbenchDraftsBySubmissionIdAsync") &&
    bomWorkbenchAsyncHelperSource.includes("getBomWorkbenchDraftByIdAsync") &&
    bomWorkbenchAsyncHelperSource.includes("getBomWorkbenchDraftDiffAsync") &&
    bomWorkbenchAsyncHelperSource.includes("saveBomWorkbenchDraftTreeAsync") &&
    bomWorkbenchAsyncHelperSource.includes("createBomWorkbenchDraftFromAssemblyAsync") &&
    bomWorkbenchAsyncHelperSource.includes("createBomWorkbenchDraftFromSolidWorksXlsAsync") &&
    bomWorkbenchAsyncHelperSource.includes("getBomReleaseSnapshotByIdAsync") &&
    bomWorkbenchAsyncHelperSource.includes("listPendingBomWorkbenchReviewsAsync") &&
    bomWorkbenchAsyncHelperSource.includes("getBomWorkbenchReviewByIdAsync") &&
    bomWorkbenchAsyncHelperSource.includes("submitBomWorkbenchDraftReviewAsync") &&
    bomWorkbenchAsyncHelperSource.includes("rejectBomWorkbenchReviewAsync") &&
    bomWorkbenchAsyncHelperSource.includes("approveBomWorkbenchReviewAsync") &&
    bomWorkbenchAsyncHelperSource.includes("setBomWorkbenchActiveDraftAsync") &&
    !bomWorkbenchAsyncHelperSource.includes("getDb(") &&
    !bomWorkbenchAsyncHelperSource.includes('from "@/lib/db"'),
  "bom-workbench-async.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-004 workbench route uses async submission and workbench helpers",
  bomWorkbenchRouteSource.includes("getSubmissionAsync") &&
    bomWorkbenchRouteSource.includes("await getSubmissionAsync") &&
    bomWorkbenchRouteSource.includes("getBomWorkbenchBySubmissionIdAsync") &&
    bomWorkbenchRouteSource.includes("await getBomWorkbenchBySubmissionIdAsync") &&
    !bomWorkbenchRouteSource.includes('from "@/lib/db"') &&
    !bomWorkbenchRouteSource.includes("getSubmission(") &&
    !bomWorkbenchRouteSource.includes("getBomWorkbenchBySubmissionId("),
  "api/bom/workbench/route.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-005 workbench SQL keeps Postgres-compatible named parameters and deterministic ordering",
  [":submissionId", ":draftId"].every((param) => bomWorkbenchAsyncSource.includes(param)) &&
    bomWorkbenchAsyncSource.includes("ORDER BY is_active DESC, updated_at DESC, id DESC") &&
    bomWorkbenchAsyncSource.includes("ORDER BY COALESCE(l.parent_line_id, ''), l.sequence_no ASC, l.id ASC") &&
    !bomWorkbenchAsyncSource.includes("WHERE s.id = ?") &&
    !bomWorkbenchAsyncSource.includes("WHERE parent_submission_id = ?") &&
    !bomWorkbenchAsyncSource.includes("WHERE id = ?") &&
    !bomWorkbenchAsyncSource.includes("datetime(") &&
    !bomWorkbenchAsyncSource.includes("rowid"),
  "bom-workbench-async-repository.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-005A active draft route uses async provider-neutral helpers",
  bomDraftActiveRouteSource.includes("getBomWorkbenchDraftByIdAsync") &&
    bomDraftActiveRouteSource.includes("await getBomWorkbenchDraftByIdAsync") &&
    bomDraftActiveRouteSource.includes("setBomWorkbenchActiveDraftAsync") &&
    bomDraftActiveRouteSource.includes("await setBomWorkbenchActiveDraftAsync") &&
    bomDraftActiveRouteSource.includes("getSubmissionAsync") &&
    bomDraftActiveRouteSource.includes("await getSubmissionAsync") &&
    !bomDraftActiveRouteSource.includes('from "@/lib/db"') &&
    !bomDraftActiveRouteSource.includes("getBomWorkbenchDraftById(") &&
    !bomDraftActiveRouteSource.includes("setBomWorkbenchActiveDraft(") &&
    !bomDraftActiveRouteSource.includes("getSubmission("),
  "api/bom/drafts/[draftId]/active/route.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-005B draft diff route uses async provider-neutral helpers",
  bomDraftDiffRouteSource.includes("getBomWorkbenchDraftByIdAsync") &&
    bomDraftDiffRouteSource.includes("await getBomWorkbenchDraftByIdAsync") &&
    bomDraftDiffRouteSource.includes("getBomWorkbenchDraftDiffAsync") &&
    bomDraftDiffRouteSource.includes("await getBomWorkbenchDraftDiffAsync") &&
    bomDraftDiffRouteSource.includes("getSubmissionAsync") &&
    bomDraftDiffRouteSource.includes("await getSubmissionAsync") &&
    !bomDraftDiffRouteSource.includes('from "@/lib/db"') &&
    !bomDraftDiffRouteSource.includes("getBomWorkbenchDraftById(") &&
    !bomDraftDiffRouteSource.includes("getBomWorkbenchDraftDiff(") &&
    !bomDraftDiffRouteSource.includes("getSubmission("),
  "api/bom/drafts/[draftId]/diff/route.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-005G draft detail and save route uses async provider-neutral helpers",
  bomDraftRouteSource.includes("getBomWorkbenchDraftByIdAsync") &&
    bomDraftRouteSource.includes("await getBomWorkbenchDraftByIdAsync") &&
    bomDraftRouteSource.includes("getSubmissionAsync") &&
    bomDraftRouteSource.includes("await getSubmissionAsync") &&
    bomDraftRouteSource.includes("saveBomWorkbenchDraftTreeAsync") &&
    bomDraftRouteSource.includes("await saveBomWorkbenchDraftTreeAsync") &&
    !bomDraftRouteSource.includes('from "@/lib/db"') &&
    !bomDraftRouteSource.includes("getBomWorkbenchDraftById(") &&
    !bomDraftRouteSource.includes("saveBomWorkbenchDraftTree(") &&
    !bomDraftRouteSource.includes("getSubmission("),
  "api/bom/drafts/[draftId]/route.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-005H draft from assembly route uses async provider-neutral helpers",
  bomDraftFromAssemblyRouteSource.includes("getSubmissionAsync") &&
    bomDraftFromAssemblyRouteSource.includes("await getSubmissionAsync") &&
    bomDraftFromAssemblyRouteSource.includes("createBomWorkbenchDraftFromAssemblyAsync") &&
    bomDraftFromAssemblyRouteSource.includes("await createBomWorkbenchDraftFromAssemblyAsync") &&
    !bomDraftFromAssemblyRouteSource.includes('from "@/lib/db"') &&
    !bomDraftFromAssemblyRouteSource.includes("getSubmission(") &&
    !bomDraftFromAssemblyRouteSource.includes("createBomWorkbenchDraftFromAssembly("),
  "api/bom/drafts/from-assembly/route.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-005J draft import-xls route uses async provider-neutral helpers",
  bomDraftImportXlsRouteSource.includes("getSubmissionAsync") &&
    bomDraftImportXlsRouteSource.includes("await getSubmissionAsync") &&
    bomDraftImportXlsRouteSource.includes("createBomWorkbenchDraftFromSolidWorksXlsAsync") &&
    bomDraftImportXlsRouteSource.includes("await createBomWorkbenchDraftFromSolidWorksXlsAsync") &&
    bomDraftImportXlsRouteSource.includes("BomXlsImportError") &&
    !bomDraftImportXlsRouteSource.includes('from "@/lib/db"') &&
    !bomDraftImportXlsRouteSource.includes("getSubmission(") &&
    !bomDraftImportXlsRouteSource.includes("createBomWorkbenchDraftFromSolidWorksXls("),
  "api/bom/drafts/import-xls/route.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-005C pending reviews route uses async provider-neutral helper",
  bomReviewsPendingRouteSource.includes("listPendingBomWorkbenchReviewsAsync") &&
    bomReviewsPendingRouteSource.includes("await listPendingBomWorkbenchReviewsAsync") &&
    !bomReviewsPendingRouteSource.includes('from "@/lib/db"') &&
    !bomReviewsPendingRouteSource.includes("listPendingBomWorkbenchReviews("),
  "api/bom/reviews/pending/route.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-005D release export route uses async provider-neutral helpers",
  bomReleaseExportRouteSource.includes("getBomReleaseSnapshotByIdAsync") &&
    bomReleaseExportRouteSource.includes("await getBomReleaseSnapshotByIdAsync") &&
    bomReleaseExportRouteSource.includes("getSubmissionAsync") &&
    bomReleaseExportRouteSource.includes("await getSubmissionAsync") &&
    !bomReleaseExportRouteSource.includes('from "@/lib/db"') &&
    !bomReleaseExportRouteSource.includes("getBomReleaseSnapshotById(") &&
    !bomReleaseExportRouteSource.includes("getSubmission("),
  "api/bom/releases/[releaseId]/export/route.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-005E review reject route uses async provider-neutral helpers",
  bomReviewRejectRouteSource.includes("getBomWorkbenchReviewByIdAsync") &&
    bomReviewRejectRouteSource.includes("await getBomWorkbenchReviewByIdAsync") &&
    bomReviewRejectRouteSource.includes("getBomWorkbenchDraftByIdAsync") &&
    bomReviewRejectRouteSource.includes("await getBomWorkbenchDraftByIdAsync") &&
    bomReviewRejectRouteSource.includes("getSubmissionAsync") &&
    bomReviewRejectRouteSource.includes("await getSubmissionAsync") &&
    bomReviewRejectRouteSource.includes("decideApprovalPlatformLegacyBomAsync") &&
    bomReviewRejectRouteSource.includes("await decideApprovalPlatformLegacyBomAsync") &&
    !bomReviewRejectRouteSource.includes('from "@/lib/db"') &&
    !bomReviewRejectRouteSource.includes("getBomWorkbenchReviewById(") &&
    !bomReviewRejectRouteSource.includes("getBomWorkbenchDraftById(") &&
    !bomReviewRejectRouteSource.includes("rejectBomWorkbenchReview(") &&
    !bomReviewRejectRouteSource.includes("getSubmission("),
  "api/bom/reviews/[reviewId]/reject/route.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-005I review approve route uses async provider-neutral helpers",
  bomReviewApproveRouteSource.includes("getBomWorkbenchReviewByIdAsync") &&
    bomReviewApproveRouteSource.includes("await getBomWorkbenchReviewByIdAsync") &&
    bomReviewApproveRouteSource.includes("getBomWorkbenchDraftByIdAsync") &&
    bomReviewApproveRouteSource.includes("await getBomWorkbenchDraftByIdAsync") &&
    bomReviewApproveRouteSource.includes("getSubmissionAsync") &&
    bomReviewApproveRouteSource.includes("await getSubmissionAsync") &&
    bomReviewApproveRouteSource.includes("decideApprovalPlatformLegacyBomAsync") &&
    bomReviewApproveRouteSource.includes("await decideApprovalPlatformLegacyBomAsync") &&
    bomReviewApproveRouteSource.includes("BomReleaseGateError") &&
    !bomReviewApproveRouteSource.includes('from "@/lib/db"') &&
    !bomReviewApproveRouteSource.includes("getBomWorkbenchReviewById(") &&
    !bomReviewApproveRouteSource.includes("getBomWorkbenchDraftById(") &&
    !bomReviewApproveRouteSource.includes("approveBomWorkbenchReview(") &&
    !bomReviewApproveRouteSource.includes("getSubmission("),
  "api/bom/reviews/[reviewId]/approve/route.ts"
);
record(
  "BOM-WORKBENCH-ASYNC-005F draft submit review route uses async provider-neutral helpers",
  bomDraftSubmitReviewRouteSource.includes("getBomWorkbenchDraftByIdAsync") &&
    bomDraftSubmitReviewRouteSource.includes("await getBomWorkbenchDraftByIdAsync") &&
    bomDraftSubmitReviewRouteSource.includes("getSubmissionAsync") &&
    bomDraftSubmitReviewRouteSource.includes("await getSubmissionAsync") &&
    bomDraftSubmitReviewRouteSource.includes("submitBomWorkbenchDraftReviewAsync") &&
    bomDraftSubmitReviewRouteSource.includes("await submitBomWorkbenchDraftReviewAsync") &&
    !bomDraftSubmitReviewRouteSource.includes('from "@/lib/db"') &&
    !bomDraftSubmitReviewRouteSource.includes("getBomWorkbenchDraftById(") &&
    !bomDraftSubmitReviewRouteSource.includes("submitBomWorkbenchDraftReview(") &&
    !bomDraftSubmitReviewRouteSource.includes("getSubmission("),
  "api/bom/drafts/[draftId]/submit-review/route.ts"
);

try {
  const userByIdSql = extractSqlConstant("SELECT_ASYNC_USER_BY_ID_SQL", userSource);
  const userByEmailSql = extractSqlConstant("SELECT_ASYNC_USER_BY_EMAIL_SQL", userSource);
  const userByEmailWithPasswordSql = extractSqlConstant("SELECT_ASYNC_USER_BY_EMAIL_WITH_PASSWORD_SQL", userSource);
  const upsertUserSql = extractSqlConstant("UPSERT_ASYNC_USER_SQL", userSource);
  const insertUserSql = extractSqlConstant("INSERT_ASYNC_USER_SQL", userSource);
  const updateUserPasswordSql = extractSqlConstant("UPDATE_ASYNC_USER_PASSWORD_SQL", userSource);
  const insertAuditSql = extractSqlConstant("INSERT_ASYNC_AUDIT_LOG_SQL", auditSource);
  const expireItemLocksSql = extractSqlConstant("EXPIRE_ASYNC_ITEM_LOCKS_SQL", itemLockAsyncSource);
  const activeItemLockByIdentifiersSql = extractSqlConstant(
    "SELECT_ASYNC_ACTIVE_ITEM_LOCK_BY_IDENTIFIERS_SQL",
    itemLockAsyncSource
  );
  const submissionItemForLockSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_ITEM_FOR_LOCK_SQL", itemLockAsyncSource);
  const activeItemLockByItemIdSql = extractSqlConstant("SELECT_ASYNC_ACTIVE_ITEM_LOCK_BY_ITEM_ID_SQL", itemLockAsyncSource);
  const insertItemLockSql = extractSqlConstant("INSERT_ASYNC_ITEM_LOCK_SQL", itemLockAsyncSource);
  const releaseItemLockSql = extractSqlConstant("RELEASE_ASYNC_ITEM_LOCK_SQL", itemLockAsyncSource);
  const itemRevisionHistorySql = extractSqlConstant("SELECT_ASYNC_ITEM_REVISION_HISTORY_SQL", itemInsightSource);
  const whereUsedSql = extractSqlConstant("SELECT_ASYNC_WHERE_USED_SQL", itemInsightSource);
  const dashboardStatusCountsSql = extractSqlConstant("SELECT_ASYNC_DASHBOARD_STATUS_COUNTS_SQL", dashboardAsyncSource);
  const releaseFailedNotificationsSql = extractSqlConstant("SELECT_ASYNC_RELEASE_FAILED_NOTIFICATIONS_SQL", notificationAsyncSource);
  const pendingReviewNotificationsSql = extractSqlConstant("SELECT_ASYNC_PENDING_REVIEW_NOTIFICATIONS_SQL", notificationAsyncSource);
  const uploadFailedNotificationsSql = extractSqlConstant("SELECT_ASYNC_UPLOAD_FAILED_NOTIFICATIONS_SQL", notificationAsyncSource);
  const missingReleasePackageNotificationsSql = extractSqlConstant(
    "SELECT_ASYNC_MISSING_RELEASE_PACKAGE_NOTIFICATIONS_SQL",
    notificationAsyncSource
  );
  const activeLockNotificationsSql = extractSqlConstant("SELECT_ASYNC_ACTIVE_LOCK_NOTIFICATIONS_SQL", notificationAsyncSource);
  const insertLlmConversationSql = extractSqlConstant("INSERT_ASYNC_LLM_CONVERSATION_SQL", aiAsyncSource);
  const selectLlmConversationSql = extractSqlConstant("SELECT_ASYNC_LLM_CONVERSATION_SQL", aiAsyncSource);
  const insertLlmMessageSql = extractSqlConstant("INSERT_ASYNC_LLM_MESSAGE_SQL", aiAsyncSource);
  const updateLlmConversationUpdatedAtSql = extractSqlConstant("UPDATE_ASYNC_LLM_CONVERSATION_UPDATED_AT_SQL", aiAsyncSource);
  const submissionListSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_SUMMARIES_SQLITE", submissionListAsyncSource);
  const submissionSearchSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_SEARCH_SQLITE", submissionListAsyncSource);
  const submissionDetailSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_DETAIL_SQL", submissionListAsyncSource);
  const designReuseCandidatesSql = extractSqlConstant(
    "SELECT_ASYNC_DESIGN_REUSE_CANDIDATES_SQLITE",
    submissionListAsyncSource
  );
  const duplicateGeometryCandidatesSql = extractSqlConstant(
    "SELECT_ASYNC_DUPLICATE_GEOMETRY_CANDIDATES_SQLITE",
    submissionListAsyncSource
  );
  const submissionFilesSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_FILES_SQL", submissionListAsyncSource);
  const submissionReferencesSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_REFERENCES_SQL", submissionListAsyncSource);
  const submissionApprovalsSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_APPROVALS_SQL", submissionListAsyncSource);
  const submissionAuditLogsSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_AUDIT_LOGS_SQL", submissionListAsyncSource);
  const submissionActiveLockSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_ACTIVE_LOCK_SQL", submissionListAsyncSource);
  const submissionReleasePackageSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_RELEASE_PACKAGE_SQL", submissionListAsyncSource);
  const submissionBomHeaderSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_BOM_HEADER_SQL", submissionListAsyncSource);
  const submissionBomLinesSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_BOM_LINES_SQL", submissionListAsyncSource);
  const bomHeaderSql = extractSqlConstant("SELECT_ASYNC_BOM_HEADER_SQL", bomAsyncSource);
  const bomLinesSql = extractSqlConstant("SELECT_ASYNC_BOM_LINES_SQL", bomAsyncSource);
  const bomSubmissionSql = extractSqlConstant("SELECT_ASYNC_BOM_SUBMISSION_SQL", bomAsyncSource);
  const assemblyFileReferencesSql = extractSqlConstant("SELECT_ASYNC_ASSEMBLY_FILE_REFERENCES_SQL", bomAsyncSource);
  const upsertBomHeaderSql = extractSqlConstant("UPSERT_ASYNC_BOM_HEADER_SQL", bomAsyncSource);
  const deleteBomLinesSql = extractSqlConstant("DELETE_ASYNC_BOM_LINES_SQL", bomAsyncSource);
  const insertBomLineSql = extractSqlConstant("INSERT_ASYNC_BOM_LINE_SQL", bomAsyncSource);
  const previousBomSubmissionsSql = extractSqlConstant("SELECT_ASYNC_PREVIOUS_BOM_SUBMISSIONS_SQL", bomAsyncSource);
  const sandboxBranchesForSubmissionSql = extractSqlConstant("SELECT_ASYNC_SANDBOX_BRANCHES_FOR_SUBMISSION_SQL", sandboxAsyncSource);
  const sandboxBranchByIdSql = extractSqlConstant("SELECT_ASYNC_SANDBOX_BRANCH_BY_ID_SQL", sandboxAsyncSource);
  const activeSandboxBranchBySourceSql = extractSqlConstant("SELECT_ASYNC_ACTIVE_SANDBOX_BRANCH_BY_SOURCE_SQL", sandboxAsyncSource);
  const duplicateSandboxBranchNameSql = extractSqlConstant("SELECT_ASYNC_SANDBOX_BRANCH_DUPLICATE_NAME_SQL", sandboxAsyncSource);
  const insertSandboxSubmissionSql = extractSqlConstant("INSERT_ASYNC_SANDBOX_SUBMISSION_SQL", sandboxAsyncSource);
  const insertSandboxFileSql = extractSqlConstant("INSERT_ASYNC_SANDBOX_FILE_SQL", sandboxAsyncSource);
  const insertSandboxFileReferenceSql = extractSqlConstant("INSERT_ASYNC_SANDBOX_FILE_REFERENCE_SQL", sandboxAsyncSource);
  const insertSandboxBranchSql = extractSqlConstant("INSERT_ASYNC_SANDBOX_BRANCH_SQL", sandboxAsyncSource);
  const closeSandboxBranchSql = extractSqlConstant("CLOSE_ASYNC_SANDBOX_BRANCH_SQL", sandboxAsyncSource);
  const mergeSandboxBranchSql = extractSqlConstant("MERGE_ASYNC_SANDBOX_BRANCH_SQL", sandboxAsyncSource);
  const partRootByCodeSql = extractSqlConstant("SELECT_ASYNC_PART_ROOT_BY_CODE_SQL", numberingAsyncSource);
  const partNumberByNumberSql = extractSqlConstant("SELECT_ASYNC_PART_NUMBER_BY_NUMBER_SQL", numberingAsyncSource);
  const drawingNumberByNumberSql = extractSqlConstant("SELECT_ASYNC_DRAWING_NUMBER_BY_NUMBER_SQL", numberingAsyncSource);
  const partRootsForDuplicateSimilaritySql = extractSqlConstant(
    "SELECT_ASYNC_PART_ROOTS_FOR_DUPLICATE_SIMILARITY_SQL",
    numberingAsyncSource
  );
  const partNumbersForDuplicateSimilaritySql = extractSqlConstant(
    "SELECT_ASYNC_PART_NUMBERS_FOR_DUPLICATE_SIMILARITY_SQL",
    numberingAsyncSource
  );
  const insertNumberingWarningEventSql = extractSqlConstant("INSERT_ASYNC_NUMBERING_WARNING_EVENT_SQL", numberingAsyncSource);
  const insertDuplicateCheckEventSql = extractSqlConstant("INSERT_ASYNC_DUPLICATE_CHECK_EVENT_SQL", numberingAsyncSource);
  const insertNumberingAuditSql = extractSqlConstant("INSERT_ASYNC_NUMBERING_AUDIT_SQL", numberingAsyncSource);
  const updateNumberingTaskStatusSql = extractSqlConstant("UPDATE_ASYNC_NUMBERING_TASK_STATUS_SQL", numberingAsyncSource);
  const numberingTaskByIdSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_TASK_BY_ID_SQL", numberingAsyncSource);
  const numberingAssignedRoleCodesSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_ASSIGNED_ROLE_CODES_SQL", numberingAsyncSource);
  const numberingAllowedRoleScopesSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_ALLOWED_ROLE_SCOPES_SQL", numberingAsyncSource);
  const numberingActiveDelegationsSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_ACTIVE_DELEGATIONS_SQL", numberingAsyncSource);
  const numberingTasksBaseSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_TASKS_BASE_SQL", numberingAsyncSource);
  const numberingNotificationsBaseSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_NOTIFICATIONS_BASE_SQL", numberingAsyncSource);
  const numberingNotificationByIdSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_NOTIFICATION_BY_ID_SQL", numberingAsyncSource);
  const updateNumberingNotificationStateSql = extractSqlConstant("UPDATE_ASYNC_NUMBERING_NOTIFICATION_STATE_SQL", numberingAsyncSource);
  const numberingExportRootsSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_EXPORT_ROOTS_SQL", numberingAsyncSource);
  const numberingExportPartsSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_EXPORT_PARTS_SQL", numberingAsyncSource);
  const numberingExportDrawingsSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_EXPORT_DRAWINGS_SQL", numberingAsyncSource);
  const numberingExportAuditSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_EXPORT_AUDIT_SQL", numberingAsyncSource);
  const insertNumberingExportJobSql = extractSqlConstant("INSERT_ASYNC_NUMBERING_EXPORT_JOB_SQL", numberingAsyncSource);
  const numberingExportJobByIdSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_EXPORT_JOB_BY_ID_SQL", numberingAsyncSource);
  const numberingExportJobsSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_EXPORT_JOBS_SQL", numberingAsyncSource);
  const monthlyAuditCountRootsSql = extractSqlConstant("SELECT_ASYNC_MONTHLY_AUDIT_COUNT_ROOTS_SQL", numberingAsyncSource);
  const monthlyAuditCountPartsSql = extractSqlConstant("SELECT_ASYNC_MONTHLY_AUDIT_COUNT_PARTS_SQL", numberingAsyncSource);
  const monthlyAuditCountDrawingsSql = extractSqlConstant("SELECT_ASYNC_MONTHLY_AUDIT_COUNT_DRAWINGS_SQL", numberingAsyncSource);
  const monthlyAuditCountOpenTasksSql = extractSqlConstant("SELECT_ASYNC_MONTHLY_AUDIT_COUNT_OPEN_TASKS_SQL", numberingAsyncSource);
  const monthlyAuditOpenTasksForTwoRolesSql = extractSqlConstant("SELECT_ASYNC_MONTHLY_AUDIT_OPEN_TASKS_FOR_TWO_ROLES_SQL", numberingAsyncSource);
  const monthlyAuditApprovalRulesForTwoRolesSql = extractSqlConstant(
    "SELECT_ASYNC_MONTHLY_AUDIT_APPROVAL_RULES_FOR_TWO_ROLES_SQL",
    numberingAsyncSource
  );
  const monthlyAuditProjectBucketsSql = extractSqlConstant("SELECT_ASYNC_MONTHLY_AUDIT_PROJECT_BUCKETS_SQL", numberingAsyncSource);
  const insertMonthlyAuditReportSql = extractSqlConstant("INSERT_ASYNC_MONTHLY_AUDIT_REPORT_SQL", numberingAsyncSource);
  const monthlyAuditReportByIdSql = extractSqlConstant("SELECT_ASYNC_MONTHLY_AUDIT_REPORT_BY_ID_SQL", numberingAsyncSource);
  const monthlyAuditReportsSql = extractSqlConstant("SELECT_ASYNC_MONTHLY_AUDIT_REPORTS_SQL", numberingAsyncSource);
  const monthlyAuditReportsByMonthSql = extractSqlConstant("SELECT_ASYNC_MONTHLY_AUDIT_REPORTS_BY_MONTH_SQL", numberingAsyncSource);
  const overdueDraftRootsSql = extractSqlConstant("SELECT_ASYNC_OVERDUE_DRAFT_ROOTS_SQL", numberingAsyncSource);
  const draftRootPartsSql = extractSqlConstant("SELECT_ASYNC_DRAFT_ROOT_PARTS_SQL", numberingAsyncSource);
  const draftRootDrawingsSql = extractSqlConstant("SELECT_ASYNC_DRAFT_ROOT_DRAWINGS_SQL", numberingAsyncSource);
  const updateOverdueDraftDrawingsSql = extractSqlConstant("UPDATE_ASYNC_OVERDUE_DRAFT_DRAWINGS_SQL", numberingAsyncSource);
  const updateOverdueDraftPartsSql = extractSqlConstant("UPDATE_ASYNC_OVERDUE_DRAFT_PARTS_SQL", numberingAsyncSource);
  const updateOverdueDraftRootSql = extractSqlConstant("UPDATE_ASYNC_OVERDUE_DRAFT_ROOT_SQL", numberingAsyncSource);
  const insertNumberingTaskItemSql = extractSqlConstant("INSERT_ASYNC_NUMBERING_TASK_ITEM_SQL", numberingAsyncSource);
  const insertNumberingNotificationSql = extractSqlConstant("INSERT_ASYNC_NUMBERING_NOTIFICATION_SQL", numberingAsyncSource);
  const rootPartNumbersSql = extractSqlConstant("SELECT_ASYNC_ROOT_PART_NUMBERS_SQL", numberingAsyncSource);
  const rootDrawingNumbersSql = extractSqlConstant("SELECT_ASYNC_ROOT_DRAWING_NUMBERS_SQL", numberingAsyncSource);
  const numberingLinksForRootSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_LINKS_FOR_ROOT_SQL", numberingAsyncSource);
  const numberingVariantsForRootSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_VARIANTS_FOR_ROOT_SQL", numberingAsyncSource);
  const numberingWarningsBaseSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_WARNINGS_BASE_SQL", numberingAsyncSource);
  const numberingAuditTrailSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_AUDIT_TRAIL_SQL", numberingAsyncSource);
  const numberingSearchRootsSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_SEARCH_ROOTS_BASE_SQL", numberingAsyncSource);
  const numberingSearchPartsSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_SEARCH_PARTS_BASE_SQL", numberingAsyncSource);
  const numberingSearchDrawingsSql = extractSqlConstant("SELECT_ASYNC_NUMBERING_SEARCH_DRAWINGS_BASE_SQL", numberingAsyncSource);
  const drawingModuleRecordsSql = extractSqlConstant("SELECT_ASYNC_DRAWING_MODULE_RECORDS_BASE_SQL", numberingAsyncSource);
  const drawingModuleLinkedPartNumbersSql = extractSqlConstant("SELECT_ASYNC_DRAWING_MODULE_LINKED_PART_NUMBERS_SQL", numberingAsyncSource);
  const drawingModuleLinkedPartsByRootSql = extractSqlConstant("SELECT_ASYNC_DRAWING_MODULE_LINKED_PARTS_BY_ROOT_SQL", numberingAsyncSource);
  const partModuleRecordsSql = extractSqlConstant("SELECT_ASYNC_PART_MODULE_RECORDS_BASE_SQL", numberingAsyncSource);
  const partDetailLinkedDrawingsSql = extractSqlConstant("SELECT_ASYNC_PART_DETAIL_LINKED_DRAWINGS_SQL", numberingAsyncSource);
  const partDetailSameDrawingVariantsSql = extractSqlConstant("SELECT_ASYNC_PART_DETAIL_SAME_DRAWING_VARIANTS_SQL", numberingAsyncSource);
  const partDetailCostProfilesSql = extractSqlConstant("SELECT_ASYNC_PART_DETAIL_COST_PROFILES_SQL", numberingAsyncSource);
  const partDetailCostTiersBaseSql = extractSqlConstant("SELECT_ASYNC_PART_DETAIL_COST_TIERS_BASE_SQL", numberingAsyncSource);
  const partDetailCostChangeRequestsSql = extractSqlConstant("SELECT_ASYNC_PART_DETAIL_COST_CHANGE_REQUESTS_SQL", numberingAsyncSource);
  const partVariantAttributesByPartIdSql = extractSqlConstant("SELECT_ASYNC_PART_VARIANT_ATTRIBUTES_BY_PART_ID_SQL", numberingAsyncSource);
  const updatePartVariantAttributesSql = extractSqlConstant("UPDATE_ASYNC_PART_VARIANT_ATTRIBUTES_SQL", numberingAsyncSource);
  const insertPartVariantAttributesSql = extractSqlConstant("INSERT_ASYNC_PART_VARIANT_ATTRIBUTES_SQL", numberingAsyncSource);
  const insertPartCostProfileSql = extractSqlConstant("INSERT_ASYNC_PART_COST_PROFILE_SQL", numberingAsyncSource);
  const insertPartCostTierSql = extractSqlConstant("INSERT_ASYNC_PART_COST_TIER_SQL", numberingAsyncSource);
  const insertPartCostChangeRequestSql = extractSqlConstant("INSERT_ASYNC_PART_COST_CHANGE_REQUEST_SQL", numberingAsyncSource);
  const selectPartCostChangeRequestByIdSql = extractSqlConstant("SELECT_ASYNC_PART_COST_CHANGE_REQUEST_BY_ID_SQL", numberingAsyncSource);
  const selectPartCostProfileByIdSql = extractSqlConstant("SELECT_ASYNC_PART_COST_PROFILE_BY_ID_SQL", numberingAsyncSource);
  const selectApprovedPartCostProfileByTypeSql = extractSqlConstant("SELECT_ASYNC_APPROVED_PART_COST_PROFILE_BY_TYPE_SQL", numberingAsyncSource);
  const selectApprovedStandardPartCostProfileSql = extractSqlConstant("SELECT_ASYNC_APPROVED_STANDARD_PART_COST_PROFILE_SQL", numberingAsyncSource);
  const updatePartCostChangeRequestDecisionSql = extractSqlConstant("UPDATE_ASYNC_PART_COST_CHANGE_REQUEST_DECISION_SQL", numberingAsyncSource);
  const updatePartCostProfileRejectedSql = extractSqlConstant("UPDATE_ASYNC_PART_COST_PROFILE_REJECTED_SQL", numberingAsyncSource);
  const updatePartCostProfileApprovedSql = extractSqlConstant("UPDATE_ASYNC_PART_COST_PROFILE_APPROVED_SQL", numberingAsyncSource);
  const updateActivePartStandardCostEndSql = extractSqlConstant("UPDATE_ASYNC_ACTIVE_PART_STANDARD_COST_END_SQL", numberingAsyncSource);
  const insertPartStandardCostSql = extractSqlConstant("INSERT_ASYNC_PART_STANDARD_COST_SQL", numberingAsyncSource);
  const submissionRevisionExistsSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_REVISION_EXISTS_SQL", submissionWriteAsyncSource);
  const upsertSubmissionItemSql = extractSqlConstant("UPSERT_ASYNC_SUBMISSION_ITEM_SQL", submissionWriteAsyncSource);
  const insertSubmissionRecordSql = extractSqlConstant("INSERT_ASYNC_SUBMISSION_RECORD_SQL", submissionWriteAsyncSource);
  const insertSubmissionFileSql = extractSqlConstant("INSERT_ASYNC_SUBMISSION_FILE_SQL", submissionWriteAsyncSource);
  const insertFileReferenceSql = extractSqlConstant("INSERT_ASYNC_FILE_REFERENCE_SQL", submissionWriteAsyncSource);
  const upsertSubmissionBomHeaderSql = extractSqlConstant("UPSERT_ASYNC_SUBMISSION_BOM_HEADER_SQL", submissionWriteAsyncSource);
  const deleteSubmissionBomLinesSql = extractSqlConstant("DELETE_ASYNC_SUBMISSION_BOM_LINES_SQL", submissionWriteAsyncSource);
  const insertSubmissionBomLineSql = extractSqlConstant("INSERT_ASYNC_SUBMISSION_BOM_LINE_SQL", submissionWriteAsyncSource);
  const insertSubmissionWriteAuditLogSql = extractSqlConstant(
    "INSERT_ASYNC_SUBMISSION_WRITE_AUDIT_LOG_SQL",
    submissionWriteAsyncSource
  );
  const asyncSubmissionFileSql = extractSqlConstant("SELECT_ASYNC_SUBMISSION_FILE_SQL", submissionFileAsyncSource);
  const asyncFilesNeedingUploadSql = extractSqlConstant("SELECT_ASYNC_FILES_NEEDING_UPLOAD_SQL", submissionFileAsyncSource);
  const updateAsyncFileGDriveStatusSql = extractSqlConstant("UPDATE_ASYNC_FILE_GDRIVE_STATUS_SQL", submissionFileAsyncSource);
  const updateAsyncFileGDriveStatusWithIdSql = extractSqlConstant(
    "UPDATE_ASYNC_FILE_GDRIVE_STATUS_WITH_ID_SQL",
    submissionFileAsyncSource
  );
  const bomWorkbenchParentSql = extractSqlConstant("SELECT_ASYNC_BOM_WORKBENCH_PARENT_SQL", bomWorkbenchAsyncSource);
  const bomWorkbenchDraftsSql = extractSqlConstant("SELECT_ASYNC_BOM_WORKBENCH_DRAFTS_SQL", bomWorkbenchAsyncSource);
  const bomWorkbenchDraftSql = extractSqlConstant("SELECT_ASYNC_BOM_WORKBENCH_DRAFT_SQL", bomWorkbenchAsyncSource);
  const bomWorkbenchDraftLinesSql = extractSqlConstant("SELECT_ASYNC_BOM_WORKBENCH_DRAFT_LINES_SQL", bomWorkbenchAsyncSource);
  const bomWorkbenchItemByPartNumberSql = extractSqlConstant("SELECT_ASYNC_BOM_WORKBENCH_ITEM_BY_PART_NUMBER_SQL", bomWorkbenchAsyncSource);
  const bomWorkbenchAssemblyReferencesSql = extractSqlConstant(
    "SELECT_ASYNC_BOM_WORKBENCH_ASSEMBLY_REFERENCES_SQL",
    bomWorkbenchAsyncSource
  );
  const insertBomWorkbenchDraftSql = extractSqlConstant("INSERT_ASYNC_BOM_WORKBENCH_DRAFT_SQL", bomWorkbenchAsyncSource);
  const deleteBomWorkbenchDraftLinesSql = extractSqlConstant("DELETE_ASYNC_BOM_WORKBENCH_DRAFT_LINES_SQL", bomWorkbenchAsyncSource);
  const insertBomWorkbenchDraftLineSql = extractSqlConstant("INSERT_ASYNC_BOM_WORKBENCH_DRAFT_LINE_SQL", bomWorkbenchAsyncSource);
  const bomImportProfileSql = extractSqlConstant("SELECT_ASYNC_BOM_IMPORT_PROFILE_SQL", bomWorkbenchAsyncSource);
  const updateBomImportProfileSql = extractSqlConstant("UPDATE_ASYNC_BOM_IMPORT_PROFILE_SQL", bomWorkbenchAsyncSource);
  const insertBomImportProfileSql = extractSqlConstant("INSERT_ASYNC_BOM_IMPORT_PROFILE_SQL", bomWorkbenchAsyncSource);
  const bomImportJobSql = extractSqlConstant("SELECT_ASYNC_BOM_IMPORT_JOB_SQL", bomWorkbenchAsyncSource);
  const insertBomImportJobSql = extractSqlConstant("INSERT_ASYNC_BOM_IMPORT_JOB_SQL", bomWorkbenchAsyncSource);
  const insertAsyncFileAssetSql = extractSqlConstant("INSERT_ASYNC_FILE_ASSET_SQL", bomWorkbenchAsyncSource);
  const updateBomWorkbenchDraftAfterSaveSql = extractSqlConstant("UPDATE_ASYNC_BOM_WORKBENCH_DRAFT_AFTER_SAVE_SQL", bomWorkbenchAsyncSource);
  const bomWorkbenchLatestReleaseSnapshotSql = extractSqlConstant(
    "SELECT_ASYNC_BOM_WORKBENCH_LATEST_RELEASE_SNAPSHOT_SQL",
    bomWorkbenchAsyncSource
  );
  const bomWorkbenchReleaseSnapshotSql = extractSqlConstant("SELECT_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOT_SQL", bomWorkbenchAsyncSource);
  const bomWorkbenchPendingReviewsSql = extractSqlConstant("SELECT_ASYNC_BOM_WORKBENCH_PENDING_REVIEWS_SQL", bomWorkbenchAsyncSource);
  const bomWorkbenchReviewSql = extractSqlConstant("SELECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL", bomWorkbenchAsyncSource);
  const bomWorkbenchExistingPendingReviewSql = extractSqlConstant(
    "SELECT_ASYNC_BOM_WORKBENCH_EXISTING_PENDING_REVIEW_SQL",
    bomWorkbenchAsyncSource
  );
  const submitBomWorkbenchDraftReviewSql = extractSqlConstant("SUBMIT_ASYNC_BOM_WORKBENCH_DRAFT_REVIEW_SQL", bomWorkbenchAsyncSource);
  const insertBomWorkbenchReviewSql = extractSqlConstant("INSERT_ASYNC_BOM_WORKBENCH_REVIEW_SQL", bomWorkbenchAsyncSource);
  const rejectBomWorkbenchDraftSql = extractSqlConstant("REJECT_ASYNC_BOM_WORKBENCH_DRAFT_SQL", bomWorkbenchAsyncSource);
  const rejectBomWorkbenchReviewSql = extractSqlConstant("REJECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL", bomWorkbenchAsyncSource);
  const releaseGateSubmissionSql = extractSqlConstant("SELECT_ASYNC_BOM_WORKBENCH_RELEASE_GATE_SUBMISSION_SQL", bomWorkbenchAsyncSource);
  const latestReleasedRevisionSql = extractSqlConstant("SELECT_ASYNC_BOM_WORKBENCH_LATEST_RELEASED_REVISION_SQL", bomWorkbenchAsyncSource);
  const obsoleteBomReleaseSnapshotsSql = extractSqlConstant(
    "OBSOLETE_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOTS_SQL",
    bomWorkbenchAsyncSource
  );
  const obsoleteBomReleasedDraftsSql = extractSqlConstant("OBSOLETE_ASYNC_BOM_WORKBENCH_RELEASED_DRAFTS_SQL", bomWorkbenchAsyncSource);
  const insertBomReleaseSnapshotSql = extractSqlConstant("INSERT_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOT_SQL", bomWorkbenchAsyncSource);
  const releaseBomWorkbenchDraftSql = extractSqlConstant("RELEASE_ASYNC_BOM_WORKBENCH_DRAFT_SQL", bomWorkbenchAsyncSource);
  const approveBomWorkbenchReviewSql = extractSqlConstant("APPROVE_ASYNC_BOM_WORKBENCH_REVIEW_SQL", bomWorkbenchAsyncSource);
  const deactivateBomWorkbenchActiveDraftsSql = extractSqlConstant(
    "DEACTIVATE_ASYNC_BOM_WORKBENCH_ACTIVE_DRAFTS_SQL",
    bomWorkbenchAsyncSource
  );
  const activateBomWorkbenchDraftSql = extractSqlConstant("ACTIVATE_ASYNC_BOM_WORKBENCH_DRAFT_SQL", bomWorkbenchAsyncSource);
  const insertBomWorkbenchEditEventSql = extractSqlConstant("INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL", bomWorkbenchAsyncSource);
  const insertBomWorkbenchAuditLogSql = extractSqlConstant("INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL", bomWorkbenchAsyncSource);
  const discussionCommentsSql = extractSqlConstant("SELECT_ASYNC_DISCUSSION_COMMENTS_SQL", collaborationAsyncSource);
  const insertDiscussionCommentSql = extractSqlConstant("INSERT_ASYNC_DISCUSSION_COMMENT_SQL", collaborationAsyncSource);
  const resolveDiscussionCommentSql = extractSqlConstant("RESOLVE_ASYNC_DISCUSSION_COMMENT_SQL", collaborationAsyncSource);
  const reviewIssuesSql = extractSqlConstant("SELECT_ASYNC_REVIEW_ISSUES_SQL", collaborationAsyncSource);
  const insertReviewIssueSql = extractSqlConstant("INSERT_ASYNC_REVIEW_ISSUE_SQL", collaborationAsyncSource);
  const resolveReviewIssueSql = extractSqlConstant("RESOLVE_ASYNC_REVIEW_ISSUE_SQL", collaborationAsyncSource);
  const pdfMarkupsSql = extractSqlConstant("SELECT_ASYNC_PDF_MARKUPS_SQL", collaborationAsyncSource);
  const insertPdfMarkupSql = extractSqlConstant("INSERT_ASYNC_PDF_MARKUP_SQL", collaborationAsyncSource);
  const resolvePdfMarkupSql = extractSqlConstant("RESOLVE_ASYNC_PDF_MARKUP_SQL", collaborationAsyncSource);
  const changeRequestsSql = extractSqlConstant("SELECT_ASYNC_CHANGE_REQUESTS_SQL", collaborationAsyncSource);
  const insertChangeRequestSql = extractSqlConstant("INSERT_ASYNC_CHANGE_REQUEST_SQL", collaborationAsyncSource);
  const decideChangeRequestSql = extractSqlConstant("DECIDE_ASYNC_CHANGE_REQUEST_SQL", collaborationAsyncSource);
  const approvalMatrixRequirementsSql = extractSqlConstant("SELECT_ASYNC_APPROVAL_MATRIX_REQUIREMENTS_SQL", approvalAsyncSource);
  const insertApprovalMatrixRequirementSql = extractSqlConstant("INSERT_ASYNC_APPROVAL_MATRIX_REQUIREMENT_SQL", approvalAsyncSource);
  const satisfyApprovalMatrixRequirementSql = extractSqlConstant(
    "SATISFY_ASYNC_APPROVAL_MATRIX_REQUIREMENT_SQL",
    approvalAsyncSource
  );
  const waiveApprovalMatrixRequirementSql = extractSqlConstant("WAIVE_ASYNC_APPROVAL_MATRIX_REQUIREMENT_SQL", approvalAsyncSource);
  const insertApprovalStepSql = extractSqlConstant("INSERT_ASYNC_APPROVAL_STEP_SQL", approvalAsyncSource);
  const reviewerDecisionSql = extractSqlConstant("SELECT_ASYNC_REVIEWER_DECISION_SQL", approvalAsyncSource);
  const approvalSummarySql = extractSqlConstant("SELECT_ASYNC_APPROVAL_SUMMARY_SQL", approvalAsyncSource);
  const rejectSubmissionSql = extractSqlConstant("REJECT_ASYNC_SUBMISSION_SQL", submissionStatusAsyncSource);
  const activeSandboxBranchSql = extractSqlConstant("SELECT_ASYNC_ACTIVE_SANDBOX_BRANCH_SQL", submissionStatusAsyncSource);
  const markSubmissionReleasingSql = extractSqlConstant("MARK_ASYNC_SUBMISSION_RELEASING_SQL", submissionStatusAsyncSource);
  const markSubmissionReleaseFailedSql = extractSqlConstant("MARK_ASYNC_SUBMISSION_RELEASE_FAILED_SQL", submissionStatusAsyncSource);
  const releaseLifecycleSubmissionSql = extractSqlConstant("SELECT_ASYNC_RELEASE_LIFECYCLE_SUBMISSION_SQL", submissionStatusAsyncSource);
  const releaseLifecycleObsoleteSubmissionsSql = extractSqlConstant(
    "SELECT_ASYNC_RELEASE_LIFECYCLE_OBSOLETE_SUBMISSIONS_SQL",
    submissionStatusAsyncSource
  );
  const markSubmissionReleasedSql = extractSqlConstant("MARK_ASYNC_SUBMISSION_RELEASED_SQL", submissionStatusAsyncSource);
  const updateItemCurrentRevisionSql = extractSqlConstant("UPDATE_ASYNC_ITEM_CURRENT_REVISION_SQL", submissionStatusAsyncSource);
  const markPreviousSubmissionObsoleteSql = extractSqlConstant(
    "MARK_ASYNC_PREVIOUS_SUBMISSION_OBSOLETE_SQL",
    submissionStatusAsyncSource
  );
  const insertObsoleteAuditLogSql = extractSqlConstant("INSERT_ASYNC_OBSOLETE_AUDIT_LOG_SQL", submissionStatusAsyncSource);
  const releasePackageBySubmissionSql = extractSqlConstant("SELECT_ASYNC_RELEASE_PACKAGE_BY_SUBMISSION_SQL", releaseAsyncSource);
  const upsertReleasePackageSql = extractSqlConstant("UPSERT_ASYNC_RELEASE_PACKAGE_SQL", releaseAsyncSource);
  const releasedFilenameConflictSql = extractSqlConstant("SELECT_ASYNC_RELEASED_FILENAME_CONFLICT_SQL", releaseAsyncSource);
  const procurementSyncRunsSql = extractSqlConstant("SELECT_ASYNC_PROCUREMENT_SYNC_RUNS_SQL", releaseAsyncSource);
  const procurementSyncRunByIdSql = extractSqlConstant("SELECT_ASYNC_PROCUREMENT_SYNC_RUN_BY_ID_SQL", releaseAsyncSource);
  const insertProcurementSyncRunSql = extractSqlConstant("INSERT_ASYNC_PROCUREMENT_SYNC_RUN_SQL", releaseAsyncSource);
  const decideProcurementSyncRunSql = extractSqlConstant("DECIDE_ASYNC_PROCUREMENT_SYNC_RUN_SQL", releaseAsyncSource);
  const readonlySharesSql = extractSqlConstant("SELECT_ASYNC_READONLY_SHARES_SQL", releaseAsyncSource);
  const readonlyShareByTokenHashSql = extractSqlConstant("SELECT_ASYNC_READONLY_SHARE_BY_TOKEN_HASH_SQL", releaseAsyncSource);
  const insertReadonlyShareSql = extractSqlConstant("INSERT_ASYNC_READONLY_SHARE_SQL", releaseAsyncSource);
  const revokeReadonlyShareSql = extractSqlConstant("REVOKE_ASYNC_READONLY_SHARE_SQL", releaseAsyncSource);
  const recordReadonlyShareAccessSql = extractSqlConstant("UPDATE_ASYNC_READONLY_SHARE_ACCESS_SQL", releaseAsyncSource);
  const supplierPortalResponsesSql = extractSqlConstant("SELECT_ASYNC_SUPPLIER_PORTAL_RESPONSES_SQL", releaseAsyncSource);
  const supplierPortalResponseSql = extractSqlConstant("SELECT_ASYNC_SUPPLIER_PORTAL_RESPONSE_SQL", releaseAsyncSource);
  const insertSupplierPortalResponseSql = extractSqlConstant("INSERT_ASYNC_SUPPLIER_PORTAL_RESPONSE_SQL", releaseAsyncSource);
  const closeSupplierPortalResponseSql = extractSqlConstant("CLOSE_ASYNC_SUPPLIER_PORTAL_RESPONSE_SQL", releaseAsyncSource);
  const handoffSubmissionIdsSql = extractSqlConstant(
    "SELECT_ASYNC_MANUFACTURING_HANDOFF_SUBMISSION_IDS_SQL",
    handoffAsyncSource
  );
  const database = new Database(":memory:");
  const qcCompanyId = "company-jenfu";
  const prepareStatement = database.prepare.bind(database);
  database.prepare = (sql) => {
    const statement = prepareStatement(sql);
    const withCompanyId = (args) => {
      if (args.length === 0) return [{ companyId: qcCompanyId }];
      const [first, ...rest] = args;
      if (first && typeof first === "object" && !Array.isArray(first)) {
        return [{ companyId: qcCompanyId, ...first }, ...rest];
      }
      return args;
    };

    return {
      ...statement,
      all: (...args) => statement.all(...withCompanyId(args)),
      get: (...args) => statement.get(...withCompanyId(args)),
      run: (...args) => statement.run(...withCompanyId(args))
    };
  };
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      account_status TEXT NOT NULL DEFAULT 'active',
      session_invalid_before TEXT,
      account_lifecycle_version INTEGER NOT NULL DEFAULT 1,
      system_role_enabled INTEGER NOT NULL DEFAULT 1,
      account_status_changed_at TEXT,
      account_status_changed_by TEXT,
      account_status_reason TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE companies (
      id TEXT PRIMARY KEY,
      company_code TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE user_company_memberships (
      user_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, company_id)
    );

    CREATE TABLE auth_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      login_identifier TEXT,
      email_normalized TEXT,
      verified_at TEXT,
      last_login_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, provider),
      UNIQUE (provider, provider_subject)
    );

    CREATE TABLE roles (
      id TEXT PRIMARY KEY,
      role_code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      system_defined INTEGER NOT NULL DEFAULT 0 CHECK (system_defined IN (0, 1)),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
    );

    CREATE TABLE role_permissions (
      id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL,
      permission_kind TEXT NOT NULL CHECK (permission_kind IN ('page', 'action')),
      permission_code TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 1 CHECK (allowed IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      UNIQUE (role_id, permission_kind, permission_code)
    );

    CREATE TABLE role_priority_versions (
      id TEXT PRIMARY KEY,
      priority_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE role_scope_rules (
      id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL,
      scope_kind TEXT NOT NULL,
      scope_code TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE user_role_assignments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      scope_template TEXT NOT NULL DEFAULT 'own_department',
      named_scope TEXT NOT NULL DEFAULT '',
      sponsor_user_id TEXT,
      starts_at TEXT,
      review_due_at TEXT,
      hard_ends_at TEXT,
      assigned_by TEXT,
      assigned_at TEXT NOT NULL,
      revoked_at TEXT,
      revoked_by TEXT
    );

    CREATE TABLE approval_delegations (
      id TEXT PRIMARY KEY,
      delegated_from TEXT NOT NULL,
      delegated_to TEXT NOT NULL,
      project_code TEXT,
      action_code TEXT,
      starts_at TEXT,
      ends_at TEXT,
      reason TEXT NOT NULL DEFAULT '',
      created_by TEXT,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      revoked_by TEXT
    );

    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      submission_id TEXT,
      actor_id TEXT,
      action TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE part_roots (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      root_code TEXT NOT NULL UNIQUE,
      core_name TEXT NOT NULL,
      item_kind TEXT NOT NULL,
      record_status TEXT NOT NULL,
      rule_version_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (company_id, root_code)
    );

    CREATE TABLE part_numbers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      part_root_id TEXT NOT NULL,
      part_number TEXT NOT NULL UNIQUE,
      sequence_no INTEGER NOT NULL,
      sequence_code TEXT NOT NULL,
      part_name TEXT NOT NULL,
      item_kind TEXT NOT NULL,
      is_universal INTEGER NOT NULL DEFAULT 0,
      custom_specification TEXT,
      record_status TEXT NOT NULL,
      universal_reason TEXT,
      rule_version_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (company_id, part_number)
    );

    CREATE TABLE drawing_numbers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      part_root_id TEXT NOT NULL,
      drawing_number TEXT NOT NULL UNIQUE,
      purpose_code TEXT NOT NULL,
      purpose_description TEXT NOT NULL,
      sequence_no INTEGER NOT NULL,
      is_primary_manufacturing INTEGER NOT NULL DEFAULT 0,
      record_status TEXT NOT NULL,
      rule_version_id TEXT NOT NULL,
      updated_at TEXT,
      UNIQUE (company_id, drawing_number)
    );

    CREATE TABLE drawing_part_links (
      id TEXT PRIMARY KEY,
      drawing_number_id TEXT NOT NULL,
      part_number_id TEXT NOT NULL,
      link_type TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE same_drawing_variants (
      id TEXT PRIMARY KEY,
      drawing_number_id TEXT NOT NULL,
      part_number_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      field_value TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE part_variant_attributes (
      id TEXT PRIMARY KEY,
      part_number_id TEXT NOT NULL UNIQUE,
      material_code TEXT,
      material_label TEXT,
      color_code TEXT,
      color_label TEXT,
      surface_treatment TEXT,
      variant_note TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE part_cost_profiles (
      id TEXT PRIMARY KEY,
      part_number_id TEXT NOT NULL,
      cost_type TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'TWD',
      uom TEXT NOT NULL DEFAULT 'pcs',
      supplier_name TEXT,
      process_name TEXT,
      cost_basis TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      effective_from TEXT,
      effective_to TEXT,
      created_by TEXT,
      approved_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE part_standard_costs (
      id TEXT PRIMARY KEY,
      part_number_id TEXT NOT NULL,
      cost_profile_id TEXT NOT NULL,
      basis_qty INTEGER NOT NULL DEFAULT 1,
      standard_reason TEXT,
      selected_by TEXT,
      approved_by TEXT,
      effective_from TEXT NOT NULL,
      effective_to TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE part_cost_tiers (
      id TEXT PRIMARY KEY,
      cost_profile_id TEXT NOT NULL,
      min_qty INTEGER NOT NULL DEFAULT 1,
      max_qty INTEGER,
      unit_cost REAL NOT NULL,
      setup_cost REAL NOT NULL DEFAULT 0,
      lead_time_days INTEGER,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE part_cost_change_requests (
      id TEXT PRIMARY KEY,
      part_number_id TEXT NOT NULL,
      proposed_cost_profile_id TEXT,
      request_type TEXT NOT NULL,
      change_reason TEXT NOT NULL,
      review_status TEXT NOT NULL,
      requested_by TEXT,
      reviewed_by TEXT,
      requested_at TEXT NOT NULL,
      reviewed_at TEXT,
      review_comment TEXT
    );

    CREATE TABLE duplicate_check_events (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      query_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT NOT NULL DEFAULT '{}',
      blocked INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE warning_events (
      id TEXT PRIMARY KEY,
      warning_code TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT,
      created_at TEXT NOT NULL,
      acknowledged_at TEXT
    );

    CREATE TABLE numbering_task_items (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      task_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      risk_level TEXT NOT NULL DEFAULT 'info',
      task_status TEXT NOT NULL DEFAULT 'open',
      assigned_to TEXT,
      assigned_role TEXT,
      project_code TEXT,
      action_url TEXT,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      handled_by TEXT,
      handled_at TEXT
    );

    CREATE TABLE numbering_notifications (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      notification_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      recipient_id TEXT,
      recipient_role TEXT,
      read_at TEXT,
      handled_at TEXT,
      handled_by TEXT,
      dismissible INTEGER NOT NULL DEFAULT 1,
      action_url TEXT,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE numbering_export_jobs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      export_mode TEXT NOT NULL,
      status TEXT NOT NULL,
      result_json TEXT NOT NULL DEFAULT '{}',
      generated_by TEXT,
      generated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE approval_rules (
      id TEXT PRIMARY KEY,
      action_code TEXT NOT NULL,
      approver_role TEXT,
      requires_approval INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE monthly_audit_reports (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      report_type TEXT NOT NULL,
      report_month TEXT NOT NULL,
      generation_mode TEXT NOT NULL,
      generated_by TEXT,
      status TEXT NOT NULL,
      query_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE llm_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE llm_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      part_number TEXT NOT NULL UNIQUE,
      part_name TEXT NOT NULL,
      current_revision TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE (company_id, part_number)
    );

    CREATE TABLE submissions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      item_id TEXT NOT NULL,
      drawing_number TEXT NOT NULL,
      revision TEXT NOT NULL,
      product_line TEXT NOT NULL DEFAULT '',
      customer TEXT NOT NULL DEFAULT '',
      project_code TEXT NOT NULL DEFAULT '',
      process_name TEXT NOT NULL DEFAULT '',
      machine TEXT NOT NULL DEFAULT '',
      material TEXT,
      surface_finish TEXT,
      document_type TEXT,
      change_description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      submitted_by TEXT NOT NULL,
      approval_required INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      released_at TEXT,
      rejected_at TEXT,
      reject_reason TEXT,
      release_error TEXT,
      superseded_by_submission_id TEXT,
      obsolete_at TEXT,
      obsolete_by TEXT,
      cancelled_at TEXT,
      cancelled_by TEXT,
      cancel_reason TEXT,
      returned_for_correction_at TEXT,
      returned_for_correction_by TEXT,
      returned_for_correction_reason TEXT,
      corrects_submission_id TEXT,
      resolved_by_submission_id TEXT,
      resolved_at TEXT,
      source_entity_type TEXT,
      source_entity_id TEXT,
      UNIQUE (drawing_number, revision),
      UNIQUE (company_id, drawing_number, revision)
    );

    CREATE TABLE submission_snapshots (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL UNIQUE,
      source_part_number_id TEXT NOT NULL,
      source_part_number TEXT NOT NULL
    );

    CREATE TABLE submission_part_scopes (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      item_id TEXT NOT NULL,
      part_number_id TEXT NOT NULL,
      part_number TEXT NOT NULL,
      part_name TEXT NOT NULL,
      link_type TEXT NOT NULL DEFAULT 'primary',
      form_state TEXT NOT NULL DEFAULT 'no_impact',
      fit_state TEXT NOT NULL DEFAULT 'no_impact',
      function_state TEXT NOT NULL DEFAULT 'no_impact',
      fff_outcome TEXT NOT NULL DEFAULT 'no_impact',
      created_at TEXT NOT NULL,
      UNIQUE (submission_id, part_number_id)
    );

    CREATE TABLE submission_files (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      file_role TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      local_path TEXT NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'local_repository',
      storage_bucket TEXT,
      storage_key TEXT,
      storage_generation TEXT,
      storage_metageneration TEXT,
      gdrive_file_id TEXT,
      gdrive_status TEXT NOT NULL DEFAULT 'none',
      sha256 TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      source_master_attachment_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE file_references (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      source_file_id TEXT,
      source_filename TEXT NOT NULL,
      source_file_role TEXT NOT NULL,
      referenced_filename TEXT NOT NULL,
      referenced_part_number TEXT,
      referenced_drawing_number TEXT,
      referenced_revision TEXT,
      reference_type TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      extraction_method TEXT NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'high',
      created_at TEXT NOT NULL
    );

    CREATE TABLE release_packages (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      package_filename TEXT NOT NULL,
      local_path TEXT NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'local_repository',
      storage_bucket TEXT,
      storage_key TEXT,
      storage_generation TEXT,
      storage_metageneration TEXT,
      sha256 TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      manifest_json TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (submission_id)
    );

    CREATE TABLE readonly_shares (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      revoked_at TEXT,
      revoked_by TEXT,
      access_count INTEGER NOT NULL DEFAULT 0,
      last_accessed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE supplier_portal_responses (
      id TEXT PRIMARY KEY,
      share_id TEXT NOT NULL,
      submission_id TEXT NOT NULL,
      response_kind TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      supplier_email TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      closed_by TEXT,
      closed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE procurement_sync_runs (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      target_system TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      response_json TEXT NOT NULL DEFAULT '{}',
      external_reference TEXT,
      created_by TEXT NOT NULL,
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE sandbox_branches (
      id TEXT PRIMARY KEY,
      source_submission_id TEXT NOT NULL,
      sandbox_submission_id TEXT NOT NULL UNIQUE,
      branch_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT NOT NULL,
      promoted_by TEXT,
      closed_by TEXT,
      merged_by TEXT,
      merge_summary_json TEXT,
      promoted_at TEXT,
      closed_at TEXT,
      merged_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (source_submission_id, branch_name)
    );

    CREATE TABLE item_locks (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      locked_by TEXT NOT NULL,
      lock_reason TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      released_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE approval_steps (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      sequence_no INTEGER NOT NULL DEFAULT 1,
      decision TEXT NOT NULL,
      comment TEXT,
      decided_at TEXT NOT NULL
    );

    CREATE TABLE approval_matrix_requirements (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      required_role TEXT NOT NULL,
      min_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      decided_by TEXT,
      decision_comment TEXT,
      decided_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE bom_headers (
      id TEXT PRIMARY KEY,
      parent_submission_id TEXT NOT NULL UNIQUE,
      parent_item_id TEXT NOT NULL,
      parent_revision TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      line_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE bom_lines (
      id TEXT PRIMARY KEY,
      bom_header_id TEXT NOT NULL,
      line_no INTEGER NOT NULL,
      child_part_number TEXT NOT NULL,
      child_revision TEXT,
      quantity REAL NOT NULL,
      source_file_id TEXT,
      source_reference_id TEXT,
      source_filename TEXT,
      created_at TEXT
    );

    CREATE TABLE bom_drafts (
      id TEXT PRIMARY KEY,
      parent_item_id TEXT NOT NULL,
      parent_submission_id TEXT NOT NULL,
      parent_revision TEXT NOT NULL,
      draft_name TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      is_active INTEGER NOT NULL,
      line_count INTEGER NOT NULL,
      review_attempt INTEGER NOT NULL,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE bom_lines_tree (
      id TEXT PRIMARY KEY,
      bom_draft_id TEXT NOT NULL,
      parent_line_id TEXT,
      node_type TEXT NOT NULL,
      item_id TEXT,
      part_number TEXT,
      revision TEXT,
      group_name TEXT,
      quantity REAL,
      sequence_no INTEGER NOT NULL,
      source TEXT NOT NULL,
      source_priority INTEGER NOT NULL,
      source_ref_id TEXT,
      source_filename TEXT,
      created_by TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE bom_release_snapshots (
      id TEXT PRIMARY KEY,
      bom_draft_id TEXT NOT NULL,
      parent_item_id TEXT NOT NULL,
      parent_submission_id TEXT NOT NULL,
      parent_revision TEXT NOT NULL,
      line_count INTEGER NOT NULL,
      released_by TEXT,
      released_at TEXT NOT NULL,
      obsolete_at TEXT,
      obsolete_by TEXT,
      line_snapshot_json TEXT NOT NULL
    );

    CREATE TABLE bom_review_requests (
      id TEXT PRIMARY KEY,
      bom_draft_id TEXT NOT NULL,
      submitted_by TEXT NOT NULL,
      change_reason TEXT NOT NULL,
      status TEXT NOT NULL,
      lifecycle_action TEXT NOT NULL DEFAULT 'release',
      submitted_at TEXT NOT NULL,
      reviewed_by TEXT,
      reviewed_at TEXT,
      decision_reason TEXT
    );

    CREATE TABLE bom_edit_events (
      id TEXT PRIMARY KEY,
      bom_draft_id TEXT NOT NULL,
      actor_id TEXT,
      event_type TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE bom_import_profiles (
      id TEXT PRIMARY KEY,
      profile_name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      version TEXT NOT NULL,
      mapping_json TEXT NOT NULL,
      is_active INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE bom_import_jobs (
      id TEXT PRIMARY KEY,
      bom_draft_id TEXT,
      parent_submission_id TEXT NOT NULL,
      import_profile_id TEXT NOT NULL,
      source_asset_id TEXT,
      original_filename TEXT NOT NULL,
      status TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      error_json TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE file_assets (
      id TEXT PRIMARY KEY,
      storage_provider TEXT NOT NULL,
      original_path TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_ext TEXT,
      file_size INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      hash_algorithm TEXT NOT NULL,
      linked_entity_type TEXT,
      linked_entity_id TEXT,
      revision TEXT,
      sync_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE discussion_comments (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      file_id TEXT,
      author_id TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE review_issues (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      file_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      raised_by TEXT NOT NULL,
      assignee_id TEXT,
      resolved_by TEXT,
      resolution TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE pdf_markups (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      x_percent REAL NOT NULL,
      y_percent REAL NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      author_id TEXT NOT NULL,
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE change_requests (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      reason TEXT NOT NULL,
      impact TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      decided_by TEXT,
      decision_comment TEXT,
      decided_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO users (id, display_name, email, password_hash, role)
    VALUES
      ('user-admin-demo', 'Admin User', 'admin@example.com', 'hash-admin', 'Admin'),
      ('user-engineer-demo', 'Engineer User', 'engineer@example.com', 'hash-engineer', 'Engineer'),
      ('user-manager-demo', 'Manager User', 'manager@example.com', 'hash-manager', 'R&D Manager');

    INSERT INTO roles (id, role_code, title, system_defined, enabled)
    VALUES
      ('role-rd', 'rd', 'RD', 1, 1),
      ('role-rd-manager', 'rd_manager', 'RD Manager', 1, 1),
      ('role-pdm-admin', 'pdm_admin', 'PDM Admin', 1, 1),
      ('role-system-admin', 'system_admin', 'System Admin', 1, 1),
      ('role-custom-reviewer', 'custom_reviewer', 'Custom Reviewer', 0, 1);

    INSERT INTO role_priority_versions (id, priority_json, status, created_at)
    VALUES ('priority-active', '["system_admin","pdm_admin","rd_manager","custom_reviewer","rd"]', 'active', '2026-06-08T00:00:00.000Z');

    INSERT INTO role_scope_rules (id, role_id, scope_kind, scope_code, allowed)
    VALUES
      ('scope-rd-project-p100', 'role-rd', 'project', 'P-100', 1),
      ('scope-rd-action-release-missing-ma', 'role-rd', 'action', 'release_missing_ma_confirm', 1);

    INSERT INTO user_role_assignments (id, user_id, role_id, assigned_by, assigned_at)
    VALUES ('assignment-custom', 'user-engineer-demo', 'role-custom-reviewer', 'user-admin-demo', '2026-06-08T00:00:00.000Z');

    INSERT INTO approval_delegations (id, delegated_from, delegated_to, project_code, action_code, created_by, created_at)
    VALUES ('delegation-manager-engineer', 'user-manager-demo', 'user-engineer-demo', 'P-100', 'numbering.batch_decide', 'user-admin-demo', '2026-06-08T00:00:00.000Z');

    INSERT INTO approval_rules (id, action_code, approver_role, requires_approval)
    VALUES
      ('approval-rule-rd-manager', 'release', 'rd_manager', 1),
      ('approval-rule-pdm-admin', 'release_missing_ma_confirm', 'pdm_admin', 1);

    INSERT INTO items (id, part_number, part_name, current_revision, created_at, updated_at)
    VALUES
      ('item-child', 'PN-100', 'Child Part', 'B', '2026-06-08T00:00:00.000Z', '2026-06-08T00:00:00.000Z'),
      ('item-parent-a', 'ASM-100', 'Parent Assembly A', 'A', '2026-06-08T00:00:00.000Z', '2026-06-08T00:00:00.000Z'),
      ('item-parent-b', 'ASM-200', 'Parent Assembly B', 'A', '2026-06-08T00:00:00.000Z', '2026-06-08T00:00:00.000Z'),
      ('item-dashboard', 'DASH-100', 'Dashboard Fixture Part', 'A', '2026-06-08T00:00:00.000Z', '2026-06-08T00:00:00.000Z');

    INSERT INTO submissions (
      id, item_id, drawing_number, revision, product_line, customer, project_code, process_name, machine, material, surface_finish,
      document_type, change_description, status, submitted_by, approval_required,
      created_at, updated_at, released_at, rejected_at, reject_reason, release_error, superseded_by_submission_id, obsolete_at, obsolete_by
    )
    VALUES
      ('sub-child-a', 'item-child', 'DRW-PN-100', 'A', 'PL-A', 'Customer A', 'P-100', 'Cutting', 'M-1', 'SUS304', '2B', 'Drawing', 'Initial child release', 'Released', 'user-engineer-demo', 1, '2026-06-08T01:00:00.000Z', '2026-06-08T01:00:00.000Z', '2026-06-08T02:00:00.000Z', NULL, NULL, NULL, NULL, NULL, NULL),
      ('sub-child-b', 'item-child', 'DRW-PN-100', 'B', 'PL-B', 'Customer B', 'P-200', 'Welding', 'M-2', 'SUS304', '2B', 'Drawing', 'Latest child release', 'Released', 'user-manager-demo', 1, '2026-06-08T03:00:00.000Z', '2026-06-08T03:00:00.000Z', '2026-06-08T04:00:00.000Z', NULL, NULL, NULL, NULL, NULL, NULL),
      ('sub-parent-a', 'item-parent-a', 'DRW-ASM-100', 'A', 'PL-A', 'Customer A', 'P-100', 'Assembly', 'ASM-1', 'SS400', 'Paint', 'Assembly', 'Parent uses old child revision', 'Released', 'user-engineer-demo', 1, '2026-06-08T05:00:00.000Z', '2026-06-08T05:00:00.000Z', '2026-06-08T06:00:00.000Z', NULL, NULL, NULL, NULL, NULL, NULL),
      ('sub-parent-b', 'item-parent-b', 'DRW-ASM-200', 'A', 'PL-B', 'Customer B', 'P-200', 'Assembly', 'ASM-2', 'SS400', 'Paint', 'Assembly', 'Parent uses latest child revision', 'Released', 'user-manager-demo', 1, '2026-06-08T07:00:00.000Z', '2026-06-08T07:00:00.000Z', '2026-06-08T08:00:00.000Z', NULL, NULL, NULL, NULL, NULL, NULL),
      ('sub-dashboard-pending', 'item-dashboard', 'DRW-DASH-PENDING', 'A', 'PL-A', 'Customer A', 'P-100', 'Review', 'DASH-1', 'AL6061', 'Anodized', 'Drawing', 'Dashboard pending search fixture', 'Pending', 'user-engineer-demo', 1, '2026-06-08T09:00:00.000Z', '2026-06-08T09:00:00.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
      ('sub-dashboard-rejected', 'item-dashboard', 'DRW-DASH-REJECTED', 'A', 'PL-C', 'Customer C', 'P-300', 'Review', 'DASH-2', 'AL6061', 'Anodized', 'Drawing', 'Dashboard rejected search fixture', 'Rejected', 'user-manager-demo', 1, '2026-06-08T10:00:00.000Z', '2026-06-08T10:00:00.000Z', NULL, '2026-06-08T11:00:00.000Z', 'QC rejected fixture', NULL, NULL, NULL, NULL),
      ('sub-dashboard-failed', 'item-dashboard', 'DRW-DASH-FAILED', 'A', 'PL-A', 'Customer A', 'P-100', 'Review', 'DASH-3', 'AL6061', 'Anodized', 'Drawing', 'Dashboard failed search fixture', 'ReleaseFailed', 'user-engineer-demo', 1, '2026-06-08T12:00:00.000Z', '2026-06-08T12:00:00.000Z', NULL, NULL, NULL, 'QC release failed fixture', NULL, NULL, NULL);

    INSERT INTO submission_files (id, submission_id, file_role, original_filename, local_path, gdrive_file_id, gdrive_status, sha256, file_size, created_at)
    VALUES
      ('file-dashboard-pending-pdf', 'sub-dashboard-pending', 'pdf', 'pending.pdf', '/tmp/pending.pdf', NULL, 'none', 'sha-pdf', 11, '2026-06-08T09:00:00.000Z'),
      ('file-dashboard-pending-dwg', 'sub-dashboard-pending', 'dwg', 'pending.dwg', '/tmp/pending.dwg', NULL, 'none', 'sha-dwg', 13, '2026-06-08T09:00:01.000Z'),
      ('file-dashboard-failed-upload', 'sub-dashboard-pending', 'pdf', 'failed-upload.pdf', '/tmp/failed-upload.pdf', NULL, 'failed', 'sha-failed-upload', 17, '2026-06-08T09:00:02.000Z');

    INSERT INTO file_references (
      id, submission_id, source_file_id, source_filename, source_file_role, referenced_filename, referenced_part_number,
      referenced_drawing_number, referenced_revision, reference_type, quantity, extraction_method, confidence, created_at
    )
    VALUES
      ('ref-parent-a-child', 'sub-parent-a', NULL, 'asm-a.sldasm', 'sldasm', 'ref-child-a.sldprt', 'PN-100', 'DRW-PN-100', 'A', 'assembly_component', 2, 'fixture', 'high', '2026-06-08T05:00:00.000Z');

    INSERT INTO release_packages (id, submission_id, package_filename, local_path, sha256, file_size, manifest_json, created_by, created_at)
    VALUES ('release-parent-a', 'sub-parent-a', 'sub-parent-a.zip', '/tmp/sub-parent-a.zip', 'sha-release', 101, '{"ok":true}', 'user-manager-demo', '2026-06-08T06:30:00.000Z');

    INSERT INTO readonly_shares (
      id, submission_id, token_hash, label, expires_at, created_by, revoked_at, revoked_by, access_count, last_accessed_at, created_at, updated_at
    )
    VALUES
      ('share-parent-a', 'sub-parent-a', 'hash-active-share', 'Supplier package', '2099-01-01T00:00:00.000Z', 'user-manager-demo', NULL, NULL, 0, NULL, '2026-06-08T06:40:00.000Z', '2026-06-08T06:40:00.000Z'),
      ('share-parent-a-revoked', 'sub-parent-a', 'hash-revoked-share', 'Revoked package', '2099-01-01T00:00:00.000Z', 'user-manager-demo', '2026-06-08T06:45:00.000Z', 'user-admin-demo', 0, NULL, '2026-06-08T06:41:00.000Z', '2026-06-08T06:45:00.000Z');

    INSERT INTO supplier_portal_responses (
      id, share_id, submission_id, response_kind, supplier_name, supplier_email, message, status, closed_by, closed_at, created_at, updated_at
    )
    VALUES (
      'supplier-response-existing',
      'share-parent-a',
      'sub-parent-a',
      'question',
      'Fixture Supplier',
      'supplier@example.com',
      'Need drawing tolerance clarification',
      'open',
      NULL,
      NULL,
      '2026-06-08T06:50:00.000Z',
      '2026-06-08T06:50:00.000Z'
    );

    INSERT INTO item_locks (id, item_id, locked_by, lock_reason, expires_at, released_at, created_at, updated_at)
    VALUES ('lock-dashboard', 'item-dashboard', 'user-engineer-demo', 'QC detail fixture', '2099-01-01T00:00:00.000Z', NULL, '2026-06-08T09:10:00.000Z', '2026-06-08T09:10:00.000Z');

    INSERT INTO approval_steps (id, submission_id, reviewer_id, sequence_no, decision, comment, decided_at)
    VALUES ('approval-parent-a', 'sub-parent-a', 'user-manager-demo', 1, 'Approved', 'ok', '2026-06-08T06:10:00.000Z');

    INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
    VALUES ('audit-parent-a', 'sub-parent-a', 'user-manager-demo', 'DetailFixture', '{"source":"detail"}', '2026-06-08T06:20:00.000Z');

    INSERT INTO part_roots (
      id, root_code, core_name, item_kind, record_status, rule_version_id, updated_at
    )
    VALUES
      ('root-duplicate-async', 'ROOT-ASYNC-001', 'Async Pump Housing', 'manufactured', 'Draft', 'rule-v1', '2026-06-08T06:30:00.000Z'),
      ('root-similar-async', 'ROOT-ASYNC-002', 'Async Pump Housing Variant', 'manufactured', 'Draft', 'rule-v1', '2026-06-08T06:31:00.000Z'),
      ('root-overdue-async', 'ROOT-ASYNC-003', 'Async Overdue Draft', 'manufactured', 'NeedInfo', 'rule-v1', '2026-05-01T06:31:00.000Z');

    INSERT INTO part_numbers (
      id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, is_universal,
      custom_specification, record_status, universal_reason, rule_version_id, updated_at
    )
    VALUES
      ('part-duplicate-async', 'root-duplicate-async', 'PN-ASYNC-001', 1, '001', 'Async Pump Housing', 'manufactured', 0, NULL, 'Draft', NULL, 'rule-v1', '2026-06-08T06:32:00.000Z'),
      ('part-similar-async', 'root-similar-async', 'PN-ASYNC-002', 2, '002', 'Async Pump Cover', 'manufactured', 0, NULL, 'Draft', NULL, 'rule-v1', '2026-06-08T06:33:00.000Z'),
      ('part-overdue-async', 'root-overdue-async', 'PN-ASYNC-003', 3, '003', 'Async Overdue Part', 'manufactured', 0, NULL, 'NeedInfo', NULL, 'rule-v1', '2026-05-01T06:33:00.000Z');

    INSERT INTO drawing_numbers (
      id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing,
      record_status, rule_version_id
    )
    VALUES
      ('drawing-duplicate-async', 'root-duplicate-async', 'DRW-ASYNC-001', 'MA', 'Manufacturing drawing', 1, 1, 'Draft', 'rule-v1'),
      ('drawing-overdue-async', 'root-overdue-async', 'DRW-ASYNC-003', 'MA', 'Overdue manufacturing drawing', 1, 1, 'NeedInfo', 'rule-v1');

    INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
    VALUES ('link-numbering-root-detail-async', 'drawing-duplicate-async', 'part-duplicate-async', 'primary_manufacturing', 'user-engineer-demo', '2026-06-08T06:33:30.000Z');

    INSERT INTO same_drawing_variants (id, drawing_number_id, part_number_id, field_name, field_value, created_by, created_at)
    VALUES ('variant-numbering-root-detail-async', 'drawing-duplicate-async', 'part-duplicate-async', 'material', 'SUS304', 'user-engineer-demo', '2026-06-08T06:33:40.000Z');

    INSERT INTO part_variant_attributes (
      id, part_number_id, material_code, material_label, color_code, color_label, surface_treatment, variant_note, updated_by, created_at, updated_at
    )
    VALUES (
      'variant-attr-numbering-drawing-async',
      'part-duplicate-async',
      'SUS304',
      'Stainless 304',
      'NAT',
      'Natural',
      'Polished',
      'Drawing module fixture',
      'user-engineer-demo',
      '2026-06-08T06:33:45.000Z',
      '2026-06-08T06:33:45.000Z'
    );

    INSERT INTO part_cost_profiles (
      id, part_number_id, cost_type, profile_name, currency, uom, status, effective_from, created_at, updated_at
    )
    VALUES (
      'cost-profile-numbering-drawing-async',
      'part-duplicate-async',
      'in_house',
      'Drawing module standard cost',
      'TWD',
      'pcs',
      'approved',
      '2026-06-08T00:00:00.000Z',
      '2026-06-08T06:33:46.000Z',
      '2026-06-08T06:33:46.000Z'
    );

    INSERT INTO part_standard_costs (
      id, part_number_id, cost_profile_id, basis_qty, standard_reason, effective_from, effective_to, created_at, updated_at
    )
    VALUES (
      'standard-cost-numbering-drawing-async',
      'part-duplicate-async',
      'cost-profile-numbering-drawing-async',
      1,
      'Drawing module fixture',
      '2026-06-08T00:00:00.000Z',
      NULL,
      '2026-06-08T06:33:47.000Z',
      '2026-06-08T06:33:47.000Z'
    );

    INSERT INTO part_cost_tiers (
      id, cost_profile_id, min_qty, max_qty, unit_cost, setup_cost, lead_time_days, note, created_at, updated_at
    )
    VALUES (
      'cost-tier-numbering-part-list-async',
      'cost-profile-numbering-drawing-async',
      1,
      NULL,
      42.5,
      3,
      5,
      'Part list fixture',
      '2026-06-08T06:33:48.000Z',
      '2026-06-08T06:33:48.000Z'
    );

    INSERT INTO part_cost_change_requests (
      id, part_number_id, proposed_cost_profile_id, request_type, change_reason, review_status, requested_by, requested_at
    )
    VALUES (
      'cost-change-numbering-part-list-async',
      'part-duplicate-async',
      'cost-profile-numbering-drawing-async',
      'set_standard',
      'Part list pending cost fixture',
      'pending',
      'user-engineer-demo',
      '2026-06-08T06:33:49.000Z'
    );

    INSERT INTO numbering_task_items (
      id, task_type, entity_type, entity_id, title, message, risk_level, task_status,
      assigned_to, assigned_role, project_code, action_url, detail_json, created_by, created_at, updated_at, handled_by, handled_at
    )
    VALUES (
      'task-numbering-async',
      'numbering_review',
      'part_number',
      'part-duplicate-async',
      'Async task fixture',
      'Async task status update fixture',
      'warning',
      'open',
      'user-engineer-demo',
      'rd',
      'P-100',
      '/numbering/tasks',
      '{"actionCode":"release_missing_ma_confirm","payload":{"overrideTypes":["ma_missing"],"impactedPartNumbers":["PN-ASYNC-001"]}}',
      'user-manager-demo',
      '2026-06-08T06:34:00.000Z',
      '2026-06-08T06:34:00.000Z',
      NULL,
      NULL
    );

    INSERT INTO numbering_notifications (
      id, notification_type, entity_type, entity_id, title, message, severity,
      recipient_id, recipient_role, read_at, handled_at, handled_by, dismissible,
      action_url, detail_json, created_by, created_at, updated_at
    )
    VALUES
      (
        'notification-numbering-async',
        'numbering_review',
        'part_number',
        'part-duplicate-async',
        'Async notification fixture',
        'Async notification list fixture',
        'critical',
        'user-engineer-demo',
        'rd',
        NULL,
        NULL,
        NULL,
        1,
        '/numbering/tasks',
        '{"projectCode":"P-100","actionCode":"release_missing_ma_confirm","payload":{"overrideTypes":["ma_missing"],"impactedPartNumbers":["PN-ASYNC-001"]}}',
        'user-manager-demo',
        '2026-06-08T06:35:00.000Z',
        '2026-06-08T06:35:00.000Z'
      ),
      (
        'notification-numbering-locked',
        'numbering_review',
        'part_number',
        'part-duplicate-async',
        'Async non-dismissible notification fixture',
        'Async notification dismiss guard fixture',
        'warning',
        NULL,
        'rd',
        NULL,
        NULL,
        NULL,
        0,
        '/numbering/tasks',
        '{"projectCode":"P-100","actionCode":"release_missing_ma_confirm"}',
        'user-manager-demo',
        '2026-06-08T06:36:00.000Z',
        '2026-06-08T06:36:00.000Z'
      );

    INSERT INTO bom_headers (id, parent_submission_id, parent_item_id, parent_revision, status, source, line_count, created_at, updated_at)
    VALUES
      ('bom-a', 'sub-parent-a', 'item-parent-a', 'A', 'ReleasedSnapshot', 'cad_references', 1, '2026-06-08T05:30:00.000Z', '2026-06-08T05:30:00.000Z'),
      ('bom-b', 'sub-parent-b', 'item-parent-b', 'A', 'ReleasedSnapshot', 'cad_references', 1, '2026-06-08T07:30:00.000Z', '2026-06-08T07:30:00.000Z');

    INSERT INTO bom_lines (id, bom_header_id, line_no, child_part_number, child_revision, quantity, source_file_id, source_reference_id, source_filename)
    VALUES
      ('line-a', 'bom-a', 1, 'pn-100', 'A', 2, NULL, 'ref-parent-a-child', 'asm-a.xlsx'),
      ('line-b', 'bom-b', 1, 'PN-100', 'B', 4, NULL, NULL, 'asm-b.xlsx');

    INSERT INTO bom_drafts (
      id, parent_item_id, parent_submission_id, parent_revision, draft_name, status, source, is_active, line_count,
      review_attempt, created_by, updated_by, created_at, updated_at
    )
    VALUES
      ('bom-draft-old', 'item-parent-a', 'sub-parent-a', 'A', 'Old draft', 'Draft', 'manual', 0, 1, 0, 'user-engineer-demo', 'user-engineer-demo', '2026-06-08T05:40:00.000Z', '2026-06-08T05:40:00.000Z'),
      ('bom-draft-active', 'item-parent-a', 'sub-parent-a', 'A', 'Active draft', 'Draft', 'cad_reference', 1, 2, 1, 'user-engineer-demo', 'user-manager-demo', '2026-06-08T05:45:00.000Z', '2026-06-08T05:50:00.000Z'),
      ('bom-draft-pending', 'item-parent-a', 'sub-parent-a', 'A', 'Pending review draft', 'PendingReview', 'solidworks_xls', 1, 1, 2, 'user-engineer-demo', 'user-manager-demo', '2026-06-08T05:55:00.000Z', '2026-06-08T05:55:00.000Z');

    INSERT INTO bom_lines_tree (
      id, bom_draft_id, parent_line_id, node_type, item_id, part_number, revision, group_name, quantity, sequence_no,
      source, source_priority, source_ref_id, source_filename, created_by, updated_by, created_at, updated_at
    )
    VALUES
      ('bom-tree-group', 'bom-draft-active', NULL, 'group', NULL, NULL, NULL, 'Purchased parts', NULL, 1, 'manual', 20, NULL, NULL, 'user-engineer-demo', 'user-manager-demo', '2026-06-08T05:50:00.000Z', '2026-06-08T05:50:00.000Z'),
      ('bom-tree-child', 'bom-draft-active', 'bom-tree-group', 'item', 'item-child', 'PN-100', 'B', NULL, 2, 1, 'cad_reference', 10, 'ref-parent-a-child', 'asm-a.sldasm', 'user-engineer-demo', 'user-manager-demo', '2026-06-08T05:51:00.000Z', '2026-06-08T05:51:00.000Z');

    INSERT INTO bom_release_snapshots (
      id, bom_draft_id, parent_item_id, parent_submission_id, parent_revision, line_count, released_by, released_at, obsolete_at, obsolete_by, line_snapshot_json
    ) VALUES (
      'bom-release-snapshot-base',
      'bom-draft-released-base',
      'item-parent-a',
      'sub-parent-a',
      'A',
      3,
      'user-manager-demo',
      '2026-06-08T04:45:00.000Z',
      NULL,
      NULL,
      '[{"id":"base-group","bom_draft_id":"bom-draft-released-base","parent_line_id":null,"node_type":"group","item_id":null,"part_number":null,"revision":null,"group_name":"Purchased parts","quantity":null,"sequence_no":1,"source":"manual","source_priority":20,"source_ref_id":null,"source_filename":null,"created_by":"user-manager-demo","updated_by":"user-manager-demo","created_at":"2026-06-08T04:40:00.000Z","updated_at":"2026-06-08T04:40:00.000Z"},{"id":"base-child","bom_draft_id":"bom-draft-released-base","parent_line_id":"base-group","node_type":"item","item_id":"item-child","part_number":"PN-100","revision":"A","group_name":null,"quantity":1,"sequence_no":1,"source":"cad_reference","source_priority":10,"source_ref_id":"ref-parent-a-child","source_filename":"asm-a.sldasm","created_by":"user-manager-demo","updated_by":"user-manager-demo","created_at":"2026-06-08T04:41:00.000Z","updated_at":"2026-06-08T04:41:00.000Z"},{"id":"base-removed","bom_draft_id":"bom-draft-released-base","parent_line_id":null,"node_type":"item","item_id":null,"part_number":"PN-REMOVED","revision":"A","group_name":null,"quantity":1,"sequence_no":2,"source":"manual","source_priority":20,"source_ref_id":null,"source_filename":null,"created_by":"user-manager-demo","updated_by":"user-manager-demo","created_at":"2026-06-08T04:42:00.000Z","updated_at":"2026-06-08T04:42:00.000Z"}]'
    );

    INSERT INTO bom_review_requests (
      id, bom_draft_id, submitted_by, change_reason, status, submitted_at, reviewed_by, reviewed_at, decision_reason
    ) VALUES (
      'bom-review-pending-async',
      'bom-draft-pending',
      'user-engineer-demo',
      'Pending async review fixture',
      'PendingReview',
      '2026-06-08T05:56:00.000Z',
      NULL,
      NULL,
      NULL
    );
  `);

  database.prepare(upsertPermissionSql).run({
    id: "role-permission-fixture",
    roleId: "role-rd",
    permissionKind: "page",
    permissionCode: "numbering.request",
    allowed: 1,
    now: "2026-06-08T00:00:00.000Z"
  });
  database.prepare(upsertPermissionSql).run({
    id: "role-permission-new-id-ignored-by-conflict",
    roleId: "role-rd",
    permissionKind: "page",
    permissionCode: "numbering.request",
    allowed: 0,
    now: "2026-06-08T00:01:00.000Z"
  });
  database.prepare(upsertPermissionSql).run({
    id: "role-permission-action",
    roleId: "role-rd",
    permissionKind: "action",
    permissionCode: "numbering.create",
    allowed: 1,
    now: "2026-06-08T00:02:00.000Z"
  });

  const roles = database.prepare(listRolesSql).all();
  const users = database.prepare(listUsersSql).all();
  const rdRole = database.prepare(selectRoleSql).get({ roleCode: "rd" });
  const missingRole = database.prepare(selectRoleSql).get({ roleCode: "missing_role" });
  const permission = database.prepare(selectPermissionSql).get({
    roleCode: "rd",
    permissionKind: "page",
    permissionCode: "numbering.request"
  });
  const permissions = database.prepare(listPermissionsSql).all({ roleCode: "rd" });
  const assignedRoles = database.prepare(assignedRolesSql).all({
    userId: "user-engineer-demo",
    now: "2026-06-08T12:00:00.000Z"
  });
  const activePriority = database.prepare(activeRolePrioritySql).get();
  const activeDelegations = database.prepare(activeDelegationsSql).all({
    userId: "user-engineer-demo",
    now: "2026-06-08T00:30:00.000Z"
  });
  const enabledRoles = database.prepare(enabledRolesSql).all();
  const matchingPermissionRows = database.prepare(permissionsByCodeSql).all({
    permissionKind: "page",
    permissionCode: "numbering.request"
  });
  const userById = database.prepare(userByIdSql).get({ id: "user-engineer-demo" });
  const userByEmail = database.prepare(userByEmailSql).get({ email: "ENGINEER@example.com" });
  const userWithPassword = database.prepare(userByEmailWithPasswordSql).get({ email: "engineer@example.com" });
  database.prepare(upsertUserSql).run({
    id: "user-engineer-demo-replacement",
    displayName: "Engineer Updated",
    email: "engineer@example.com",
    passwordHash: "hash-engineer-updated",
    role: "Engineer",
    now: "2026-06-08T01:00:00.000Z"
  });
  database.prepare(insertUserSql).run({
    id: "user-created-async",
    displayName: "Created Async",
    email: "created.async@example.com",
    passwordHash: "hash-created",
    role: "Procurement",
    now: "2026-06-08T01:01:00.000Z"
  });
  database.prepare(updateUserPasswordSql).run({
    userId: "user-created-async",
    passwordHash: "hash-created-updated",
    now: "2026-06-08T01:02:00.000Z"
  });
  const updatedUser = database.prepare(userByEmailWithPasswordSql).get({ email: "engineer@example.com" });
  const createdUser = database.prepare(userByEmailWithPasswordSql).get({ email: "created.async@example.com" });
  database
    .prepare(
      `
      INSERT INTO item_locks (id, item_id, locked_by, lock_reason, expires_at, released_at, created_at, updated_at)
      VALUES ('lock-expired-async', 'item-parent-b', 'user-engineer-demo', 'Expired async fixture', '2026-06-08T00:00:00.000Z', NULL, '2026-06-07T23:00:00.000Z', '2026-06-07T23:00:00.000Z')
    `
    )
    .run();
  database.prepare(expireItemLocksSql).run({ now: "2026-06-08T12:00:00.000Z" });
  const asyncActiveItemLockByPart = database.prepare(activeItemLockByIdentifiersSql).get({
    partNumber: "DASH-100",
    drawingNumber: "",
    now: "2026-06-08T12:00:00.000Z"
  });
  const asyncActiveItemLockByDrawing = database.prepare(activeItemLockByIdentifiersSql).get({
    partNumber: "",
    drawingNumber: "DRW-DASH-PENDING",
    now: "2026-06-08T12:00:00.000Z"
  });
  const asyncExpiredItemLock = database.prepare("SELECT released_at, updated_at FROM item_locks WHERE id = 'lock-expired-async'").get();
  const asyncCheckoutSubmissionItem = database.prepare(submissionItemForLockSql).get({
    submissionId: "sub-parent-a"
  });
  const asyncCheckoutExistingBefore = database.prepare(activeItemLockByItemIdSql).get({
    itemId: "item-parent-a",
    now: "2026-06-08T12:05:00.000Z"
  });
  database.prepare(insertItemLockSql).run({
    id: "lock-checkout-async",
    itemId: asyncCheckoutSubmissionItem.item_id,
    lockedBy: "user-engineer-demo",
    lockReason: "Async checkout fixture",
    expiresAt: "2026-06-08T13:05:00.000Z",
    now: "2026-06-08T12:05:00.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-checkout-created-async",
    submissionId: null,
    actorId: "user-engineer-demo",
    action: "CheckoutLockCreated",
    detailJson: JSON.stringify({
      itemId: "item-parent-a",
      reason: "Async checkout fixture",
      expiresAt: "2026-06-08T13:05:00.000Z"
    }),
    createdAt: "2026-06-08T12:05:00.000Z"
  });
  const asyncCheckoutCreatedLock = database.prepare(activeItemLockByItemIdSql).get({
    itemId: "item-parent-a",
    now: "2026-06-08T12:06:00.000Z"
  });
  database.prepare(releaseItemLockSql).run({
    id: "lock-checkout-async",
    now: "2026-06-08T12:10:00.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-checkout-released-async",
    submissionId: null,
    actorId: "user-engineer-demo",
    action: "CheckoutLockReleased",
    detailJson: JSON.stringify({
      itemId: "item-parent-a",
      lockId: "lock-checkout-async",
      forced: false
    }),
    createdAt: "2026-06-08T12:10:00.000Z"
  });
  const asyncCheckoutReleasedLock = database.prepare("SELECT released_at, updated_at FROM item_locks WHERE id = ?").get(
    "lock-checkout-async"
  );
  const asyncCheckoutAudits = database
    .prepare(
      "SELECT action, actor_id, detail_json FROM audit_logs WHERE id IN ('audit-checkout-created-async', 'audit-checkout-released-async') ORDER BY created_at ASC"
    )
    .all();
  database.prepare(insertAuditSql).run({
    id: "audit-async-fixture",
    submissionId: null,
    actorId: "user-engineer-demo",
    action: "Login",
    detailJson: JSON.stringify({ source: "qc-async-audit" }),
    createdAt: "2026-06-08T00:00:00.000Z"
  });
  const auditLog = database.prepare("SELECT id, actor_id, action, detail_json FROM audit_logs WHERE id = ?").get("audit-async-fixture");
  database.prepare(insertLlmConversationSql).run({
    id: "llm-conversation-async",
    userId: "user-engineer-demo",
    title: "Async chat fixture",
    now: "2026-06-08T01:03:00.000Z"
  });
  const asyncLlmConversation = database.prepare(selectLlmConversationSql).get({ id: "llm-conversation-async" });
  database.prepare(insertLlmMessageSql).run({
    id: "llm-message-user-async",
    conversationId: "llm-conversation-async",
    role: "user",
    content: "pending summary",
    now: "2026-06-08T01:04:00.000Z"
  });
  database.prepare(updateLlmConversationUpdatedAtSql).run({
    conversationId: "llm-conversation-async",
    now: "2026-06-08T01:04:00.000Z"
  });
  database.prepare(insertLlmMessageSql).run({
    id: "llm-message-assistant-async",
    conversationId: "llm-conversation-async",
    role: "assistant",
    content: "assistant answer",
    now: "2026-06-08T01:05:00.000Z"
  });
  database.prepare(updateLlmConversationUpdatedAtSql).run({
    conversationId: "llm-conversation-async",
    now: "2026-06-08T01:05:00.000Z"
  });
  const asyncLlmConversationAfterMessages = database.prepare(selectLlmConversationSql).get({ id: "llm-conversation-async" });
  const asyncLlmMessages = database
    .prepare("SELECT conversation_id, role, content, created_at FROM llm_messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all("llm-conversation-async");
  const allRevisions = database.prepare(itemRevisionHistorySql).all({
    partNumber: "PN-100",
    submittedBy: null
  });
  const scopedRevisions = database.prepare(itemRevisionHistorySql).all({
    partNumber: "PN-100",
    submittedBy: "user-engineer-demo"
  });
  const allWhereUsed = database.prepare(whereUsedSql).all({
    partNumber: "PN-100",
    submittedBy: null
  });
  const scopedWhereUsed = database.prepare(whereUsedSql).all({
    partNumber: "PN-100",
    submittedBy: "user-engineer-demo"
  });
  const allDashboardCounts = database.prepare(dashboardStatusCountsSql).all({ submittedBy: null });
  const scopedDashboardCounts = database.prepare(dashboardStatusCountsSql).all({ submittedBy: "user-engineer-demo" });
  const allDashboardMetrics = Object.fromEntries(allDashboardCounts.map((row) => [row.status, row.count]));
  const scopedDashboardMetrics = Object.fromEntries(scopedDashboardCounts.map((row) => [row.status, row.count]));
  const notificationManagerParams = {
    userId: "user-manager-demo",
    scopeEngineer: 0,
    now: "2026-06-08T13:00:00.000Z",
    limit: 20
  };
  const notificationEngineerParams = {
    userId: "user-engineer-demo",
    scopeEngineer: 1,
    now: "2026-06-08T13:00:00.000Z",
    limit: 20
  };
  const managerReleaseFailedNotifications = database.prepare(releaseFailedNotificationsSql).all(notificationManagerParams);
  const engineerReleaseFailedNotifications = database.prepare(releaseFailedNotificationsSql).all(notificationEngineerParams);
  const managerPendingReviewNotifications = database.prepare(pendingReviewNotificationsSql).all(notificationManagerParams);
  const engineerPendingReviewNotifications = database.prepare(pendingReviewNotificationsSql).all(notificationEngineerParams);
  const managerUploadFailedNotifications = database.prepare(uploadFailedNotificationsSql).all(notificationManagerParams);
  const engineerUploadFailedNotifications = database.prepare(uploadFailedNotificationsSql).all(notificationEngineerParams);
  const managerMissingPackageNotifications = database.prepare(missingReleasePackageNotificationsSql).all(notificationManagerParams);
  const engineerMissingPackageNotifications = database.prepare(missingReleasePackageNotificationsSql).all(notificationEngineerParams);
  const managerActiveLockNotifications = database.prepare(activeLockNotificationsSql).all(notificationManagerParams);
  const engineerActiveLockNotifications = database.prepare(activeLockNotificationsSql).all(notificationEngineerParams);
  const allHandoffSubmissionIds = database.prepare(handoffSubmissionIdsSql).all({
    submittedBy: null,
    limit: 20
  });
  const scopedHandoffSubmissionIds = database.prepare(handoffSubmissionIdsSql).all({
    submittedBy: "user-engineer-demo",
    limit: 20
  });
  const limitedHandoffSubmissionIds = database.prepare(handoffSubmissionIdsSql).all({
    submittedBy: null,
    limit: 2
  });
  const allSubmissionListRows = database.prepare(submissionListSql).all({
    now: "2026-06-08T13:00:00.000Z",
    includeHistory: 0,
    status: null,
    submittedBy: null,
    limit: 10,
    offset: 0
  });
  const scopedPendingSubmissionListRows = database.prepare(submissionListSql).all({
    now: "2026-06-08T13:00:00.000Z",
    includeHistory: 0,
    status: "Pending",
    submittedBy: "user-engineer-demo",
    limit: 10,
    offset: 0
  });
  const pagedSubmissionListRows = database.prepare(submissionListSql).all({
    now: "2026-06-08T13:00:00.000Z",
    includeHistory: 0,
    status: null,
    submittedBy: null,
    limit: 2,
    offset: 1
  });
  const searchByQueryRows = database
    .prepare(
      submissionSearchSql.replace(
        "__SEARCH_WHERE__",
        `(
          lower(s.drawing_number) LIKE :queryLike
          OR lower(i.part_number) LIKE :queryLike
          OR lower(f.original_filename) LIKE :queryLike
          OR lower(r.referenced_filename) LIKE :queryLike
        )`
      )
    )
    .all({ now: "2026-06-08T13:00:00.000Z", includeHistory: 0, queryLike: "%pending.dwg%", limit: 10 });
  const scopedSearchFilterRows = database
    .prepare(
      submissionSearchSql.replace(
        "__SEARCH_WHERE__",
        "s.status = :status AND s.submitted_by = :submittedBy AND lower(s.product_line) LIKE :productLineLike"
      )
    )
    .all({
      now: "2026-06-08T13:00:00.000Z",
      includeHistory: 0,
      status: "Pending",
      submittedBy: "user-engineer-demo",
      productLineLike: "%pl-a%",
      limit: 10
    });
  const childPartSearchRows = database
    .prepare(
      submissionSearchSql.replace(
        "__SEARCH_WHERE__",
        `(
          lower(r.referenced_part_number) LIKE :childPartLike
          OR EXISTS (
            SELECT 1
            FROM bom_headers child_bh
            JOIN bom_lines child_bl ON child_bl.bom_header_id = child_bh.id
            WHERE child_bh.parent_submission_id = s.id
              AND lower(child_bl.child_part_number) LIKE :childPartLike
          )
        )`
      )
    )
    .all({ now: "2026-06-08T13:00:00.000Z", includeHistory: 0, childPartLike: "%pn-100%", limit: 10 });
  const outdatedBomSearchRows = database
    .prepare(
      submissionSearchSql.replace(
        "__SEARCH_WHERE__",
        `EXISTS (
          SELECT 1
          FROM bom_headers issue_bh
          JOIN bom_lines issue_bl ON issue_bl.bom_header_id = issue_bh.id
          JOIN items issue_i ON upper(issue_i.part_number) = upper(issue_bl.child_part_number)
          JOIN submissions latest_released ON latest_released.id = (
            SELECT lr.id
            FROM submissions lr
            WHERE lr.item_id = issue_i.id
              AND lr.status = 'Released'
            ORDER BY COALESCE(lr.released_at, lr.updated_at, lr.created_at) DESC, lr.id DESC
            LIMIT 1
          )
          WHERE issue_bh.parent_submission_id = s.id
            AND issue_bl.child_revision IS NOT NULL
            AND upper(issue_bl.child_revision) <> upper(latest_released.revision)
        )`
      )
    )
    .all({ now: "2026-06-08T13:00:00.000Z", includeHistory: 0, limit: 10 });
  const parentDetail = database.prepare(submissionDetailSql).get({ id: "sub-parent-a" });
  const parentReferences = database.prepare(submissionReferencesSql).all({ id: "sub-parent-a" });
  const parentApprovals = database.prepare(submissionApprovalsSql).all({ id: "sub-parent-a" });
  const parentAuditLogs = database.prepare(submissionAuditLogsSql).all({ id: "sub-parent-a" });
  const parentReleasePackage = database.prepare(submissionReleasePackageSql).get({ id: "sub-parent-a" });
  const parentBomHeader = database.prepare(submissionBomHeaderSql).get({ id: "sub-parent-a" });
  const parentBomLines = database.prepare(submissionBomLinesSql).all({ bomHeaderId: "bom-a" });
  const dashboardDetail = database.prepare(submissionDetailSql).get({ id: "sub-dashboard-pending" });
  const dashboardFiles = database.prepare(submissionFilesSql).all({ id: "sub-dashboard-pending" });
  const dashboardActiveLock = database.prepare(submissionActiveLockSql).get({
    itemId: "item-dashboard",
    now: "2026-06-08T13:00:00.000Z"
  });
  const asyncCreateMissingRevisionBefore = database.prepare(submissionRevisionExistsSql).get({
    drawingNumber: "DRW-ASYNC-CREATE",
    revision: "A"
  });
  const asyncCreateItemInitial = database.prepare(upsertSubmissionItemSql).get({
    id: "item-create-async",
    partNumber: "PN-ASYNC-CREATE",
    partName: "Async Create Part Initial",
    now: "2026-06-08T13:10:00.000Z"
  });
  const asyncCreateItemUpdated = database.prepare(upsertSubmissionItemSql).get({
    id: "item-create-async-ignored",
    partNumber: "PN-ASYNC-CREATE",
    partName: "Async Create Part Updated",
    now: "2026-06-08T13:11:00.000Z"
  });
  database.prepare(insertSubmissionRecordSql).run({
    id: "sub-create-async",
    itemId: asyncCreateItemUpdated.id,
    drawingNumber: "DRW-ASYNC-CREATE",
    revision: "A",
    productLine: "PL-CREATE",
    customer: "Customer Create",
    projectCode: "P-CREATE",
    processName: "Async Upload",
    machine: "M-CREATE",
    material: "SUS316",
    surfaceFinish: "Polished",
    documentType: "Assembly",
    changeDescription: "Async create fixture",
    submittedBy: "user-engineer-demo",
    approvalRequired: 2,
    sourceEntityType: null,
    sourceEntityId: null,
    correctsSubmissionId: null,
    now: "2026-06-08T13:12:00.000Z"
  });
  database.prepare(insertSubmissionFileSql).run({
    id: "file-create-asm",
    submissionId: "sub-create-async",
    fileRole: "sldasm",
    originalFilename: "create-assembly.sldasm",
    localPath: "/tmp/create-assembly.sldasm",
    storageProvider: "local_repository",
    storageBucket: null,
    storageKey: null,
    gdriveFileId: null,
    sha256: "sha-create-asm",
    fileSize: 31,
    sourceMasterAttachmentId: null,
    now: "2026-06-08T13:13:00.000Z"
  });
  database.prepare(insertSubmissionFileSql).run({
    id: "file-create-pdf",
    submissionId: "sub-create-async",
    fileRole: "pdf",
    originalFilename: "create-assembly.pdf",
    localPath: "/tmp/create-assembly.pdf",
    storageProvider: "local_repository",
    storageBucket: null,
    storageKey: null,
    gdriveFileId: null,
    sha256: "sha-create-pdf",
    fileSize: 17,
    sourceMasterAttachmentId: null,
    now: "2026-06-08T13:13:01.000Z"
  });
  database.prepare(insertFileReferenceSql).run({
    id: "ref-create-child",
    submissionId: "sub-create-async",
    sourceFileId: "file-create-asm",
    sourceFilename: "create-assembly.sldasm",
    sourceFileRole: "sldasm",
    referencedFilename: "create-child.sldprt",
    referencedPartNumber: "PN-100",
    referencedDrawingNumber: "DRW-PN-100",
    referencedRevision: "B",
    referenceType: "assembly_component",
    quantity: 3,
    extractionMethod: "qc-async-create",
    confidence: "high",
    now: "2026-06-08T13:14:00.000Z"
  });
  database.prepare(insertFileReferenceSql).run({
    id: "ref-create-drawing",
    submissionId: "sub-create-async",
    sourceFileId: "file-create-pdf",
    sourceFilename: "create-assembly.pdf",
    sourceFileRole: "pdf",
    referencedFilename: "create-drawing-model.sldprt",
    referencedPartNumber: "PN-DRAWING-ONLY",
    referencedDrawingNumber: "DRW-DRAWING-ONLY",
    referencedRevision: "A",
    referenceType: "drawing_model",
    quantity: 1,
    extractionMethod: "qc-async-create",
    confidence: "medium",
    now: "2026-06-08T13:14:01.000Z"
  });
  database.prepare(insertSubmissionWriteAuditLogSql).run({
    id: "audit-create-submit",
    submissionId: "sub-create-async",
    actorId: "user-engineer-demo",
    action: "Submit",
    detailJson: JSON.stringify({ fileCount: 2 }),
    createdAt: "2026-06-08T13:15:00.000Z"
  });
  const asyncCreateBomHeader = database.prepare(upsertSubmissionBomHeaderSql).get({
    id: "bom-create-async",
    parentItemId: asyncCreateItemUpdated.id,
    parentSubmissionId: "sub-create-async",
    parentRevision: "A",
    lineCount: 1,
    now: "2026-06-08T13:16:00.000Z"
  });
  database.prepare(deleteSubmissionBomLinesSql).run({ bomHeaderId: asyncCreateBomHeader.id });
  database.prepare(insertSubmissionBomLineSql).run({
    id: "line-create-child",
    bomHeaderId: asyncCreateBomHeader.id,
    lineNo: 1,
    childPartNumber: "PN-100",
    childRevision: "B",
    quantity: 3,
    sourceFileId: "file-create-asm",
    sourceReferenceId: "ref-create-child",
    sourceFilename: "create-assembly.sldasm",
    now: "2026-06-08T13:16:01.000Z"
  });
  database.prepare(insertSubmissionWriteAuditLogSql).run({
    id: "audit-create-bom",
    submissionId: "sub-create-async",
    actorId: null,
    action: "BomDraftMaterialized",
    detailJson: JSON.stringify({ source: "file_references", lineCount: 1 }),
    createdAt: "2026-06-08T13:17:00.000Z"
  });
  const asyncCreateRevisionAfter = database.prepare(submissionRevisionExistsSql).get({
    drawingNumber: "DRW-ASYNC-CREATE",
    revision: "A"
  });
  const asyncCreateItemRow = database.prepare("SELECT id, part_name FROM items WHERE part_number = 'PN-ASYNC-CREATE'").get();
  const asyncCreateSubmissionRow = database
    .prepare("SELECT id, item_id, status, approval_required, submitted_by FROM submissions WHERE id = 'sub-create-async'")
    .get();
  const asyncCreateFiles = database
    .prepare("SELECT id, file_role, original_filename, gdrive_status, file_size FROM submission_files WHERE submission_id = 'sub-create-async' ORDER BY original_filename ASC")
    .all();
  const asyncCreateReferences = database
    .prepare("SELECT id, source_file_id, reference_type, referenced_part_number, quantity FROM file_references WHERE submission_id = 'sub-create-async' ORDER BY id ASC")
    .all();
  const asyncCreateBomLines = database
    .prepare("SELECT line_no, child_part_number, child_revision, quantity, source_reference_id FROM bom_lines WHERE bom_header_id = ? ORDER BY line_no ASC")
    .all(asyncCreateBomHeader.id);
  const asyncCreateAuditLogs = database
    .prepare("SELECT action, actor_id, detail_json FROM audit_logs WHERE submission_id = 'sub-create-async' ORDER BY created_at ASC")
    .all();
  const bomDraftFromAssemblyAt = "2026-06-08T13:18:00.000Z";
  const asyncBomWorkbenchAssemblyParent = database.prepare(bomWorkbenchParentSql).get({ submissionId: "sub-create-async" });
  const asyncBomWorkbenchAssemblyReferences = database.prepare(bomWorkbenchAssemblyReferencesSql).all({
    submissionId: "sub-create-async"
  });
  database.prepare(deactivateBomWorkbenchActiveDraftsSql).run({
    parentItemId: asyncBomWorkbenchAssemblyParent.parent_item_id,
    parentRevision: asyncBomWorkbenchAssemblyParent.parent_revision,
    updatedAt: bomDraftFromAssemblyAt
  });
  database.prepare(insertBomWorkbenchDraftSql).run({
    id: "bom-draft-from-assembly-async",
    parentItemId: asyncBomWorkbenchAssemblyParent.parent_item_id,
    parentSubmissionId: "sub-create-async",
    parentRevision: asyncBomWorkbenchAssemblyParent.parent_revision,
    draftName: "Async assembly draft",
    status: "Draft",
    source: "cad_reference",
    isActive: 1,
    lineCount: asyncBomWorkbenchAssemblyReferences.length,
    reviewAttempt: 0,
    createdBy: "user-engineer-demo",
    updatedBy: "user-engineer-demo",
    createdAt: bomDraftFromAssemblyAt,
    updatedAt: bomDraftFromAssemblyAt
  });
  for (const [index, reference] of asyncBomWorkbenchAssemblyReferences.entries()) {
    const childItem = database.prepare(bomWorkbenchItemByPartNumberSql).get({
      partNumber: reference.referenced_part_number
    });
    database.prepare(insertBomWorkbenchDraftLineSql).run({
      id: `bom-draft-from-assembly-line-${index + 1}`,
      draftId: "bom-draft-from-assembly-async",
      parentLineId: null,
      nodeType: "item",
      itemId: childItem?.id ?? null,
      partNumber: reference.referenced_part_number,
      revision: reference.referenced_revision,
      groupName: null,
      quantity: reference.quantity,
      sequenceNo: index + 1,
      source: "cad_reference",
      sourcePriority: 10,
      sourceRefId: reference.id,
      sourceFilename: reference.source_filename,
      createdBy: "user-engineer-demo",
      updatedBy: "user-engineer-demo",
      createdAt: bomDraftFromAssemblyAt,
      updatedAt: bomDraftFromAssemblyAt
    });
  }
  database.prepare(insertBomWorkbenchEditEventSql).run({
    id: "bom-edit-create-from-assembly-async",
    draftId: "bom-draft-from-assembly-async",
    actorId: "user-engineer-demo",
    eventType: "create_from_assembly",
    beforeJson: null,
    afterJson: JSON.stringify({
      draftId: "bom-draft-from-assembly-async",
      lineCount: asyncBomWorkbenchAssemblyReferences.length,
      sourceReferenceCount: asyncBomWorkbenchAssemblyReferences.length,
      setActive: true
    }),
    reason: "Create BOM workbench draft from assembly references",
    createdAt: bomDraftFromAssemblyAt
  });
  database.prepare(insertBomWorkbenchAuditLogSql).run({
    id: "audit-bom-create-from-assembly-async",
    submissionId: "sub-create-async",
    actorId: "user-engineer-demo",
    action: "BomWorkbenchDraftCreated",
    detailJson: JSON.stringify({
      draftId: "bom-draft-from-assembly-async",
      source: "cad_reference",
      lineCount: asyncBomWorkbenchAssemblyReferences.length,
      sourceReferenceCount: asyncBomWorkbenchAssemblyReferences.length,
      setActive: true
    }),
    createdAt: bomDraftFromAssemblyAt
  });
  const asyncBomWorkbenchAssemblyDraft = database.prepare(bomWorkbenchDraftSql).get({
    draftId: "bom-draft-from-assembly-async"
  });
  const asyncBomWorkbenchAssemblyLines = database.prepare(bomWorkbenchDraftLinesSql).all({
    draftId: "bom-draft-from-assembly-async"
  });
  const asyncBomWorkbenchAssemblyEvent = database
    .prepare("SELECT * FROM bom_edit_events WHERE id = ?")
    .get("bom-edit-create-from-assembly-async");
  const asyncBomWorkbenchAssemblyAudit = database
    .prepare("SELECT * FROM audit_logs WHERE id = ?")
    .get("audit-bom-create-from-assembly-async");
  const bomDraftImportXlsAt = "2026-06-08T13:19:00.000Z";
  const asyncBomImportProfileBefore = database.prepare(bomImportProfileSql).get({
    profileName: "solidworks_bom_default",
    version: "v1"
  });
  database.prepare(insertBomImportProfileSql).run({
    id: "bom-import-profile-async",
    profileName: "solidworks_bom_default",
    sourceType: "solidworks_xls",
    version: "v1",
    mappingJson: JSON.stringify({ acceptedFormats: ["tsv", "csv", "excel_html", "spreadsheetml_xml"] }),
    isActive: 1,
    createdAt: bomDraftImportXlsAt
  });
  const asyncBomImportProfile = database.prepare(bomImportProfileSql).get({
    profileName: "solidworks_bom_default",
    version: "v1"
  });
  const asyncBomImportParent = database.prepare(bomWorkbenchParentSql).get({ submissionId: "sub-create-async" });
  database.prepare(deactivateBomWorkbenchActiveDraftsSql).run({
    parentItemId: asyncBomImportParent.parent_item_id,
    parentRevision: asyncBomImportParent.parent_revision,
    updatedAt: bomDraftImportXlsAt
  });
  database.prepare(insertBomWorkbenchDraftSql).run({
    id: "bom-draft-import-xls-async",
    parentItemId: asyncBomImportParent.parent_item_id,
    parentSubmissionId: "sub-create-async",
    parentRevision: asyncBomImportParent.parent_revision,
    draftName: "Async SolidWorks XLS draft",
    status: "Draft",
    source: "solidworks_xls",
    isActive: 1,
    lineCount: 1,
    reviewAttempt: 0,
    createdBy: "user-engineer-demo",
    updatedBy: "user-engineer-demo",
    createdAt: bomDraftImportXlsAt,
    updatedAt: bomDraftImportXlsAt
  });
  database.prepare(insertAsyncFileAssetSql).run({
    id: "file-asset-bom-import-async",
    storageProvider: "external",
    originalPath: "/tmp/solidworks-bom-async.xls",
    storageKey: "bom-imports/2026/06/bom-import-job-async/solidworks-bom-async.xls",
    fileName: "solidworks-bom-async.xls",
    fileExt: "xls",
    fileSize: 123,
    contentHash: "sha-bom-import-async",
    hashAlgorithm: "SHA-256",
    linkedEntityType: "bom_import_job",
    linkedEntityId: "bom-import-job-async",
    revision: asyncBomImportParent.parent_revision,
    syncStatus: "local_only",
    createdAt: bomDraftImportXlsAt,
    updatedAt: bomDraftImportXlsAt
  });
  const asyncBomImportChildItem = database.prepare(bomWorkbenchItemByPartNumberSql).get({ partNumber: "PN-100" });
  database.prepare(insertBomWorkbenchDraftLineSql).run({
    id: "bom-draft-import-xls-line-1",
    draftId: "bom-draft-import-xls-async",
    parentLineId: null,
    nodeType: "item",
    itemId: asyncBomImportChildItem?.id ?? null,
    partNumber: "PN-100",
    revision: "B",
    groupName: null,
    quantity: 3,
    sequenceNo: 1,
    source: "solidworks_xls",
    sourcePriority: 20,
    sourceRefId: "solidworks_rows:2,3",
    sourceFilename: "solidworks-bom-async.xls",
    createdBy: "user-engineer-demo",
    updatedBy: "user-engineer-demo",
    createdAt: bomDraftImportXlsAt,
    updatedAt: bomDraftImportXlsAt
  });
  database.prepare(insertBomImportJobSql).run({
    id: "bom-import-job-async",
    draftId: "bom-draft-import-xls-async",
    parentSubmissionId: "sub-create-async",
    importProfileId: "bom-import-profile-async",
    sourceAssetId: "file-asset-bom-import-async",
    originalFilename: "solidworks-bom-async.xls",
    status: "Imported",
    rowCount: 2,
    errorJson: JSON.stringify({
      format: "delimited",
      sha256: "sha-bom-import-async",
      storageKey: "bom-imports/2026/06/bom-import-job-async/solidworks-bom-async.xls",
      transformedLineCount: 1,
      warnings: ["duplicate_part_revision_rows_merged"]
    }),
    createdBy: "user-engineer-demo",
    createdAt: bomDraftImportXlsAt
  });
  database.prepare(insertBomWorkbenchEditEventSql).run({
    id: "bom-edit-import-xls-async",
    draftId: "bom-draft-import-xls-async",
    actorId: "user-engineer-demo",
    eventType: "import_solidworks_xls",
    beforeJson: null,
    afterJson: JSON.stringify({
      draftId: "bom-draft-import-xls-async",
      importJobId: "bom-import-job-async",
      originalFilename: "solidworks-bom-async.xls",
      sourceAssetId: "file-asset-bom-import-async",
      profileName: "solidworks_bom_default",
      profileVersion: "v1",
      rawRowCount: 2,
      lineCount: 1,
      setActive: true
    }),
    reason: "Import BOM workbench draft from SolidWorks BOM XLS",
    createdAt: bomDraftImportXlsAt
  });
  database.prepare(insertBomWorkbenchAuditLogSql).run({
    id: "audit-bom-import-xls-async",
    submissionId: "sub-create-async",
    actorId: "user-engineer-demo",
    action: "BomWorkbenchDraftImported",
    detailJson: JSON.stringify({
      draftId: "bom-draft-import-xls-async",
      importJobId: "bom-import-job-async",
      source: "solidworks_xls",
      originalFilename: "solidworks-bom-async.xls",
      sourceAssetId: "file-asset-bom-import-async",
      profileName: "solidworks_bom_default",
      profileVersion: "v1",
      rawRowCount: 2,
      lineCount: 1,
      setActive: true
    }),
    createdAt: bomDraftImportXlsAt
  });
  const asyncBomImportDraft = database.prepare(bomWorkbenchDraftSql).get({ draftId: "bom-draft-import-xls-async" });
  const asyncBomImportLines = database.prepare(bomWorkbenchDraftLinesSql).all({ draftId: "bom-draft-import-xls-async" });
  const asyncBomImportJob = database.prepare(bomImportJobSql).get({ importJobId: "bom-import-job-async" });
  const asyncBomImportAsset = database.prepare("SELECT * FROM file_assets WHERE id = ?").get("file-asset-bom-import-async");
  const asyncBomImportEvent = database.prepare("SELECT * FROM bom_edit_events WHERE id = ?").get("bom-edit-import-xls-async");
  const asyncBomImportAudit = database.prepare("SELECT * FROM audit_logs WHERE id = ?").get("audit-bom-import-xls-async");
  const asyncSubmissionFile = database.prepare(asyncSubmissionFileSql).get({
    submissionId: "sub-dashboard-pending",
    fileId: "file-dashboard-pending-pdf"
  });
  const asyncMissingSubmissionFile = database.prepare(asyncSubmissionFileSql).get({
    submissionId: "sub-dashboard-pending",
    fileId: "missing-file"
  });
  const asyncFilesNeedingUploadBefore = database.prepare(asyncFilesNeedingUploadSql).all({
    submissionId: "sub-dashboard-pending"
  });
  database.prepare(updateAsyncFileGDriveStatusSql).run({
    fileId: "file-dashboard-pending-pdf",
    gdriveStatus: "uploading"
  });
  const asyncUploadStatusOnly = database
    .prepare("SELECT gdrive_status, gdrive_file_id FROM submission_files WHERE id = 'file-dashboard-pending-pdf'")
    .get();
  database.prepare(updateAsyncFileGDriveStatusWithIdSql).run({
    fileId: "file-dashboard-pending-pdf",
    gdriveStatus: "uploaded",
    gdriveFileId: "gdrive-file-async"
  });
  const asyncUploadStatusWithId = database
    .prepare("SELECT gdrive_status, gdrive_file_id FROM submission_files WHERE id = 'file-dashboard-pending-pdf'")
    .get();
  database.prepare(insertDiscussionCommentSql).run({
    id: "comment-async",
    submissionId: "sub-dashboard-pending",
    fileId: "file-dashboard-pending-pdf",
    authorId: "user-engineer-demo",
    body: "Async discussion body",
    now: "2026-06-08T13:10:00.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-comment-async",
    submissionId: "sub-dashboard-pending",
    actorId: "user-engineer-demo",
    action: "DiscussionCommentCreated",
    detailJson: JSON.stringify({ commentId: "comment-async" }),
    createdAt: "2026-06-08T13:10:01.000Z"
  });
  const asyncDiscussionCommentsBeforeResolve = database
    .prepare(discussionCommentsSql)
    .all({ submissionId: "sub-dashboard-pending" });
  database.prepare(resolveDiscussionCommentSql).run({
    submissionId: "sub-dashboard-pending",
    commentId: "comment-async",
    resolvedBy: "user-manager-demo",
    now: "2026-06-08T13:11:00.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-comment-resolved-async",
    submissionId: "sub-dashboard-pending",
    actorId: "user-manager-demo",
    action: "DiscussionCommentResolved",
    detailJson: JSON.stringify({ commentId: "comment-async" }),
    createdAt: "2026-06-08T13:11:01.000Z"
  });
  const asyncDiscussionCommentsAfterResolve = database
    .prepare(discussionCommentsSql)
    .all({ submissionId: "sub-dashboard-pending" });
  database.prepare(insertReviewIssueSql).run({
    id: "issue-async",
    submissionId: "sub-dashboard-pending",
    fileId: "file-dashboard-pending-dwg",
    title: "Async issue",
    description: "Async issue body",
    raisedBy: "user-engineer-demo",
    assigneeId: "user-manager-demo",
    now: "2026-06-08T13:20:00.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-issue-async",
    submissionId: "sub-dashboard-pending",
    actorId: "user-engineer-demo",
    action: "ReviewIssueCreated",
    detailJson: JSON.stringify({ issueId: "issue-async" }),
    createdAt: "2026-06-08T13:20:01.000Z"
  });
  database.prepare(resolveReviewIssueSql).run({
    submissionId: "sub-dashboard-pending",
    issueId: "issue-async",
    resolvedBy: "user-manager-demo",
    resolution: "Fixed",
    now: "2026-06-08T13:21:00.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-issue-resolved-async",
    submissionId: "sub-dashboard-pending",
    actorId: "user-manager-demo",
    action: "ReviewIssueResolved",
    detailJson: JSON.stringify({ issueId: "issue-async" }),
    createdAt: "2026-06-08T13:21:01.000Z"
  });
  const asyncReviewIssues = database.prepare(reviewIssuesSql).all({ submissionId: "sub-dashboard-pending" });
  database.prepare(insertPdfMarkupSql).run({
    id: "markup-async",
    submissionId: "sub-dashboard-pending",
    fileId: "file-dashboard-pending-pdf",
    pageNumber: 2,
    xPercent: 25.5,
    yPercent: 40.25,
    body: "Async markup",
    authorId: "user-engineer-demo",
    now: "2026-06-08T13:30:00.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-markup-async",
    submissionId: "sub-dashboard-pending",
    actorId: "user-engineer-demo",
    action: "PdfMarkupCreated",
    detailJson: JSON.stringify({ markupId: "markup-async" }),
    createdAt: "2026-06-08T13:30:01.000Z"
  });
  database.prepare(resolvePdfMarkupSql).run({
    submissionId: "sub-dashboard-pending",
    markupId: "markup-async",
    resolvedBy: "user-manager-demo",
    now: "2026-06-08T13:31:00.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-markup-resolved-async",
    submissionId: "sub-dashboard-pending",
    actorId: "user-manager-demo",
    action: "PdfMarkupResolved",
    detailJson: JSON.stringify({ markupId: "markup-async" }),
    createdAt: "2026-06-08T13:31:01.000Z"
  });
  const asyncPdfMarkups = database.prepare(pdfMarkupsSql).all({ submissionId: "sub-dashboard-pending" });
  database.prepare(insertChangeRequestSql).run({
    id: "change-async",
    submissionId: "sub-dashboard-pending",
    kind: "ECR",
    title: "Async change",
    reason: "Async change reason",
    impact: "Async change impact",
    requestedBy: "user-engineer-demo",
    now: "2026-06-08T13:40:00.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-change-async",
    submissionId: "sub-dashboard-pending",
    actorId: "user-engineer-demo",
    action: "ChangeRequestCreated",
    detailJson: JSON.stringify({ changeId: "change-async", kind: "ECR", title: "Async change" }),
    createdAt: "2026-06-08T13:40:01.000Z"
  });
  const asyncChangeRequestsBeforeDecision = database.prepare(changeRequestsSql).all({ submissionId: "sub-dashboard-pending" });
  database.prepare(decideChangeRequestSql).run({
    submissionId: "sub-dashboard-pending",
    changeId: "change-async",
    decidedBy: "user-manager-demo",
    status: "approved",
    comment: "Approved for async migration",
    now: "2026-06-08T13:41:00.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-change-decided-async",
    submissionId: "sub-dashboard-pending",
    actorId: "user-manager-demo",
    action: "ChangeRequestDecided",
    detailJson: JSON.stringify({ changeId: "change-async", status: "approved", comment: "Approved for async migration" }),
    createdAt: "2026-06-08T13:41:01.000Z"
  });
  const asyncChangeRequestsAfterDecision = database.prepare(changeRequestsSql).all({ submissionId: "sub-dashboard-pending" });
  database
    .prepare(
      "INSERT INTO approval_steps (id, submission_id, reviewer_id, sequence_no, decision, comment, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "approval-dashboard-manager",
      "sub-dashboard-pending",
      "user-manager-demo",
      1,
      "Approved",
      "manager approved",
      "2026-06-08T13:59:00.000Z"
    );
  database.prepare(insertApprovalMatrixRequirementSql).run({
    id: "approval-matrix-manager",
    submissionId: "sub-dashboard-pending",
    requiredRole: "R&D Manager",
    minCount: 1,
    createdBy: "user-engineer-demo",
    now: "2026-06-08T14:00:00.000Z"
  });
  database.prepare(insertApprovalMatrixRequirementSql).run({
    id: "approval-matrix-admin",
    submissionId: "sub-dashboard-pending",
    requiredRole: "Admin",
    minCount: 1,
    createdBy: "user-engineer-demo",
    now: "2026-06-08T14:00:01.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-approval-matrix-init-async",
    submissionId: "sub-dashboard-pending",
    actorId: "user-engineer-demo",
    action: "ApprovalMatrixInitialized",
    detailJson: JSON.stringify({ requirements: [{ role: "R&D Manager", minCount: 1 }, { role: "Admin", minCount: 1 }] }),
    createdAt: "2026-06-08T14:00:02.000Z"
  });
  const asyncApprovalMatrixBeforeRefresh = database
    .prepare(approvalMatrixRequirementsSql)
    .all({ submissionId: "sub-dashboard-pending" });
  database.prepare(satisfyApprovalMatrixRequirementSql).run({
    submissionId: "sub-dashboard-pending",
    requirementId: "approval-matrix-manager",
    now: "2026-06-08T14:01:00.000Z"
  });
  const asyncApprovalMatrixAfterRefresh = database
    .prepare(approvalMatrixRequirementsSql)
    .all({ submissionId: "sub-dashboard-pending" });
  database.prepare(waiveApprovalMatrixRequirementSql).run({
    submissionId: "sub-dashboard-pending",
    requirementId: "approval-matrix-admin",
    decidedBy: "user-manager-demo",
    comment: "Waived for async migration",
    now: "2026-06-08T14:02:00.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-approval-matrix-waived-async",
    submissionId: "sub-dashboard-pending",
    actorId: "user-manager-demo",
    action: "ApprovalMatrixWaived",
    detailJson: JSON.stringify({ requirementId: "approval-matrix-admin", comment: "Waived for async migration" }),
    createdAt: "2026-06-08T14:02:01.000Z"
  });
  const asyncApprovalMatrixAfterWaive = database
    .prepare(approvalMatrixRequirementsSql)
    .all({ submissionId: "sub-dashboard-pending" });
  database.prepare(insertApprovalStepSql).run({
    id: "approval-dashboard-admin-reject",
    submissionId: "sub-dashboard-pending",
    reviewerId: "user-admin-demo",
    decision: "Rejected",
    comment: "admin rejected",
    decidedAt: "2026-06-08T14:10:00.000Z"
  });
  const asyncReviewerDecision = database.prepare(reviewerDecisionSql).get({
    submissionId: "sub-dashboard-pending",
    reviewerId: "user-admin-demo"
  });
  const asyncApprovalSummaryRows = database.prepare(approvalSummarySql).all({
    submissionId: "sub-dashboard-pending"
  });
  const asyncApprovalSummary = Object.fromEntries(asyncApprovalSummaryRows.map((row) => [row.decision, Number(row.count)]));
  database.prepare(rejectSubmissionSql).run({
    id: "sub-dashboard-pending",
    rejectReason: "Rejected for async migration",
    now: "2026-06-08T14:11:00.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-reject-async",
    submissionId: "sub-dashboard-pending",
    actorId: "user-admin-demo",
    action: "Reject",
    detailJson: JSON.stringify({ reason: "Rejected for async migration" }),
    createdAt: "2026-06-08T14:11:01.000Z"
  });
  const asyncRejectedSubmission = database
    .prepare("SELECT status, rejected_at, reject_reason, release_error FROM submissions WHERE id = 'sub-dashboard-pending'")
    .get();
  const asyncRejectAuditLog = database
    .prepare("SELECT action, actor_id, detail_json FROM audit_logs WHERE id = 'audit-reject-async'")
    .get();
  database
    .prepare(
      `
      INSERT INTO submissions (
        id, item_id, drawing_number, revision, product_line, customer, project_code, process_name, machine, material,
        surface_finish, document_type, change_description, status, submitted_by, approval_required,
        created_at, updated_at, released_at, rejected_at, reject_reason, release_error, superseded_by_submission_id,
        obsolete_at, obsolete_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      "sub-release-pending",
      "item-child",
      "DRW-PN-100",
      "C",
      "PL-A",
      "Customer A",
      "P-100",
      "Release",
      "M-3",
      "SUS304",
      "2B",
      "Drawing",
      "Release decision pending fixture",
      "Pending",
      "user-engineer-demo",
      1,
      "2026-06-08T14:20:00.000Z",
      "2026-06-08T14:20:00.000Z",
      null,
      null,
      null,
      null,
      null,
      null,
      null
    );
  database
    .prepare(
      `
      INSERT INTO submissions (
        id, item_id, drawing_number, revision, product_line, customer, project_code, process_name, machine, material,
        surface_finish, document_type, change_description, status, submitted_by, approval_required,
        created_at, updated_at, released_at, rejected_at, reject_reason, release_error, superseded_by_submission_id,
        obsolete_at, obsolete_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      "sub-release-fail",
      "item-dashboard",
      "DRW-DASH-FAIL-ASYNC",
      "B",
      "PL-A",
      "Customer A",
      "P-100",
      "Release",
      "DASH-4",
      "AL6061",
      "Anodized",
      "Drawing",
      "Release failure fixture",
      "Pending",
      "user-engineer-demo",
      1,
      "2026-06-08T14:20:10.000Z",
      "2026-06-08T14:20:10.000Z",
      null,
      null,
      null,
      null,
      null,
      null,
      null
    );
  database
    .prepare(
      `
      INSERT INTO sandbox_branches (
        id, source_submission_id, sandbox_submission_id, branch_name, reason, status, created_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      "sandbox-release-active",
      "sub-child-b",
      "sub-release-pending",
      "Release sandbox",
      "QC active sandbox fixture",
      "active",
      "user-manager-demo",
      "2026-06-08T14:21:00.000Z",
      "2026-06-08T14:21:00.000Z"
    );
  database
    .prepare(
      "INSERT INTO submission_files (id, submission_id, file_role, original_filename, local_path, gdrive_file_id, gdrive_status, sha256, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "file-release-conflict-existing",
      "sub-parent-a",
      "pdf",
      "released-conflict.pdf",
      "/tmp/released-conflict.pdf",
      null,
      "none",
      "sha-conflict-existing",
      17,
      "2026-06-08T14:21:10.000Z"
    );
  database
    .prepare(
      "INSERT INTO submission_files (id, submission_id, file_role, original_filename, local_path, gdrive_file_id, gdrive_status, sha256, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      "file-release-conflict-pending",
      "sub-release-pending",
      "pdf",
      "released-conflict.pdf",
      "/tmp/released-conflict-pending.pdf",
      null,
      "none",
      "sha-conflict-pending",
      19,
      "2026-06-08T14:21:11.000Z"
    );
  const asyncActiveSandboxBranch = database.prepare(activeSandboxBranchSql).get({ submissionId: "sub-release-pending" });
  const asyncReleasedFilenameConflict = database.prepare(releasedFilenameConflictSql).get({
    submissionId: "sub-release-pending",
    fileRole: "pdf",
    originalFilename: "RELEASED-CONFLICT.pdf"
  });
  database.prepare(markSubmissionReleasingSql).run({
    id: "sub-release-fail",
    now: "2026-06-08T14:22:00.000Z"
  });
  const asyncReleaseFailReleasing = database
    .prepare("SELECT status, release_error, reject_reason FROM submissions WHERE id = 'sub-release-fail'")
    .get();
  database.prepare(markSubmissionReleaseFailedSql).run({
    id: "sub-release-fail",
    releaseError: "QC release failure",
    now: "2026-06-08T14:23:00.000Z"
  });
  const asyncReleaseFailedSubmission = database
    .prepare("SELECT status, release_error FROM submissions WHERE id = 'sub-release-fail'")
    .get();
  database.prepare(upsertReleasePackageSql).run({
    id: "release-package-async-a",
    submissionId: "sub-release-pending",
    packageFilename: "release-a.zip",
    localPath: "/tmp/release-a.zip",
    storageProvider: "local_repository",
    storageBucket: null,
    storageKey: null,
    sha256: "sha-release-a",
    fileSize: 101,
    manifestJson: JSON.stringify({ version: "a" }),
    createdBy: "user-manager-demo",
    now: "2026-06-08T14:24:00.000Z"
  });
  database.prepare(upsertReleasePackageSql).run({
    id: "release-package-async-b",
    submissionId: "sub-release-pending",
    packageFilename: "release-b.zip",
    localPath: "/tmp/release-b.zip",
    storageProvider: "local_repository",
    storageBucket: null,
    storageKey: null,
    sha256: "sha-release-b",
    fileSize: 202,
    manifestJson: JSON.stringify({ version: "b" }),
    createdBy: "user-admin-demo",
    now: "2026-06-08T14:25:00.000Z"
  });
  const asyncReleasePackage = database.prepare(releasePackageBySubmissionSql).get({ submissionId: "sub-release-pending" });
  const asyncReadonlySharesBeforeCreate = database.prepare(readonlySharesSql).all({ submissionId: "sub-parent-a" });
  database.prepare(insertReadonlyShareSql).run({
    id: "share-async-created",
    submissionId: "sub-parent-a",
    tokenHash: "hash-created-share",
    label: "Async created share",
    expiresAt: "2099-01-02T00:00:00.000Z",
    createdBy: "user-manager-demo",
    now: "2026-06-08T14:24:00.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-readonly-share-created",
    submissionId: "sub-parent-a",
    actorId: "user-manager-demo",
    action: "ReadonlyShareCreated",
    detailJson: JSON.stringify({
      shareId: "share-async-created",
      label: "Async created share",
      expiresAt: "2099-01-02T00:00:00.000Z"
    }),
    createdAt: "2026-06-08T14:24:00.000Z"
  });
  const asyncReadonlySharesAfterCreate = database.prepare(readonlySharesSql).all({ submissionId: "sub-parent-a" });
  const asyncCreatedReadonlyShare = database.prepare(readonlyShareByTokenHashSql).get({ tokenHash: "hash-created-share" });
  database.prepare(revokeReadonlyShareSql).run({
    submissionId: "sub-parent-a",
    shareId: "share-async-created",
    revokedBy: "user-admin-demo",
    now: "2026-06-08T14:24:05.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-readonly-share-revoked",
    submissionId: "sub-parent-a",
    actorId: "user-admin-demo",
    action: "ReadonlyShareRevoked",
    detailJson: JSON.stringify({ shareId: "share-async-created" }),
    createdAt: "2026-06-08T14:24:05.000Z"
  });
  const asyncRevokedReadonlyShare = database.prepare(readonlyShareByTokenHashSql).get({ tokenHash: "hash-created-share" });
  const asyncReadonlyShareAuditRows = database
    .prepare(
      "SELECT action, actor_id, detail_json FROM audit_logs WHERE id IN ('audit-readonly-share-created', 'audit-readonly-share-revoked') ORDER BY created_at ASC"
    )
    .all();
  const asyncReadonlyShare = database.prepare(readonlyShareByTokenHashSql).get({ tokenHash: "hash-active-share" });
  const asyncReadonlyShareRevoked = database.prepare(readonlyShareByTokenHashSql).get({ tokenHash: "hash-revoked-share" });
  const asyncReadonlyShareAccessBefore = database.prepare(readonlyShareByTokenHashSql).get({ tokenHash: "hash-active-share" });
  database.prepare(recordReadonlyShareAccessSql).run({
    submissionId: "sub-parent-a",
    shareId: "share-parent-a",
    now: "2026-06-08T14:24:30.000Z"
  });
  const asyncReadonlyShareAccessAfter = database.prepare(readonlyShareByTokenHashSql).get({ tokenHash: "hash-active-share" });
  database.prepare(insertSupplierPortalResponseSql).run({
    id: "supplier-response-async",
    shareId: "share-parent-a",
    submissionId: "sub-parent-a",
    responseKind: "acknowledgement",
    supplierName: "Async Supplier",
    supplierEmail: "async.supplier@example.com",
    message: "Package acknowledged",
    now: "2026-06-08T14:24:10.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-supplier-response-created",
    submissionId: "sub-parent-a",
    actorId: null,
    action: "SupplierPortalResponseCreated",
    detailJson: JSON.stringify({
      shareId: "share-parent-a",
      responseId: "supplier-response-async",
      responseKind: "acknowledgement",
      supplierEmail: "async.supplier@example.com"
    }),
    createdAt: "2026-06-08T14:24:10.000Z"
  });
  const asyncSupplierResponsesBeforeClose = database.prepare(supplierPortalResponsesSql).all({
    submissionId: "sub-parent-a",
    shareId: null
  });
  const asyncSupplierResponsesFiltered = database.prepare(supplierPortalResponsesSql).all({
    submissionId: "sub-parent-a",
    shareId: "share-parent-a"
  });
  const asyncSupplierResponseBeforeClose = database.prepare(supplierPortalResponseSql).get({
    submissionId: "sub-parent-a",
    responseId: "supplier-response-async"
  });
  database.prepare(closeSupplierPortalResponseSql).run({
    submissionId: "sub-parent-a",
    responseId: "supplier-response-async",
    closedBy: "user-manager-demo",
    now: "2026-06-08T14:24:20.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-supplier-response-closed",
    submissionId: "sub-parent-a",
    actorId: "user-manager-demo",
    action: "SupplierPortalResponseClosed",
    detailJson: JSON.stringify({ responseId: "supplier-response-async" }),
    createdAt: "2026-06-08T14:24:20.000Z"
  });
  const asyncSupplierResponseAfterClose = database.prepare(supplierPortalResponseSql).get({
    submissionId: "sub-parent-a",
    responseId: "supplier-response-async"
  });
  const asyncSupplierResponseAuditRows = database
    .prepare(
      "SELECT action, actor_id, detail_json FROM audit_logs WHERE id IN ('audit-supplier-response-created', 'audit-supplier-response-closed') ORDER BY created_at ASC"
    )
    .all();
  database.prepare(insertProcurementSyncRunSql).run({
    id: "proc-sync-async",
    submissionId: "sub-release-pending",
    targetSystem: "procurement",
    payloadJson: JSON.stringify({ schema: "ai-pdm-procurement-sync.v1", fixture: true }),
    externalReference: "EXT-SENT",
    createdBy: "user-admin-demo",
    now: "2026-06-08T14:25:10.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-proc-sync-sent",
    submissionId: "sub-release-pending",
    actorId: "user-admin-demo",
    action: "ProcurementSyncSent",
    detailJson: JSON.stringify({ runId: "proc-sync-async", targetSystem: "procurement", externalReference: "EXT-SENT" }),
    createdAt: "2026-06-08T14:25:10.000Z"
  });
  const asyncProcurementSyncRuns = database.prepare(procurementSyncRunsSql).all({
    submissionId: null,
    targetSystem: null
  });
  const asyncProcurementSyncRunsFiltered = database.prepare(procurementSyncRunsSql).all({
    submissionId: "sub-release-pending",
    targetSystem: "procurement"
  });
  const asyncProcurementSyncRunBeforeDecision = database.prepare(procurementSyncRunByIdSql).get({ runId: "proc-sync-async" });
  database.prepare(decideProcurementSyncRunSql).run({
    runId: "proc-sync-async",
    status: "acknowledged",
    responseJson: JSON.stringify({ action: "acknowledge", message: "ok", received_at: "2026-06-08T14:25:20.000Z" }),
    externalReference: "EXT-ACK",
    actorId: "user-manager-demo",
    now: "2026-06-08T14:25:20.000Z"
  });
  database.prepare(insertAuditSql).run({
    id: "audit-proc-sync-ack",
    submissionId: "sub-release-pending",
    actorId: "user-manager-demo",
    action: "ProcurementSyncAcknowledged",
    detailJson: JSON.stringify({ runId: "proc-sync-async", externalReference: "EXT-ACK" }),
    createdAt: "2026-06-08T14:25:20.000Z"
  });
  const asyncProcurementSyncRunAfterDecision = database.prepare(procurementSyncRunByIdSql).get({ runId: "proc-sync-async" });
  const asyncProcurementSyncAuditRows = database
    .prepare(
      "SELECT action, actor_id, detail_json FROM audit_logs WHERE id IN ('audit-proc-sync-sent', 'audit-proc-sync-ack') ORDER BY created_at ASC"
    )
    .all();
  const asyncLifecycleSubmission = database.prepare(releaseLifecycleSubmissionSql).get({ id: "sub-release-pending" });
  const asyncLifecycleObsoleteRows = database.prepare(releaseLifecycleObsoleteSubmissionsSql).all({
    itemId: asyncLifecycleSubmission.item_id,
    id: asyncLifecycleSubmission.id
  });
  database.prepare(markSubmissionReleasedSql).run({
    id: "sub-release-pending",
    now: "2026-06-08T14:26:00.000Z"
  });
  database.prepare(updateItemCurrentRevisionSql).run({
    itemId: asyncLifecycleSubmission.item_id,
    revision: asyncLifecycleSubmission.revision,
    now: "2026-06-08T14:26:00.000Z"
  });
  for (const row of asyncLifecycleObsoleteRows) {
    database.prepare(markPreviousSubmissionObsoleteSql).run({
      id: row.id,
      supersededBySubmissionId: asyncLifecycleSubmission.id,
      obsoleteBy: "user-manager-demo",
      now: "2026-06-08T14:26:00.000Z"
    });
    database.prepare(insertObsoleteAuditLogSql).run({
      id: `audit-obsolete-${row.id}`,
      submissionId: row.id,
      actorId: "user-manager-demo",
      detailJson: JSON.stringify({
        supersededBySubmissionId: asyncLifecycleSubmission.id,
        supersededByRevision: asyncLifecycleSubmission.revision
      }),
      createdAt: "2026-06-08T14:26:00.000Z"
    });
  }
  const asyncReleasedSubmission = database
    .prepare("SELECT status, released_at, release_error, reject_reason FROM submissions WHERE id = 'sub-release-pending'")
    .get();
  const asyncUpdatedItem = database.prepare("SELECT current_revision FROM items WHERE id = 'item-child'").get();
  const asyncObsoleteSubmissions = database
    .prepare("SELECT id, status, superseded_by_submission_id, obsolete_by FROM submissions WHERE id IN ('sub-child-a', 'sub-child-b') ORDER BY id ASC")
    .all();
  const asyncObsoleteAuditCount = database
    .prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'ObsoleteByRevision' AND actor_id = 'user-manager-demo'")
    .get();
  const asyncCollaborationAuditLogs = database
    .prepare("SELECT action FROM audit_logs WHERE submission_id = 'sub-dashboard-pending' ORDER BY created_at ASC, id ASC")
    .all();
  const asyncBomWorkbenchParent = database.prepare(bomWorkbenchParentSql).get({ submissionId: "sub-parent-a" });
  const asyncBomWorkbenchDrafts = database.prepare(bomWorkbenchDraftsSql).all({ submissionId: "sub-parent-a" });
  const asyncBomWorkbenchActiveSummary =
    asyncBomWorkbenchDrafts.find((draft) => Number(draft.is_active) === 1 && (draft.status === "Draft" || draft.status === "Rejected")) ?? null;
  const asyncBomWorkbenchActiveDraft = asyncBomWorkbenchActiveSummary
    ? database.prepare(bomWorkbenchDraftSql).get({ draftId: asyncBomWorkbenchActiveSummary.id })
    : undefined;
  const asyncBomWorkbenchActiveLines = asyncBomWorkbenchActiveSummary
    ? database.prepare(bomWorkbenchDraftLinesSql).all({ draftId: asyncBomWorkbenchActiveSummary.id })
    : [];
  const asyncBomWorkbenchBaseSnapshot = asyncBomWorkbenchActiveSummary
    ? database.prepare(bomWorkbenchLatestReleaseSnapshotSql).get({
        parentItemId: asyncBomWorkbenchActiveSummary.parent_item_id,
        draftId: asyncBomWorkbenchActiveSummary.id
      })
    : undefined;
  const asyncBomWorkbenchBaseLines = asyncBomWorkbenchBaseSnapshot
    ? JSON.parse(asyncBomWorkbenchBaseSnapshot.line_snapshot_json)
    : [];
  const asyncBomWorkbenchReleaseSnapshot = database.prepare(bomWorkbenchReleaseSnapshotSql).get({
    snapshotId: "bom-release-snapshot-base"
  });
  const asyncBomWorkbenchReleaseSnapshotLines = asyncBomWorkbenchReleaseSnapshot
    ? JSON.parse(asyncBomWorkbenchReleaseSnapshot.line_snapshot_json)
    : [];
  const asyncBomWorkbenchPendingReviews = database.prepare(bomWorkbenchPendingReviewsSql).all();
  const asyncBomWorkbenchPendingReview = asyncBomWorkbenchPendingReviews.find((review) => review.id === "bom-review-pending-async");
  const asyncBomWorkbenchPendingDiffDraft = asyncBomWorkbenchPendingReview
    ? database.prepare(bomWorkbenchDraftSql).get({ draftId: asyncBomWorkbenchPendingReview.bom_draft_id })
    : undefined;
  const asyncBomWorkbenchPendingBaseSnapshot = asyncBomWorkbenchPendingDiffDraft
    ? database.prepare(bomWorkbenchLatestReleaseSnapshotSql).get({
        parentItemId: asyncBomWorkbenchPendingDiffDraft.parent_item_id,
        draftId: asyncBomWorkbenchPendingDiffDraft.id
      })
    : undefined;
  const asyncBomWorkbenchReviewBeforeReject = database.prepare(bomWorkbenchReviewSql).get({
    reviewId: "bom-review-pending-async"
  });
  const bomReviewRejectAt = "2026-06-08T06:01:00.000Z";
  database.prepare(rejectBomWorkbenchDraftSql).run({
    draftId: "bom-draft-pending",
    updatedBy: "user-manager-demo",
    updatedAt: bomReviewRejectAt
  });
  database.prepare(rejectBomWorkbenchReviewSql).run({
    reviewId: "bom-review-pending-async",
    reviewedBy: "user-manager-demo",
    decisionReason: "Needs BOM correction",
    reviewedAt: bomReviewRejectAt
  });
  database.prepare(insertBomWorkbenchEditEventSql).run({
    id: "bom-edit-reject-async",
    draftId: "bom-draft-pending",
    actorId: "user-manager-demo",
    eventType: "reject_review",
    beforeJson: JSON.stringify({ status: asyncBomWorkbenchPendingDiffDraft?.status, reviewId: "bom-review-pending-async" }),
    afterJson: JSON.stringify({ status: "Rejected" }),
    reason: "Needs BOM correction",
    createdAt: bomReviewRejectAt
  });
  database.prepare(insertBomWorkbenchAuditLogSql).run({
    id: "audit-bom-reject-async",
    submissionId: "sub-parent-a",
    actorId: "user-manager-demo",
    action: "BomWorkbenchReviewRejected",
    detailJson: JSON.stringify({ draftId: "bom-draft-pending", reviewId: "bom-review-pending-async", decisionReason: "Needs BOM correction" }),
    createdAt: bomReviewRejectAt
  });
  const asyncBomWorkbenchRejectedReview = database.prepare(bomWorkbenchReviewSql).get({
    reviewId: "bom-review-pending-async"
  });
  const asyncBomWorkbenchRejectedDraft = database.prepare(bomWorkbenchDraftSql).get({ draftId: "bom-draft-pending" });
  const asyncBomWorkbenchRejectionEvent = database
    .prepare("SELECT * FROM bom_edit_events WHERE id = ?")
    .get("bom-edit-reject-async");
  const asyncBomWorkbenchRejectionAudit = database
    .prepare("SELECT * FROM audit_logs WHERE id = ?")
    .get("audit-bom-reject-async");
  const asyncBomWorkbenchPendingConflictAfterReject = database.prepare(bomWorkbenchExistingPendingReviewSql).get({
    parentItemId: "item-parent-a",
    parentRevision: "A",
    draftId: "bom-draft-pending"
  });
  const bomReviewSubmitAt = "2026-06-08T06:03:00.000Z";
  database.prepare(submitBomWorkbenchDraftReviewSql).run({
    draftId: "bom-draft-pending",
    updatedBy: "user-engineer-demo",
    updatedAt: bomReviewSubmitAt
  });
  database.prepare(insertBomWorkbenchReviewSql).run({
    id: "bom-review-resubmitted-async",
    draftId: "bom-draft-pending",
    status: "PendingReview",
    lifecycleAction: "release",
    submittedBy: "user-engineer-demo",
    changeReason: "Resubmit after async rejection",
    submittedAt: bomReviewSubmitAt
  });
  database.prepare(insertBomWorkbenchEditEventSql).run({
    id: "bom-edit-submit-async",
    draftId: "bom-draft-pending",
    actorId: "user-engineer-demo",
    eventType: "submit_review",
    beforeJson: JSON.stringify({ status: "Rejected", reviewAttempt: 2 }),
    afterJson: JSON.stringify({ status: "PendingReview", reviewAttempt: 3, reviewId: "bom-review-resubmitted-async" }),
    reason: "Resubmit after async rejection",
    createdAt: bomReviewSubmitAt
  });
  database.prepare(insertBomWorkbenchAuditLogSql).run({
    id: "audit-bom-submit-async",
    submissionId: "sub-parent-a",
    actorId: "user-engineer-demo",
    action: "BomWorkbenchReviewSubmitted",
    detailJson: JSON.stringify({
      draftId: "bom-draft-pending",
      reviewId: "bom-review-resubmitted-async",
      changeReason: "Resubmit after async rejection"
    }),
    createdAt: bomReviewSubmitAt
  });
  const asyncBomWorkbenchSubmittedReview = database.prepare(bomWorkbenchReviewSql).get({
    reviewId: "bom-review-resubmitted-async"
  });
  const asyncBomWorkbenchSubmittedDraft = database.prepare(bomWorkbenchDraftSql).get({ draftId: "bom-draft-pending" });
  const asyncBomWorkbenchSubmitEvent = database
    .prepare("SELECT * FROM bom_edit_events WHERE id = ?")
    .get("bom-edit-submit-async");
  const asyncBomWorkbenchSubmitAudit = database
    .prepare("SELECT * FROM audit_logs WHERE id = ?")
    .get("audit-bom-submit-async");
  database.prepare(insertBomWorkbenchDraftSql).run({
    id: "bom-draft-released-base",
    parentItemId: "item-parent-a",
    parentSubmissionId: "sub-parent-a",
    parentRevision: "A",
    draftName: "Released base draft",
    status: "Released",
    source: "cad_reference",
    isActive: 0,
    lineCount: 3,
    reviewAttempt: 1,
    createdBy: "user-manager-demo",
    updatedBy: "user-manager-demo",
    createdAt: "2026-06-08T04:40:00.000Z",
    updatedAt: "2026-06-08T04:45:00.000Z"
  });
  database.prepare(insertBomWorkbenchDraftLineSql).run({
    id: "bom-approve-child",
    draftId: "bom-draft-pending",
    parentLineId: null,
    nodeType: "item",
    itemId: "item-child",
    partNumber: "PN-100",
    revision: "C",
    groupName: null,
    quantity: 2,
    sequenceNo: 1,
    source: "solidworks_xls",
    sourcePriority: 20,
    sourceRefId: "approve-row-1",
    sourceFilename: "approve-bom.xls",
    createdBy: "user-engineer-demo",
    updatedBy: "user-engineer-demo",
    createdAt: bomReviewSubmitAt,
    updatedAt: bomReviewSubmitAt
  });
  const bomReviewApproveAt = "2026-06-08T06:03:30.000Z";
  const bomReviewApproveSnapshotId = "bom-release-snapshot-approved-async";
  const asyncBomWorkbenchApproveItem = database.prepare(bomWorkbenchItemByPartNumberSql).get({ partNumber: "PN-100" });
  const asyncBomWorkbenchApproveChildSubmission = database.prepare(releaseGateSubmissionSql).get({
    itemId: asyncBomWorkbenchApproveItem.id,
    revision: "C"
  });
  const asyncBomWorkbenchApproveLatestReleased = database.prepare(latestReleasedRevisionSql).get({
    itemId: asyncBomWorkbenchApproveItem.id
  });
  const asyncBomWorkbenchApproveDraftBefore = database.prepare(bomWorkbenchDraftSql).get({ draftId: "bom-draft-pending" });
  const asyncBomWorkbenchApproveLinesBefore = database.prepare(bomWorkbenchDraftLinesSql).all({ draftId: "bom-draft-pending" });
  database.prepare(obsoleteBomReleaseSnapshotsSql).run({
    parentItemId: "item-parent-a",
    parentRevision: "A",
    obsoleteAt: bomReviewApproveAt,
    obsoleteBy: "user-manager-demo"
  });
  database.prepare(obsoleteBomReleasedDraftsSql).run({
    parentItemId: "item-parent-a",
    parentRevision: "A",
    snapshotId: bomReviewApproveSnapshotId,
    updatedBy: "user-manager-demo",
    updatedAt: bomReviewApproveAt
  });
  database.prepare(insertBomReleaseSnapshotSql).run({
    id: bomReviewApproveSnapshotId,
    draftId: "bom-draft-pending",
    parentItemId: "item-parent-a",
    parentSubmissionId: "sub-parent-a",
    parentRevision: "A",
    lineSnapshotJson: JSON.stringify(asyncBomWorkbenchApproveLinesBefore),
    lineCount: asyncBomWorkbenchApproveLinesBefore.length,
    releasedBy: "user-manager-demo",
    releasedAt: bomReviewApproveAt
  });
  database.prepare(releaseBomWorkbenchDraftSql).run({
    draftId: "bom-draft-pending",
    updatedBy: "user-manager-demo",
    updatedAt: bomReviewApproveAt
  });
  database.prepare(approveBomWorkbenchReviewSql).run({
    reviewId: "bom-review-resubmitted-async",
    reviewedBy: "user-manager-demo",
    decisionReason: "Approve async BOM release",
    reviewedAt: bomReviewApproveAt
  });
  database.prepare(insertBomWorkbenchEditEventSql).run({
    id: "bom-edit-approve-async",
    draftId: "bom-draft-pending",
    actorId: "user-manager-demo",
    eventType: "approve_release",
    beforeJson: JSON.stringify({ status: asyncBomWorkbenchApproveDraftBefore.status, reviewId: "bom-review-resubmitted-async" }),
    afterJson: JSON.stringify({ status: "Released", snapshotId: bomReviewApproveSnapshotId }),
    reason: "Approve async BOM release",
    createdAt: bomReviewApproveAt
  });
  database.prepare(insertBomWorkbenchAuditLogSql).run({
    id: "audit-bom-approve-async",
    submissionId: "sub-parent-a",
    actorId: "user-manager-demo",
    action: "BomWorkbenchReviewApproved",
    detailJson: JSON.stringify({
      draftId: "bom-draft-pending",
      reviewId: "bom-review-resubmitted-async",
      snapshotId: bomReviewApproveSnapshotId,
      decisionReason: "Approve async BOM release"
    }),
    createdAt: bomReviewApproveAt
  });
  const asyncBomWorkbenchApprovedReview = database.prepare(bomWorkbenchReviewSql).get({
    reviewId: "bom-review-resubmitted-async"
  });
  const asyncBomWorkbenchApprovedDraft = database.prepare(bomWorkbenchDraftSql).get({ draftId: "bom-draft-pending" });
  const asyncBomWorkbenchApprovedSnapshot = database.prepare(bomWorkbenchReleaseSnapshotSql).get({
    snapshotId: bomReviewApproveSnapshotId
  });
  const asyncBomWorkbenchObsoletedSnapshot = database.prepare(bomWorkbenchReleaseSnapshotSql).get({
    snapshotId: "bom-release-snapshot-base"
  });
  const asyncBomWorkbenchObsoletedDraft = database.prepare(bomWorkbenchDraftSql).get({ draftId: "bom-draft-released-base" });
  const asyncBomWorkbenchApproveEvent = database
    .prepare("SELECT * FROM bom_edit_events WHERE id = ?")
    .get("bom-edit-approve-async");
  const asyncBomWorkbenchApproveAudit = database
    .prepare("SELECT * FROM audit_logs WHERE id = ?")
    .get("audit-bom-approve-async");
  const bomDraftSaveAt = "2026-06-08T06:04:00.000Z";
  const asyncBomWorkbenchSaveBefore = database.prepare(bomWorkbenchDraftSql).get({ draftId: "bom-draft-old" });
  database.prepare(deleteBomWorkbenchDraftLinesSql).run({ draftId: "bom-draft-old" });
  const asyncBomWorkbenchSaveChildItem = database.prepare(bomWorkbenchItemByPartNumberSql).get({ partNumber: "PN-100" });
  database.prepare(insertBomWorkbenchDraftLineSql).run({
    id: "bom-save-group",
    draftId: "bom-draft-old",
    parentLineId: null,
    nodeType: "group",
    itemId: null,
    partNumber: null,
    revision: null,
    groupName: "Manual group",
    quantity: null,
    sequenceNo: 1,
    source: "manual",
    sourcePriority: 30,
    sourceRefId: null,
    sourceFilename: null,
    createdBy: "user-engineer-demo",
    updatedBy: "user-engineer-demo",
    createdAt: bomDraftSaveAt,
    updatedAt: bomDraftSaveAt
  });
  database.prepare(insertBomWorkbenchDraftLineSql).run({
    id: "bom-save-child",
    draftId: "bom-draft-old",
    parentLineId: "bom-save-group",
    nodeType: "item",
    itemId: asyncBomWorkbenchSaveChildItem?.id ?? null,
    partNumber: "PN-100",
    revision: "B",
    groupName: null,
    quantity: 4,
    sequenceNo: 1,
    source: "manual",
    sourcePriority: 30,
    sourceRefId: null,
    sourceFilename: null,
    createdBy: "user-engineer-demo",
    updatedBy: "user-engineer-demo",
    createdAt: bomDraftSaveAt,
    updatedAt: bomDraftSaveAt
  });
  database.prepare(updateBomWorkbenchDraftAfterSaveSql).run({
    draftId: "bom-draft-old",
    source: "manual",
    lineCount: 2,
    updatedBy: "user-engineer-demo",
    updatedAt: bomDraftSaveAt
  });
  database.prepare(insertBomWorkbenchEditEventSql).run({
    id: "bom-edit-save-async",
    draftId: "bom-draft-old",
    actorId: "user-engineer-demo",
    eventType: "save_tree",
    beforeJson: JSON.stringify({ lineCount: Number(asyncBomWorkbenchSaveBefore?.line_count ?? 0) }),
    afterJson: JSON.stringify({ lineCount: 2 }),
    reason: "Manual async save",
    createdAt: bomDraftSaveAt
  });
  database.prepare(insertBomWorkbenchAuditLogSql).run({
    id: "audit-bom-save-async",
    submissionId: "sub-parent-a",
    actorId: "user-engineer-demo",
    action: "BomWorkbenchDraftSaved",
    detailJson: JSON.stringify({
      draftId: "bom-draft-old",
      beforeLineCount: Number(asyncBomWorkbenchSaveBefore?.line_count ?? 0),
      afterLineCount: 2,
      reason: "Manual async save"
    }),
    createdAt: bomDraftSaveAt
  });
  const asyncBomWorkbenchSavedDraft = database.prepare(bomWorkbenchDraftSql).get({ draftId: "bom-draft-old" });
  const asyncBomWorkbenchSavedLines = database.prepare(bomWorkbenchDraftLinesSql).all({ draftId: "bom-draft-old" });
  const asyncBomWorkbenchSaveEvent = database
    .prepare("SELECT * FROM bom_edit_events WHERE id = ?")
    .get("bom-edit-save-async");
  const asyncBomWorkbenchSaveAudit = database
    .prepare("SELECT * FROM audit_logs WHERE id = ?")
    .get("audit-bom-save-async");
  const asyncBomWorkbenchMissingParent = database.prepare(bomWorkbenchParentSql).get({ submissionId: "missing-submission" });
  const asyncBomWorkbenchMissingDraft = database.prepare(bomWorkbenchDraftSql).get({ draftId: "missing-draft" });
  const bomActiveSwitchAt = "2026-06-08T06:05:00.000Z";
  database.prepare(deactivateBomWorkbenchActiveDraftsSql).run({
    parentItemId: "item-parent-a",
    parentRevision: "A",
    updatedAt: bomActiveSwitchAt
  });
  database.prepare(activateBomWorkbenchDraftSql).run({
    draftId: "bom-draft-old",
    updatedBy: "user-manager-demo",
    updatedAt: bomActiveSwitchAt
  });
  database.prepare(insertBomWorkbenchEditEventSql).run({
    id: "bom-edit-active-async",
    draftId: "bom-draft-old",
    actorId: "user-manager-demo",
    eventType: "set_active",
    beforeJson: JSON.stringify({ isActive: 0 }),
    afterJson: JSON.stringify({ isActive: 1 }),
    reason: "Set active BOM workbench draft",
    createdAt: bomActiveSwitchAt
  });
  database.prepare(insertBomWorkbenchAuditLogSql).run({
    id: "audit-bom-active-async",
    submissionId: "sub-parent-a",
    actorId: "user-manager-demo",
    action: "BomWorkbenchDraftActivated",
    detailJson: JSON.stringify({ draftId: "bom-draft-old", previousActive: 0 }),
    createdAt: bomActiveSwitchAt
  });
  const asyncBomWorkbenchAfterActiveSwitch = database.prepare(bomWorkbenchDraftsSql).all({ submissionId: "sub-parent-a" });
  const asyncBomWorkbenchActivatedDraft = database.prepare(bomWorkbenchDraftSql).get({ draftId: "bom-draft-old" });
  const asyncBomWorkbenchDeactivatedDraft = database.prepare(bomWorkbenchDraftSql).get({ draftId: "bom-draft-active" });
  const asyncBomWorkbenchActivationEvent = database
    .prepare("SELECT * FROM bom_edit_events WHERE id = ?")
    .get("bom-edit-active-async");
  const asyncBomWorkbenchActivationAudit = database
    .prepare("SELECT * FROM audit_logs WHERE id = ?")
    .get("audit-bom-active-async");

  record(
    "ACCESS-ASYNC-015 SQLite semantic role list returns system roles first",
    roles.length === 5 && roles[0].system_defined === 1 && roles[4].role_code === "custom_reviewer",
    JSON.stringify(roles)
  );
  record(
    "ACCESS-ASYNC-016 SQLite semantic user list returns three users",
    users.length === 3 &&
      users.some((user) => user.id === "user-admin-demo") &&
      users.some((user) => user.id === "user-engineer-demo") &&
      users.some((user) => user.id === "user-manager-demo"),
    JSON.stringify(users)
  );
  record(
    "ACCESS-ASYNC-017 SQLite semantic role lookup works and missing role is undefined",
    rdRole?.id === "role-rd" && missingRole === undefined,
    JSON.stringify({ rdRole, missingRole })
  );
  record(
    "ACCESS-ASYNC-018 SQLite semantic permission upsert updates existing row",
    permission?.id === "role-permission-fixture" && permission.allowed === 0,
    JSON.stringify(permission)
  );
  record(
    "ACCESS-ASYNC-019 SQLite semantic permission list is deterministic",
    permissions.length === 2 &&
      permissions[0].permission_kind === "action" &&
      permissions[0].permission_code === "numbering.create" &&
      permissions[1].permission_kind === "page",
    JSON.stringify(permissions)
  );
  record(
    "ACCESS-ASYNC-020 SQLite semantic assigned role lookup works",
    assignedRoles.length === 1 && assignedRoles[0].role_code === "custom_reviewer",
    JSON.stringify(assignedRoles)
  );
  record(
    "ACCESS-ASYNC-021 SQLite semantic active role priority lookup works",
    activePriority?.priority_json.includes("custom_reviewer"),
    JSON.stringify(activePriority)
  );
  record(
    "ACCESS-ASYNC-022 SQLite semantic active delegation lookup works",
    activeDelegations.length === 1 &&
      activeDelegations[0].delegated_from === "user-manager-demo" &&
      activeDelegations[0].action_code === "numbering.batch_decide",
    JSON.stringify(activeDelegations)
  );
  record(
    "ACCESS-ASYNC-023 SQLite semantic enabled role and permission-code lookups work",
    enabledRoles.length === 5 && matchingPermissionRows.length === 1 && matchingPermissionRows[0].role_code === "rd",
    JSON.stringify({ enabledRoles, matchingPermissionRows })
  );
  record(
    "AUTH-ASYNC-012 SQLite semantic user-by-id lookup works",
    userById?.id === "user-engineer-demo" && userById?.password_hash === undefined,
    JSON.stringify(userById)
  );
  record(
    "AUTH-ASYNC-013 SQLite semantic user-by-email lookup is case-insensitive",
    userByEmail?.id === "user-engineer-demo" && userByEmail?.password_hash === undefined,
    JSON.stringify(userByEmail)
  );
  record(
    "AUTH-ASYNC-014 SQLite semantic password lookup includes password hash",
    userWithPassword?.id === "user-engineer-demo" && userWithPassword?.password_hash === "hash-engineer",
    JSON.stringify(userWithPassword)
  );
  record(
    "AUTH-ASYNC-015 SQLite semantic user upsert updates by email",
    updatedUser?.id === "user-engineer-demo" &&
      updatedUser?.display_name === "Engineer Updated" &&
      updatedUser?.password_hash === "hash-engineer-updated",
    JSON.stringify(updatedUser)
  );
  record(
    "AUTH-ASYNC-016 SQLite semantic create and password update work",
    createdUser?.id === "user-created-async" &&
      createdUser?.role === "Procurement" &&
      createdUser?.password_hash === "hash-created-updated",
    JSON.stringify(createdUser)
  );
  record(
    "AUDIT-ASYNC-005 SQLite semantic audit insert works",
    auditLog?.actor_id === "user-engineer-demo" &&
      auditLog?.action === "Login" &&
      String(auditLog?.detail_json ?? "").includes("qc-async-audit"),
    JSON.stringify(auditLog)
  );
  record(
    "AI-CHAT-ASYNC-004 SQLite semantic conversation create/get works",
    asyncLlmConversation?.id === "llm-conversation-async" &&
      asyncLlmConversation?.user_id === "user-engineer-demo" &&
      asyncLlmConversation?.title === "Async chat fixture" &&
      asyncLlmConversation?.updated_at === "2026-06-08T01:03:00.000Z",
    JSON.stringify(asyncLlmConversation)
  );
  record(
    "AI-CHAT-ASYNC-005 SQLite semantic message insert updates conversation timestamp",
    asyncLlmMessages.length === 2 &&
      asyncLlmMessages[0].role === "user" &&
      asyncLlmMessages[0].content === "pending summary" &&
      asyncLlmMessages[1].role === "assistant" &&
      asyncLlmMessages[1].content === "assistant answer" &&
      asyncLlmConversationAfterMessages?.updated_at === "2026-06-08T01:05:00.000Z",
    JSON.stringify({ asyncLlmConversationAfterMessages, asyncLlmMessages })
  );
  record(
    "ITEM-INSIGHT-ASYNC-005 SQLite semantic revision history returns newest first and honors scope",
    allRevisions.length === 2 &&
      allRevisions[0].submission_id === "sub-child-b" &&
      allRevisions[1].submission_id === "sub-child-a" &&
      scopedRevisions.length === 1 &&
      scopedRevisions[0].submission_id === "sub-child-a",
    JSON.stringify({ allRevisions, scopedRevisions })
  );
  record(
    "ITEM-INSIGHT-ASYNC-006 SQLite semantic where-used is case-insensitive and honors scope",
    allWhereUsed.length === 2 &&
      allWhereUsed[0].parent_submission_id === "sub-parent-a" &&
      Number(allWhereUsed[0].child_is_outdated) === 1 &&
      Number(allWhereUsed[0].quantity) === 2 &&
      scopedWhereUsed.length === 1 &&
      scopedWhereUsed[0].parent_submission_id === "sub-parent-a",
    JSON.stringify({ allWhereUsed, scopedWhereUsed })
  );
  record(
    "DASHBOARD-METRICS-ASYNC-004 SQLite semantic metrics count all statuses",
    allDashboardMetrics.Pending === 1 &&
      allDashboardMetrics.Released === 4 &&
      allDashboardMetrics.Rejected === 1 &&
      allDashboardMetrics.ReleaseFailed === 1,
    JSON.stringify({ allDashboardCounts, allDashboardMetrics })
  );
  record(
    "DASHBOARD-METRICS-ASYNC-005 SQLite semantic metrics honor submittedBy scope",
    scopedDashboardMetrics.Pending === 1 &&
      scopedDashboardMetrics.Released === 2 &&
      scopedDashboardMetrics.Rejected === undefined &&
      scopedDashboardMetrics.ReleaseFailed === 1,
    JSON.stringify({ scopedDashboardCounts, scopedDashboardMetrics })
  );
  record(
    "NOTIFICATION-ASYNC-004 SQLite semantic notification queries cover status file package and lock alerts",
    managerReleaseFailedNotifications.some((row) => row.submission_id === "sub-dashboard-failed") &&
      managerPendingReviewNotifications.some((row) => row.submission_id === "sub-dashboard-pending" && Number(row.detail) === 1) &&
      managerUploadFailedNotifications.some((row) => row.id === "file-dashboard-failed-upload") &&
      managerMissingPackageNotifications.some((row) => row.submission_id === "sub-child-b") &&
      managerActiveLockNotifications.some((row) => row.id === "lock-dashboard"),
    JSON.stringify({
      managerReleaseFailedNotifications,
      managerPendingReviewNotifications,
      managerUploadFailedNotifications,
      managerMissingPackageNotifications,
      managerActiveLockNotifications
    })
  );
  record(
    "NOTIFICATION-ASYNC-005 SQLite semantic engineer notification scope is enforced",
    engineerReleaseFailedNotifications.every((row) => row.submitted_by === "user-engineer-demo") &&
      engineerPendingReviewNotifications.every((row) => row.submitted_by === "user-engineer-demo") &&
      engineerUploadFailedNotifications.every((row) => row.submitted_by === "user-engineer-demo") &&
      engineerMissingPackageNotifications.every((row) => row.submitted_by === "user-engineer-demo") &&
      engineerActiveLockNotifications.some((row) => row.id === "lock-dashboard") &&
      !engineerMissingPackageNotifications.some((row) => row.submission_id === "sub-child-b"),
    JSON.stringify({
      engineerReleaseFailedNotifications,
      engineerPendingReviewNotifications,
      engineerUploadFailedNotifications,
      engineerMissingPackageNotifications,
      engineerActiveLockNotifications
    })
  );
  record(
    "HANDOFF-ASYNC-004 SQLite semantic handoff returns latest released submission per item",
    allHandoffSubmissionIds.length === 3 &&
      allHandoffSubmissionIds[0].id === "sub-parent-b" &&
      allHandoffSubmissionIds[1].id === "sub-parent-a" &&
      allHandoffSubmissionIds[2].id === "sub-child-b" &&
      !allHandoffSubmissionIds.some((row) => row.id === "sub-child-a"),
    JSON.stringify(allHandoffSubmissionIds)
  );
  record(
    "HANDOFF-ASYNC-005 SQLite semantic handoff honors submittedBy scope and limit",
    scopedHandoffSubmissionIds.length === 1 &&
      scopedHandoffSubmissionIds[0].id === "sub-parent-a" &&
      limitedHandoffSubmissionIds.length === 2 &&
      limitedHandoffSubmissionIds[0].id === "sub-parent-b" &&
      limitedHandoffSubmissionIds[1].id === "sub-parent-a",
    JSON.stringify({ scopedHandoffSubmissionIds, limitedHandoffSubmissionIds })
  );
  record(
    "ITEM-LOCK-ASYNC-003 SQLite semantic preflight active lock lookup and expiry work",
    asyncActiveItemLockByPart?.id === "lock-dashboard" &&
      asyncActiveItemLockByPart?.locked_by_name === "Engineer Updated" &&
      asyncActiveItemLockByDrawing?.id === "lock-dashboard" &&
      asyncExpiredItemLock?.released_at === "2026-06-08T12:00:00.000Z" &&
      asyncExpiredItemLock?.updated_at === "2026-06-08T12:00:00.000Z",
    JSON.stringify({ asyncActiveItemLockByPart, asyncActiveItemLockByDrawing, asyncExpiredItemLock })
  );
  record(
    "ITEM-LOCK-ASYNC-004 SQLite semantic checkout create release and audits work",
    asyncCheckoutSubmissionItem?.item_id === "item-parent-a" &&
      !asyncCheckoutExistingBefore &&
      asyncCheckoutCreatedLock?.id === "lock-checkout-async" &&
      asyncCheckoutCreatedLock?.locked_by_name === "Engineer Updated" &&
      asyncCheckoutCreatedLock?.expires_at === "2026-06-08T13:05:00.000Z" &&
      asyncCheckoutReleasedLock?.released_at === "2026-06-08T12:10:00.000Z" &&
      asyncCheckoutReleasedLock?.updated_at === "2026-06-08T12:10:00.000Z" &&
      asyncCheckoutAudits.length === 2 &&
      asyncCheckoutAudits[0]?.action === "CheckoutLockCreated" &&
      asyncCheckoutAudits[1]?.action === "CheckoutLockReleased" &&
      asyncCheckoutAudits.every((audit) => audit.actor_id === "user-engineer-demo") &&
      asyncCheckoutAudits.every((audit) => audit.detail_json.includes("item-parent-a")),
    JSON.stringify({
      asyncCheckoutSubmissionItem,
      asyncCheckoutExistingBefore,
      asyncCheckoutCreatedLock,
      asyncCheckoutReleasedLock,
      asyncCheckoutAudits
    })
  );
  record(
    "SUBMISSION-LIST-ASYNC-004 SQLite semantic list returns newest first with aggregate flags",
    allSubmissionListRows.length === 7 &&
      allSubmissionListRows[0].id === "sub-dashboard-failed" &&
      allSubmissionListRows[1].id === "sub-dashboard-rejected" &&
      allSubmissionListRows[2].id === "sub-dashboard-pending" &&
      Number(allSubmissionListRows[2].file_count) === 3 &&
      String(allSubmissionListRows[2].file_roles ?? "").includes("pdf") &&
      String(allSubmissionListRows[2].file_roles ?? "").includes("dwg") &&
      Number(allSubmissionListRows[2].has_active_lock) === 1 &&
      Number(allSubmissionListRows.find((row) => row.id === "sub-parent-a")?.has_release_package ?? 0) === 1,
    JSON.stringify(allSubmissionListRows)
  );
  record(
    "SUBMISSION-LIST-ASYNC-005 SQLite semantic list honors status, submittedBy, limit, and offset",
    scopedPendingSubmissionListRows.length === 1 &&
      scopedPendingSubmissionListRows[0].id === "sub-dashboard-pending" &&
      pagedSubmissionListRows.length === 2 &&
      pagedSubmissionListRows[0].id === "sub-dashboard-rejected" &&
      pagedSubmissionListRows[1].id === "sub-dashboard-pending",
    JSON.stringify({ scopedPendingSubmissionListRows, pagedSubmissionListRows })
  );
  record(
    "SUBMISSION-SEARCH-ASYNC-004 SQLite semantic search finds file references and honors query",
    searchByQueryRows.length === 1 && searchByQueryRows[0].id === "sub-dashboard-pending",
    JSON.stringify(searchByQueryRows)
  );
  record(
    "SUBMISSION-SEARCH-ASYNC-005 SQLite semantic search honors status, submittedBy, and finder filters",
    scopedSearchFilterRows.length === 1 && scopedSearchFilterRows[0].id === "sub-dashboard-pending",
    JSON.stringify(scopedSearchFilterRows)
  );
  record(
    "SUBMISSION-SEARCH-ASYNC-006 SQLite semantic search honors child part and outdated BOM filters",
    childPartSearchRows.length === 2 &&
      childPartSearchRows[0].id === "sub-parent-b" &&
      childPartSearchRows[1].id === "sub-parent-a" &&
      outdatedBomSearchRows.length === 1 &&
      outdatedBomSearchRows[0].id === "sub-parent-a",
    JSON.stringify({ childPartSearchRows, outdatedBomSearchRows })
  );
  record(
    "SUBMISSION-DETAIL-ASYNC-004 SQLite semantic detail row includes release package, references, approvals, audit, and BOM",
    parentDetail?.id === "sub-parent-a" &&
      Number(parentDetail?.has_release_package) === 1 &&
      parentReferences.length === 1 &&
      parentApprovals.length === 1 &&
      parentApprovals[0].reviewer_name === "Manager User" &&
      parentAuditLogs.length === 1 &&
      parentAuditLogs[0].action === "DetailFixture" &&
      parentReleasePackage?.package_filename === "sub-parent-a.zip" &&
      parentBomHeader?.parent_part_number === "ASM-100" &&
      parentBomLines.length === 1 &&
      parentBomLines[0].child_submission_id === "sub-child-a" &&
      parentBomLines[0].child_latest_released_revision === "B",
    JSON.stringify({ parentDetail, parentReferences, parentApprovals, parentAuditLogs, parentReleasePackage, parentBomHeader, parentBomLines })
  );
  record(
    "SUBMISSION-DETAIL-ASYNC-005 SQLite semantic detail row includes files and active lock",
    dashboardDetail?.id === "sub-dashboard-pending" &&
      dashboardFiles.length === 3 &&
      dashboardFiles[0].original_filename === "pending.pdf" &&
      dashboardActiveLock?.id === "lock-dashboard" &&
      dashboardActiveLock?.locked_by_name === "Engineer Updated",
    JSON.stringify({ dashboardDetail, dashboardFiles, dashboardActiveLock })
  );
  record(
    "SUBMISSION-DETAIL-ASYNC-006 SQLite semantic missing detail returns undefined",
    database.prepare(submissionDetailSql).get({ id: "missing-submission" }) === undefined,
    "missing-submission"
  );
  database
    .prepare(
      `INSERT INTO submissions (
        id, item_id, drawing_number, revision, product_line, customer, project_code, process_name, machine, material,
        surface_finish, document_type, change_description, status, submitted_by, approval_required,
        created_at, updated_at, released_at
      ) VALUES (
        'sub-parent-a-v2', 'item-parent-a', 'DRW-ASM-100', 'B', 'PL-A', 'Customer A', 'P-100', 'Assembly', 'ASM-1',
        'SS400', 'Paint', 'Assembly', 'Parent async BOM v2 fixture', 'Released', 'user-engineer-demo', 1,
        '2026-06-08T07:30:00.000Z', '2026-06-08T07:30:00.000Z', '2026-06-08T08:30:00.000Z'
      )`
    )
    .run();
  database
    .prepare(
      `INSERT INTO bom_headers (id, parent_submission_id, parent_item_id, parent_revision, status, source, line_count, created_at, updated_at)
       VALUES ('bom-a-v2', 'sub-parent-a-v2', 'item-parent-a', 'B', 'ReleasedSnapshot', 'fixture', 1, '2026-06-08T08:30:00.000Z', '2026-06-08T08:30:00.000Z')`
    )
    .run();
  database
    .prepare(
      `INSERT INTO bom_lines (id, bom_header_id, line_no, child_part_number, child_revision, quantity, source_file_id, source_reference_id, source_filename)
       VALUES ('bom-line-a-v2-child', 'bom-a-v2', 1, 'PN-100', 'B', 3, NULL, NULL, 'asm-a-v2.sldasm')`
    )
    .run();
  const asyncBomHeader = database.prepare(bomHeaderSql).get({ submissionId: "sub-parent-a" });
  const asyncBomLines = asyncBomHeader ? database.prepare(bomLinesSql).all({ bomHeaderId: asyncBomHeader.id }) : [];
  const asyncPreviousBomRows = database.prepare(previousBomSubmissionsSql).all({ itemId: "item-parent-a" });
  database
    .prepare(
      `INSERT INTO file_references (
        id, submission_id, source_file_id, source_filename, source_file_role, referenced_filename, referenced_part_number,
        referenced_drawing_number, referenced_revision, reference_type, quantity, extraction_method, confidence, created_at
      ) VALUES (
        'ref-bom-async-materialize', 'sub-dashboard-rejected', NULL, 'dashboard-async.sldasm', 'sldasm',
        'pn-async-child.sldprt', 'PN-100', 'DRW-PN-100', 'B', 'assembly_component', 4, 'fixture', 'high',
        '2026-06-08T12:30:00.000Z'
      )`
    )
    .run();
  const asyncBomMaterializeSubmission = database.prepare(bomSubmissionSql).get({ submissionId: "sub-dashboard-rejected" });
  const asyncBomMaterializeRefs = database.prepare(assemblyFileReferencesSql).all({ submissionId: "sub-dashboard-rejected" });
  database.prepare(upsertBomHeaderSql).run({
    id: "bom-async-materialized",
    parentItemId: asyncBomMaterializeSubmission.item_id,
    parentSubmissionId: asyncBomMaterializeSubmission.id,
    parentRevision: asyncBomMaterializeSubmission.revision,
    status: "Draft",
    source: "cad_references",
    lineCount: asyncBomMaterializeRefs.length,
    now: "2026-06-08T12:31:00.000Z"
  });
  database.prepare(deleteBomLinesSql).run({ bomHeaderId: "bom-async-materialized" });
  for (const [index, reference] of asyncBomMaterializeRefs.entries()) {
    database.prepare(insertBomLineSql).run({
      id: `bom-async-materialized-line-${index + 1}`,
      bomHeaderId: "bom-async-materialized",
      lineNo: index + 1,
      childPartNumber: reference.referenced_part_number,
      childRevision: reference.referenced_revision,
      quantity: Number(reference.quantity),
      sourceFileId: reference.source_file_id,
      sourceReferenceId: reference.id,
      sourceFilename: reference.source_filename,
      createdAt: "2026-06-08T12:31:00.000Z"
    });
  }
  database.prepare(insertAuditSql).run({
    id: "audit-bom-materialized-async",
    submissionId: "sub-dashboard-rejected",
    actorId: null,
    action: "BomDraftMaterialized",
    detailJson: JSON.stringify({ source: "file_references", lineCount: asyncBomMaterializeRefs.length }),
    createdAt: "2026-06-08T12:31:00.000Z"
  });
  const asyncMaterializedBomHeader = database.prepare(bomHeaderSql).get({ submissionId: "sub-dashboard-rejected" });
  const asyncMaterializedBomLines = database.prepare(bomLinesSql).all({ bomHeaderId: "bom-async-materialized" });
  const asyncBomMaterializeAudit = database
    .prepare("SELECT action, detail_json FROM audit_logs WHERE id = ?")
    .get("audit-bom-materialized-async");
  record(
    "BOM-ASYNC-002 SQLite semantic BOM detail previous and materialize SQL work",
    asyncBomHeader?.id === "bom-a" &&
      asyncBomLines.length === 1 &&
      String(asyncBomLines[0].child_part_number).toUpperCase() === "PN-100" &&
      Number(asyncBomLines[0].quantity) === 2 &&
      asyncPreviousBomRows.length === 2 &&
      asyncPreviousBomRows[0].id === "sub-parent-a" &&
      asyncPreviousBomRows[1].id === "sub-parent-a-v2" &&
      asyncMaterializedBomHeader?.id === "bom-async-materialized" &&
      asyncMaterializedBomHeader?.source === "cad_references" &&
      Number(asyncMaterializedBomHeader?.line_count) === 1 &&
      asyncMaterializedBomLines.length === 1 &&
      asyncMaterializedBomLines[0].child_part_number === "PN-100" &&
      Number(asyncMaterializedBomLines[0].quantity) === 4 &&
      asyncBomMaterializeAudit?.action === "BomDraftMaterialized" &&
      String(asyncBomMaterializeAudit?.detail_json ?? "").includes('"lineCount":1'),
    JSON.stringify({
      asyncBomHeader,
      asyncBomLines,
      asyncPreviousBomRows,
      asyncMaterializedBomHeader,
      asyncMaterializedBomLines,
      asyncBomMaterializeAudit
    })
  );
  database
    .prepare(
      `INSERT INTO submission_files (id, submission_id, file_role, original_filename, local_path, gdrive_file_id, gdrive_status, sha256, file_size, created_at)
       VALUES ('file-sandbox-source-a', 'sub-parent-a', 'sldasm', 'sandbox-source-a.sldasm', '/tmp/sandbox-source-a.sldasm', NULL, 'none', 'sha-sandbox-source-a', 1200, '2026-06-08T12:40:00.000Z')`
    )
    .run();
  const asyncSandboxActiveBefore = database.prepare(activeSandboxBranchBySourceSql).get({ sourceSubmissionId: "sub-parent-a" });
  const asyncSandboxDuplicateBefore = database.prepare(duplicateSandboxBranchNameSql).get({
    sourceSubmissionId: "sub-parent-a",
    branchName: "Async sandbox branch"
  });
  database.prepare(insertSandboxSubmissionSql).run({
    id: "sub-sandbox-async",
    itemId: "item-parent-a",
    drawingNumber: "DRW-ASM-100",
    revision: "A-SBX-QC",
    productLine: "PL-A",
    customer: "Customer A",
    projectCode: "P-100",
    processName: "Assembly",
    machine: "ASM-1",
    material: "SS400",
    surfaceFinish: "Paint",
    documentType: "Assembly",
    changeDescription: "[Sandbox: Async sandbox branch] QC async branch",
    submittedBy: "user-engineer-demo",
    approvalRequired: 1,
    now: "2026-06-08T12:41:00.000Z"
  });
  database.prepare(insertSandboxFileSql).run({
    id: "file-sandbox-async-a",
    submissionId: "sub-sandbox-async",
    fileRole: "sldasm",
    originalFilename: "sandbox-source-a.sldasm",
    localPath: "/tmp/sandbox-source-a.sldasm",
    storageProvider: "local_repository",
    storageBucket: null,
    storageKey: null,
    sha256: "sha-sandbox-source-a",
    fileSize: 1200,
    createdAt: "2026-06-08T12:41:00.000Z"
  });
  database.prepare(insertSandboxFileReferenceSql).run({
    id: "ref-sandbox-async-child",
    submissionId: "sub-sandbox-async",
    sourceFileId: "file-sandbox-async-a",
    sourceFilename: "sandbox-source-a.sldasm",
    sourceFileRole: "sldasm",
    referencedFilename: "ref-child-a.sldprt",
    referencedPartNumber: "PN-100",
    referencedDrawingNumber: "DRW-PN-100",
    referencedRevision: "B",
    referenceType: "assembly_component",
    quantity: 5,
    extractionMethod: "fixture",
    confidence: "high",
    createdAt: "2026-06-08T12:41:00.000Z"
  });
  database.prepare(insertSandboxBranchSql).run({
    id: "sandbox-async-branch",
    sourceSubmissionId: "sub-parent-a",
    sandboxSubmissionId: "sub-sandbox-async",
    branchName: "Async sandbox branch",
    reason: "QC async branch",
    createdBy: "user-engineer-demo",
    createdAt: "2026-06-08T12:41:00.000Z",
    updatedAt: "2026-06-08T12:41:00.000Z"
  });
  const asyncSandboxSourceBranches = database.prepare(sandboxBranchesForSubmissionSql).all({ submissionId: "sub-parent-a" });
  const asyncSandboxBranch = database.prepare(sandboxBranchByIdSql).get({ branchId: "sandbox-async-branch" });
  const asyncSandboxActiveAfter = database.prepare(activeSandboxBranchBySourceSql).get({ sourceSubmissionId: "sub-parent-a" });
  const asyncSandboxDuplicateAfter = database.prepare(duplicateSandboxBranchNameSql).get({
    sourceSubmissionId: "sub-parent-a",
    branchName: "async sandbox branch"
  });
  database.prepare(closeSandboxBranchSql).run({
    branchId: "sandbox-async-branch",
    userId: "user-engineer-demo",
    now: "2026-06-08T12:42:00.000Z"
  });
  const asyncSandboxClosedBranch = database.prepare(sandboxBranchByIdSql).get({ branchId: "sandbox-async-branch" });
  database.prepare(insertSandboxSubmissionSql).run({
    id: "sub-sandbox-async-merge",
    itemId: "item-parent-a",
    drawingNumber: "DRW-ASM-100",
    revision: "A-SBX-MRG",
    productLine: "PL-A",
    customer: "Customer A",
    projectCode: "P-100",
    processName: "Assembly",
    machine: "ASM-1",
    material: "SS400",
    surfaceFinish: "Paint",
    documentType: "Assembly",
    changeDescription: "[Sandbox: Async merge branch] QC async merge",
    submittedBy: "user-engineer-demo",
    approvalRequired: 1,
    now: "2026-06-08T12:43:00.000Z"
  });
  database.prepare(insertSandboxBranchSql).run({
    id: "sandbox-async-merge",
    sourceSubmissionId: "sub-parent-a",
    sandboxSubmissionId: "sub-sandbox-async-merge",
    branchName: "Async merge branch",
    reason: "QC async merge",
    createdBy: "user-engineer-demo",
    createdAt: "2026-06-08T12:43:00.000Z",
    updatedAt: "2026-06-08T12:43:00.000Z"
  });
  database.prepare(mergeSandboxBranchSql).run({
    branchId: "sandbox-async-merge",
    userId: "user-engineer-demo",
    now: "2026-06-08T12:44:00.000Z",
    mergeSummaryJson: JSON.stringify({ change_count: 1, fixture: "sandbox-async" })
  });
  const asyncSandboxMergedBranch = database.prepare(sandboxBranchByIdSql).get({ branchId: "sandbox-async-merge" });
  const asyncDuplicateRoot = database.prepare(partRootByCodeSql).get({ rootCode: "ROOT-ASYNC-001" });
  const asyncDuplicatePart = database.prepare(partNumberByNumberSql).get({ partNumber: "PN-ASYNC-001" });
  const asyncDuplicateDrawing = database.prepare(drawingNumberByNumberSql).get({ drawingNumber: "DRW-ASYNC-001" });
  const asyncDuplicateRootCandidates = database.prepare(partRootsForDuplicateSimilaritySql).all({ limit: 200 });
  const asyncDuplicatePartCandidates = database.prepare(partNumbersForDuplicateSimilaritySql).all({ limit: 200 });
  database.prepare(insertNumberingWarningEventSql).run({
    id: "warning-numbering-duplicate-async",
    warningCode: "DUPLICATE_NUMBERING_BLOCKER",
    severity: "blocker",
    entityType: "part_number",
    entityId: "part-duplicate-async",
    title: "Duplicate numbering code",
    message: "An exact numbering code already exists and cannot be reused.",
    detailJson: JSON.stringify({ query: { partNumber: "PN-ASYNC-001" }, matches: [{ entityId: "part-duplicate-async" }] }),
    createdBy: "user-engineer-demo",
    createdAt: "2026-06-08T12:45:00.000Z"
  });
  database.prepare(insertDuplicateCheckEventSql).run({
    id: "duplicate-check-numbering-async",
    entityType: "part_number",
    queryJson: JSON.stringify({ partNumber: "PN-ASYNC-001" }),
    resultJson: JSON.stringify({ matches: [{ entityId: "part-duplicate-async" }], warningEventId: "warning-numbering-duplicate-async" }),
    blocked: 1,
    createdBy: "user-engineer-demo",
    createdAt: "2026-06-08T12:45:01.000Z"
  });
  database.prepare(insertNumberingAuditSql).run({
    id: "audit-numbering-duplicate-async",
    actorId: "user-engineer-demo",
    action: "numbering.duplicate_check",
    detailJson: JSON.stringify({ query: { partNumber: "PN-ASYNC-001" }, blocked: true, warningEventId: "warning-numbering-duplicate-async", matchCount: 1 }),
    createdAt: "2026-06-08T12:45:02.000Z"
  });
  const asyncDuplicateWarningEvent = database.prepare("SELECT * FROM warning_events WHERE id = ?").get("warning-numbering-duplicate-async");
  const asyncDuplicateCheckEvent = database.prepare("SELECT * FROM duplicate_check_events WHERE id = ?").get("duplicate-check-numbering-async");
  const asyncDuplicateAudit = database.prepare("SELECT * FROM audit_logs WHERE id = ?").get("audit-numbering-duplicate-async");
  record(
    "NUMBERING-DUPLICATE-ASYNC-002 SQLite semantic duplicate lookup event and audit SQL work",
    asyncDuplicateRoot?.id === "root-duplicate-async" &&
      asyncDuplicatePart?.id === "part-duplicate-async" &&
      asyncDuplicateDrawing?.id === "drawing-duplicate-async" &&
      asyncDuplicateRootCandidates.some((row) => row.id === "root-similar-async") &&
      asyncDuplicatePartCandidates.some((row) => row.id === "part-similar-async") &&
      asyncDuplicateWarningEvent?.severity === "blocker" &&
      asyncDuplicateWarningEvent?.entity_id === "part-duplicate-async" &&
      Number(asyncDuplicateCheckEvent?.blocked) === 1 &&
      String(asyncDuplicateCheckEvent?.result_json ?? "").includes("warning-numbering-duplicate-async") &&
      asyncDuplicateAudit?.action === "numbering.duplicate_check" &&
      String(asyncDuplicateAudit?.detail_json ?? "").includes('"matchCount":1'),
    JSON.stringify({
      asyncDuplicateRoot,
      asyncDuplicatePart,
      asyncDuplicateDrawing,
      asyncDuplicateRootCandidates,
      asyncDuplicatePartCandidates,
      asyncDuplicateWarningEvent,
      asyncDuplicateCheckEvent,
      asyncDuplicateAudit
    })
  );
  const asyncRootDetailRoot = database.prepare(partRootByCodeSql).get({ rootCode: "ROOT-ASYNC-001" });
  const asyncRootDetailParts = database.prepare(rootPartNumbersSql).all({ rootId: "root-duplicate-async" });
  const asyncRootDetailDrawings = database.prepare(rootDrawingNumbersSql).all({ rootId: "root-duplicate-async" });
  const asyncRootDetailLinks = database.prepare(numberingLinksForRootSql).all({ rootId: "root-duplicate-async" });
  const asyncRootDetailVariants = database.prepare(numberingVariantsForRootSql).all({ rootId: "root-duplicate-async" });
  const asyncRootDetailWarnings = database
    .prepare(
      `${numberingWarningsBaseSql}
       WHERE (entity_type = :entityType0 AND entity_id = :entityId0)
          OR (entity_type = :entityType1 AND entity_id = :entityId1)
       ORDER BY acknowledged_at IS NULL DESC, created_at DESC
       LIMIT 100`
    )
    .all({
      entityType0: "part_root",
      entityId0: "root-duplicate-async",
      entityType1: "part_number",
      entityId1: "part-duplicate-async"
    });
  const asyncRootDetailAuditTrail = database.prepare(numberingAuditTrailSql).all();
  const asyncRootDetailAuditMatches = asyncRootDetailAuditTrail.filter((row) =>
    String(row.detail_json ?? "").includes("PN-ASYNC-001") || String(row.detail_json ?? "").includes("ROOT-ASYNC-001")
  );
  record(
    "NUMBERING-ROOT-DETAIL-ASYNC-002 SQLite semantic root detail SQL returns parts drawings links variants warnings and audit",
    asyncRootDetailRoot?.id === "root-duplicate-async" &&
      asyncRootDetailParts.some((row) => row.id === "part-duplicate-async") &&
      asyncRootDetailDrawings.some((row) => row.id === "drawing-duplicate-async") &&
      asyncRootDetailLinks.some((row) => row.id === "link-numbering-root-detail-async" && row.link_type === "primary_manufacturing") &&
      asyncRootDetailVariants.some((row) => row.id === "variant-numbering-root-detail-async" && row.field_name === "material") &&
      asyncRootDetailWarnings.some((row) => row.id === "warning-numbering-duplicate-async" && row.severity === "blocker") &&
      asyncRootDetailAuditMatches.some((row) => row.id === "audit-numbering-duplicate-async"),
    JSON.stringify({
      asyncRootDetailRoot,
      asyncRootDetailParts,
      asyncRootDetailDrawings,
      asyncRootDetailLinks,
      asyncRootDetailVariants,
      asyncRootDetailWarnings,
      asyncRootDetailAuditMatches
    })
  );
  const asyncSearchRoots = database
    .prepare(
      `${numberingSearchRootsSql}
       WHERE (r.root_code LIKE :queryLike ESCAPE '\\' OR r.core_name LIKE :queryLike ESCAPE '\\')
         AND r.record_status = :recordStatus
       ORDER BY r.updated_at DESC, r.root_code ASC
       LIMIT :limit`
    )
    .all({ queryLike: "%Async Pump%", recordStatus: "Draft", limit: 10 });
  const asyncSearchParts = database
    .prepare(
      `${numberingSearchPartsSql}
       WHERE (p.part_number LIKE :queryLike ESCAPE '\\' OR p.part_name LIKE :queryLike ESCAPE '\\' OR r.root_code LIKE :queryLike ESCAPE '\\' OR r.core_name LIKE :queryLike ESCAPE '\\')
         AND p.record_status = :recordStatus
       ORDER BY p.updated_at DESC, p.part_number ASC
       LIMIT :limit`
    )
    .all({ queryLike: "%PN-ASYNC-001%", recordStatus: "Draft", limit: 10 });
  const asyncSearchDrawings = database
    .prepare(
      `${numberingSearchDrawingsSql}
       WHERE (d.drawing_number LIKE :queryLike ESCAPE '\\' OR d.purpose_description LIKE :queryLike ESCAPE '\\' OR r.root_code LIKE :queryLike ESCAPE '\\' OR r.core_name LIKE :queryLike ESCAPE '\\')
         AND d.record_status = :recordStatus
       ORDER BY d.updated_at DESC, d.drawing_number ASC
       LIMIT :limit`
    )
    .all({ queryLike: "%DRW-ASYNC-001%", recordStatus: "Draft", limit: 10 });
  record(
    "NUMBERING-SEARCH-ASYNC-002 SQLite semantic search SQL returns roots parts drawings and warning counts",
    asyncSearchRoots.some((row) => row.entity_type === "part_root" && row.entity_id === "root-duplicate-async" && row.primary_drawing_number === "DRW-ASYNC-001") &&
      asyncSearchParts.some(
        (row) =>
          row.entity_type === "part_number" &&
          row.entity_id === "part-duplicate-async" &&
          row.primary_drawing_number === "DRW-ASYNC-001" &&
          Number(row.warning_count) === 1
      ) &&
      asyncSearchDrawings.some(
        (row) =>
          row.entity_type === "drawing_number" &&
          row.entity_id === "drawing-duplicate-async" &&
          row.drawing_number === "DRW-ASYNC-001" &&
          Number(row.linked_part_count) === 1
      ),
    JSON.stringify({ asyncSearchRoots, asyncSearchParts, asyncSearchDrawings })
  );
  const asyncDrawingModuleRows = database
    .prepare(
      `${drawingModuleRecordsSql}
       WHERE (
         d.drawing_number LIKE :queryLike ESCAPE '\\'
         OR d.purpose_description LIKE :queryLike ESCAPE '\\'
         OR r.root_code LIKE :queryLike ESCAPE '\\'
         OR r.core_name LIKE :queryLike ESCAPE '\\'
         OR EXISTS (
           SELECT 1
           FROM drawing_part_links ql
           JOIN part_numbers qp ON qp.id = ql.part_number_id
           WHERE ql.drawing_number_id = d.id
             AND (qp.part_number LIKE :queryLike ESCAPE '\\' OR qp.part_name LIKE :queryLike ESCAPE '\\')
         )
       )
         AND d.record_status = :recordStatus
         AND d.purpose_code = :purposeCode
       ORDER BY d.updated_at DESC, d.drawing_number ASC
       LIMIT :limit`
    )
    .all({ queryLike: "%PN-ASYNC-001%", recordStatus: "Draft", purposeCode: "MA", limit: 10 });
  const asyncDrawingModuleLinkedPartNumbers = database
    .prepare(
      `${drawingModuleLinkedPartNumbersSql}
       WHERE l.drawing_number_id IN (:drawingId0)
       ORDER BY l.drawing_number_id ASC, p.part_number ASC`
    )
    .all({ drawingId0: "drawing-duplicate-async" });
  const asyncDrawingModuleLinkedParts = database
    .prepare(
      `${drawingModuleLinkedPartsByRootSql}
       WHERE p.part_root_id IN (:rootId0)
       ORDER BY p.part_root_id ASC, p.sequence_no ASC, p.part_number ASC`
    )
    .all({ rootId0: "root-duplicate-async" });
  record(
    "NUMBERING-DRAWING-MODULE-ASYNC-002 SQLite semantic drawing module SQL returns drawing linked parts variants and cost status",
    asyncDrawingModuleRows.some(
      (row) =>
        row.id === "drawing-duplicate-async" &&
        row.root_code === "ROOT-ASYNC-001" &&
        Number(row.linked_part_count) === 1 &&
        Number(row.warning_count) === 0
    ) &&
      asyncDrawingModuleLinkedPartNumbers.some(
        (row) => row.drawing_number_id === "drawing-duplicate-async" && row.part_number === "PN-ASYNC-001"
      ) &&
      asyncDrawingModuleLinkedParts.some(
        (row) =>
          row.id === "part-duplicate-async" &&
          row.material_code === "SUS304" &&
          row.primary_drawing_number === "DRW-ASYNC-001" &&
          row.standard_cost_id === "standard-cost-numbering-drawing-async" &&
          row.standard_profile_name === "Drawing module standard cost" &&
          row.standard_cost_type === "in_house"
    ),
    JSON.stringify({ asyncDrawingModuleRows, asyncDrawingModuleLinkedPartNumbers, asyncDrawingModuleLinkedParts })
  );
  const asyncPartModuleRows = database
    .prepare(
      `${partModuleRecordsSql}
       WHERE (p.part_number LIKE :queryLike OR p.part_name LIKE :queryLike OR r.root_code LIKE :queryLike OR r.core_name LIKE :queryLike OR va.material_label LIKE :queryLike OR va.color_label LIKE :queryLike)
         AND p.record_status = :recordStatus
       ORDER BY r.root_code ASC, p.sequence_no ASC, p.part_number ASC
       LIMIT :limit`
    )
    .all({ queryLike: "%PN-ASYNC-001%", recordStatus: "Draft", limit: 10 });
  record(
    "NUMBERING-PART-MODULE-ASYNC-002 SQLite semantic part module SQL returns variant drawing and standard cost fields",
    asyncPartModuleRows.some(
      (row) =>
        row.id === "part-duplicate-async" &&
        row.root_code === "ROOT-ASYNC-001" &&
        row.primary_drawing_number === "DRW-ASYNC-001" &&
        Number(row.drawing_count) === 1 &&
        Number(row.pending_cost_request_count) === 1 &&
        row.variant_id === "variant-attr-numbering-drawing-async" &&
        row.material_code === "SUS304" &&
        row.standard_cost_id === "standard-cost-numbering-drawing-async" &&
        row.standard_profile_name === "Drawing module standard cost" &&
        row.standard_cost_type === "in_house" &&
        Number(row.standard_unit_cost) === 42.5
    ),
    JSON.stringify({ asyncPartModuleRows })
  );
  const asyncPartDetailRow = database
    .prepare(`${partModuleRecordsSql} WHERE p.part_number = :partNumber LIMIT 1`)
    .get({ partNumber: "PN-ASYNC-001" });
  const asyncPartDetailLinkedDrawings = database
    .prepare(partDetailLinkedDrawingsSql)
    .all({ partNumberId: "part-duplicate-async" });
  const asyncPartDetailVariants = database
    .prepare(partDetailSameDrawingVariantsSql)
    .all({ partNumberId: "part-duplicate-async" });
  const asyncPartDetailCostProfiles = database
    .prepare(partDetailCostProfilesSql)
    .all({ partNumberId: "part-duplicate-async" });
  const asyncPartDetailCostTiers = database
    .prepare(partDetailCostTiersBaseSql.replace("__PROFILE_ID_FILTER__", ":profileId0"))
    .all({ profileId0: "cost-profile-numbering-drawing-async" });
  const asyncPartDetailCostChanges = database
    .prepare(partDetailCostChangeRequestsSql)
    .all({ partNumberId: "part-duplicate-async" });
  record(
    "NUMBERING-PART-MODULE-ASYNC-003 SQLite semantic part detail SQL returns linked drawings variants costs and changes",
    asyncPartDetailRow?.id === "part-duplicate-async" &&
      asyncPartDetailLinkedDrawings.some(
        (row) => row.drawing_number === "DRW-ASYNC-001" && row.link_type === "primary_manufacturing"
      ) &&
      asyncPartDetailVariants.some(
        (row) => row.drawing_number === "DRW-ASYNC-001" && row.field_name === "material" && row.field_value === "SUS304"
      ) &&
      asyncPartDetailCostProfiles.some(
        (row) =>
          row.id === "cost-profile-numbering-drawing-async" &&
          row.profile_name === "Drawing module standard cost" &&
          row.status === "approved"
      ) &&
      asyncPartDetailCostTiers.some(
        (row) => row.cost_profile_id === "cost-profile-numbering-drawing-async" && Number(row.unit_cost) === 42.5
      ) &&
      asyncPartDetailCostChanges.some(
        (row) =>
          row.id === "cost-change-numbering-part-list-async" &&
          row.request_type === "set_standard" &&
          row.review_status === "pending"
      ),
    JSON.stringify({
      asyncPartDetailRow,
      asyncPartDetailLinkedDrawings,
      asyncPartDetailVariants,
      asyncPartDetailCostProfiles,
      asyncPartDetailCostTiers,
      asyncPartDetailCostChanges
    })
  );
  database.prepare(updatePartVariantAttributesSql).run({
    id: "variant-attr-numbering-drawing-async",
    materialCode: "SUS316",
    materialLabel: "Stainless 316",
    colorCode: "BLK",
    colorLabel: "Black",
    surfaceTreatment: "Anodized",
    variantNote: "Updated through async variant SQL",
    updatedBy: "user-engineer-demo",
    updatedAt: "2026-06-08T12:45:00.000Z"
  });
  database.prepare(insertPartVariantAttributesSql).run({
    id: "variant-attr-numbering-part-async-insert",
    partNumberId: "part-similar-async",
    materialCode: "AL6061",
    materialLabel: "Aluminum 6061",
    colorCode: null,
    colorLabel: null,
    surfaceTreatment: "Clear anodized",
    variantNote: "Inserted through async variant SQL",
    updatedBy: "user-engineer-demo",
    createdAt: "2026-06-08T12:45:01.000Z",
    updatedAt: "2026-06-08T12:45:01.000Z"
  });
  database.prepare(insertNumberingAuditSql).run({
    id: "audit-numbering-part-variant-async",
    actorId: "user-engineer-demo",
    action: "numbering.part_variant.upsert",
    detailJson: JSON.stringify({
      partNumber: "PN-ASYNC-001",
      materialCode: "SUS316",
      materialLabel: "Stainless 316",
      colorCode: "BLK",
      colorLabel: "Black",
      surfaceTreatment: "Anodized",
      variantNote: "Updated through async variant SQL"
    }),
    createdAt: "2026-06-08T12:45:02.000Z"
  });
  const asyncPartVariantUpdated = database
    .prepare(partVariantAttributesByPartIdSql)
    .get({ partNumberId: "part-duplicate-async" });
  const asyncPartVariantInserted = database
    .prepare(partVariantAttributesByPartIdSql)
    .get({ partNumberId: "part-similar-async" });
  const asyncPartVariantDetailRow = database
    .prepare(`${partModuleRecordsSql} WHERE p.part_number = :partNumber LIMIT 1`)
    .get({ partNumber: "PN-ASYNC-001" });
  const asyncPartVariantAudit = database
    .prepare("SELECT action, actor_id, detail_json FROM audit_logs WHERE id = ?")
    .get("audit-numbering-part-variant-async");
  record(
    "NUMBERING-PART-VARIANT-ASYNC-001 SQLite semantic part variant upsert SQL updates inserts and audits",
    asyncPartVariantUpdated?.material_code === "SUS316" &&
      asyncPartVariantUpdated?.material_label === "Stainless 316" &&
      asyncPartVariantUpdated?.color_code === "BLK" &&
      asyncPartVariantUpdated?.surface_treatment === "Anodized" &&
      asyncPartVariantInserted?.material_code === "AL6061" &&
      asyncPartVariantInserted?.surface_treatment === "Clear anodized" &&
      asyncPartVariantDetailRow?.variant_id === "variant-attr-numbering-drawing-async" &&
      asyncPartVariantDetailRow?.material_code === "SUS316" &&
      asyncPartVariantAudit?.action === "numbering.part_variant.upsert" &&
      asyncPartVariantAudit?.actor_id === "user-engineer-demo" &&
      asyncPartVariantAudit?.detail_json.includes("PN-ASYNC-001"),
    JSON.stringify({ asyncPartVariantUpdated, asyncPartVariantInserted, asyncPartVariantDetailRow, asyncPartVariantAudit })
  );
  database.prepare(insertPartCostProfileSql).run({
    id: "cost-profile-numbering-part-create-async",
    partNumberId: "part-similar-async",
    costType: "purchase",
    profileName: "Async created purchase cost",
    currency: "TWD",
    uom: "pcs",
    supplierName: "Async Supplier",
    processName: null,
    costBasis: "QC semantic fixture",
    status: "pending_review",
    effectiveFrom: "2026-06-08T00:00:00.000Z",
    effectiveTo: null,
    createdBy: "user-engineer-demo",
    createdAt: "2026-06-08T12:46:00.000Z",
    updatedAt: "2026-06-08T12:46:00.000Z"
  });
  database.prepare(insertPartCostTierSql).run({
    id: "cost-tier-numbering-part-create-async",
    costProfileId: "cost-profile-numbering-part-create-async",
    minQty: 1,
    maxQty: 20,
    unitCost: 66.6,
    setupCost: 4,
    leadTimeDays: 9,
    note: "Async create tier",
    createdAt: "2026-06-08T12:46:01.000Z",
    updatedAt: "2026-06-08T12:46:01.000Z"
  });
  database.prepare(insertPartCostChangeRequestSql).run({
    id: "cost-change-numbering-part-create-async",
    partNumberId: "part-similar-async",
    proposedCostProfileId: "cost-profile-numbering-part-create-async",
    changeReason: "Part cost profile created for standard cost review",
    requestedBy: "user-engineer-demo",
    requestedAt: "2026-06-08T12:46:02.000Z"
  });
  database.prepare(insertNumberingAuditSql).run({
    id: "audit-numbering-part-cost-profile-create-async",
    actorId: "user-engineer-demo",
    action: "numbering.part_cost_profile.create",
    detailJson: JSON.stringify({
      partNumber: "PN-ASYNC-002",
      costProfileId: "cost-profile-numbering-part-create-async",
      status: "pending_review",
      tierCount: 1
    }),
    createdAt: "2026-06-08T12:46:03.000Z"
  });
  const asyncPartCostProfiles = database
    .prepare(partDetailCostProfilesSql)
    .all({ partNumberId: "part-similar-async" });
  const asyncPartCostTiers = database
    .prepare(partDetailCostTiersBaseSql.replace("__PROFILE_ID_FILTER__", ":profileId0"))
    .all({ profileId0: "cost-profile-numbering-part-create-async" });
  const asyncPartCostChanges = database
    .prepare(partDetailCostChangeRequestsSql)
    .all({ partNumberId: "part-similar-async" });
  const asyncPartCostAudit = database
    .prepare("SELECT action, actor_id, detail_json FROM audit_logs WHERE id = ?")
    .get("audit-numbering-part-cost-profile-create-async");
  record(
    "NUMBERING-PART-COST-PROFILE-ASYNC-001 SQLite semantic part cost profile create SQL inserts profile tier change request and audit",
    asyncPartCostProfiles.some(
      (row) =>
        row.id === "cost-profile-numbering-part-create-async" &&
        row.cost_type === "purchase" &&
        row.profile_name === "Async created purchase cost" &&
        row.status === "pending_review"
    ) &&
      asyncPartCostTiers.some(
        (row) =>
          row.id === "cost-tier-numbering-part-create-async" &&
          row.cost_profile_id === "cost-profile-numbering-part-create-async" &&
          Number(row.unit_cost) === 66.6
      ) &&
      asyncPartCostChanges.some(
        (row) =>
          row.id === "cost-change-numbering-part-create-async" &&
          row.proposed_cost_profile_id === "cost-profile-numbering-part-create-async" &&
          row.request_type === "set_standard" &&
          row.review_status === "pending"
      ) &&
      asyncPartCostAudit?.action === "numbering.part_cost_profile.create" &&
      asyncPartCostAudit?.actor_id === "user-engineer-demo" &&
      asyncPartCostAudit?.detail_json.includes("cost-profile-numbering-part-create-async"),
    JSON.stringify({ asyncPartCostProfiles, asyncPartCostTiers, asyncPartCostChanges, asyncPartCostAudit })
  );
  const asyncCostChangeBeforeDecision = database
    .prepare(selectPartCostChangeRequestByIdSql)
    .get({ requestId: "cost-change-numbering-part-create-async" });
  const asyncCostProfileBeforeDecision = database
    .prepare(selectPartCostProfileByIdSql)
    .get({ profileId: "cost-profile-numbering-part-create-async" });
  database.prepare(updatePartCostChangeRequestDecisionSql).run({
    reviewStatus: "approved",
    reviewedBy: "user-admin-demo",
    reviewedAt: "2026-06-08T12:47:00.000Z",
    reviewComment: "Approved for async standard cost",
    requestId: "cost-change-numbering-part-create-async"
  });
  database.prepare(updatePartCostProfileApprovedSql).run({
    profileId: "cost-profile-numbering-part-create-async",
    approvedBy: "user-admin-demo",
    updatedAt: "2026-06-08T12:47:00.000Z"
  });
  database.prepare(updateActivePartStandardCostEndSql).run({
    effectiveTo: "2026-06-08T12:47:00.000Z",
    updatedAt: "2026-06-08T12:47:00.000Z",
    partNumberId: "part-similar-async"
  });
  database.prepare(insertPartStandardCostSql).run({
    id: "standard-cost-numbering-part-approve-async",
    partNumberId: "part-similar-async",
    costProfileId: "cost-profile-numbering-part-create-async",
    basisQty: 1,
    standardReason: "Approved for async standard cost",
    selectedBy: "user-admin-demo",
    approvedBy: "user-admin-demo",
    effectiveFrom: "2026-06-08T12:47:00.000Z",
    createdAt: "2026-06-08T12:47:00.000Z",
    updatedAt: "2026-06-08T12:47:00.000Z"
  });
  database.prepare(insertNumberingAuditSql).run({
    id: "audit-numbering-part-cost-change-approve-async",
    actorId: "user-admin-demo",
    action: "numbering.part_cost_change.approve",
    detailJson: JSON.stringify({
      partNumber: "PN-ASYNC-002",
      requestId: "cost-change-numbering-part-create-async",
      costProfileId: "cost-profile-numbering-part-create-async",
      requestType: "set_standard"
    }),
    createdAt: "2026-06-08T12:47:00.000Z"
  });
  database.prepare(insertPartCostProfileSql).run({
    id: "cost-profile-numbering-part-reject-async",
    partNumberId: "part-similar-async",
    costType: "purchase",
    profileName: "Async rejected purchase cost",
    currency: "TWD",
    uom: "pcs",
    supplierName: null,
    processName: null,
    costBasis: "Async reject semantic",
    status: "pending_review",
    effectiveFrom: "2026-06-08T00:00:00.000Z",
    effectiveTo: null,
    createdBy: "user-engineer-demo",
    createdAt: "2026-06-08T12:48:00.000Z",
    updatedAt: "2026-06-08T12:48:00.000Z"
  });
  database.prepare(insertPartCostChangeRequestSql).run({
    id: "cost-change-numbering-part-reject-async",
    partNumberId: "part-similar-async",
    proposedCostProfileId: "cost-profile-numbering-part-reject-async",
    changeReason: "Reject semantic request",
    requestedBy: "user-engineer-demo",
    requestedAt: "2026-06-08T12:48:01.000Z"
  });
  database.prepare(updatePartCostChangeRequestDecisionSql).run({
    reviewStatus: "rejected",
    reviewedBy: "user-admin-demo",
    reviewedAt: "2026-06-08T12:49:00.000Z",
    reviewComment: "Rejected by async semantic",
    requestId: "cost-change-numbering-part-reject-async"
  });
  database.prepare(updatePartCostProfileRejectedSql).run({
    profileId: "cost-profile-numbering-part-reject-async",
    updatedAt: "2026-06-08T12:49:00.000Z"
  });
  database.prepare(insertNumberingAuditSql).run({
    id: "audit-numbering-part-cost-change-reject-async",
    actorId: "user-admin-demo",
    action: "numbering.part_cost_change.reject",
    detailJson: JSON.stringify({
      partNumber: "PN-ASYNC-002",
      requestId: "cost-change-numbering-part-reject-async",
      costProfileId: "cost-profile-numbering-part-reject-async",
      reviewComment: "Rejected by async semantic"
    }),
    createdAt: "2026-06-08T12:49:00.000Z"
  });
  const asyncCostChangeAfterApprove = database
    .prepare(selectPartCostChangeRequestByIdSql)
    .get({ requestId: "cost-change-numbering-part-create-async" });
  const asyncCostProfileAfterApprove = database
    .prepare(selectPartCostProfileByIdSql)
    .get({ profileId: "cost-profile-numbering-part-create-async" });
  const asyncStandardCostAfterApprove = database
    .prepare("SELECT * FROM part_standard_costs WHERE id = ?")
    .get("standard-cost-numbering-part-approve-async");
  const asyncCostChangeAfterReject = database
    .prepare(selectPartCostChangeRequestByIdSql)
    .get({ requestId: "cost-change-numbering-part-reject-async" });
  const asyncCostProfileAfterReject = database
    .prepare(selectPartCostProfileByIdSql)
    .get({ profileId: "cost-profile-numbering-part-reject-async" });
  const asyncCostDecisionAudits = database
    .prepare("SELECT action, actor_id, detail_json FROM audit_logs WHERE id IN (?, ?) ORDER BY action")
    .all("audit-numbering-part-cost-change-approve-async", "audit-numbering-part-cost-change-reject-async");
  record(
    "NUMBERING-PART-COST-CHANGE-ASYNC-001 SQLite semantic cost change decision SQL approves standards and rejects pending profiles",
    asyncCostChangeBeforeDecision?.review_status === "pending" &&
      asyncCostProfileBeforeDecision?.status === "pending_review" &&
      asyncCostChangeAfterApprove?.review_status === "approved" &&
      asyncCostChangeAfterApprove?.reviewed_by === "user-admin-demo" &&
      asyncCostProfileAfterApprove?.status === "approved" &&
      asyncCostProfileAfterApprove?.approved_by === "user-admin-demo" &&
      asyncStandardCostAfterApprove?.part_number_id === "part-similar-async" &&
      asyncStandardCostAfterApprove?.cost_profile_id === "cost-profile-numbering-part-create-async" &&
      Number(asyncStandardCostAfterApprove?.basis_qty) === 1 &&
      asyncCostChangeAfterReject?.review_status === "rejected" &&
      asyncCostProfileAfterReject?.status === "rejected" &&
      asyncCostDecisionAudits.some((row) => row.action === "numbering.part_cost_change.approve" && row.actor_id === "user-admin-demo") &&
      asyncCostDecisionAudits.some((row) => row.action === "numbering.part_cost_change.reject" && row.actor_id === "user-admin-demo"),
    JSON.stringify({
      asyncCostChangeBeforeDecision,
      asyncCostProfileBeforeDecision,
      asyncCostChangeAfterApprove,
      asyncCostProfileAfterApprove,
      asyncStandardCostAfterApprove,
      asyncCostChangeAfterReject,
      asyncCostProfileAfterReject,
      asyncCostDecisionAudits
    })
  );
  const asyncStandardResolutionProfile = database.prepare(selectApprovedStandardPartCostProfileSql).get({
    partNumberId: "part-similar-async",
    asOf: "2026-06-08T12:47:30.000Z"
  });
  const asyncTypedResolutionProfile = database.prepare(selectApprovedPartCostProfileByTypeSql).get({
    partNumberId: "part-similar-async",
    costType: "purchase",
    asOf: "2026-06-08T12:47:30.000Z"
  });
  const asyncResolutionTierRows = database
    .prepare(partDetailCostTiersBaseSql.replace("__PROFILE_ID_FILTER__", ":profileId"))
    .all({ profileId: "cost-profile-numbering-part-create-async" });
  const asyncResolutionTier = asyncResolutionTierRows.find(
    (row) => Number(row.min_qty) <= 1 && (row.max_qty === null || Number(row.max_qty) >= 1)
  );
  const asyncResolutionQuantity = 3;
  const asyncResolutionExtendedCost = asyncResolutionTier ? Number(asyncResolutionTier.unit_cost) * asyncResolutionQuantity + Number(asyncResolutionTier.setup_cost) : null;
  record(
    "NUMBERING-PART-COST-RESOLUTION-ASYNC-001 SQLite semantic cost resolution SQL finds standard and typed approved profile tiers",
      asyncStandardResolutionProfile?.id === "cost-profile-numbering-part-create-async" &&
      asyncTypedResolutionProfile?.id === "cost-profile-numbering-part-create-async" &&
      asyncResolutionTier?.id === "cost-tier-numbering-part-create-async" &&
      Number(asyncResolutionTier.unit_cost) === 66.6 &&
      Math.abs((asyncResolutionExtendedCost ?? 0) - 203.8) < 0.000001,
    JSON.stringify({
      asyncStandardResolutionProfile,
      asyncTypedResolutionProfile,
      asyncResolutionTierRows,
      asyncResolutionExtendedCost
    })
  );
  const asyncTaskBeforeUpdate = database.prepare(numberingTaskByIdSql).get({ taskId: "task-numbering-async" });
  database.prepare(updateNumberingTaskStatusSql).run({
    taskId: "task-numbering-async",
    status: "handled",
    handledBy: "user-engineer-demo",
    handledAt: "2026-06-08T12:46:00.000Z",
    updatedAt: "2026-06-08T12:46:00.000Z"
  });
  const asyncTaskAfterHandled = database.prepare(numberingTaskByIdSql).get({ taskId: "task-numbering-async" });
  const asyncTaskHandledRaw = database.prepare("SELECT handled_by, handled_at FROM numbering_task_items WHERE id = ?").get("task-numbering-async");
  database.prepare(updateNumberingTaskStatusSql).run({
    taskId: "task-numbering-async",
    status: "cancelled",
    handledBy: null,
    handledAt: null,
    updatedAt: "2026-06-08T12:47:00.000Z"
  });
  const asyncTaskAfterCancelled = database.prepare(numberingTaskByIdSql).get({ taskId: "task-numbering-async" });
  const asyncTaskCancelledRaw = database.prepare("SELECT handled_by, handled_at FROM numbering_task_items WHERE id = ?").get("task-numbering-async");
  record(
    "NUMBERING-TASK-ASYNC-001 SQLite semantic task status update SQL works",
    asyncTaskBeforeUpdate?.task_status === "open" &&
      asyncTaskAfterHandled?.task_status === "handled" &&
      asyncTaskHandledRaw?.handled_by === "user-engineer-demo" &&
      asyncTaskAfterHandled?.handled_at === "2026-06-08T12:46:00.000Z" &&
      asyncTaskAfterCancelled?.task_status === "cancelled" &&
      asyncTaskCancelledRaw?.handled_by === null &&
      asyncTaskAfterCancelled?.handled_at === null,
    JSON.stringify({ asyncTaskBeforeUpdate, asyncTaskAfterHandled, asyncTaskHandledRaw, asyncTaskAfterCancelled, asyncTaskCancelledRaw })
  );
  const asyncNumberingAssignedRoles = database.prepare(numberingAssignedRoleCodesSql).all({
    userId: "user-engineer-demo",
    now: "2026-06-08T12:48:00.000Z"
  });
  const asyncNumberingRoleScopes = database.prepare(numberingAllowedRoleScopesSql).all();
  const asyncNumberingDelegations = database.prepare(numberingActiveDelegationsSql).all({
    userId: "user-engineer-demo",
    now: "2026-06-08T12:48:00.000Z"
  });
  database.prepare(updateNumberingTaskStatusSql).run({
    taskId: "task-numbering-async",
    status: "open",
    handledBy: null,
    handledAt: null,
    updatedAt: "2026-06-08T12:48:30.000Z"
  });
  const asyncNumberingTaskListRows = database
    .prepare(
      `
      ${numberingTasksBaseSql}
      WHERE task_status = :status
        AND (assigned_to = :userId OR created_by = :userId OR assigned_role IN (:role0, :role1))
      ORDER BY
        CASE risk_level WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT :limit
    `
    )
    .all({
      status: "open",
      userId: "user-engineer-demo",
      role0: "rd",
      role1: "custom_reviewer",
      limit: 500
    });
  record(
    "NUMBERING-TASK-ASYNC-002 SQLite semantic task list role scope SQL works",
    asyncNumberingAssignedRoles.some((row) => row.role_code === "custom_reviewer") &&
      asyncNumberingRoleScopes.some((row) => row.role_code === "rd" && row.scope_kind === "project" && row.scope_code === "P-100") &&
      asyncNumberingRoleScopes.some((row) => row.role_code === "rd" && row.scope_kind === "action" && row.scope_code === "release_missing_ma_confirm") &&
      asyncNumberingDelegations.some((row) => row.delegated_from === "user-manager-demo" && row.delegated_from_role === "R&D Manager") &&
      asyncNumberingTaskListRows.some((row) => row.id === "task-numbering-async" && row.task_status === "open"),
    JSON.stringify({ asyncNumberingAssignedRoles, asyncNumberingRoleScopes, asyncNumberingDelegations, asyncNumberingTaskListRows })
  );
  const asyncNumberingNotificationUnreadRows = database
    .prepare(
      `
      ${numberingNotificationsBaseSql}
      WHERE read_at IS NULL
        AND handled_at IS NULL
        AND (recipient_id = :userId OR created_by = :userId OR recipient_role IN (:role0, :role1))
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT :limit
    `
    )
    .all({
      userId: "user-engineer-demo",
      role0: "rd",
      role1: "custom_reviewer",
      limit: 500
    });
  const asyncNotificationBeforeUpdate = database.prepare(numberingNotificationByIdSql).get({ notificationId: "notification-numbering-async" });
  database.prepare(updateNumberingNotificationStateSql).run({
    notificationId: "notification-numbering-async",
    markRead: 1,
    markHandled: 0,
    handledBy: "user-engineer-demo",
    now: "2026-06-08T12:49:00.000Z"
  });
  const asyncNotificationAfterRead = database.prepare(numberingNotificationByIdSql).get({ notificationId: "notification-numbering-async" });
  database.prepare(updateNumberingNotificationStateSql).run({
    notificationId: "notification-numbering-async",
    markRead: 1,
    markHandled: 1,
    handledBy: "user-engineer-demo",
    now: "2026-06-08T12:50:00.000Z"
  });
  const asyncNotificationAfterHandled = database.prepare(numberingNotificationByIdSql).get({ notificationId: "notification-numbering-async" });
  const asyncNotificationHandledRaw = database
    .prepare("SELECT read_at, handled_at, handled_by FROM numbering_notifications WHERE id = ?")
    .get("notification-numbering-async");
  const asyncLockedNotification = database.prepare(numberingNotificationByIdSql).get({ notificationId: "notification-numbering-locked" });
  record(
    "NUMBERING-NOTIFICATION-ASYNC-002 SQLite semantic notification list and state SQL works",
    asyncNumberingNotificationUnreadRows.some((row) => row.id === "notification-numbering-async" && row.severity === "critical") &&
      asyncNumberingNotificationUnreadRows.some((row) => row.id === "notification-numbering-locked" && Number(row.dismissible) === 0) &&
      asyncNotificationBeforeUpdate?.read_at === null &&
      asyncNotificationAfterRead?.read_at === "2026-06-08T12:49:00.000Z" &&
      asyncNotificationAfterRead?.handled_at === null &&
      asyncNotificationAfterHandled?.read_at === "2026-06-08T12:49:00.000Z" &&
      asyncNotificationAfterHandled?.handled_at === "2026-06-08T12:50:00.000Z" &&
      asyncNotificationHandledRaw?.handled_by === "user-engineer-demo" &&
      Number(asyncLockedNotification?.dismissible) === 0,
    JSON.stringify({
      asyncNumberingNotificationUnreadRows,
      asyncNotificationBeforeUpdate,
      asyncNotificationAfterRead,
      asyncNotificationAfterHandled,
      asyncNotificationHandledRaw,
      asyncLockedNotification
    })
  );
  const asyncNumberingExportRoots = database.prepare(numberingExportRootsSql).all();
  const asyncNumberingExportParts = database.prepare(numberingExportPartsSql).all();
  const asyncNumberingExportDrawings = database.prepare(numberingExportDrawingsSql).all();
  const asyncNumberingExportAuditBefore = database.prepare(numberingExportAuditSql).all({ limit: 50 });
  const asyncNumberingExportResult = {
    exportMode: "last_change_summary",
    generatedAt: "2026-06-08T12:51:00.000Z",
    roots: asyncNumberingExportRoots,
    parts: asyncNumberingExportParts,
    drawings: asyncNumberingExportDrawings,
    auditSummary: asyncNumberingExportAuditBefore
  };
  database.prepare(insertNumberingExportJobSql).run({
    id: "export-job-numbering-async",
    exportMode: "last_change_summary",
    resultJson: JSON.stringify(asyncNumberingExportResult),
    generatedBy: "user-admin-demo",
    generatedAt: "2026-06-08T12:51:00.000Z",
    completedAt: "2026-06-08T12:51:00.000Z"
  });
  database.prepare(insertNumberingAuditSql).run({
    id: "audit-numbering-export-async",
    actorId: "user-admin-demo",
    action: "numbering.export_job.create",
    detailJson: JSON.stringify({ exportJobId: "export-job-numbering-async", exportMode: "last_change_summary" }),
    createdAt: "2026-06-08T12:51:01.000Z"
  });
  const asyncNumberingExportJob = database.prepare(numberingExportJobByIdSql).get({ jobId: "export-job-numbering-async" });
  const asyncNumberingExportJobs = database.prepare(numberingExportJobsSql).all({ limit: 20 });
  const asyncNumberingExportAuditAfter = database.prepare(numberingExportAuditSql).all({ limit: 50 });
  record(
    "NUMBERING-EXPORT-ASYNC-002 SQLite semantic export payload job and audit SQL works",
    asyncNumberingExportRoots.some((row) => row.root_code === "ROOT-ASYNC-001") &&
      asyncNumberingExportParts.some((row) => row.part_number === "PN-ASYNC-001" && row.root_code === "ROOT-ASYNC-001") &&
      asyncNumberingExportDrawings.some((row) => row.drawing_number === "DRW-ASYNC-001" && row.root_code === "ROOT-ASYNC-001") &&
      asyncNumberingExportJob?.status === "completed" &&
      String(asyncNumberingExportJob?.result_json ?? "").includes('"exportMode":"last_change_summary"') &&
      asyncNumberingExportJobs.some((row) => row.id === "export-job-numbering-async") &&
      asyncNumberingExportAuditAfter.some((row) => row.action === "numbering.export_job.create"),
    JSON.stringify({
      asyncNumberingExportRoots,
      asyncNumberingExportParts,
      asyncNumberingExportDrawings,
      asyncNumberingExportAuditBefore,
      asyncNumberingExportJob,
      asyncNumberingExportJobs,
      asyncNumberingExportAuditAfter
    })
  );
  const asyncMonthlyCounts = {
    roots: database.prepare(monthlyAuditCountRootsSql).get().count,
    parts: database.prepare(monthlyAuditCountPartsSql).get().count,
    drawings: database.prepare(monthlyAuditCountDrawingsSql).get().count,
    openTasks: database.prepare(monthlyAuditCountOpenTasksSql).get().count
  };
  const asyncMonthlyRdOpenTasks = database
    .prepare(monthlyAuditOpenTasksForTwoRolesSql)
    .get({ role0: "rd", role1: "rd_manager" });
  const asyncMonthlyRdApprovalRules = database
    .prepare(monthlyAuditApprovalRulesForTwoRolesSql)
    .get({ role0: "rd", role1: "rd_manager" });
  const asyncMonthlyProjectBuckets = database.prepare(monthlyAuditProjectBucketsSql).all();
  const asyncMonthlyQuery = {
    reportType: "numbering_master",
    reportMonth: "2026-06",
    scheduledDay: 1,
    counts: asyncMonthlyCounts,
    departmentPages: [
      { key: "company", label: "Company", roles: [], counts: asyncMonthlyCounts },
      {
        key: "rd",
        label: "RD",
        roles: ["rd", "rd_manager"],
        counts: {
          openTasks: asyncMonthlyRdOpenTasks.count,
          approvalRules: asyncMonthlyRdApprovalRules.count
        }
      }
    ],
    projectBuckets: asyncMonthlyProjectBuckets
  };
  database.prepare(insertMonthlyAuditReportSql).run({
    id: "monthly-audit-numbering-async",
    reportMonth: "2026-06",
    generationMode: "manual",
    generatedBy: "user-admin-demo",
    queryJson: JSON.stringify(asyncMonthlyQuery),
    createdAt: "2026-06-08T12:52:00.000Z"
  });
  database.prepare(insertNumberingAuditSql).run({
    id: "audit-numbering-monthly-async",
    actorId: "user-admin-demo",
    action: "numbering.monthly_audit_report.generate",
    detailJson: JSON.stringify({ monthlyAuditReportId: "monthly-audit-numbering-async", reportMonth: "2026-06", generationMode: "manual" }),
    createdAt: "2026-06-08T12:52:01.000Z"
  });
  const asyncMonthlyReport = database.prepare(monthlyAuditReportByIdSql).get({ reportId: "monthly-audit-numbering-async" });
  const asyncMonthlyReports = database.prepare(monthlyAuditReportsSql).all({ limit: 20 });
  const asyncMonthlyReportsByMonth = database.prepare(monthlyAuditReportsByMonthSql).all({ reportMonth: "2026-06", limit: 20 });
  const asyncMonthlyAuditRow = database.prepare("SELECT * FROM audit_logs WHERE id = ?").get("audit-numbering-monthly-async");
  record(
    "NUMBERING-MONTHLY-AUDIT-ASYNC-002 SQLite semantic monthly report counts list get and audit SQL works",
    Number(asyncMonthlyCounts.roots) >= 2 &&
      Number(asyncMonthlyCounts.parts) >= 2 &&
      Number(asyncMonthlyCounts.drawings) >= 1 &&
      Number(asyncMonthlyCounts.openTasks) >= 1 &&
      Number(asyncMonthlyRdOpenTasks?.count ?? 0) >= 1 &&
      Number(asyncMonthlyRdApprovalRules?.count ?? 0) >= 1 &&
      asyncMonthlyProjectBuckets.some((row) => row.projectCode === "P-100" && Number(row.openTasks) >= 1) &&
      asyncMonthlyReport?.report_type === "numbering_master" &&
      String(asyncMonthlyReport?.query_json ?? "").includes('"reportMonth":"2026-06"') &&
      asyncMonthlyReports.some((row) => row.id === "monthly-audit-numbering-async") &&
      asyncMonthlyReportsByMonth.some((row) => row.id === "monthly-audit-numbering-async") &&
      asyncMonthlyAuditRow?.action === "numbering.monthly_audit_report.generate",
    JSON.stringify({
      asyncMonthlyCounts,
      asyncMonthlyRdOpenTasks,
      asyncMonthlyRdApprovalRules,
      asyncMonthlyProjectBuckets,
      asyncMonthlyReport,
      asyncMonthlyReports,
      asyncMonthlyReportsByMonth,
      asyncMonthlyAuditRow
    })
  );
  const asyncOverdueCutoffAt = "2026-05-13T00:00:00.000Z";
  const asyncOverdueActedAt = "2026-06-12T00:00:00.000Z";
  const asyncOverdueRoots = database.prepare(overdueDraftRootsSql).all({ cutoffAt: asyncOverdueCutoffAt });
  const asyncOverduePartsBefore = database.prepare(draftRootPartsSql).all({ rootId: "root-overdue-async" });
  const asyncOverdueDrawingsBefore = database.prepare(draftRootDrawingsSql).all({ rootId: "root-overdue-async" });
  database.prepare(updateOverdueDraftDrawingsSql).run({ rootId: "root-overdue-async", updatedAt: asyncOverdueActedAt });
  database.prepare(updateOverdueDraftPartsSql).run({ rootId: "root-overdue-async", updatedAt: asyncOverdueActedAt });
  database.prepare(updateOverdueDraftRootSql).run({ rootId: "root-overdue-async", updatedAt: asyncOverdueActedAt });
  database.prepare(insertNumberingTaskItemSql).run({
    id: "task-overdue-numbering-async",
    taskType: "draft_admin_confirm",
    entityType: "part_root",
    entityId: "root-overdue-async",
    title: "Draft numbering requires admin confirmation",
    message: "Draft root ROOT-ASYNC-003 has been open for at least 30 days.",
    riskLevel: "warning",
    assignedTo: null,
    assignedRole: "pdm_admin",
    projectCode: null,
    actionUrl: "/numbering/search?root=ROOT-ASYNC-003",
    detailJson: JSON.stringify({ rootCode: "ROOT-ASYNC-003", cutoffAt: asyncOverdueCutoffAt }),
    createdBy: "user-admin-demo",
    createdAt: asyncOverdueActedAt,
    updatedAt: asyncOverdueActedAt
  });
  database.prepare(insertNumberingNotificationSql).run({
    id: "notification-overdue-numbering-async",
    notificationType: "draft_admin_confirm",
    entityType: "part_root",
    entityId: "root-overdue-async",
    title: "Draft numbering requires admin confirmation",
    message: "Draft root ROOT-ASYNC-003 has been open for at least 30 days.",
    severity: "warning",
    recipientId: null,
    recipientRole: "pdm_admin",
    dismissible: 0,
    actionUrl: "/numbering/search?root=ROOT-ASYNC-003",
    detailJson: JSON.stringify({ rootCode: "ROOT-ASYNC-003", cutoffAt: asyncOverdueCutoffAt }),
    createdBy: "user-admin-demo",
    createdAt: asyncOverdueActedAt,
    updatedAt: asyncOverdueActedAt
  });
  database.prepare(insertNumberingAuditSql).run({
    id: "audit-overdue-numbering-async",
    actorId: "user-admin-demo",
    action: "numbering.draft.pending_admin_confirm",
    detailJson: JSON.stringify({ rootCode: "ROOT-ASYNC-003", olderThanDays: 30, cutoffAt: asyncOverdueCutoffAt }),
    createdAt: asyncOverdueActedAt
  });
  const asyncOverdueRootAfter = database.prepare("SELECT * FROM part_roots WHERE id = ?").get("root-overdue-async");
  const asyncOverduePartAfter = database.prepare("SELECT * FROM part_numbers WHERE id = ?").get("part-overdue-async");
  const asyncOverdueDrawingAfter = database.prepare("SELECT * FROM drawing_numbers WHERE id = ?").get("drawing-overdue-async");
  const asyncOverdueTask = database.prepare("SELECT * FROM numbering_task_items WHERE id = ?").get("task-overdue-numbering-async");
  const asyncOverdueNotification = database.prepare("SELECT * FROM numbering_notifications WHERE id = ?").get("notification-overdue-numbering-async");
  const asyncOverdueAudit = database.prepare("SELECT * FROM audit_logs WHERE id = ?").get("audit-overdue-numbering-async");
  record(
    "NUMBERING-DRAFTS-OVERDUE-ASYNC-002 SQLite semantic overdue draft update task notification and audit SQL works",
    asyncOverdueRoots.some((row) => row.id === "root-overdue-async") &&
      asyncOverdueRoots.every((row) => row.id !== "root-duplicate-async") &&
      asyncOverduePartsBefore.some((row) => row.id === "part-overdue-async" && row.record_status === "NeedInfo") &&
      asyncOverdueDrawingsBefore.some((row) => row.id === "drawing-overdue-async" && row.record_status === "NeedInfo") &&
      asyncOverdueRootAfter?.record_status === "PendingAdminConfirm" &&
      asyncOverduePartAfter?.record_status === "PendingAdminConfirm" &&
      asyncOverdueDrawingAfter?.record_status === "PendingAdminConfirm" &&
      asyncOverdueTask?.assigned_role === "pdm_admin" &&
      asyncOverdueTask?.task_status === "open" &&
      String(asyncOverdueTask?.detail_json ?? "").includes("ROOT-ASYNC-003") &&
      asyncOverdueNotification?.recipient_role === "pdm_admin" &&
      Number(asyncOverdueNotification?.dismissible ?? 1) === 0 &&
      asyncOverdueAudit?.action === "numbering.draft.pending_admin_confirm",
    JSON.stringify({
      asyncOverdueRoots,
      asyncOverduePartsBefore,
      asyncOverdueDrawingsBefore,
      asyncOverdueRootAfter,
      asyncOverduePartAfter,
      asyncOverdueDrawingAfter,
      asyncOverdueTask,
      asyncOverdueNotification,
      asyncOverdueAudit
    })
  );
  record(
    "SANDBOX-ASYNC-002 SQLite semantic sandbox branch create list close and merge SQL work",
    asyncSandboxActiveBefore === undefined &&
      asyncSandboxDuplicateBefore === undefined &&
      asyncSandboxSourceBranches.some((branch) => branch.id === "sandbox-async-branch") &&
      asyncSandboxBranch?.sandbox_submission_id === "sub-sandbox-async" &&
      asyncSandboxBranch?.created_by_name === "Engineer Updated" &&
      asyncSandboxActiveAfter?.id === "sandbox-async-branch" &&
      asyncSandboxDuplicateAfter?.id === "sandbox-async-branch" &&
      asyncSandboxClosedBranch?.status === "closed" &&
      asyncSandboxClosedBranch?.closed_by === "user-engineer-demo" &&
      asyncSandboxMergedBranch?.status === "promoted" &&
      asyncSandboxMergedBranch?.merged_by === "user-engineer-demo" &&
      String(asyncSandboxMergedBranch?.merge_summary_json ?? "").includes("sandbox-async"),
    JSON.stringify({
      asyncSandboxSourceBranches,
      asyncSandboxBranch,
      asyncSandboxActiveAfter,
      asyncSandboxDuplicateAfter,
      asyncSandboxClosedBranch,
      asyncSandboxMergedBranch
    })
  );
  database
    .prepare(
      `INSERT INTO submission_files (id, submission_id, file_role, original_filename, local_path, gdrive_file_id, gdrive_status, sha256, file_size, created_at)
       VALUES
         ('file-parent-a-candidate-cad', 'sub-parent-a', 'sldprt', 'parent-bracket.sldprt', '/tmp/parent-bracket-a.sldprt', NULL, 'none', 'sha-parent-bracket', 1000, '2026-06-08T12:20:00.000Z'),
         ('file-parent-b-candidate-cad', 'sub-parent-b', 'sldprt', 'parent-bracket.sldprt', '/tmp/parent-bracket-b.sldprt', NULL, 'none', 'sha-parent-bracket', 1002, '2026-06-08T12:21:00.000Z')`
    )
    .run();
  const asyncDesignReuseRows = database.prepare(designReuseCandidatesSql).all({
    submissionId: "sub-parent-a",
    submittedBy: null
  });
  const asyncScopedDesignReuseRows = database.prepare(designReuseCandidatesSql).all({
    submissionId: "sub-parent-a",
    submittedBy: "user-engineer-demo"
  });
  const asyncDuplicateGeometryRows = database.prepare(duplicateGeometryCandidatesSql).all({
    submissionId: "sub-parent-a",
    submittedBy: null
  });
  record(
    "SUBMISSION-CANDIDATE-ASYNC-002 SQLite semantic reuse and duplicate candidate SQL works",
    asyncDesignReuseRows.some(
      (row) => row.id === "sub-parent-b" && String(row.file_names ?? "").includes("parent-bracket.sldprt")
    ) &&
      asyncScopedDesignReuseRows.every((row) => row.submitted_by === "user-engineer-demo") &&
      asyncDuplicateGeometryRows.some(
        (row) => row.id === "sub-parent-b" && String(row.file_fingerprints ?? "").includes("sha-parent-bracket")
      ),
    JSON.stringify({ asyncDesignReuseRows, asyncScopedDesignReuseRows, asyncDuplicateGeometryRows })
  );
  record(
    "SUBMISSION-WRITE-ASYNC-006 SQLite semantic item upsert and revision duplicate check work",
    asyncCreateMissingRevisionBefore === undefined &&
      asyncCreateRevisionAfter?.id === "sub-create-async" &&
      asyncCreateItemInitial?.id === "item-create-async" &&
      asyncCreateItemUpdated?.id === "item-create-async" &&
      asyncCreateItemRow?.part_name === "Async Create Part Updated",
    JSON.stringify({
      asyncCreateMissingRevisionBefore,
      asyncCreateRevisionAfter,
      asyncCreateItemInitial,
      asyncCreateItemUpdated,
      asyncCreateItemRow
    })
  );
  record(
    "SUBMISSION-WRITE-ASYNC-007 SQLite semantic submission files references and submit audit insert work",
    asyncCreateSubmissionRow?.id === "sub-create-async" &&
      asyncCreateSubmissionRow?.status === "Pending" &&
      Number(asyncCreateSubmissionRow?.approval_required) === 2 &&
      asyncCreateFiles.length === 2 &&
      asyncCreateFiles.every((file) => file.gdrive_status === "none") &&
      asyncCreateReferences.length === 2 &&
      asyncCreateReferences.some(
        (reference) =>
          reference.id === "ref-create-child" &&
          reference.source_file_id === "file-create-asm" &&
          reference.reference_type === "assembly_component" &&
          Number(reference.quantity) === 3
      ) &&
      asyncCreateAuditLogs.some(
        (log) =>
          log.action === "Submit" &&
          log.actor_id === "user-engineer-demo" &&
          String(log.detail_json ?? "").includes('"fileCount":2')
      ),
    JSON.stringify({ asyncCreateSubmissionRow, asyncCreateFiles, asyncCreateReferences, asyncCreateAuditLogs })
  );
  record(
    "SUBMISSION-WRITE-ASYNC-008 SQLite semantic BOM materialization from assembly references works",
    asyncCreateBomHeader?.id === "bom-create-async" &&
      asyncCreateBomHeader?.parent_submission_id === "sub-create-async" &&
      Number(asyncCreateBomHeader?.line_count) === 1 &&
      asyncCreateBomLines.length === 1 &&
      asyncCreateBomLines[0].child_part_number === "PN-100" &&
      asyncCreateBomLines[0].child_revision === "B" &&
      Number(asyncCreateBomLines[0].quantity) === 3 &&
      asyncCreateBomLines[0].source_reference_id === "ref-create-child" &&
      asyncCreateAuditLogs.some(
        (log) => log.action === "BomDraftMaterialized" && String(log.detail_json ?? "").includes('"lineCount":1')
      ),
    JSON.stringify({ asyncCreateBomHeader, asyncCreateBomLines, asyncCreateAuditLogs })
  );
  record(
    "BOM-WORKBENCH-ASYNC-007G SQLite semantic draft from assembly creates draft lines event and audit",
    asyncBomWorkbenchAssemblyParent?.parent_submission_id === "sub-create-async" &&
      asyncBomWorkbenchAssemblyReferences.length === 1 &&
      asyncBomWorkbenchAssemblyDraft?.id === "bom-draft-from-assembly-async" &&
      asyncBomWorkbenchAssemblyDraft?.source === "cad_reference" &&
      Number(asyncBomWorkbenchAssemblyDraft?.is_active) === 1 &&
      Number(asyncBomWorkbenchAssemblyDraft?.line_count) === 1 &&
      asyncBomWorkbenchAssemblyLines.length === 1 &&
      asyncBomWorkbenchAssemblyLines[0].part_number === "PN-100" &&
      asyncBomWorkbenchAssemblyLines[0].revision === "B" &&
      Number(asyncBomWorkbenchAssemblyLines[0].quantity) === 3 &&
      asyncBomWorkbenchAssemblyLines[0].source_ref_id === "ref-create-child" &&
      asyncBomWorkbenchAssemblyEvent?.event_type === "create_from_assembly" &&
      String(asyncBomWorkbenchAssemblyEvent?.after_json ?? "").includes('"sourceReferenceCount":1') &&
      asyncBomWorkbenchAssemblyAudit?.action === "BomWorkbenchDraftCreated" &&
      String(asyncBomWorkbenchAssemblyAudit?.detail_json ?? "").includes('"source":"cad_reference"'),
    JSON.stringify({
      asyncBomWorkbenchAssemblyParent,
      asyncBomWorkbenchAssemblyReferences,
      asyncBomWorkbenchAssemblyDraft,
      asyncBomWorkbenchAssemblyLines,
      asyncBomWorkbenchAssemblyEvent,
      asyncBomWorkbenchAssemblyAudit
    })
  );
  record(
    "BOM-WORKBENCH-ASYNC-007I SQLite semantic draft import-xls creates profile asset job lines event and audit",
    asyncBomImportProfileBefore === undefined &&
      asyncBomImportProfile?.id === "bom-import-profile-async" &&
      asyncBomImportProfile?.source_type === "solidworks_xls" &&
      asyncBomImportDraft?.id === "bom-draft-import-xls-async" &&
      asyncBomImportDraft?.source === "solidworks_xls" &&
      Number(asyncBomImportDraft?.is_active) === 1 &&
      Number(asyncBomImportDraft?.line_count) === 1 &&
      asyncBomImportLines.length === 1 &&
      asyncBomImportLines[0].part_number === "PN-100" &&
      asyncBomImportLines[0].revision === "B" &&
      Number(asyncBomImportLines[0].quantity) === 3 &&
      asyncBomImportLines[0].source_ref_id === "solidworks_rows:2,3" &&
      asyncBomImportJob?.id === "bom-import-job-async" &&
      asyncBomImportJob?.source_asset_id === "file-asset-bom-import-async" &&
      Number(asyncBomImportJob?.row_count) === 2 &&
      asyncBomImportAsset?.linked_entity_type === "bom_import_job" &&
      asyncBomImportAsset?.linked_entity_id === "bom-import-job-async" &&
      asyncBomImportEvent?.event_type === "import_solidworks_xls" &&
      String(asyncBomImportEvent?.after_json ?? "").includes('"rawRowCount":2') &&
      asyncBomImportAudit?.action === "BomWorkbenchDraftImported" &&
      String(asyncBomImportAudit?.detail_json ?? "").includes('"source":"solidworks_xls"'),
    JSON.stringify({
      asyncBomImportProfile,
      asyncBomImportDraft,
      asyncBomImportLines,
      asyncBomImportJob,
      asyncBomImportAsset,
      asyncBomImportEvent,
      asyncBomImportAudit
    })
  );
  record(
    "SUBMISSION-FILE-ASYNC-006 SQLite semantic file lookup and missing file behavior work",
    asyncSubmissionFile?.id === "file-dashboard-pending-pdf" &&
      Number(asyncSubmissionFile?.file_size) === 11 &&
      asyncMissingSubmissionFile === undefined,
    JSON.stringify({ asyncSubmissionFile, asyncMissingSubmissionFile })
  );
  record(
    "SUBMISSION-FILE-ASYNC-007 SQLite semantic upload queue and status updates work",
    asyncFilesNeedingUploadBefore.length === 3 &&
      asyncFilesNeedingUploadBefore[0].id === "file-dashboard-pending-pdf" &&
      asyncUploadStatusOnly?.gdrive_status === "uploading" &&
      asyncUploadStatusOnly?.gdrive_file_id === null &&
      asyncUploadStatusWithId?.gdrive_status === "uploaded" &&
      asyncUploadStatusWithId?.gdrive_file_id === "gdrive-file-async",
    JSON.stringify({ asyncFilesNeedingUploadBefore, asyncUploadStatusOnly, asyncUploadStatusWithId })
  );
  record(
    "BOM-WORKBENCH-ASYNC-006 SQLite semantic parent and draft summary lookup works",
    asyncBomWorkbenchParent?.parent_submission_id === "sub-parent-a" &&
      asyncBomWorkbenchParent?.parent_part_number === "ASM-100" &&
      asyncBomWorkbenchParent?.parent_status === "Released" &&
      asyncBomWorkbenchDrafts.length === 3 &&
      asyncBomWorkbenchDrafts[0].id === "bom-draft-pending" &&
      asyncBomWorkbenchActiveSummary?.id === "bom-draft-active" &&
      Number(asyncBomWorkbenchActiveSummary?.is_active) === 1,
    JSON.stringify({ asyncBomWorkbenchParent, asyncBomWorkbenchDrafts, asyncBomWorkbenchActiveSummary })
  );
  record(
    "BOM-WORKBENCH-ASYNC-007 SQLite semantic active draft detail and line ordering work",
    asyncBomWorkbenchActiveDraft?.id === "bom-draft-active" &&
      Number(asyncBomWorkbenchActiveDraft?.line_count) === 2 &&
      asyncBomWorkbenchActiveLines.length === 2 &&
      asyncBomWorkbenchActiveLines[0].id === "bom-tree-group" &&
      asyncBomWorkbenchActiveLines[0].node_type === "group" &&
      asyncBomWorkbenchActiveLines[1].id === "bom-tree-child" &&
      asyncBomWorkbenchActiveLines[1].part_name === "Child Part" &&
      Number(asyncBomWorkbenchActiveLines[1].quantity) === 2,
    JSON.stringify({ asyncBomWorkbenchActiveDraft, asyncBomWorkbenchActiveLines })
  );
  record(
    "BOM-WORKBENCH-ASYNC-007A SQLite semantic draft diff baseline snapshot lookup works",
    asyncBomWorkbenchBaseSnapshot?.id === "bom-release-snapshot-base" &&
      asyncBomWorkbenchBaseSnapshot?.parent_part_number === "ASM-100" &&
      asyncBomWorkbenchBaseSnapshot?.parent_drawing_number === "DRW-ASM-100" &&
      asyncBomWorkbenchBaseSnapshot?.released_by_name === "Manager User" &&
      Array.isArray(asyncBomWorkbenchBaseLines) &&
      asyncBomWorkbenchBaseLines.length === 3 &&
      asyncBomWorkbenchBaseLines.some((line) => line.part_number === "PN-100" && line.revision === "A" && Number(line.quantity) === 1) &&
      asyncBomWorkbenchActiveLines.some((line) => line.part_number === "PN-100" && line.revision === "B" && Number(line.quantity) === 2),
    JSON.stringify({ asyncBomWorkbenchBaseSnapshot, asyncBomWorkbenchBaseLines, asyncBomWorkbenchActiveLines })
  );
  record(
    "BOM-WORKBENCH-ASYNC-007C SQLite semantic release snapshot by id lookup works",
    asyncBomWorkbenchReleaseSnapshot?.id === "bom-release-snapshot-base" &&
      asyncBomWorkbenchReleaseSnapshot?.parent_submission_id === "sub-parent-a" &&
      asyncBomWorkbenchReleaseSnapshot?.parent_part_number === "ASM-100" &&
      asyncBomWorkbenchReleaseSnapshot?.parent_drawing_number === "DRW-ASM-100" &&
      asyncBomWorkbenchReleaseSnapshot?.released_by_name === "Manager User" &&
      Array.isArray(asyncBomWorkbenchReleaseSnapshotLines) &&
      asyncBomWorkbenchReleaseSnapshotLines.length === 3 &&
      asyncBomWorkbenchReleaseSnapshotLines.some((line) => line.part_number === "PN-100" && line.revision === "A"),
    JSON.stringify({ asyncBomWorkbenchReleaseSnapshot, asyncBomWorkbenchReleaseSnapshotLines })
  );
  record(
    "BOM-WORKBENCH-ASYNC-007B SQLite semantic pending review list joins draft metadata and diff baseline",
    asyncBomWorkbenchPendingReviews.length === 1 &&
      asyncBomWorkbenchPendingReview?.id === "bom-review-pending-async" &&
      asyncBomWorkbenchPendingReview?.submitted_by_name === "Engineer Updated" &&
      asyncBomWorkbenchPendingReview?.parent_part_number === "ASM-100" &&
      asyncBomWorkbenchPendingReview?.parent_drawing_number === "DRW-ASM-100" &&
      Number(asyncBomWorkbenchPendingReview?.review_attempt) === 2 &&
      asyncBomWorkbenchPendingDiffDraft?.id === "bom-draft-pending" &&
      asyncBomWorkbenchPendingBaseSnapshot?.id === "bom-release-snapshot-base",
    JSON.stringify({
      asyncBomWorkbenchPendingReviews,
      asyncBomWorkbenchPendingDiffDraft,
      asyncBomWorkbenchPendingBaseSnapshot
    })
  );
  record(
    "BOM-WORKBENCH-ASYNC-007D SQLite semantic review reject updates draft review event and audit",
    asyncBomWorkbenchReviewBeforeReject?.status === "PendingReview" &&
      asyncBomWorkbenchRejectedReview?.status === "Rejected" &&
      asyncBomWorkbenchRejectedReview?.reviewed_by === "user-manager-demo" &&
      asyncBomWorkbenchRejectedReview?.decision_reason === "Needs BOM correction" &&
      asyncBomWorkbenchRejectedReview?.reviewed_at === "2026-06-08T06:01:00.000Z" &&
      asyncBomWorkbenchRejectedDraft?.status === "Rejected" &&
      asyncBomWorkbenchRejectedDraft?.updated_by === "user-manager-demo" &&
      asyncBomWorkbenchRejectionEvent?.event_type === "reject_review" &&
      String(asyncBomWorkbenchRejectionEvent?.before_json ?? "").includes('"status":"PendingReview"') &&
      asyncBomWorkbenchRejectionAudit?.action === "BomWorkbenchReviewRejected" &&
      String(asyncBomWorkbenchRejectionAudit?.detail_json ?? "").includes('"decisionReason":"Needs BOM correction"'),
    JSON.stringify({
      asyncBomWorkbenchReviewBeforeReject,
      asyncBomWorkbenchRejectedReview,
      asyncBomWorkbenchRejectedDraft,
      asyncBomWorkbenchRejectionEvent,
      asyncBomWorkbenchRejectionAudit
    })
  );
  record(
    "BOM-WORKBENCH-ASYNC-007E SQLite semantic draft submit review updates draft review event and audit",
    asyncBomWorkbenchPendingConflictAfterReject === undefined &&
      asyncBomWorkbenchSubmittedReview?.id === "bom-review-resubmitted-async" &&
      asyncBomWorkbenchSubmittedReview?.status === "PendingReview" &&
      asyncBomWorkbenchSubmittedReview?.submitted_by === "user-engineer-demo" &&
      asyncBomWorkbenchSubmittedReview?.change_reason === "Resubmit after async rejection" &&
      asyncBomWorkbenchSubmittedReview?.submitted_at === "2026-06-08T06:03:00.000Z" &&
      asyncBomWorkbenchSubmittedDraft?.status === "PendingReview" &&
      Number(asyncBomWorkbenchSubmittedDraft?.review_attempt) === 3 &&
      asyncBomWorkbenchSubmittedDraft?.updated_by === "user-engineer-demo" &&
      asyncBomWorkbenchSubmitEvent?.event_type === "submit_review" &&
      String(asyncBomWorkbenchSubmitEvent?.after_json ?? "").includes('"reviewAttempt":3') &&
      asyncBomWorkbenchSubmitAudit?.action === "BomWorkbenchReviewSubmitted" &&
      String(asyncBomWorkbenchSubmitAudit?.detail_json ?? "").includes('"reviewId":"bom-review-resubmitted-async"'),
    JSON.stringify({
      asyncBomWorkbenchPendingConflictAfterReject,
      asyncBomWorkbenchSubmittedReview,
      asyncBomWorkbenchSubmittedDraft,
      asyncBomWorkbenchSubmitEvent,
      asyncBomWorkbenchSubmitAudit
    })
  );
  record(
    "BOM-WORKBENCH-ASYNC-007H SQLite semantic review approve releases snapshot event and audit",
    asyncBomWorkbenchApproveItem?.id === "item-child" &&
      asyncBomWorkbenchApproveChildSubmission?.status === "Released" &&
      asyncBomWorkbenchApproveChildSubmission?.revision === "C" &&
      asyncBomWorkbenchApproveLatestReleased?.revision === "C" &&
      asyncBomWorkbenchApprovedReview?.status === "Approved" &&
      asyncBomWorkbenchApprovedReview?.reviewed_by === "user-manager-demo" &&
      asyncBomWorkbenchApprovedReview?.decision_reason === "Approve async BOM release" &&
      asyncBomWorkbenchApprovedDraft?.status === "Released" &&
      Number(asyncBomWorkbenchApprovedDraft?.is_active) === 0 &&
      asyncBomWorkbenchApprovedSnapshot?.id === "bom-release-snapshot-approved-async" &&
      asyncBomWorkbenchApprovedSnapshot?.bom_draft_id === "bom-draft-pending" &&
      Number(asyncBomWorkbenchApprovedSnapshot?.line_count) === 1 &&
      asyncBomWorkbenchObsoletedSnapshot?.obsolete_by === "user-manager-demo" &&
      asyncBomWorkbenchObsoletedDraft?.status === "Obsolete" &&
      asyncBomWorkbenchApproveEvent?.event_type === "approve_release" &&
      String(asyncBomWorkbenchApproveEvent?.after_json ?? "").includes('"status":"Released"') &&
      asyncBomWorkbenchApproveAudit?.action === "BomWorkbenchReviewApproved" &&
      String(asyncBomWorkbenchApproveAudit?.detail_json ?? "").includes('"snapshotId":"bom-release-snapshot-approved-async"'),
    JSON.stringify({
      asyncBomWorkbenchApproveItem,
      asyncBomWorkbenchApproveChildSubmission,
      asyncBomWorkbenchApproveLatestReleased,
      asyncBomWorkbenchApprovedReview,
      asyncBomWorkbenchApprovedDraft,
      asyncBomWorkbenchApprovedSnapshot,
      asyncBomWorkbenchObsoletedSnapshot,
      asyncBomWorkbenchObsoletedDraft,
      asyncBomWorkbenchApproveEvent,
      asyncBomWorkbenchApproveAudit
    })
  );
  record(
    "BOM-WORKBENCH-ASYNC-007F SQLite semantic draft save tree replaces lines event and audit",
    asyncBomWorkbenchSaveChildItem?.id === "item-child" &&
      asyncBomWorkbenchSavedDraft?.id === "bom-draft-old" &&
      asyncBomWorkbenchSavedDraft?.source === "manual" &&
      Number(asyncBomWorkbenchSavedDraft?.line_count) === 2 &&
      asyncBomWorkbenchSavedDraft?.updated_by === "user-engineer-demo" &&
      asyncBomWorkbenchSavedLines.length === 2 &&
      asyncBomWorkbenchSavedLines[0].id === "bom-save-group" &&
      asyncBomWorkbenchSavedLines[0].node_type === "group" &&
      asyncBomWorkbenchSavedLines[1].id === "bom-save-child" &&
      asyncBomWorkbenchSavedLines[1].item_id === "item-child" &&
      Number(asyncBomWorkbenchSavedLines[1].quantity) === 4 &&
      asyncBomWorkbenchSaveEvent?.event_type === "save_tree" &&
      String(asyncBomWorkbenchSaveEvent?.after_json ?? "").includes('"lineCount":2') &&
      asyncBomWorkbenchSaveAudit?.action === "BomWorkbenchDraftSaved" &&
      String(asyncBomWorkbenchSaveAudit?.detail_json ?? "").includes('"afterLineCount":2'),
    JSON.stringify({
      asyncBomWorkbenchSaveChildItem,
      asyncBomWorkbenchSavedDraft,
      asyncBomWorkbenchSavedLines,
      asyncBomWorkbenchSaveEvent,
      asyncBomWorkbenchSaveAudit
    })
  );
  record(
    "BOM-WORKBENCH-ASYNC-008 SQLite semantic missing workbench and draft return undefined",
    asyncBomWorkbenchMissingParent === undefined && asyncBomWorkbenchMissingDraft === undefined,
    JSON.stringify({ asyncBomWorkbenchMissingParent, asyncBomWorkbenchMissingDraft })
  );
  record(
    "BOM-WORKBENCH-ASYNC-009 SQLite semantic active draft switch updates draft, edit event, and audit",
    Number(asyncBomWorkbenchActivatedDraft?.is_active) === 1 &&
      asyncBomWorkbenchActivatedDraft?.updated_by === "user-manager-demo" &&
      Number(asyncBomWorkbenchDeactivatedDraft?.is_active) === 0 &&
      asyncBomWorkbenchAfterActiveSwitch.filter((draft) => Number(draft.is_active) === 1 && draft.status === "Draft").length === 1 &&
      asyncBomWorkbenchActivationEvent?.event_type === "set_active" &&
      String(asyncBomWorkbenchActivationEvent?.before_json ?? "").includes('"isActive":0') &&
      asyncBomWorkbenchActivationAudit?.action === "BomWorkbenchDraftActivated" &&
      String(asyncBomWorkbenchActivationAudit?.detail_json ?? "").includes('"previousActive":0'),
    JSON.stringify({
      asyncBomWorkbenchActivatedDraft,
      asyncBomWorkbenchDeactivatedDraft,
      asyncBomWorkbenchActivationEvent,
      asyncBomWorkbenchActivationAudit
    })
  );
  record(
    "COLLABORATION-ASYNC-005 SQLite semantic discussion create/list/resolve works",
    asyncDiscussionCommentsBeforeResolve.length === 1 &&
      asyncDiscussionCommentsBeforeResolve[0].id === "comment-async" &&
      asyncDiscussionCommentsBeforeResolve[0].status === "open" &&
      asyncDiscussionCommentsBeforeResolve[0].file_original_filename === "pending.pdf" &&
      asyncDiscussionCommentsBeforeResolve[0].author_name === "Engineer Updated" &&
      asyncDiscussionCommentsAfterResolve.length === 1 &&
      asyncDiscussionCommentsAfterResolve[0].status === "resolved" &&
      asyncDiscussionCommentsAfterResolve[0].resolved_by_name === "Manager User",
    JSON.stringify({ asyncDiscussionCommentsBeforeResolve, asyncDiscussionCommentsAfterResolve })
  );
  record(
    "COLLABORATION-ASYNC-006 SQLite semantic review issue create/list/resolve works",
    asyncReviewIssues.length === 1 &&
      asyncReviewIssues[0].id === "issue-async" &&
      asyncReviewIssues[0].status === "resolved" &&
      asyncReviewIssues[0].file_original_filename === "pending.dwg" &&
      asyncReviewIssues[0].raised_by_name === "Engineer Updated" &&
      asyncReviewIssues[0].assignee_name === "Manager User" &&
      asyncReviewIssues[0].resolved_by_name === "Manager User" &&
      asyncReviewIssues[0].resolution === "Fixed",
    JSON.stringify(asyncReviewIssues)
  );
  record(
    "COLLABORATION-ASYNC-007 SQLite semantic PDF markup create/list/resolve works",
    asyncPdfMarkups.length === 1 &&
      asyncPdfMarkups[0].id === "markup-async" &&
      asyncPdfMarkups[0].status === "resolved" &&
      asyncPdfMarkups[0].file_original_filename === "pending.pdf" &&
      asyncPdfMarkups[0].author_name === "Engineer Updated" &&
      asyncPdfMarkups[0].resolved_by_name === "Manager User" &&
      Number(asyncPdfMarkups[0].page_number) === 2 &&
      Number(asyncPdfMarkups[0].x_percent) === 25.5 &&
      Number(asyncPdfMarkups[0].y_percent) === 40.25,
    JSON.stringify(asyncPdfMarkups)
  );
  record(
    "COLLABORATION-ASYNC-008 SQLite semantic collaboration audit insert works",
    [
      "DiscussionCommentCreated",
      "DiscussionCommentResolved",
      "ReviewIssueCreated",
      "ReviewIssueResolved",
      "PdfMarkupCreated",
      "PdfMarkupResolved"
    ].every((action) => asyncCollaborationAuditLogs.some((row) => row.action === action)),
    JSON.stringify(asyncCollaborationAuditLogs)
  );
  record(
    "CHANGE-REQUEST-ASYNC-005 SQLite semantic change request create/list works",
    asyncChangeRequestsBeforeDecision.length === 1 &&
      asyncChangeRequestsBeforeDecision[0].id === "change-async" &&
      asyncChangeRequestsBeforeDecision[0].kind === "ECR" &&
      asyncChangeRequestsBeforeDecision[0].status === "open" &&
      asyncChangeRequestsBeforeDecision[0].requested_by_name === "Engineer Updated" &&
      asyncChangeRequestsBeforeDecision[0].decided_by_name === null,
    JSON.stringify(asyncChangeRequestsBeforeDecision)
  );
  record(
    "CHANGE-REQUEST-ASYNC-006 SQLite semantic change request decide works",
    asyncChangeRequestsAfterDecision.length === 1 &&
      asyncChangeRequestsAfterDecision[0].id === "change-async" &&
      asyncChangeRequestsAfterDecision[0].status === "approved" &&
      asyncChangeRequestsAfterDecision[0].decided_by_name === "Manager User" &&
      asyncChangeRequestsAfterDecision[0].decision_comment === "Approved for async migration",
    JSON.stringify(asyncChangeRequestsAfterDecision)
  );
  record(
    "CHANGE-REQUEST-ASYNC-007 SQLite semantic change request audit insert works",
    ["ChangeRequestCreated", "ChangeRequestDecided"].every((action) =>
      asyncCollaborationAuditLogs.some((row) => row.action === action)
    ),
    JSON.stringify(asyncCollaborationAuditLogs)
  );
  record(
    "APPROVAL-MATRIX-ASYNC-005 SQLite semantic approval matrix list and approved count work",
    asyncApprovalMatrixBeforeRefresh.length === 2 &&
      asyncApprovalMatrixBeforeRefresh[0].id === "approval-matrix-manager" &&
      asyncApprovalMatrixBeforeRefresh[0].required_role === "R&D Manager" &&
      asyncApprovalMatrixBeforeRefresh[0].status === "open" &&
      Number(asyncApprovalMatrixBeforeRefresh[0].approved_count) === 1 &&
      asyncApprovalMatrixBeforeRefresh[0].created_by_name === "Engineer Updated" &&
      asyncApprovalMatrixBeforeRefresh[1].id === "approval-matrix-admin" &&
      Number(asyncApprovalMatrixBeforeRefresh[1].approved_count) === 0,
    JSON.stringify(asyncApprovalMatrixBeforeRefresh)
  );
  record(
    "APPROVAL-MATRIX-ASYNC-006 SQLite semantic approval matrix refresh satisfies approved requirement",
    asyncApprovalMatrixAfterRefresh.length === 2 &&
      asyncApprovalMatrixAfterRefresh[0].id === "approval-matrix-manager" &&
      asyncApprovalMatrixAfterRefresh[0].status === "satisfied" &&
      asyncApprovalMatrixAfterRefresh[1].id === "approval-matrix-admin" &&
      asyncApprovalMatrixAfterRefresh[1].status === "open",
    JSON.stringify(asyncApprovalMatrixAfterRefresh)
  );
  record(
    "APPROVAL-MATRIX-ASYNC-007 SQLite semantic approval matrix waive and audit work",
    asyncApprovalMatrixAfterWaive.length === 2 &&
      asyncApprovalMatrixAfterWaive[1].id === "approval-matrix-admin" &&
      asyncApprovalMatrixAfterWaive[1].status === "waived" &&
      asyncApprovalMatrixAfterWaive[1].decided_by_name === "Manager User" &&
      asyncApprovalMatrixAfterWaive[1].decision_comment === "Waived for async migration" &&
      ["ApprovalMatrixInitialized", "ApprovalMatrixWaived"].every((action) =>
        asyncCollaborationAuditLogs.some((row) => row.action === action)
      ),
    JSON.stringify({ asyncApprovalMatrixAfterWaive, asyncCollaborationAuditLogs })
  );
  record(
    "APPROVAL-DECISION-ASYNC-004 SQLite semantic approval decision insert, duplicate lookup, and summary work",
    asyncReviewerDecision?.id === "approval-dashboard-admin-reject" &&
      asyncApprovalSummary.Approved === 1 &&
      asyncApprovalSummary.Rejected === 1,
    JSON.stringify({ asyncReviewerDecision, asyncApprovalSummaryRows, asyncApprovalSummary })
  );
  record(
    "APPROVAL-DECISION-ASYNC-005 SQLite semantic reject status update and audit work",
    asyncRejectedSubmission?.status === "Rejected" &&
      asyncRejectedSubmission?.rejected_at === "2026-06-08T14:11:00.000Z" &&
      asyncRejectedSubmission?.reject_reason === "Rejected for async migration" &&
      asyncRejectedSubmission?.release_error === null &&
      asyncRejectAuditLog?.action === "Reject" &&
      asyncRejectAuditLog?.actor_id === "user-admin-demo" &&
      String(asyncRejectAuditLog?.detail_json ?? "").includes("Rejected for async migration"),
    JSON.stringify({ asyncRejectedSubmission, asyncRejectAuditLog })
  );
  record(
    "RELEASE-DECISION-ASYNC-006 SQLite semantic active sandbox and filename conflict checks work",
    asyncActiveSandboxBranch?.id === "sandbox-release-active" &&
      asyncActiveSandboxBranch?.sandbox_submission_id === "sub-release-pending" &&
      asyncActiveSandboxBranch?.created_by_name === "Manager User" &&
      asyncReleasedFilenameConflict?.submission_id === "sub-parent-a" &&
      asyncReleasedFilenameConflict?.original_filename === "released-conflict.pdf",
    JSON.stringify({ asyncActiveSandboxBranch, asyncReleasedFilenameConflict })
  );
  record(
    "RELEASE-DECISION-ASYNC-007 SQLite semantic releasing and release failure status updates work",
    asyncReleaseFailReleasing?.status === "Releasing" &&
      asyncReleaseFailReleasing?.release_error === null &&
      asyncReleaseFailReleasing?.reject_reason === null &&
      asyncReleaseFailedSubmission?.status === "ReleaseFailed" &&
      asyncReleaseFailedSubmission?.release_error === "QC release failure",
    JSON.stringify({ asyncReleaseFailReleasing, asyncReleaseFailedSubmission })
  );
  record(
    "RELEASE-DECISION-ASYNC-008 SQLite semantic release package upsert works",
    asyncReleasePackage?.id === "release-package-async-a" &&
      asyncReleasePackage?.package_filename === "release-b.zip" &&
      asyncReleasePackage?.sha256 === "sha-release-b" &&
      Number(asyncReleasePackage?.file_size) === 202 &&
      asyncReleasePackage?.created_by === "user-admin-demo",
    JSON.stringify(asyncReleasePackage)
  );
  record(
    "PROCUREMENT-SYNC-ASYNC-004 SQLite semantic create list and audit work",
    asyncProcurementSyncRunBeforeDecision?.id === "proc-sync-async" &&
      asyncProcurementSyncRunBeforeDecision?.status === "sent" &&
      asyncProcurementSyncRunBeforeDecision?.target_system === "procurement" &&
      asyncProcurementSyncRunBeforeDecision?.created_by_name === "Admin User" &&
      asyncProcurementSyncRuns.some((row) => row.id === "proc-sync-async") &&
      asyncProcurementSyncRunsFiltered.length === 1 &&
      asyncProcurementSyncRunsFiltered[0].id === "proc-sync-async" &&
      asyncProcurementSyncAuditRows.some(
        (row) => row.action === "ProcurementSyncSent" && row.actor_id === "user-admin-demo" && row.detail_json.includes("EXT-SENT")
      ),
    JSON.stringify({
      asyncProcurementSyncRuns,
      asyncProcurementSyncRunsFiltered,
      asyncProcurementSyncRunBeforeDecision,
      asyncProcurementSyncAuditRows
    })
  );
  record(
    "PROCUREMENT-SYNC-ASYNC-005 SQLite semantic decision update and audit work",
    asyncProcurementSyncRunAfterDecision?.status === "acknowledged" &&
      asyncProcurementSyncRunAfterDecision?.external_reference === "EXT-ACK" &&
      asyncProcurementSyncRunAfterDecision?.acknowledged_by === "user-manager-demo" &&
      asyncProcurementSyncRunAfterDecision?.acknowledged_by_name === "Manager User" &&
      String(asyncProcurementSyncRunAfterDecision?.response_json ?? "").includes("acknowledge") &&
      asyncProcurementSyncAuditRows.some(
        (row) =>
          row.action === "ProcurementSyncAcknowledged" &&
          row.actor_id === "user-manager-demo" &&
          row.detail_json.includes("EXT-ACK")
      ),
    JSON.stringify({
      asyncProcurementSyncRunAfterDecision,
      asyncProcurementSyncAuditRows
    })
  );
  record(
    "READONLY-SHARE-ASYNC-004 SQLite semantic share create list and audit work",
    asyncReadonlySharesBeforeCreate.some((row) => row.id === "share-parent-a") &&
      asyncReadonlySharesAfterCreate[0]?.id === "share-async-created" &&
      asyncCreatedReadonlyShare?.id === "share-async-created" &&
      asyncCreatedReadonlyShare?.created_by_name === "Manager User" &&
      Number(asyncCreatedReadonlyShare?.response_count ?? 0) === 0 &&
      asyncReadonlyShareAuditRows.some(
        (row) =>
          row.action === "ReadonlyShareCreated" &&
          row.actor_id === "user-manager-demo" &&
          row.detail_json.includes("Async created share")
      ),
    JSON.stringify({
      asyncReadonlySharesBeforeCreate,
      asyncReadonlySharesAfterCreate,
      asyncCreatedReadonlyShare,
      asyncReadonlyShareAuditRows
    })
  );
  record(
    "READONLY-SHARE-ASYNC-005 SQLite semantic share revoke and audit work",
    asyncRevokedReadonlyShare?.id === "share-async-created" &&
      asyncRevokedReadonlyShare?.revoked_at === "2026-06-08T14:24:05.000Z" &&
      asyncRevokedReadonlyShare?.revoked_by === "user-admin-demo" &&
      asyncRevokedReadonlyShare?.revoked_by_name === "Admin User" &&
      asyncReadonlyShareAuditRows.some(
        (row) =>
          row.action === "ReadonlyShareRevoked" &&
          row.actor_id === "user-admin-demo" &&
          row.detail_json.includes("share-async-created")
      ),
    JSON.stringify({
      asyncRevokedReadonlyShare,
      asyncReadonlyShareAuditRows
    })
  );
  record(
    "PUBLIC-SHARE-ASYNC-004 SQLite semantic share access count update works",
    Number(asyncReadonlyShareAccessAfter?.access_count ?? 0) === Number(asyncReadonlyShareAccessBefore?.access_count ?? 0) + 1 &&
      asyncReadonlyShareAccessAfter?.last_accessed_at === "2026-06-08T14:24:30.000Z" &&
      asyncReadonlyShareAccessAfter?.updated_at === "2026-06-08T14:24:30.000Z",
    JSON.stringify({
      asyncReadonlyShareAccessBefore,
      asyncReadonlyShareAccessAfter
    })
  );
  record(
    "SUPPLIER-RESPONSE-ASYNC-004 SQLite semantic readonly share and response create/list work",
    asyncReadonlyShare?.id === "share-parent-a" &&
      asyncReadonlyShare?.revoked_at === null &&
      Number(asyncReadonlyShare?.response_count ?? 0) >= 1 &&
      asyncReadonlyShareRevoked?.revoked_at === "2026-06-08T06:45:00.000Z" &&
      asyncSupplierResponseBeforeClose?.id === "supplier-response-async" &&
      asyncSupplierResponseBeforeClose?.status === "open" &&
      asyncSupplierResponseBeforeClose?.share_label === "Supplier package" &&
      asyncSupplierResponsesBeforeClose.some((row) => row.id === "supplier-response-existing") &&
      asyncSupplierResponsesBeforeClose.some((row) => row.id === "supplier-response-async") &&
      asyncSupplierResponsesFiltered.length >= 2 &&
      asyncSupplierResponseAuditRows.some(
        (row) =>
          row.action === "SupplierPortalResponseCreated" &&
          row.actor_id === null &&
          row.detail_json.includes("async.supplier@example.com")
      ),
    JSON.stringify({
      asyncReadonlyShare,
      asyncReadonlyShareRevoked,
      asyncSupplierResponsesBeforeClose,
      asyncSupplierResponsesFiltered,
      asyncSupplierResponseBeforeClose,
      asyncSupplierResponseAuditRows
    })
  );
  record(
    "SUPPLIER-RESPONSE-ASYNC-005 SQLite semantic response close and audit work",
    asyncSupplierResponseAfterClose?.status === "closed" &&
      asyncSupplierResponseAfterClose?.closed_by === "user-manager-demo" &&
      asyncSupplierResponseAfterClose?.closed_by_name === "Manager User" &&
      asyncSupplierResponseAfterClose?.closed_at === "2026-06-08T14:24:20.000Z" &&
      asyncSupplierResponseAuditRows.some(
        (row) =>
          row.action === "SupplierPortalResponseClosed" &&
          row.actor_id === "user-manager-demo" &&
          row.detail_json.includes("supplier-response-async")
      ),
    JSON.stringify({
      asyncSupplierResponseAfterClose,
      asyncSupplierResponseAuditRows
    })
  );
  record(
    "RELEASE-DECISION-ASYNC-009 SQLite semantic release lifecycle marks current and obsoletes previous releases",
    asyncReleasedSubmission?.status === "Released" &&
      asyncReleasedSubmission?.released_at === "2026-06-08T14:26:00.000Z" &&
      asyncReleasedSubmission?.release_error === null &&
      asyncReleasedSubmission?.reject_reason === null &&
      asyncUpdatedItem?.current_revision === "C" &&
      asyncLifecycleObsoleteRows.length === 2 &&
      asyncObsoleteSubmissions.length === 2 &&
      asyncObsoleteSubmissions.every(
        (row) =>
          row.status === "Obsolete" &&
          row.superseded_by_submission_id === "sub-release-pending" &&
          row.obsolete_by === "user-manager-demo"
      ) &&
      Number(asyncObsoleteAuditCount?.count ?? 0) === 2,
    JSON.stringify({
      asyncReleasedSubmission,
      asyncUpdatedItem,
      asyncLifecycleObsoleteRows,
      asyncObsoleteSubmissions,
      asyncObsoleteAuditCount
    })
  );

  database.close();
} catch (error) {
  record(
    "ACCESS-ASYNC-015 SQLite semantic role list returns system roles first",
    false,
    error instanceof Error ? error.stack ?? error.message : String(error)
  );
  record("ACCESS-ASYNC-016 SQLite semantic user list returns three users", false, "semantic setup failed");
  record("ACCESS-ASYNC-017 SQLite semantic role lookup works and missing role is undefined", false, "semantic setup failed");
  record("ACCESS-ASYNC-018 SQLite semantic permission upsert updates existing row", false, "semantic setup failed");
  record("ACCESS-ASYNC-019 SQLite semantic permission list is deterministic", false, "semantic setup failed");
  record("ACCESS-ASYNC-020 SQLite semantic assigned role lookup works", false, "semantic setup failed");
  record("ACCESS-ASYNC-021 SQLite semantic active role priority lookup works", false, "semantic setup failed");
  record("ACCESS-ASYNC-022 SQLite semantic active delegation lookup works", false, "semantic setup failed");
  record("ACCESS-ASYNC-023 SQLite semantic enabled role and permission-code lookups work", false, "semantic setup failed");
  record("AUTH-ASYNC-012 SQLite semantic user-by-id lookup works", false, "semantic setup failed");
  record("AUTH-ASYNC-013 SQLite semantic user-by-email lookup is case-insensitive", false, "semantic setup failed");
  record("AUTH-ASYNC-014 SQLite semantic password lookup includes password hash", false, "semantic setup failed");
  record("AUTH-ASYNC-015 SQLite semantic user upsert updates by email", false, "semantic setup failed");
  record("AUTH-ASYNC-016 SQLite semantic create and password update work", false, "semantic setup failed");
  record("AUDIT-ASYNC-005 SQLite semantic audit insert works", false, "semantic setup failed");
  record("AI-CHAT-ASYNC-004 SQLite semantic conversation create/get works", false, "semantic setup failed");
  record("AI-CHAT-ASYNC-005 SQLite semantic message insert updates conversation timestamp", false, "semantic setup failed");
  record("ITEM-INSIGHT-ASYNC-005 SQLite semantic revision history returns newest first and honors scope", false, "semantic setup failed");
  record("ITEM-INSIGHT-ASYNC-006 SQLite semantic where-used is case-insensitive and honors scope", false, "semantic setup failed");
  record("DASHBOARD-METRICS-ASYNC-004 SQLite semantic metrics count all statuses", false, "semantic setup failed");
  record("DASHBOARD-METRICS-ASYNC-005 SQLite semantic metrics honor submittedBy scope", false, "semantic setup failed");
  record(
    "NOTIFICATION-ASYNC-004 SQLite semantic notification queries cover status file package and lock alerts",
    false,
    "semantic setup failed"
  );
  record("NOTIFICATION-ASYNC-005 SQLite semantic engineer notification scope is enforced", false, "semantic setup failed");
  record("HANDOFF-ASYNC-004 SQLite semantic handoff returns latest released submission per item", false, "semantic setup failed");
  record("HANDOFF-ASYNC-005 SQLite semantic handoff honors submittedBy scope and limit", false, "semantic setup failed");
  record("ITEM-LOCK-ASYNC-003 SQLite semantic preflight active lock lookup and expiry work", false, "semantic setup failed");
  record("ITEM-LOCK-ASYNC-004 SQLite semantic checkout create release and audits work", false, "semantic setup failed");
  record("SUBMISSION-LIST-ASYNC-004 SQLite semantic list returns newest first with aggregate flags", false, "semantic setup failed");
  record("SUBMISSION-LIST-ASYNC-005 SQLite semantic list honors status, submittedBy, limit, and offset", false, "semantic setup failed");
  record("SUBMISSION-SEARCH-ASYNC-004 SQLite semantic search finds file references and honors query", false, "semantic setup failed");
  record("SUBMISSION-SEARCH-ASYNC-005 SQLite semantic search honors status, submittedBy, and finder filters", false, "semantic setup failed");
  record("SUBMISSION-SEARCH-ASYNC-006 SQLite semantic search honors child part and outdated BOM filters", false, "semantic setup failed");
  record("SUBMISSION-DETAIL-ASYNC-004 SQLite semantic detail row includes release package, references, approvals, audit, and BOM", false, "semantic setup failed");
  record("SUBMISSION-DETAIL-ASYNC-005 SQLite semantic detail row includes files and active lock", false, "semantic setup failed");
  record("SUBMISSION-DETAIL-ASYNC-006 SQLite semantic missing detail returns undefined", false, "semantic setup failed");
  record("BOM-ASYNC-002 SQLite semantic BOM detail previous and materialize SQL work", false, "semantic setup failed");
  record("SANDBOX-ASYNC-002 SQLite semantic sandbox branch create list close and merge SQL work", false, "semantic setup failed");
  record("NUMBERING-DUPLICATE-ASYNC-002 SQLite semantic duplicate lookup event and audit SQL work", false, "semantic setup failed");
  record(
    "NUMBERING-ROOT-DETAIL-ASYNC-002 SQLite semantic root detail SQL returns parts drawings links variants warnings and audit",
    false,
    "semantic setup failed"
  );
  record("NUMBERING-SEARCH-ASYNC-002 SQLite semantic search SQL returns roots parts drawings and warning counts", false, "semantic setup failed");
  record(
    "NUMBERING-DRAWING-MODULE-ASYNC-002 SQLite semantic drawing module SQL returns drawing linked parts variants and cost status",
    false,
    "semantic setup failed"
  );
  record(
    "NUMBERING-PART-MODULE-ASYNC-002 SQLite semantic part module SQL returns variant drawing and standard cost fields",
    false,
    "semantic setup failed"
  );
  record("NUMBERING-TASK-ASYNC-001 SQLite semantic task status update SQL works", false, "semantic setup failed");
  record("NUMBERING-TASK-ASYNC-002 SQLite semantic task list role scope SQL works", false, "semantic setup failed");
  record("NUMBERING-NOTIFICATION-ASYNC-002 SQLite semantic notification list and state SQL works", false, "semantic setup failed");
  record("NUMBERING-EXPORT-ASYNC-002 SQLite semantic export payload job and audit SQL works", false, "semantic setup failed");
  record("NUMBERING-MONTHLY-AUDIT-ASYNC-002 SQLite semantic monthly report counts list get and audit SQL works", false, "semantic setup failed");
  record("NUMBERING-DRAFTS-OVERDUE-ASYNC-002 SQLite semantic overdue draft update task notification and audit SQL works", false, "semantic setup failed");
  record("SUBMISSION-CANDIDATE-ASYNC-002 SQLite semantic reuse and duplicate candidate SQL works", false, "semantic setup failed");
  record("SUBMISSION-WRITE-ASYNC-006 SQLite semantic item upsert and revision duplicate check work", false, "semantic setup failed");
  record("SUBMISSION-WRITE-ASYNC-007 SQLite semantic submission files references and submit audit insert work", false, "semantic setup failed");
  record("SUBMISSION-WRITE-ASYNC-008 SQLite semantic BOM materialization from assembly references works", false, "semantic setup failed");
  record("BOM-WORKBENCH-ASYNC-007G SQLite semantic draft from assembly creates draft lines event and audit", false, "semantic setup failed");
  record(
    "BOM-WORKBENCH-ASYNC-007I SQLite semantic draft import-xls creates profile asset job lines event and audit",
    false,
    "semantic setup failed"
  );
  record("SUBMISSION-FILE-ASYNC-006 SQLite semantic file lookup and missing file behavior work", false, "semantic setup failed");
  record("SUBMISSION-FILE-ASYNC-007 SQLite semantic upload queue and status updates work", false, "semantic setup failed");
  record("BOM-WORKBENCH-ASYNC-006 SQLite semantic parent and draft summary lookup works", false, "semantic setup failed");
  record("BOM-WORKBENCH-ASYNC-007 SQLite semantic active draft detail and line ordering work", false, "semantic setup failed");
  record("BOM-WORKBENCH-ASYNC-007A SQLite semantic draft diff baseline snapshot lookup works", false, "semantic setup failed");
  record("BOM-WORKBENCH-ASYNC-007B SQLite semantic pending review list joins draft metadata and diff baseline", false, "semantic setup failed");
  record("BOM-WORKBENCH-ASYNC-007C SQLite semantic release snapshot by id lookup works", false, "semantic setup failed");
  record("BOM-WORKBENCH-ASYNC-008 SQLite semantic missing workbench and draft return undefined", false, "semantic setup failed");
  record("BOM-WORKBENCH-ASYNC-009 SQLite semantic active draft switch updates draft, edit event, and audit", false, "semantic setup failed");
  record("COLLABORATION-ASYNC-005 SQLite semantic discussion create/list/resolve works", false, "semantic setup failed");
  record("COLLABORATION-ASYNC-006 SQLite semantic review issue create/list/resolve works", false, "semantic setup failed");
  record("COLLABORATION-ASYNC-007 SQLite semantic PDF markup create/list/resolve works", false, "semantic setup failed");
  record("COLLABORATION-ASYNC-008 SQLite semantic collaboration audit insert works", false, "semantic setup failed");
  record("CHANGE-REQUEST-ASYNC-005 SQLite semantic change request create/list works", false, "semantic setup failed");
  record("CHANGE-REQUEST-ASYNC-006 SQLite semantic change request decide works", false, "semantic setup failed");
  record("CHANGE-REQUEST-ASYNC-007 SQLite semantic change request audit insert works", false, "semantic setup failed");
  record("APPROVAL-MATRIX-ASYNC-005 SQLite semantic approval matrix list and approved count work", false, "semantic setup failed");
  record("APPROVAL-MATRIX-ASYNC-006 SQLite semantic approval matrix refresh satisfies approved requirement", false, "semantic setup failed");
  record("APPROVAL-MATRIX-ASYNC-007 SQLite semantic approval matrix waive and audit work", false, "semantic setup failed");
  record("APPROVAL-DECISION-ASYNC-004 SQLite semantic approval decision insert, duplicate lookup, and summary work", false, "semantic setup failed");
  record("APPROVAL-DECISION-ASYNC-005 SQLite semantic reject status update and audit work", false, "semantic setup failed");
  record("RELEASE-DECISION-ASYNC-006 SQLite semantic active sandbox and filename conflict checks work", false, "semantic setup failed");
  record("RELEASE-DECISION-ASYNC-007 SQLite semantic releasing and release failure status updates work", false, "semantic setup failed");
  record("RELEASE-DECISION-ASYNC-008 SQLite semantic release package upsert works", false, "semantic setup failed");
  record("PROCUREMENT-SYNC-ASYNC-004 SQLite semantic create list and audit work", false, "semantic setup failed");
  record("PROCUREMENT-SYNC-ASYNC-005 SQLite semantic decision update and audit work", false, "semantic setup failed");
  record("READONLY-SHARE-ASYNC-004 SQLite semantic share create list and audit work", false, "semantic setup failed");
  record("READONLY-SHARE-ASYNC-005 SQLite semantic share revoke and audit work", false, "semantic setup failed");
  record("PUBLIC-SHARE-ASYNC-004 SQLite semantic share access count update works", false, "semantic setup failed");
  record("SUPPLIER-RESPONSE-ASYNC-004 SQLite semantic readonly share and response create/list work", false, "semantic setup failed");
  record("SUPPLIER-RESPONSE-ASYNC-005 SQLite semantic response close and audit work", false, "semantic setup failed");
  record(
    "RELEASE-DECISION-ASYNC-009 SQLite semantic release lifecycle marks current and obsoletes previous releases",
    false,
    "semantic setup failed"
  );
}

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);

process.exitCode = failed.length === 0 ? 0 : 1;
