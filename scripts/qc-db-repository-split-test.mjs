#!/usr/bin/env node

import { projectFileExists, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

const db = readProjectFile(root, "src/lib/db.ts");
const packageJson = readProjectJson(root, "package.json");
const repositories = {
  dashboard: "src/lib/repositories/dashboard-repository.ts",
  ai: "src/lib/repositories/ai-repository.ts",
  system: "src/lib/repositories/system-repository.ts",
  collaboration: "src/lib/repositories/collaboration-repository.ts",
  notification: "src/lib/repositories/notification-repository.ts",
  itemLock: "src/lib/repositories/item-lock-repository.ts",
  release: "src/lib/repositories/release-repository.ts",
  sandbox: "src/lib/repositories/sandbox-repository.ts",
  approval: "src/lib/repositories/approval-repository.ts",
  submissionFile: "src/lib/repositories/submission-file-repository.ts",
  user: "src/lib/repositories/user-repository.ts",
  item: "src/lib/repositories/item-repository.ts",
  bom: "src/lib/repositories/bom-repository.ts",
  submission: "src/lib/repositories/submission-repository.ts",
  contracts: "src/lib/repositories/contracts.ts"
};

for (const [name, relativePath] of Object.entries(repositories)) {
  record(`REPO-001 ${name} repository file exists`, projectFileExists(root, relativePath), relativePath);
}

record("REPO-002 db.ts re-exports dashboard repository", db.includes("@/lib/repositories/dashboard-repository"), "src/lib/db.ts");
record("REPO-003 db.ts re-exports ai repository", db.includes("@/lib/repositories/ai-repository"), "src/lib/db.ts");
record("REPO-004 db.ts re-exports system repository", db.includes("@/lib/repositories/system-repository"), "src/lib/db.ts");
record("REPO-005 db.ts re-exports collaboration repository", db.includes("@/lib/repositories/collaboration-repository"), "src/lib/db.ts");
record("REPO-006 db.ts re-exports notification repository", db.includes("@/lib/repositories/notification-repository"), "src/lib/db.ts");
record("REPO-007 db.ts re-exports item-lock repository", db.includes("@/lib/repositories/item-lock-repository"), "src/lib/db.ts");
record("REPO-008 db.ts re-exports release repository", db.includes("@/lib/repositories/release-repository"), "src/lib/db.ts");
record("REPO-009 db.ts re-exports sandbox repository", db.includes("@/lib/repositories/sandbox-repository"), "src/lib/db.ts");
record("REPO-010 db.ts re-exports approval repository", db.includes("@/lib/repositories/approval-repository"), "src/lib/db.ts");
record("REPO-011 db.ts re-exports submission-file repository", db.includes("@/lib/repositories/submission-file-repository"), "src/lib/db.ts");
record("REPO-012 db.ts re-exports user repository", db.includes("@/lib/repositories/user-repository"), "src/lib/db.ts");
record("REPO-013 db.ts re-exports item repository", db.includes("@/lib/repositories/item-repository"), "src/lib/db.ts");
record("REPO-014 db.ts re-exports bom repository", db.includes("@/lib/repositories/bom-repository"), "src/lib/db.ts");
record("REPO-015 db.ts re-exports submission repository", db.includes("@/lib/repositories/submission-repository"), "src/lib/db.ts");

for (const symbol of [
  "getDashboardMetrics",
  "createLlmConversation",
  "getLlmConversation",
  "addLlmMessage",
  "getSystemSetting",
  "setSystemSetting",
  "getAllSystemSettings",
  "listDiscussionComments",
  "createDiscussionComment",
  "resolveDiscussionComment",
  "listReviewIssues",
  "createReviewIssue",
  "resolveReviewIssue",
  "listChangeRequests",
  "createChangeRequest",
  "decideChangeRequest",
  "listPdfMarkups",
  "createPdfMarkup",
  "resolvePdfMarkup",
  "listNotifications",
  "summarizeNotifications",
  "getActiveItemLock",
  "findActiveItemLockForSubmissionIdentifiers",
  "expireItemLocks",
  "createItemLock",
  "releaseItemLock",
  "getReleasePackageBySubmissionId",
  "upsertReleasePackageRecord",
  "listReadonlyShares",
  "createReadonlyShare",
  "revokeReadonlyShare",
  "getReadonlyShareByTokenHash",
  "recordReadonlyShareAccess",
  "listSupplierPortalResponses",
  "getSupplierPortalResponse",
  "createSupplierPortalResponse",
  "closeSupplierPortalResponse",
  "listProcurementSyncRuns",
  "getProcurementSyncRun",
  "createProcurementSyncRun",
  "decideProcurementSyncRun",
  "getSandboxMergePreview",
  "listSandboxBranchesForSubmission",
  "getSandboxBranchById",
  "getActiveSandboxBranchForSubmission",
  "createSandboxBranch",
  "updateSandboxBranchStatus",
  "mergeSandboxBranch",
  "addApproval",
  "reviewerHasDecision",
  "getApprovalSummary",
  "listApprovalMatrixRequirements",
  "getApprovalMatrixRequirement",
  "initializeApprovalMatrixRequirements",
  "refreshApprovalMatrixRequirements",
  "waiveApprovalMatrixRequirement",
  "listOpenApprovalMatrixRequirements",
  "getSubmissionFile",
  "updateFileGDriveStatus",
  "getFilesNeedingUpload",
  "findReleasedFilenameConflicts",
  "getAuthMode",
  "getUserById",
  "getUserByEmail",
  "getUserByEmailWithPassword",
  "createUser",
  "updateUserPassword",
  "ensureDemoUser",
  "listItemRevisionHistory",
  "submissionRevisionExists",
  "findOrCreateItem",
  "getBomBySubmissionId",
  "findPreviousBomSubmissionId",
  "getBomDiffBetweenSubmissions",
  "listWhereUsed",
  "listSubmissions",
  "getSubmission",
  "searchSubmissions",
  "listDesignReuseCandidates",
  "listDuplicateGeometryCandidates",
  "listManufacturingHandoffEntries",
  "createSubmissionRecord",
  "updateSubmissionStatus",
  "markSubmissionReleasedAndObsoletePrevious"
]) {
  record(`REPO-016 db.ts no longer owns ${symbol}`, !new RegExp(`export function ${symbol}\\b`, "u").test(db), "src/lib/db.ts");
}

const aiRepository = readProjectFile(root, repositories.ai);
const dashboardRepository = readProjectFile(root, repositories.dashboard);
const systemRepository = readProjectFile(root, repositories.system);
const collaborationRepository = readProjectFile(root, repositories.collaboration);
const notificationRepository = readProjectFile(root, repositories.notification);
const itemLockRepository = readProjectFile(root, repositories.itemLock);
const releaseRepository = readProjectFile(root, repositories.release);
const sandboxRepository = readProjectFile(root, repositories.sandbox);
const approvalRepository = readProjectFile(root, repositories.approval);
const submissionFileRepository = readProjectFile(root, repositories.submissionFile);
const userRepository = readProjectFile(root, repositories.user);
const itemRepository = readProjectFile(root, repositories.item);
const bomRepository = readProjectFile(root, repositories.bom);
const submissionRepository = readProjectFile(root, repositories.submission);
record("REPO-017 ai repository owns LLM persistence", /llm_conversations/u.test(aiRepository) && /llm_messages/u.test(aiRepository), repositories.ai);
record("REPO-018 dashboard repository owns metrics query", /GROUP BY status/u.test(dashboardRepository), repositories.dashboard);
record("REPO-019 system repository owns settings upsert", /ON CONFLICT\(key\)/u.test(systemRepository), repositories.system);
record(
  "REPO-020 collaboration repository owns review workflow tables",
  ["discussion_comments", "review_issues", "change_requests", "pdf_markups"].every((table) =>
    collaborationRepository.includes(table)
  ),
  repositories.collaboration
);
record(
  "REPO-021 notification repository owns notification queries",
  ["release_failed", "pending_review", "drive_upload_failed", "release_package_missing", "active_lock"].every((kind) =>
    notificationRepository.includes(kind)
  ),
  repositories.notification
);
record(
  "REPO-022 item-lock repository owns checkout locking",
  ["item_locks", "CheckoutLockCreated", "CheckoutLockReleased"].every((marker) => itemLockRepository.includes(marker)),
  repositories.itemLock
);
record(
  "REPO-023 release repository owns release/share/procurement workflows",
  [
    "release_packages",
    "readonly_shares",
    "supplier_portal_responses",
    "procurement_sync_runs",
    "ReadonlyShareCreated",
    "SupplierPortalResponseCreated",
    "ProcurementSyncSent"
  ].every((marker) => releaseRepository.includes(marker)),
  repositories.release
);
record(
  "REPO-024 sandbox repository owns sandbox branch workflows",
  ["sandbox_branches", "SandboxBranchCreated", "SandboxBranchMerged", "merge_summary_json"].every((marker) =>
    sandboxRepository.includes(marker)
  ),
  repositories.sandbox
);
record(
  "REPO-025 approval repository owns approval matrix workflows",
  ["approval_steps", "approval_matrix_requirements", "ApprovalMatrixInitialized", "ApprovalMatrixWaived"].every((marker) =>
    approvalRepository.includes(marker)
  ),
  repositories.approval
);
record(
  "REPO-026 submission-file repository owns file status workflows",
  ["submission_files", "gdrive_status", "gdrive_file_id", "Released"].every((marker) => submissionFileRepository.includes(marker)),
  repositories.submissionFile
);
record(
  "REPO-027 user repository owns auth and user workflows",
  ["users", "PDM_BOOTSTRAP_USERS", "DEMO_PASSWORD", "password_hash", "seedConfiguredUsers"].every((marker) =>
    userRepository.includes(marker)
  ),
  repositories.user
);
record(
  "REPO-028 item repository owns item core workflows",
  ["items", "current_revision", "part_number", "revision"].every((marker) => itemRepository.includes(marker)),
  repositories.item
);
record(
  "REPO-029 bom repository owns BOM and where-used workflows",
  ["bom_headers", "bom_lines", "ReleasedSnapshot", "child_part_number", "parent_submission_id"].every((marker) =>
    bomRepository.includes(marker)
  ),
  repositories.bom
);
record(
  "REPO-030 submission repository owns submission workflows",
  [
    "submissions",
    "submission_files",
    "file_references",
    '"Submit"',
    "markSubmissionReleasedAndObsoletePrevious",
    "ObsoleteByRevision"
  ].every((marker) => submissionRepository.includes(marker)),
  repositories.submission
);
record("REPO-031 package exposes repository split QC", packageJson.scripts?.["qc:db-repository-split"] === "node scripts/qc-db-repository-split-test.mjs", "package.json");

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
