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
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  database.exec(schema);
  ensureCompanyScopeSchema(database);
  ensureNumberingCompanyScopeSchema(database);
  ensureNumberingWorkflowCompanyScopeSchema(database);
  ensureUsersRoleSchema(database);
  ensureSubmissionsLifecycleSchema(database);
  ensureSubmissionIndexes(database);
  reconcileItemCurrentRevisions(database);
  ensureColumn(database, "review_issues", "assignee_id", "TEXT");
  ensureColumn(database, "part_numbers", "custom_specification", "TEXT");
  ensureFileAssetsMasterAttachmentSchema(database);
  ensureColumn(database, "sandbox_branches", "merged_by", "TEXT");
  ensureColumn(database, "sandbox_branches", "merge_summary_json", "TEXT");
  ensureColumn(database, "sandbox_branches", "merged_at", "TEXT");
  seedConfiguredUsers(database);
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
  ensurePartRootsCompanyScopeSchema(database);
  ensurePartNumbersCompanyScopeSchema(database);
  ensureDrawingNumbersCompanyScopeSchema(database);
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
        rule_version_id TEXT NOT NULL DEFAULT 'numbering-rule-v1',
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
        rule_version_id TEXT NOT NULL DEFAULT 'numbering-rule-v1',
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
  if (hasCompanyId && usesCompanyUnique) return;

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
        purpose_code TEXT NOT NULL CHECK (purpose_code IN ('MA', 'OT')),
        purpose_description TEXT NOT NULL DEFAULT '',
        sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
        is_primary_manufacturing INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_manufacturing IN (0, 1)),
        development_phase TEXT NOT NULL DEFAULT 'EVT' CHECK (development_phase IN ('EVT', 'DVT', 'PVT', 'Release', 'ECR')),
        record_status TEXT NOT NULL DEFAULT 'Draft' CHECK (record_status IN ('Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected', 'Obsolete', 'Merged', 'EVTDisabled', 'PendingAdminConfirm', 'MainDrawingInvalid')),
        rule_version_id TEXT NOT NULL DEFAULT 'numbering-rule-v1',
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

function ensureColumn(database: SqliteDatabase, table: string, column: string, definition: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
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
      status TEXT NOT NULL CHECK (status IN ('Pending', 'Releasing', 'Released', 'Rejected', 'ReleaseFailed', 'Obsolete')),
      submitted_by TEXT NOT NULL,
      approval_required INTEGER NOT NULL DEFAULT 1 CHECK (approval_required IN (1, 2)),
      released_at TEXT,
      rejected_at TEXT,
      reject_reason TEXT,
      release_error TEXT,
      superseded_by_submission_id TEXT,
      obsolete_at TEXT,
      obsolete_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (submitted_by) REFERENCES users(id),
      FOREIGN KEY (superseded_by_submission_id) REFERENCES submissions(id),
      FOREIGN KEY (obsolete_by) REFERENCES users(id),
      UNIQUE (company_id, drawing_number, revision)
    )
  `;
}

function ensureSubmissionsLifecycleSchema(database: SqliteDatabase) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'submissions'").get() as
    | { sql: string }
    | undefined;
  const columns = database.prepare("PRAGMA table_info(submissions)").all() as Array<{ name: string }>;
  const hasObsoleteStatus = Boolean(row?.sql.includes("'Obsolete'"));
  const hasCompanyId = columns.some((column) => column.name === "company_id");
  const usesCompanyUnique = Boolean(row?.sql.includes("UNIQUE (company_id, drawing_number, revision)"));

  if (hasObsoleteStatus && hasCompanyId && usesCompanyUnique) {
    ensureColumn(database, "submissions", "superseded_by_submission_id", "TEXT");
    ensureColumn(database, "submissions", "obsolete_at", "TEXT");
    ensureColumn(database, "submissions", "obsolete_by", "TEXT");
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
