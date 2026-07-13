import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createDefaultDatabaseProvider, type DatabaseProvider, type SqliteDatabase } from "@/lib/db-provider";
import { reconcileItemCurrentRevisions } from "@/lib/repositories/item-repository";
import { seedConfiguredUsers } from "@/lib/repositories/user-repository";

export { getDashboardMetrics } from "@/lib/repositories/dashboard-repository";
export { addLlmMessage, createLlmConversation, getLlmConversation, type LlmConversation } from "@/lib/repositories/ai-repository";
export { getAllSystemSettings, getSystemSetting, setSystemSetting } from "@/lib/repositories/system-repository";
export {
  createChangeRequest,
  createDiscussionComment,
  createPdfMarkup,
  createReviewIssue,
  decideChangeRequest,
  decidePhaseGateCheck,
  getChangeRequest,
  getDiscussionComment,
  getPdfMarkup,
  getPhaseGateCheck,
  getReviewIssue,
  initializePhaseGateChecks,
  listChangeRequests,
  listDiscussionComments,
  listOpenRequiredPhaseGateChecks,
  listPdfMarkups,
  listPhaseGateChecks,
  listReviewIssues,
  resolveDiscussionComment,
  resolvePdfMarkup,
  resolveReviewIssue
} from "@/lib/repositories/collaboration-repository";
export { listNotifications, summarizeNotifications } from "@/lib/repositories/notification-repository";
export { getActiveItemLock } from "@/lib/repositories/item-lock-repository";
export {
  createItemLock,
  expireItemLocks,
  findActiveItemLockForSubmissionIdentifiers,
  releaseItemLock
} from "@/lib/repositories/item-lock-repository";
export { getReleasePackageBySubmissionId } from "@/lib/repositories/release-repository";
export {
  closeSupplierPortalResponse,
  createProcurementSyncRun,
  createReadonlyShare,
  createSupplierPortalResponse,
  decideProcurementSyncRun,
  getProcurementSyncRun,
  getReadonlyShareByTokenHash,
  getSupplierPortalResponse,
  listProcurementSyncRuns,
  listReadonlyShares,
  listSupplierPortalResponses,
  recordReadonlyShareAccess,
  revokeReadonlyShare,
  upsertReleasePackageRecord
} from "@/lib/repositories/release-repository";
export {
  createSandboxBranch,
  getActiveSandboxBranchForSubmission,
  getSandboxBranchById,
  getSandboxMergePreview,
  listSandboxBranchesForSubmission,
  mergeSandboxBranch,
  updateSandboxBranchStatus
} from "@/lib/repositories/sandbox-repository";
export {
  addApproval,
  getApprovalMatrixRequirement,
  getApprovalSummary,
  initializeApprovalMatrixRequirements,
  listApprovalMatrixRequirements,
  listOpenApprovalMatrixRequirements,
  refreshApprovalMatrixRequirements,
  reviewerHasDecision,
  waiveApprovalMatrixRequirement
} from "@/lib/repositories/approval-repository";
export {
  findReleasedFilenameConflicts,
  getFilesNeedingUpload,
  getSubmissionFile,
  updateFileGDriveStatus
} from "@/lib/repositories/submission-file-repository";
export {
  createUser,
  ensureDemoUser,
  getAuthMode,
  getUserByEmail,
  getUserByEmailWithPassword,
  getUserById,
  updateUserPassword,
  type DbUser,
  type DbUserWithPassword
} from "@/lib/repositories/user-repository";
export { findOrCreateItem, listItemRevisionHistory, submissionRevisionExists } from "@/lib/repositories/item-repository";
export {
  createMasterAttachment,
  getMasterAttachment,
  getMasterAttachmentBytes,
  listMasterAttachments,
  softDeleteMasterAttachment,
  syncMasterAttachmentToDrive,
  type MasterAttachmentCategory,
  type MasterAttachmentDriveStatus,
  type MasterAttachmentEntityType,
  type MasterAttachmentPreviewDerivative,
  type MasterAttachmentPreviewDerivativeStatus,
  type MasterAttachmentPreviewJob,
  type MasterAttachmentPreviewJobStatus,
  type MasterAttachmentRecord
} from "@/lib/repositories/master-attachment-repository";
export {
  addDrawingNumberToRoot,
  addPartNumberToRoot,
  analyzeMainDrawingObsolescence,
  applyNumberingRuleTemplate,
  checkNumberingDuplicates,
  checkNumberingPermission,
  confirmNumberingImportBatch,
  createNumberingApprovalBatch,
  createNumberingExportJob,
  createNumberingImportBatch,
  createPartCostProfile,
  decidePartCostChangeRequest,
  createNumberingRecord,
  decideNumberingApprovalBatch,
  decideNumberingApproval,
  evaluateApprovalRules,
  evaluateNumberingGate,
  listDvtPromotionCandidates,
  getNumberingRootDetail,
  getNumberingApprovalBatch,
  getNumberingExportJob,
  getNumberingImportBatch,
  getNumberingRootBundle,
  generateMonthlyNumberingAuditReport,
  getMonthlyNumberingAuditReport,
  listNumberingApprovalBatches,
  listMonthlyNumberingAuditReports,
  listNumberingAdminMatrix,
  listNumberingExportJobs,
  listNumberingImportBatches,
  listNumberingNotifications,
  listNumberingTasks,
  listDrawingModuleRecords,
  listPartModuleRecords,
  linkPartNumberToDrawing,
  markOverdueDraftNumberingRecords,
  obsoleteDraftNumberingRecord,
  resubmitRejectedNumberingApprovalBatchItems,
  requestMainDrawingRestoreApproval,
  requestNumberingApproval,
  requestSameDrawingVariantApproval,
  resolvePartCost,
  revokeNumberingApprovalDelegation,
  revokeNumberingUserRoleAssignment,
  saveNumberingRolePriority,
  searchNumberingRecords,
  submitDvtPromotionDecisions,
  getPartModuleDetail,
  updateDraftNumberingRecord,
  upsertNumberingAdminRole,
  upsertNumberingApprovalDelegation,
  upsertNumberingApprovalRule,
  upsertNumberingRolePermission,
  upsertNumberingRoleScope,
  upsertNumberingUserRoleAssignment,
  upsertPartVariantAttributes,
  updateNumberingNotificationState,
  updateNumberingTaskStatus,
  type AddDrawingNumberInput,
  type AddPartNumberInput,
  type ApplyNumberingRuleTemplateInput,
  type CreateNumberingRecordInput,
  type DecideNumberingApprovalInput,
  type DvtPromotionCandidateRecord,
  type DvtPromotionCandidateStatus,
  type DvtPromotionDecisionAction,
  type DvtPromotionDecisionResult,
  type DvtPromotionSubmissionRecord,
  type DrawingModuleListInput,
  type DrawingModuleListRecord,
  type DrawingPurposeCode,
  type DrawingNumberRecord,
  type ApprovalRuleEvaluation,
  type CreateNumberingApprovalBatchInput,
  type CreateNumberingExportJobInput,
  type CreateNumberingImportBatchInput,
  type CreatePartCostProfileInput,
  type DecidePartCostChangeRequestInput,
  type EvaluateApprovalRuleInput,
  type DecideNumberingApprovalBatchInput,
  type DuplicateCheckInput,
  type EvaluateNumberingGateInput,
  type LinkPartNumberToDrawingInput,
  type ListMonthlyNumberingAuditReportsInput,
  type ListNumberingApprovalBatchesInput,
  type ListDvtPromotionCandidatesInput,
  type ListNumberingExportJobsInput,
  type ListNumberingImportBatchesInput,
  type MarkOverdueDraftNumberingInput,
  type MarkOverdueDraftNumberingResult,
  type MainDrawingImpactInput,
  type PartCostType,
  type PartCostResolutionRecord,
  type PartModuleDetailRecord,
  type PartModuleListInput,
  type PartModuleListRecord,
  type UpsertPartVariantAttributesInput,
  type ResolvePartCostInput,
  type NumberingAuditTrailRecord,
  type NumberingAttentionMarkerRecord,
  type NumberingApprovalRecord,
  type NumberingApprovalActionCode,
  type NumberingApprovalBatchRecord,
  type NumberingApprovalReviewBatchRecord,
  type NumberingApprovalReviewBatchItemRecord,
  type NumberingApprovalReviewRequestRecord,
  type NumberingApprovalDecisionRecord,
  type NumberingApprovalEntitySummaryRecord,
  type NumberingPhase,
  type NumberingNotificationRecord,
  type NumberingImportBatchRecord,
  type NumberingItemKind,
  type NumberingExportJobRecord,
  type NumberingLinkRecord,
  type NumberingAdminApprovalRuleRecord,
  type NumberingAdminRoleScopeRecord,
  type NumberingAdminUserRecord,
  type NumberingApprovalDelegationRecord,
  type NumberingAdminMatrixRecord,
  type NumberingAdminPermissionRecord,
  type NumberingAdminRoleRecord,
  type NumberingApprovalHardRuleCatalogItem,
  type NumberingPermissionCheckResult,
  type NumberingPermissionKind,
  type NumberingAdminRuleTemplateRecord,
  type NumberingUserRoleAssignmentRecord,
  type NumberingRolePriorityVersionRecord,
  type NumberingRoleScopeKind,
  type NumberingRuleVersionRecord,
  type NumberingRecordStatus,
  type NumberingRootDetailRecord,
  type NumberingSearchEntityType,
  type NumberingSearchInput,
  type NumberingSearchResultRecord,
  type MonthlyAuditReportRecord,
  type NumberingTaskRecord,
  type NumberingUserScope,
  type NumberingVariantRecord,
  type NumberingWarningRecord,
  type ObsoleteDraftNumberingRecordInput,
  type RevokeNumberingApprovalDelegationInput,
  type RevokeNumberingUserRoleAssignmentInput,
  type RequestMainDrawingRestoreApprovalInput,
  type RequestNumberingApprovalInput,
  type ResubmitRejectedNumberingApprovalBatchItemsInput,
  type ConfirmNumberingImportBatchInput,
  type CheckNumberingPermissionInput,
  type GenerateMonthlyNumberingAuditReportInput,
  type SaveNumberingRolePriorityInput,
  type UpdateNumberingNotificationStateInput,
  type UpdateNumberingTaskStatusInput,
  type UpsertNumberingAdminRoleInput,
  type UpsertNumberingApprovalDelegationInput,
  type UpsertNumberingApprovalRuleInput,
  type UpsertNumberingRolePermissionInput,
  type UpsertNumberingRoleScopeInput,
  type UpsertNumberingUserRoleAssignmentInput,
  type UpdateDraftNumberingRecordInput,
  type RequestSameDrawingVariantApprovalInput,
  type SubmitDvtPromotionDecision,
  type SubmitDvtPromotionInput,
  type PartNumberRecord,
  type PartRootRecord
} from "@/lib/repositories/numbering-repository";
export {
  createBomWorkbenchDraftFromSolidWorksXls,
  createBomWorkbenchDraftFromAssembly,
  approveBomWorkbenchReview,
  BomReleaseGateError,
  BomXlsImportError,
  evaluateBomReleaseGate,
  findPreviousBomSubmissionId,
  getBomBySubmissionId,
  getBomDiffBetweenSubmissions,
  getBomImportJobById,
  getBomReleaseSnapshotById,
  getBomWorkbenchBySubmissionId,
  getBomWorkbenchDraftDiff,
  getBomWorkbenchDraftById,
  getBomWorkbenchReviewById,
  listPendingBomWorkbenchReviews,
  listBomWorkbenchDraftsBySubmissionId,
  listWhereUsed,
  materializeBomDraftFromReferences,
  rejectBomWorkbenchReview,
  saveBomWorkbenchDraftTree,
  setBomWorkbenchActiveDraft,
  submitBomWorkbenchDraftReview,
  type CreateBomWorkbenchDraftFromAssemblyInput,
  type CreateBomWorkbenchDraftFromSolidWorksXlsInput,
  type CreateBomWorkbenchDraftFromSolidWorksXlsResult,
  type DecideBomWorkbenchReviewInput,
  type BomWorkbenchDraftDiffResult,
  type BomWorkbenchLineDiffChange,
  type BomWorkbenchPendingReview,
  type SaveBomWorkbenchDraftTreeInput,
  type SetBomWorkbenchActiveDraftInput,
  type SubmitBomWorkbenchDraftReviewInput
} from "@/lib/repositories/bom-repository";
export {
  createSubmissionRecord,
  getSubmission,
  listDesignReuseCandidates,
  listDuplicateGeometryCandidates,
  listManufacturingHandoffEntries,
  listSubmissions,
  markSubmissionReleasedAndObsoletePrevious,
  searchSubmissions,
  updateSubmissionStatus,
  type SubmissionSearchFilters
} from "@/lib/repositories/submission-repository";

let dbProvider: DatabaseProvider | null = null;

function initDatabase(database: SqliteDatabase) {
  database.exec("PRAGMA foreign_keys = ON;");
  ensurePreSchemaCompatibility(database);
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  database.exec(schema);
  ensureCompanyScopeSchema(database);
  ensureNumberingCompanyScopeSchema(database);
  ensureNumberingWorkflowCompanyScopeSchema(database);
  ensureAccessControlLaunchSchema(database);
  ensureUsersRoleSchema(database);
  ensureAuthIdentitySchema(database);
  ensureSubmissionsLifecycleSchema(database);
  ensureSubmissionStoragePointerSchema(database);
  ensureSubmissionSnapshotAndAttemptSchema(database);
  ensureSubmissionLifecycleRequestSchema(database);
  ensureBomReviewLifecycleSchema(database);
  ensureSettingsSecretLifecycleSchema(database);
  ensureShared3dBaselineSchema(database);
  ensureSubmissionIndexes(database);
  reconcileItemCurrentRevisions(database);
  ensureColumn(database, "review_issues", "assignee_id", "TEXT");
  ensureColumn(database, "part_numbers", "custom_specification", "TEXT");
  ensureFileAssetsMasterAttachmentSchema(database);
  ensureSolidWorksNativePreviewSchema(database);
  ensureColumn(database, "sandbox_branches", "merged_by", "TEXT");
  ensureColumn(database, "sandbox_branches", "merge_summary_json", "TEXT");
  ensureColumn(database, "sandbox_branches", "merged_at", "TEXT");
  seedConfiguredUsers(database);
}

function ensurePreSchemaCompatibility(database: SqliteDatabase) {
  const usersTable = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get() as { name?: string } | undefined;
  if (!usersTable) return;

  // Schema-level indexes are evaluated before the full compatibility pass below.
  ensureColumn(
    database,
    "users",
    "account_status",
    "TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'expired', 'offboarded'))"
  );
  ensureColumn(
    database,
    "users",
    "system_role_enabled",
    "INTEGER NOT NULL DEFAULT 1 CHECK (system_role_enabled IN (0, 1))"
  );
}

function ensureBomReviewLifecycleSchema(database: SqliteDatabase) {
  ensureColumn(database, "bom_review_requests", "lifecycle_action", "TEXT NOT NULL DEFAULT 'release'");
  database
    .prepare("UPDATE bom_review_requests SET lifecycle_action = 'release' WHERE lifecycle_action IS NULL OR lifecycle_action = ''")
    .run();
}

function ensureSubmissionLifecycleRequestSchema(database: SqliteDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS submission_lifecycle_requests (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      action_code TEXT NOT NULL CHECK (action_code IN ('obsolete_submission')),
      request_status TEXT NOT NULL DEFAULT 'pending' CHECK (request_status IN ('pending', 'approved', 'rejected', 'cancelled')),
      requested_by TEXT NOT NULL,
      reason TEXT NOT NULL,
      decided_by TEXT,
      decision_reason TEXT,
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
      FOREIGN KEY (requested_by) REFERENCES users(id),
      FOREIGN KEY (decided_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_submission_lifecycle_requests_submission
      ON submission_lifecycle_requests(submission_id, action_code, request_status, created_at DESC);
  `);
}

function ensureSubmissionSnapshotAndAttemptSchema(database: SqliteDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS submission_snapshots (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL UNIQUE,
      company_id TEXT NOT NULL,
      source_root_id TEXT NOT NULL,
      source_root_code TEXT NOT NULL,
      source_drawing_number_id TEXT NOT NULL,
      source_drawing_number TEXT NOT NULL,
      source_part_number_id TEXT NOT NULL,
      source_part_number TEXT NOT NULL,
      snapshot_version TEXT NOT NULL DEFAULT 'drawing_part_submission_v1',
      rules_version TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      captured_by TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE INDEX IF NOT EXISTS idx_submission_snapshots_root
      ON submission_snapshots(company_id, source_root_code);
    CREATE INDEX IF NOT EXISTS idx_submission_snapshots_drawing
      ON submission_snapshots(company_id, source_drawing_number);

    CREATE TABLE IF NOT EXISTS submission_attempts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      source_root_code TEXT NOT NULL,
      source_drawing_number TEXT,
      source_revision TEXT,
      idempotency_key TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('started', 'blocked', 'failed', 'created')),
      retryable INTEGER NOT NULL DEFAULT 0 CHECK (retryable IN (0, 1)),
      blocker_json TEXT,
      error_code TEXT,
      error_message TEXT,
      submission_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL,
      UNIQUE (company_id, actor_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_submission_attempts_source
      ON submission_attempts(company_id, source_root_code, source_drawing_number, source_revision, updated_at DESC);
  `);
  ensureColumn(database, "submission_attempts", "source_revision", "TEXT");
  ensureColumn(database, "submission_attempts", "retryable", "INTEGER NOT NULL DEFAULT 0");
}

function ensureUsersRoleSchema(database: SqliteDatabase) {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get() as { sql?: string } | undefined;
  if (!row?.sql || row.sql.includes("'Manufacturing'") || row.sql.includes('"Manufacturing"')) return;

  database.exec("PRAGMA foreign_keys = OFF;");
  try {
    database.exec(`
      BEGIN;
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        email TEXT UNIQUE,
        password_hash TEXT,
        role TEXT NOT NULL CHECK (role IN ('Engineer', 'R&D Manager', 'Admin', 'Manufacturing', 'Procurement')),
        company_id TEXT NOT NULL DEFAULT 'company-jenfu',
        account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'expired', 'offboarded')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );
      INSERT INTO users_new (id, display_name, email, password_hash, role, company_id, created_at, updated_at)
      SELECT id, display_name, email, password_hash, role, COALESCE(company_id, 'company-jenfu'), created_at, updated_at
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      COMMIT;
    `);
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON;");
  }
}

function ensureAuthIdentitySchema(database: SqliteDatabase) {
  ensureColumn(
    database,
    "users",
    "account_status",
    "TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'expired', 'offboarded'))"
  );
  ensureColumn(database, "users", "session_invalid_before", "TEXT");
  ensureColumn(database, "users", "account_lifecycle_version", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "users", "system_role_enabled", "INTEGER NOT NULL DEFAULT 1 CHECK (system_role_enabled IN (0, 1))");
  ensureColumn(database, "users", "account_status_changed_at", "TEXT");
  ensureColumn(database, "users", "account_status_changed_by", "TEXT");
  ensureColumn(database, "users", "account_status_reason", "TEXT");
  database.exec(`
    CREATE TABLE IF NOT EXISTS auth_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('local_password', 'google_oauth', 'invite')),
      provider_subject TEXT NOT NULL,
      login_identifier TEXT,
      email_normalized TEXT,
      verified_at TEXT,
      last_login_at TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      identity_lifecycle_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (provider, provider_subject),
      UNIQUE (user_id, provider)
    );
    CREATE INDEX IF NOT EXISTS idx_auth_identities_login
      ON auth_identities(provider, login_identifier, status);
    CREATE INDEX IF NOT EXISTS idx_auth_identities_user
      ON auth_identities(user_id, status);
    CREATE TABLE IF NOT EXISTS account_recovery_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      identity_id TEXT,
      request_type TEXT NOT NULL DEFAULT 'admin_password_reset' CHECK (request_type IN ('admin_password_reset', 'account_recovery')),
      token_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'revoked', 'expired')),
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      used_at TEXT,
      used_by TEXT,
      revoked_at TEXT,
      revoked_by TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (identity_id) REFERENCES auth_identities(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (used_by) REFERENCES users(id),
      FOREIGN KEY (revoked_by) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_users_account_status
      ON users(account_status, system_role_enabled);
    CREATE INDEX IF NOT EXISTS idx_account_recovery_requests_user_status
      ON account_recovery_requests(user_id, status, expires_at);
    INSERT OR IGNORE INTO auth_identities (
      id, user_id, provider, provider_subject, login_identifier, email_normalized,
      verified_at, status, created_at, updated_at
    )
    SELECT
      'identity-local-' || id,
      id,
      'local_password',
      lower(email),
      lower(email),
      lower(email),
      created_at,
      'active',
      created_at,
      updated_at
    FROM users
    WHERE email IS NOT NULL AND password_hash IS NOT NULL;
  `);
  ensureColumn(database, "auth_identities", "identity_lifecycle_version", "INTEGER NOT NULL DEFAULT 1");
}

const defaultCompanies = [
  { id: "company-jenfu", companyCode: "JENFU", displayName: "鉦富" },
  { id: "company-maxima", companyCode: "MAXIMA", displayName: "久方" }
] as const;

function ensureCompanyScopeSchema(database: SqliteDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      company_code TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS user_company_memberships (
      user_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, company_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );
  `);

  const now = new Date().toISOString();
  for (const company of defaultCompanies) {
    database
      .prepare(
        `INSERT INTO companies (id, company_code, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(company_code) DO UPDATE SET
           display_name = excluded.display_name,
           updated_at = excluded.updated_at`
      )
      .run(company.id, company.companyCode, company.displayName, now, now);
  }

  ensureColumn(database, "users", "company_id", "TEXT NOT NULL DEFAULT 'company-jenfu'");
  database.prepare("UPDATE users SET company_id = 'company-jenfu' WHERE company_id IS NULL OR company_id = ''").run();
  ensureItemsCompanyScopeSchema(database);
  ensureUserCompanyMembershipBackfill(database);
}

function ensureItemsCompanyScopeSchema(database: SqliteDatabase) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'").get() as
    | { sql?: string }
    | undefined;
  const columns = database.prepare("PRAGMA table_info(items)").all() as Array<{ name: string }>;
  const hasCompanyId = columns.some((column) => column.name === "company_id");
  const usesCompanyUnique = Boolean(row?.sql?.includes("UNIQUE (company_id, part_number)"));

  if (hasCompanyId && usesCompanyUnique) return;

  const existing = new Set(columns.map((column) => column.name));
  const selectCompanyId = existing.has("company_id") ? "COALESCE(company_id, 'company-jenfu')" : "'company-jenfu'";
  const selectCurrentRevision = existing.has("current_revision") ? "current_revision" : "NULL";
  const selectCreatedAt = existing.has("created_at") ? "created_at" : "datetime('now')";
  const selectUpdatedAt = existing.has("updated_at") ? "updated_at" : "datetime('now')";

  database.pragma("foreign_keys = OFF");
  try {
    database.exec("DROP TABLE IF EXISTS items_company_scope_migration");
    database.exec(`
      CREATE TABLE items_company_scope_migration (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT 'company-jenfu',
        part_number TEXT NOT NULL,
        part_name TEXT NOT NULL,
        current_revision TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        UNIQUE (company_id, part_number)
      );
    `);
    database
      .prepare(
        `INSERT OR IGNORE INTO items_company_scope_migration (id, company_id, part_number, part_name, current_revision, created_at, updated_at)
         SELECT id, ${selectCompanyId}, part_number, part_name, ${selectCurrentRevision}, ${selectCreatedAt}, ${selectUpdatedAt}
         FROM items`
      )
      .run();
    database.exec("DROP TABLE items");
    database.exec("ALTER TABLE items_company_scope_migration RENAME TO items");
  } finally {
    database.pragma("foreign_keys = ON");
  }
}

function ensureUserCompanyMembershipBackfill(database: SqliteDatabase) {
  database
    .prepare(
      `INSERT OR IGNORE INTO user_company_memberships (user_id, company_id, is_default)
       SELECT id, COALESCE(company_id, 'company-jenfu'), 1
       FROM users`
    )
    .run();
  database
    .prepare(
      `INSERT OR IGNORE INTO user_company_memberships (user_id, company_id, is_default)
       SELECT id, 'company-maxima', 0
       FROM users
       WHERE role = 'Admin'`
    )
    .run();
}

function ensureNumberingCompanyScopeSchema(database: SqliteDatabase) {
  ensureColumn(database, "numbering_sequences", "company_id", "TEXT NOT NULL DEFAULT 'company-jenfu'");
  database.prepare("UPDATE numbering_sequences SET company_id = 'company-jenfu' WHERE company_id IS NULL OR company_id = ''").run();
  ensureNumberingRuleVersionSeeds(database);
  ensurePartRootsCompanyScopeSchema(database);
  ensurePartNumbersCompanyScopeSchema(database);
  ensureDrawingNumbersCompanyScopeSchema(database);
}

function ensureNumberingRuleVersionSeeds(database: SqliteDatabase) {
  database
    .prepare(
      `INSERT OR IGNORE INTO numbering_rule_versions (id, rule_code, title, status, retired_at, rule_json)
       VALUES (?, ?, ?, 'retired', datetime('now'), ?)`
    )
    .run(
      "numbering-rule-v1",
      "PDM-NUMBERING-V1",
      "PDM numbering rule v1",
      '{"partRootDigits":4,"partSequenceDigits":3,"drawingPrefix":"D","partPrefix":"P","drawingPurposeCodes":["MA","OT"]}'
    );
  database
    .prepare(
      `INSERT OR IGNORE INTO numbering_rule_versions (id, rule_code, title, status, rule_json)
       VALUES (?, ?, ?, 'retired', ?)`
    )
    .run(
      "numbering-rule-v2",
      "PDM-NUMBERING-V2",
      "PDM compact numbering rule v2",
      '{"rootDigits":5,"partCode":"P","drawingPurposeCodes":["M","R"],"partSequenceDigits":2,"drawingSequenceDigits":2,"reservedSequences":["00"],"formats":{"root":"{root}","part":"{root}-P{seq}","drawing":"{root}-{purpose}{seq}"},"compatibility":{"v1ManufacturingCodes":["MA"],"v1ReferenceCodes":["OT"]}}'
    );
  database
    .prepare(
      `INSERT OR IGNORE INTO numbering_rule_versions (id, rule_code, title, status, rule_json)
       VALUES (?, ?, ?, 'active', ?)`
    )
    .run(
      "numbering-rule-v3-alpha-root",
      "PDM-NUMBERING-V3",
      "PDM alphanumeric root numbering rule v3",
      '{"rootFormat":"alpha_numeric_1_letter_4_digits","rootLetters":"ABCDEFGHIJKLMNOPQRSTUVWXYZ","rootSequenceDigits":4,"rootSequenceStart":1,"rootSequenceEnd":9999,"partCode":"P","drawingPurposeCodes":["M","R"],"partSequenceDigits":2,"drawingSequenceDigits":2,"reservedRootSequences":["0000"],"reservedCategorySequences":["00"],"formats":{"root":"{letter}{rootSeq4}","part":"{root}-P{seq2}","drawing":"{root}-{purpose}{seq2}"},"compatibility":{"v1ManufacturingCodes":["MA"],"v1ReferenceCodes":["OT"],"v2RootPattern":"^[0-9]{5}$"}}'
    );
  database
    .prepare("UPDATE numbering_rule_versions SET status = 'retired', retired_at = COALESCE(retired_at, datetime('now')), updated_at = datetime('now') WHERE id = ?")
    .run("numbering-rule-v1");
  database
    .prepare("UPDATE numbering_rule_versions SET status = 'retired', retired_at = COALESCE(retired_at, datetime('now')), updated_at = datetime('now') WHERE id = ?")
    .run("numbering-rule-v2");
  database
    .prepare("UPDATE numbering_rule_versions SET status = 'active', retired_at = NULL, updated_at = datetime('now') WHERE id = ?")
    .run("numbering-rule-v3-alpha-root");
}

function ensurePartRootsCompanyScopeSchema(database: SqliteDatabase) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'part_roots'").get() as
    | { sql?: string }
    | undefined;
  const columns = database.prepare("PRAGMA table_info(part_roots)").all() as Array<{ name: string }>;
  const hasCompanyId = columns.some((column) => column.name === "company_id");
  const usesCompanyUnique = Boolean(row?.sql?.includes("UNIQUE (company_id, root_code)"));
  if (hasCompanyId && usesCompanyUnique) return;

  const existing = new Set(columns.map((column) => column.name));
  const selectCompanyId = existing.has("company_id") ? "COALESCE(company_id, 'company-jenfu')" : "'company-jenfu'";

  database.pragma("foreign_keys = OFF");
  try {
    database.exec("DROP TABLE IF EXISTS part_roots_company_scope_migration");
    database.exec(`
      CREATE TABLE part_roots_company_scope_migration (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT 'company-jenfu',
        root_code TEXT NOT NULL,
        core_name TEXT NOT NULL,
        item_kind TEXT NOT NULL CHECK (item_kind IN ('purchased', 'manufactured', 'outsourced', 'shared', 'custom')),
        development_phase TEXT NOT NULL DEFAULT 'EVT' CHECK (development_phase IN ('EVT', 'DVT', 'PVT', 'Release', 'ECR')),
        record_status TEXT NOT NULL DEFAULT 'Draft' CHECK (record_status IN ('Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected', 'Obsolete', 'Merged', 'EVTDisabled', 'PendingAdminConfirm', 'MainDrawingInvalid')),
        rule_version_id TEXT NOT NULL DEFAULT 'numbering-rule-v3-alpha-root',
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (rule_version_id) REFERENCES numbering_rule_versions(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        UNIQUE (company_id, root_code)
      );
    `);
    database
      .prepare(
        `INSERT OR IGNORE INTO part_roots_company_scope_migration (
           id, company_id, root_code, core_name, item_kind, development_phase, record_status,
           rule_version_id, created_by, created_at, updated_at
         )
         SELECT id, ${selectCompanyId}, root_code, core_name, item_kind, development_phase, record_status,
                rule_version_id, created_by, created_at, updated_at
         FROM part_roots`
      )
      .run();
    database.exec("DROP TABLE part_roots");
    database.exec("ALTER TABLE part_roots_company_scope_migration RENAME TO part_roots");
  } finally {
    database.pragma("foreign_keys = ON");
  }
}

function ensurePartNumbersCompanyScopeSchema(database: SqliteDatabase) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'part_numbers'").get() as
    | { sql?: string }
    | undefined;
  const columns = database.prepare("PRAGMA table_info(part_numbers)").all() as Array<{ name: string }>;
  const hasCompanyId = columns.some((column) => column.name === "company_id");
  const usesCompanyUnique = Boolean(row?.sql?.includes("UNIQUE (company_id, part_number)"));
  if (hasCompanyId && usesCompanyUnique) return;

  const existing = new Set(columns.map((column) => column.name));
  const selectCompanyId = existing.has("company_id") ? "COALESCE(company_id, 'company-jenfu')" : "'company-jenfu'";

  database.pragma("foreign_keys = OFF");
  try {
    database.exec("DROP TABLE IF EXISTS part_numbers_company_scope_migration");
    database.exec(`
      CREATE TABLE part_numbers_company_scope_migration (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT 'company-jenfu',
        part_root_id TEXT NOT NULL,
        part_number TEXT NOT NULL,
        sequence_no INTEGER NOT NULL CHECK (sequence_no >= 0),
        sequence_code TEXT NOT NULL,
        part_name TEXT NOT NULL,
        item_kind TEXT NOT NULL CHECK (item_kind IN ('purchased', 'manufactured', 'outsourced', 'shared', 'custom')),
        is_universal INTEGER NOT NULL DEFAULT 0 CHECK (is_universal IN (0, 1)),
        bom_usage_policy TEXT NOT NULL DEFAULT 'undecided' CHECK (bom_usage_policy IN ('undecided', 'not_required', 'available', 'restricted', 'obsolete')),
        custom_specification TEXT,
        development_phase TEXT NOT NULL DEFAULT 'EVT' CHECK (development_phase IN ('EVT', 'DVT', 'PVT', 'Release', 'ECR')),
        record_status TEXT NOT NULL DEFAULT 'Draft' CHECK (record_status IN ('Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected', 'Obsolete', 'Merged', 'EVTDisabled', 'PendingAdminConfirm', 'MainDrawingInvalid')),
        universal_reason TEXT,
        rule_version_id TEXT NOT NULL DEFAULT 'numbering-rule-v3-alpha-root',
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (part_root_id) REFERENCES part_roots(id) ON DELETE CASCADE,
        FOREIGN KEY (rule_version_id) REFERENCES numbering_rule_versions(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        UNIQUE (company_id, part_number),
        UNIQUE (part_root_id, sequence_code)
      );
    `);
    database
      .prepare(
        `INSERT OR IGNORE INTO part_numbers_company_scope_migration (
           id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
           item_kind, is_universal, bom_usage_policy, custom_specification, development_phase,
           record_status, universal_reason, rule_version_id, created_by, created_at, updated_at
         )
         SELECT id, ${selectCompanyId}, part_root_id, part_number, sequence_no, sequence_code, part_name,
                item_kind, is_universal, bom_usage_policy, custom_specification, development_phase,
                record_status, universal_reason, rule_version_id, created_by, created_at, updated_at
         FROM part_numbers`
      )
      .run();
    database.exec("DROP TABLE part_numbers");
    database.exec("ALTER TABLE part_numbers_company_scope_migration RENAME TO part_numbers");
  } finally {
    database.pragma("foreign_keys = ON");
  }
}

function ensureDrawingNumbersCompanyScopeSchema(database: SqliteDatabase) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'drawing_numbers'").get() as
    | { sql?: string }
    | undefined;
  const columns = database.prepare("PRAGMA table_info(drawing_numbers)").all() as Array<{ name: string }>;
  const hasCompanyId = columns.some((column) => column.name === "company_id");
  const usesCompanyUnique = Boolean(row?.sql?.includes("UNIQUE (company_id, drawing_number)"));
  const supportsV2PurposeCodes = Boolean(row?.sql?.includes("'M'") && row.sql.includes("'R'"));
  if (hasCompanyId && usesCompanyUnique && supportsV2PurposeCodes) return;

  const existing = new Set(columns.map((column) => column.name));
  const selectCompanyId = existing.has("company_id") ? "COALESCE(company_id, 'company-jenfu')" : "'company-jenfu'";

  database.pragma("foreign_keys = OFF");
  try {
    database.exec("DROP TABLE IF EXISTS drawing_numbers_company_scope_migration");
    database.exec(`
      CREATE TABLE drawing_numbers_company_scope_migration (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT 'company-jenfu',
        part_root_id TEXT NOT NULL,
        drawing_number TEXT NOT NULL,
        purpose_code TEXT NOT NULL CHECK (purpose_code IN ('MA', 'OT', 'M', 'R')),
        purpose_description TEXT NOT NULL DEFAULT '',
        sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
        is_primary_manufacturing INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_manufacturing IN (0, 1)),
        development_phase TEXT NOT NULL DEFAULT 'EVT' CHECK (development_phase IN ('EVT', 'DVT', 'PVT', 'Release', 'ECR')),
        record_status TEXT NOT NULL DEFAULT 'Draft' CHECK (record_status IN ('Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected', 'Obsolete', 'Merged', 'EVTDisabled', 'PendingAdminConfirm', 'MainDrawingInvalid')),
        rule_version_id TEXT NOT NULL DEFAULT 'numbering-rule-v3-alpha-root',
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (part_root_id) REFERENCES part_roots(id) ON DELETE CASCADE,
        FOREIGN KEY (rule_version_id) REFERENCES numbering_rule_versions(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        UNIQUE (company_id, drawing_number),
        UNIQUE (part_root_id, purpose_code, sequence_no)
      );
    `);
    database
      .prepare(
        `INSERT OR IGNORE INTO drawing_numbers_company_scope_migration (
           id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
           is_primary_manufacturing, development_phase, record_status, rule_version_id,
           created_by, created_at, updated_at
         )
         SELECT id, ${selectCompanyId}, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
                is_primary_manufacturing, development_phase, record_status, rule_version_id,
                created_by, created_at, updated_at
         FROM drawing_numbers`
      )
      .run();
    database.exec("DROP TABLE drawing_numbers");
    database.exec("ALTER TABLE drawing_numbers_company_scope_migration RENAME TO drawing_numbers");
  } finally {
    database.pragma("foreign_keys = ON");
  }
}

function ensureNumberingWorkflowCompanyScopeSchema(database: SqliteDatabase) {
  for (const tableName of [
    "approval_requests",
    "approval_batches",
    "import_batches",
    "numbering_export_jobs",
    "monthly_audit_reports",
    "numbering_task_items",
    "numbering_notifications"
  ]) {
    ensureColumn(database, tableName, "company_id", "TEXT NOT NULL DEFAULT 'company-jenfu'");
    database.prepare(`UPDATE ${tableName} SET company_id = 'company-jenfu' WHERE company_id IS NULL OR company_id = ''`).run();
  }
}

function ensureAccessControlLaunchSchema(database: SqliteDatabase) {
  ensureColumn(database, "user_role_assignments", "scope_template", "TEXT NOT NULL DEFAULT 'own_department'");
  ensureColumn(database, "user_role_assignments", "named_scope", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "user_role_assignments", "sponsor_user_id", "TEXT");
  ensureColumn(database, "user_role_assignments", "starts_at", "TEXT");
  ensureColumn(database, "user_role_assignments", "review_due_at", "TEXT");
  ensureColumn(database, "user_role_assignments", "hard_ends_at", "TEXT");

  const launchRoles = [
    { id: "role-manufacturing", roleCode: "manufacturing", title: "製造" },
    { id: "role-procurement", roleCode: "procurement", title: "採購" },
    { id: "role-external-specialist", roleCode: "external_specialist", title: "外部專員" }
  ];
  const now = new Date().toISOString();
  for (const role of launchRoles) {
    database
      .prepare(
        `INSERT INTO roles (id, role_code, title, system_defined, enabled, created_at, updated_at)
         VALUES (?, ?, ?, 1, 1, ?, ?)
         ON CONFLICT(role_code) DO UPDATE SET
           title = excluded.title,
           system_defined = 1,
           enabled = 1,
           updated_at = excluded.updated_at`
      )
      .run(role.id, role.roleCode, role.title, now, now);
  }

  const roleRows = database.prepare("SELECT id, role_code FROM roles").all() as Array<{ id: string; role_code: string }>;
  const roleIdByCode = new Map(roleRows.map((row) => [row.role_code, row.id]));
  const launchPermissions = [
    ["manufacturing", "page", "numbering.search"],
    ["manufacturing", "page", "numbering.drawings.view"],
    ["manufacturing", "page", "numbering.reports"],
    ["procurement", "page", "numbering.search"],
    ["procurement", "page", "numbering.drawings.view"],
    ["procurement", "page", "numbering.reports"],
    ["external_specialist", "page", "numbering.search"],
    ["external_specialist", "page", "numbering.drawings.view"],
    ["external_specialist", "action", "pdm.comment.create"],
    ["external_specialist", "action", "pdm.advice.create"]
  ] as const;
  const insertPermission = database.prepare(
    `INSERT OR IGNORE INTO role_permissions (id, role_id, permission_kind, permission_code, allowed, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`
  );
  for (const [roleCode, permissionKind, permissionCode] of launchPermissions) {
    const roleId = roleIdByCode.get(roleCode);
    if (!roleId) continue;
    const permissionId = `default-perm-${roleCode}-${permissionKind}-${permissionCode.replaceAll(".", "-").replaceAll("_", "-")}`;
    insertPermission.run(permissionId, roleId, permissionKind, permissionCode, now, now);
  }
}

function ensureColumn(database: SqliteDatabase, table: string, column: string, definition: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureSubmissionStoragePointerSchema(database: SqliteDatabase) {
  ensureColumn(database, "submission_files", "storage_provider", "TEXT NOT NULL DEFAULT 'local_repository'");
  ensureColumn(database, "submission_files", "storage_bucket", "TEXT");
  ensureColumn(database, "submission_files", "storage_key", "TEXT");
  ensureColumn(database, "submission_files", "storage_generation", "TEXT");
  ensureColumn(database, "submission_files", "storage_metageneration", "TEXT");
  ensureColumn(database, "release_packages", "storage_provider", "TEXT NOT NULL DEFAULT 'local_repository'");
  ensureColumn(database, "release_packages", "storage_bucket", "TEXT");
  ensureColumn(database, "release_packages", "storage_key", "TEXT");
  ensureColumn(database, "release_packages", "storage_generation", "TEXT");
  ensureColumn(database, "release_packages", "storage_metageneration", "TEXT");
  ensureColumn(database, "file_assets", "storage_bucket", "TEXT");
  ensureColumn(database, "file_assets", "storage_generation", "TEXT");
  ensureColumn(database, "file_assets", "storage_metageneration", "TEXT");
  ensureColumn(database, "file_derivatives", "storage_bucket", "TEXT");
  ensureColumn(database, "file_derivatives", "storage_generation", "TEXT");
  ensureColumn(database, "file_derivatives", "storage_metageneration", "TEXT");
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_submission_files_storage_pointer
      ON submission_files(storage_provider, storage_bucket, storage_key);
    CREATE INDEX IF NOT EXISTS idx_release_packages_storage_pointer
      ON release_packages(storage_provider, storage_bucket, storage_key);
  `);
}

function ensureSettingsSecretLifecycleSchema(database: SqliteDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS secret_references (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      provider TEXT NOT NULL,
      display_name TEXT NOT NULL,
      vault_provider TEXT NOT NULL DEFAULT 'local_test_double' CHECK (vault_provider IN ('local_test_double', 'supabase_vault')),
      vault_secret_id TEXT NOT NULL,
      masked_hint TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('draft', 'tested', 'active', 'retired', 'revoked')),
      version INTEGER NOT NULL CHECK (version > 0),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      tested_at TEXT,
      activated_by TEXT,
      activated_at TEXT,
      retired_by TEXT,
      retired_at TEXT,
      revoked_by TEXT,
      revoked_at TEXT,
      revoke_reason TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (activated_by) REFERENCES users(id),
      FOREIGN KEY (retired_by) REFERENCES users(id),
      FOREIGN KEY (revoked_by) REFERENCES users(id),
      UNIQUE (kind, version)
    );

    CREATE TABLE IF NOT EXISTS setting_test_runs (
      id TEXT PRIMARY KEY,
      secret_reference_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      provider TEXT NOT NULL,
      result_status TEXT NOT NULL CHECK (result_status IN ('passed', 'failed', 'blocked')),
      summary TEXT NOT NULL,
      redacted_error TEXT,
      artifact_path TEXT,
      tested_by TEXT NOT NULL,
      tested_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (secret_reference_id) REFERENCES secret_references(id) ON DELETE CASCADE,
      FOREIGN KEY (tested_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS setting_activation_events (
      id TEXT PRIMARY KEY,
      secret_reference_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('created_draft', 'tested', 'activated', 'retired', 'revoked')),
      actor_id TEXT NOT NULL,
      event_at TEXT NOT NULL DEFAULT (datetime('now')),
      detail_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (secret_reference_id) REFERENCES secret_references(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_secret_references_kind_status
      ON secret_references(kind, lifecycle_status, version DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_secret_references_kind_active_unique
      ON secret_references(kind)
      WHERE lifecycle_status = 'active';
    CREATE INDEX IF NOT EXISTS idx_setting_test_runs_secret
      ON setting_test_runs(secret_reference_id, tested_at DESC);
    CREATE INDEX IF NOT EXISTS idx_setting_activation_events_secret
      ON setting_activation_events(secret_reference_id, event_at DESC);
  `);
}

function ensureShared3dBaselineSchema(database: SqliteDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS shared_cad_model_versions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      owner_scope TEXT NOT NULL CHECK (owner_scope IN ('part_root', 'part_number')),
      owner_id TEXT NOT NULL,
      part_root_id TEXT NOT NULL,
      part_number_id TEXT,
      source_file_asset_id TEXT NOT NULL,
      model_revision TEXT NOT NULL DEFAULT 'unlabeled',
      content_hash TEXT NOT NULL,
      hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
      status TEXT NOT NULL CHECK (status IN ('Draft', 'Pending', 'Released', 'Obsolete')),
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      released_by TEXT,
      released_at TEXT,
      release_reason TEXT,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (part_root_id) REFERENCES part_roots(id),
      FOREIGN KEY (part_number_id) REFERENCES part_numbers(id),
      FOREIGN KEY (source_file_asset_id) REFERENCES file_assets(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (released_by) REFERENCES users(id),
      UNIQUE (company_id, owner_scope, owner_id, model_revision, content_hash)
    );

    CREATE TABLE IF NOT EXISTS drawing_revision_package_model_links (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL UNIQUE,
      basis_type TEXT NOT NULL CHECK (basis_type IN ('shared_model', 'two_d_only')),
      shared_model_version_id TEXT,
      exception_reason TEXT,
      exception_confirmed_by TEXT,
      exception_confirmed_at TEXT,
      review_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'confirmed', 'revoked')),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (
        (basis_type = 'shared_model' AND shared_model_version_id IS NOT NULL)
        OR
        (basis_type = 'two_d_only' AND exception_reason IS NOT NULL AND exception_confirmed_by IS NOT NULL AND exception_confirmed_at IS NOT NULL)
      ),
      FOREIGN KEY (package_id) REFERENCES drawing_revision_packages(id) ON DELETE CASCADE,
      FOREIGN KEY (shared_model_version_id) REFERENCES shared_cad_model_versions(id),
      FOREIGN KEY (exception_confirmed_by) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS manufacturing_baselines (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      owner_scope TEXT NOT NULL CHECK (owner_scope IN ('part_root', 'part_number')),
      owner_id TEXT NOT NULL,
      part_root_id TEXT NOT NULL,
      part_number_id TEXT,
      baseline_code TEXT NOT NULL,
      baseline_revision TEXT NOT NULL,
      shared_model_version_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Released', 'Obsolete', 'Cancelled')),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      released_by TEXT,
      released_at TEXT,
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (part_root_id) REFERENCES part_roots(id),
      FOREIGN KEY (part_number_id) REFERENCES part_numbers(id),
      FOREIGN KEY (shared_model_version_id) REFERENCES shared_cad_model_versions(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (released_by) REFERENCES users(id),
      UNIQUE (company_id, owner_scope, owner_id, baseline_revision)
    );

    CREATE TABLE IF NOT EXISTS manufacturing_baseline_items (
      id TEXT PRIMARY KEY,
      baseline_id TEXT NOT NULL,
      drawing_number_id TEXT NOT NULL,
      drawing_number TEXT NOT NULL,
      package_id TEXT,
      package_revision TEXT,
      inclusion_status TEXT NOT NULL DEFAULT 'included' CHECK (inclusion_status IN ('included', 'excluded')),
      selection_reason TEXT,
      review_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'approved')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (
        inclusion_status = 'included'
        OR
        (inclusion_status = 'excluded' AND selection_reason IS NOT NULL AND review_status = 'approved')
      ),
      FOREIGN KEY (baseline_id) REFERENCES manufacturing_baselines(id) ON DELETE CASCADE,
      FOREIGN KEY (drawing_number_id) REFERENCES drawing_numbers(id),
      FOREIGN KEY (package_id) REFERENCES drawing_revision_packages(id),
      UNIQUE (baseline_id, drawing_number_id)
    );

    CREATE INDEX IF NOT EXISTS idx_shared_cad_model_versions_owner
      ON shared_cad_model_versions(company_id, owner_scope, owner_id, status, model_revision);
    CREATE INDEX IF NOT EXISTS idx_shared_cad_model_versions_hash
      ON shared_cad_model_versions(company_id, owner_scope, owner_id, content_hash);
    CREATE INDEX IF NOT EXISTS idx_drawing_revision_package_model_links_model
      ON drawing_revision_package_model_links(shared_model_version_id, review_status);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_baselines_owner
      ON manufacturing_baselines(company_id, owner_scope, owner_id, status, baseline_revision);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_baselines_model
      ON manufacturing_baselines(shared_model_version_id, status);
    CREATE INDEX IF NOT EXISTS idx_manufacturing_baseline_items_baseline
      ON manufacturing_baseline_items(baseline_id, drawing_number_id);
  `);
}

function ensureFileAssetsMasterAttachmentSchema(database: SqliteDatabase) {
  ensureColumn(database, "file_assets", "mime_type", "TEXT");
  ensureColumn(database, "file_assets", "document_category", "TEXT NOT NULL DEFAULT 'other'");
  ensureColumn(database, "file_assets", "display_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "file_assets", "description", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "file_assets", "uploaded_by", "TEXT");
  ensureColumn(database, "file_assets", "deleted_at", "TEXT");
  ensureColumn(database, "file_assets", "deleted_by", "TEXT");
  ensureColumn(database, "file_assets", "deleted_reason", "TEXT");
  ensureColumn(database, "file_assets", "gdrive_file_id", "TEXT");
  ensureColumn(database, "file_assets", "gdrive_status", "TEXT NOT NULL DEFAULT 'none'");
  ensureColumn(database, "file_assets", "gdrive_error", "TEXT");
  ensureColumn(database, "file_assets", "gdrive_synced_at", "TEXT");
}

function ensureSolidWorksNativePreviewSchema(database: SqliteDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS preview_jobs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      source_file_asset_id TEXT NOT NULL,
      source_content_hash TEXT NOT NULL,
      requested_kind TEXT NOT NULL CHECK (requested_kind IN ('native_thumbnail_png', 'drawing_pdf')),
      source_extension TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'skipped', 'cancelled')),
      priority INTEGER NOT NULL DEFAULT 100,
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      locked_by TEXT,
      locked_at TEXT,
      idempotency_key TEXT NOT NULL,
      generator_profile TEXT NOT NULL DEFAULT 'windows_solidworks_preview_worker',
      error_code TEXT,
      error_summary TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (source_file_asset_id) REFERENCES file_assets(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      UNIQUE (idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS file_derivatives (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      source_file_asset_id TEXT NOT NULL,
      source_content_hash TEXT NOT NULL,
      derivative_kind TEXT NOT NULL CHECK (derivative_kind IN ('thumbnail_png', 'drawing_pdf', 'sheet_png', 'model_preview_png')),
      storage_provider TEXT NOT NULL DEFAULT 'local_repository' CHECK (storage_provider IN ('local_repository', 'supabase_storage', 's3_compatible', 'external')),
      storage_key TEXT NOT NULL,
      original_path TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL CHECK (file_size >= 0),
      content_hash TEXT NOT NULL,
      hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
      width INTEGER,
      height INTEGER,
      page_count INTEGER,
      generator_profile TEXT NOT NULL,
      generator_version TEXT,
      preview_job_id TEXT,
      status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'stale', 'retired', 'failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by_worker TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (source_file_asset_id) REFERENCES file_assets(id),
      FOREIGN KEY (preview_job_id) REFERENCES preview_jobs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_preview_jobs_source_status
      ON preview_jobs(source_file_asset_id, source_content_hash, requested_kind, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_preview_jobs_claim
      ON preview_jobs(status, priority, created_at);
    CREATE INDEX IF NOT EXISTS idx_file_derivatives_source_status
      ON file_derivatives(source_file_asset_id, source_content_hash, derivative_kind, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_file_derivatives_preview_job
      ON file_derivatives(preview_job_id);
  `);
}

const submissionLifecycleColumns = [
  "id",
  "company_id",
  "item_id",
  "drawing_number",
  "revision",
  "product_line",
  "customer",
  "project_code",
  "process_name",
  "machine",
  "material",
  "surface_finish",
  "document_type",
  "change_description",
  "status",
  "submitted_by",
  "approval_required",
  "released_at",
  "rejected_at",
  "reject_reason",
  "release_error",
  "superseded_by_submission_id",
  "obsolete_at",
  "obsolete_by",
  "cancelled_at",
  "cancelled_by",
  "cancel_reason",
  "returned_for_correction_at",
  "returned_for_correction_by",
  "returned_for_correction_reason",
  "corrects_submission_id",
  "resolved_by_submission_id",
  "resolved_at",
  "source_entity_type",
  "source_entity_id",
  "created_at",
  "updated_at"
];

const submissionFinderColumns = new Set(["product_line", "customer", "project_code", "process_name", "machine"]);

function createSubmissionsLifecycleTableSql(tableName: string) {
  return `
    CREATE TABLE ${tableName} (
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
      material TEXT NOT NULL,
      surface_finish TEXT NOT NULL,
      document_type TEXT NOT NULL,
      change_description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Pending', 'Releasing', 'Released', 'Rejected', 'ReleaseFailed', 'Obsolete', 'Cancelled')),
      submitted_by TEXT NOT NULL,
      approval_required INTEGER NOT NULL DEFAULT 1 CHECK (approval_required IN (1, 2)),
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (submitted_by) REFERENCES users(id),
      FOREIGN KEY (superseded_by_submission_id) REFERENCES submissions(id),
      FOREIGN KEY (obsolete_by) REFERENCES users(id),
      FOREIGN KEY (cancelled_by) REFERENCES users(id),
      FOREIGN KEY (returned_for_correction_by) REFERENCES users(id),
      FOREIGN KEY (corrects_submission_id) REFERENCES submissions(id),
      FOREIGN KEY (resolved_by_submission_id) REFERENCES submissions(id)
    )
  `;
}

function ensureSubmissionsLifecycleSchema(database: SqliteDatabase) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'submissions'").get() as
    | { sql: string }
    | undefined;
  const columns = database.prepare("PRAGMA table_info(submissions)").all() as Array<{ name: string }>;
  const hasObsoleteStatus = Boolean(row?.sql.includes("'Obsolete'"));
  const hasCancelledStatus = Boolean(row?.sql.includes("'Cancelled'"));
  const hasCompanyId = columns.some((column) => column.name === "company_id");
  const usesCompanyUnique = Boolean(row?.sql.includes("UNIQUE (company_id, drawing_number, revision)"));
  const hasReleaseRecoveryColumns = [
    "cancelled_at",
    "cancelled_by",
    "cancel_reason",
    "returned_for_correction_at",
    "returned_for_correction_by",
    "returned_for_correction_reason",
    "corrects_submission_id",
    "resolved_by_submission_id",
    "resolved_at"
  ].every((columnName) => columns.some((column) => column.name === columnName));

  if (hasObsoleteStatus && hasCancelledStatus && hasCompanyId && hasReleaseRecoveryColumns && !usesCompanyUnique) {
    ensureColumn(database, "submissions", "superseded_by_submission_id", "TEXT");
    ensureColumn(database, "submissions", "obsolete_at", "TEXT");
    ensureColumn(database, "submissions", "obsolete_by", "TEXT");
    ensureColumn(database, "submissions", "source_entity_type", "TEXT");
    ensureColumn(database, "submissions", "source_entity_id", "TEXT");
    ensureColumn(database, "submission_files", "source_master_attachment_id", "TEXT");
    ensureSubmissionFinderColumns(database);
    return;
  }

  const existing = new Set(columns.map((column) => column.name));
  const selectColumns = submissionLifecycleColumns.map((column) =>
    existing.has(column)
      ? column
      : column === "company_id"
        ? "'company-jenfu' AS company_id"
      : column === "approval_required"
        ? "1 AS approval_required"
        : submissionFinderColumns.has(column)
          ? `'' AS ${column}`
          : `NULL AS ${column}`
  );

  database.pragma("foreign_keys = OFF");
  try {
    database.exec("DROP TABLE IF EXISTS submissions_lifecycle_migration");
    database.exec(createSubmissionsLifecycleTableSql("submissions_lifecycle_migration"));
    database
      .prepare(
        `
        INSERT INTO submissions_lifecycle_migration (${submissionLifecycleColumns.join(", ")})
        SELECT ${selectColumns.join(", ")}
        FROM submissions
      `
      )
      .run();
    database.exec("DROP TABLE submissions");
    database.exec("ALTER TABLE submissions_lifecycle_migration RENAME TO submissions");
  } finally {
    database.pragma("foreign_keys = ON");
  }
  ensureSubmissionFinderColumns(database);
  ensureColumn(database, "submissions", "source_entity_type", "TEXT");
  ensureColumn(database, "submissions", "source_entity_id", "TEXT");
  ensureColumn(database, "submission_files", "source_master_attachment_id", "TEXT");
}

function ensureSubmissionFinderColumns(database: SqliteDatabase) {
  ensureColumn(database, "submissions", "product_line", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "submissions", "customer", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "submissions", "project_code", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "submissions", "process_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "submissions", "machine", "TEXT NOT NULL DEFAULT ''");
}

function ensureSubmissionIndexes(database: SqliteDatabase) {
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_submissions_status_created_at ON submissions(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_submissions_company_status_created_at ON submissions(company_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_submissions_company_created_at ON submissions(company_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_submissions_submitted_created_at ON submissions(submitted_by, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_submissions_submitted_status_created_at ON submissions(submitted_by, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_submissions_item_created_at ON submissions(item_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_submissions_drawing_number ON submissions(company_id, drawing_number);
    CREATE INDEX IF NOT EXISTS idx_submissions_company_drawing_revision ON submissions(company_id, drawing_number, revision);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_blocking_same_revision_unique
      ON submissions(company_id, drawing_number, revision)
      WHERE status IN ('Pending', 'Releasing', 'Released', 'Obsolete');
    CREATE INDEX IF NOT EXISTS idx_submissions_release_failed_resolution
      ON submissions(company_id, drawing_number, revision, resolved_by_submission_id, resolved_at)
      WHERE status = 'ReleaseFailed';
    CREATE INDEX IF NOT EXISTS idx_submissions_corrects_submission ON submissions(corrects_submission_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_finder_fields ON submissions(product_line, customer, project_code, process_name, machine, material, surface_finish, status);
  `);
}

export function getDb() {
  if (!dbProvider) {
    const dataDir = getDataDir();
    dbProvider = createDefaultDatabaseProvider({
      provider: process.env.PDM_DB_PROVIDER,
      dataDir,
      repositoryDir: getRepositoryDir(),
      databasePath: path.join(dataDir, "ai-pdm.sqlite"),
      initialize: initDatabase
    });
  }
  return dbProvider.getConnection();
}

function resolveAppPath(value: string | undefined, fallback: string) {
  const configured = value?.trim();
  if (!configured) return path.join(/*turbopackIgnore: true*/ process.cwd(), fallback);
  return path.isAbsolute(configured) ? configured : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
}

function getDataDir() {
  return resolveAppPath(process.env.PDM_DATA_DIR, "data");
}

function getRepositoryDir() {
  return resolveAppPath(process.env.PDM_REPOSITORY_DIR, path.join("data", "repository"));
}

export function createAuditLog(input: {
  submissionId?: string | null;
  actorId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
}) {
  getDb()
    .prepare("INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(
      crypto.randomUUID(),
      input.submissionId ?? null,
      input.actorId ?? null,
      input.action,
      JSON.stringify(input.detail ?? {}),
      new Date().toISOString()
    );
}
