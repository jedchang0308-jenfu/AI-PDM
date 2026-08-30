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
  getChangeRequest,
  getDiscussionComment,
  getPdfMarkup,
  getReviewIssue,
  listChangeRequests,
  listDiscussionComments,
  listPdfMarkups,
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
  applyNumberingRuleTemplate,
  checkNumberingDuplicates,
  checkNumberingPermission,
  createNumberingApprovalBatch,
  createNumberingExportJob,
  createNumberingRecord,
  decideNumberingApprovalBatch,
  decideNumberingApproval,
  evaluateApprovalRules,
  evaluateNumberingGate,
  getNumberingRootDetail,
  getNumberingApprovalBatch,
  getNumberingExportJob,
  getNumberingRootBundle,
  generateMonthlyNumberingAuditReport,
  getMonthlyNumberingAuditReport,
  listNumberingApprovalBatches,
  listMonthlyNumberingAuditReports,
  listNumberingAdminMatrix,
  listNumberingExportJobs,
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
  revokeNumberingApprovalDelegation,
  revokeNumberingUserRoleAssignment,
  saveNumberingRolePriority,
  searchNumberingRecords,
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
  type DrawingModuleListInput,
  type DrawingModuleListRecord,
  type DrawingPurposeCode,
  type DrawingNumberRecord,
  type ApprovalRuleEvaluation,
  type CreateNumberingApprovalBatchInput,
  type CreateNumberingExportJobInput,
  type EvaluateApprovalRuleInput,
  type DecideNumberingApprovalBatchInput,
  type DuplicateCheckInput,
  type EvaluateNumberingGateInput,
  type LinkPartNumberToDrawingInput,
  type ListMonthlyNumberingAuditReportsInput,
  type ListNumberingApprovalBatchesInput,
  type ListNumberingExportJobsInput,
  type MarkOverdueDraftNumberingInput,
  type MarkOverdueDraftNumberingResult,
  type PartModuleDetailRecord,
  type PartModuleListInput,
  type PartModuleListRecord,
  type UpsertPartVariantAttributesInput,
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
  type NumberingNotificationRecord,
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
  type PartNumberRecord,
  type PartRootRecord
} from "@/lib/repositories/numbering-repository";
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
  ensureDrawingRevisionLifecycleAuthorityPreSchema(database);
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  database.exec(schema);
  ensureStandaloneManufacturingImpactRetirement(database);
  ensureTransferPackagePhase1DSchema(database);
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
  ensureReviewConfirmationDecisionSchema(database);
  ensureSettingsSecretLifecycleSchema(database);
  ensureShared3dBaselineSchema(database);
  ensureSubmissionIndexes(database);
  reconcileItemCurrentRevisions(database);
  ensureColumn(database, "review_issues", "assignee_id", "TEXT");
  ensureColumn(database, "part_numbers", "custom_specification", "TEXT");
  ensureColumn(database, "part_numbers", "series_code", "TEXT");
  ensureProjectStatusRemovalSchema(database);
  ensureColumn(database, "numbering_draft_workspaces", "append_reason", "TEXT");
  ensureColumn(database, "numbering_draft_workspaces", "source_drawing_number_id", "TEXT");
  ensureColumn(database, "numbering_draft_workspaces", "source_part_number_id", "TEXT");
  ensureColumn(database, "numbering_draft_workspaces", "source_link_type", "TEXT");
  ensureColumn(database, "numbering_draft_parts", "universal_reason", "TEXT");
  ensureColumn(database, "numbering_draft_parts", "series_code", "TEXT");
  ensureFileAssetsMasterAttachmentSchema(database);
  ensureSolidWorksNativePreviewSchema(database);
  ensureDev088ReplacementAttachmentSchema(database);
  ensureDev087CanonicalWorkbenchSchema(database);
  ensureDev065PartPreviewSchema(database);
  ensureDev090InlineRelationMatrixSchema(database);
  ensureDev106RetiredWorkbenchResidueCleanupSchema(database);
  ensureColumn(database, "sandbox_branches", "merged_by", "TEXT");
  ensureColumn(database, "sandbox_branches", "merge_summary_json", "TEXT");
  ensureColumn(database, "sandbox_branches", "merged_at", "TEXT");
  ensureUnifiedDrawingAggregateBackfill(database);
  seedConfiguredUsers(database);
  assertSqliteInitializerIntegrity(database);
}

export function ensureStandaloneManufacturingImpactRetirement(database: SqliteDatabase) {
  const migrationVersion = "pdm-standalone-manufacturing-impact-retirement-v1";
  const applied = database
    .prepare("SELECT version FROM pdm_local_data_migrations WHERE version = ?")
    .get(migrationVersion) as { version: string } | undefined;
  if (applied) return;

  database.transaction(() => {
    const removedPermissionCount = database
      .prepare(
        `DELETE FROM role_permissions
         WHERE permission_code IN ('numbering.impact', 'numbering.impact.analyze', 'numbering.impact.apply')`
      )
      .run().changes;
    database
      .prepare("INSERT INTO pdm_local_data_migrations (version, detail_json) VALUES (?, ?)")
      .run(
        migrationVersion,
        JSON.stringify({
          source: "standalone manufacturing impact feature retirement",
          removedPermissionCount,
          preservedCapabilities: ["formal obsolete dependency snapshot", "drawing revision F/F/F impact"]
        })
      );
  })();
}

function assertSqliteInitializerIntegrity(database: SqliteDatabase) {
  const residue = database
    .prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN (
        'part_roots_company_scope_migration',
        'part_numbers_company_scope_migration',
        'drawing_numbers_company_scope_migration'
      ) ORDER BY name`)
    .all() as Array<{ name: string }>;
  if (residue.length) {
    throw new Error(`PDM_SQLITE_MIGRATION_RESIDUE:${residue.map((row) => row.name).join(",")}`);
  }
  const violations = database.pragma("foreign_key_check") as Array<Record<string, unknown>>;
  if (violations.length) {
    throw new Error(`PDM_SQLITE_FOREIGN_KEY_CHECK_FAILED:${JSON.stringify(violations)}`);
  }
}

function ensureReviewConfirmationDecisionSchema(database: SqliteDatabase) {
  const table = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'review_confirmation_events'")
    .get() as { sql?: string } | undefined;
  if (!table?.sql || table.sql.includes("request_more_information")) return;

  database.exec("PRAGMA foreign_keys = OFF;");
  try {
    database.exec(`
      BEGIN IMMEDIATE;

      DROP INDEX IF EXISTS idx_review_confirmation_events_review;
      ALTER TABLE review_confirmation_events RENAME TO review_confirmation_events_before_human_decisions;

      CREATE TABLE review_confirmation_events (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT 'company-jenfu',
        review_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK (
          action IN (
            'confirm_original_part_reuse',
            'return_for_replacement_part',
            'request_more_information',
            'approve_replacement_part_and_drawing_release'
          )
        ),
        reviewer_user_id TEXT NOT NULL,
        result TEXT NOT NULL,
        occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
        metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (reviewer_user_id) REFERENCES users(id)
      );

      INSERT INTO review_confirmation_events (
        id, company_id, review_id, action, reviewer_user_id, result, occurred_at, metadata_json
      )
      SELECT id, company_id, review_id, action, reviewer_user_id, result, occurred_at, metadata_json
      FROM review_confirmation_events_before_human_decisions;

      DROP TABLE review_confirmation_events_before_human_decisions;
      CREATE INDEX idx_review_confirmation_events_review
      ON review_confirmation_events(company_id, review_id, occurred_at DESC);

      COMMIT;
    `);
  } catch (error) {
    if (database.inTransaction) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON;");
  }
}

function ensureUnifiedDrawingAggregateBackfill(database: SqliteDatabase) {
  const migrationVersion = "dev-064-unified-drawing-aggregate-v1";
  const applied = database
    .prepare("SELECT version FROM pdm_local_data_migrations WHERE version = ?")
    .get(migrationVersion) as { version: string } | undefined;
  if (applied) return;

  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      INSERT OR IGNORE INTO drawings (
        id, company_id, drawing_number, lifecycle_state, workspace_id, drawing_draft_id,
        candidate_reservation_id, formal_drawing_number_id, part_root_id, purpose_code,
        purpose_description, sequence_no, is_primary_manufacturing, owner_id,
        rule_version_id, row_version, created_by, created_at, updated_at
      )
      SELECT
        'drawing-' || draft.id,
        draft.company_id,
        reservation.candidate_code,
        'building',
        draft.workspace_id,
        draft.id,
        reservation.id,
        COALESCE(candidate.formal_drawing_number_id,
          CASE WHEN reservation.promoted_master_type = 'drawing_number' THEN reservation.promoted_master_id END),
        formal.part_root_id,
        draft.purpose_code,
        draft.purpose_description,
        reservation.sequence_no,
        draft.is_primary_manufacturing,
        workspace.owner_id,
        formal.rule_version_id,
        1,
        workspace.created_by,
        workspace.created_at,
        CASE
          WHEN reservation.updated_at IS NOT NULL AND reservation.updated_at > draft.updated_at THEN reservation.updated_at
          WHEN workspace.updated_at > draft.updated_at THEN workspace.updated_at
          ELSE draft.updated_at
        END
      FROM numbering_draft_drawings draft
      JOIN numbering_draft_workspaces workspace
        ON workspace.id = draft.workspace_id AND workspace.company_id = draft.company_id
      LEFT JOIN number_candidate_reservations reservation
        ON reservation.id = draft.candidate_reservation_id AND reservation.company_id = draft.company_id
      LEFT JOIN numbering_candidate_revision_drafts candidate
        ON candidate.drawing_draft_id = draft.id AND candidate.company_id = draft.company_id
      LEFT JOIN drawing_numbers formal
        ON formal.id = COALESCE(candidate.formal_drawing_number_id,
          CASE WHEN reservation.promoted_master_type = 'drawing_number' THEN reservation.promoted_master_id END);

      INSERT INTO drawings (
        id, company_id, drawing_number, lifecycle_state, formal_drawing_number_id,
        part_root_id, purpose_code, purpose_description, sequence_no,
        is_primary_manufacturing, rule_version_id, row_version, created_by, created_at, updated_at
      )
      SELECT
        COALESCE('drawing-' || reservation.draft_item_id, 'drawing-formal-' || formal.id),
        formal.company_id,
        formal.drawing_number,
        'building',
        formal.id,
        formal.part_root_id,
        formal.purpose_code,
        formal.purpose_description,
        formal.sequence_no,
        formal.is_primary_manufacturing,
        formal.rule_version_id,
        1,
        formal.created_by,
        formal.created_at,
        formal.updated_at
      FROM drawing_numbers formal
      LEFT JOIN number_candidate_reservations reservation
        ON reservation.company_id = formal.company_id
       AND reservation.promoted_master_type = 'drawing_number'
       AND reservation.promoted_master_id = formal.id
      ON CONFLICT(company_id, drawing_number)
        WHERE drawing_number IS NOT NULL AND lifecycle_state <> 'cancelled'
        DO UPDATE SET
        formal_drawing_number_id = excluded.formal_drawing_number_id,
        part_root_id = excluded.part_root_id,
        purpose_code = excluded.purpose_code,
        purpose_description = excluded.purpose_description,
        sequence_no = excluded.sequence_no,
        is_primary_manufacturing = excluded.is_primary_manufacturing,
        rule_version_id = excluded.rule_version_id,
        updated_at = CASE WHEN excluded.updated_at > drawings.updated_at THEN excluded.updated_at ELSE drawings.updated_at END;

      INSERT OR IGNORE INTO drawing_revisions (
        id, company_id, drawing_id, revision, lifecycle_state, policy_snapshot_json,
        override_reason, row_version, approval_request_id, review_snapshot_hash,
        source_candidate_revision_id, source_revision_package_id, created_by,
        created_at, updated_by, updated_at, submitted_at, controlled_at, released_at, cancelled_at
      )
      SELECT
        'drawing-revision-' || candidate.id,
        candidate.company_id,
        drawing.id,
        candidate.revision,
        'preparing',
        candidate.policy_snapshot_json,
        candidate.override_reason,
        candidate.row_version,
        candidate.approval_request_id,
        candidate.review_snapshot_hash,
        candidate.id,
        candidate.formal_revision_package_id,
        candidate.created_by,
        candidate.created_at,
        candidate.updated_by,
        candidate.updated_at,
        CASE WHEN candidate.lifecycle_status = 'review_locked' THEN candidate.updated_at END,
        candidate.promoted_at,
        package.released_at,
        candidate.cancelled_at
      FROM numbering_candidate_revision_drafts candidate
      JOIN drawings drawing
        ON drawing.company_id = candidate.company_id AND drawing.drawing_draft_id = candidate.drawing_draft_id
      LEFT JOIN drawing_revision_packages package ON package.id = candidate.formal_revision_package_id;

      INSERT INTO drawing_revisions (
        id, company_id, drawing_id, revision, lifecycle_state, policy_snapshot_json,
        row_version, source_revision_package_id, created_by, created_at, updated_by,
        updated_at, submitted_at, controlled_at, released_at, cancelled_at
      )
      SELECT
        COALESCE('drawing-revision-' || candidate.id, 'drawing-revision-package-' || package.id),
        package.company_id,
        drawing.id,
        package.revision,
        'preparing',
        COALESCE(package.snapshot_json, '{}'),
        1,
        package.id,
        package.created_by,
        package.created_at,
        package.created_by,
        package.updated_at,
        package.submitted_at,
        CASE WHEN package.lifecycle_state = 'rd_controlled' THEN package.updated_at END,
        package.released_at,
        package.cancelled_at
      FROM drawing_revision_packages package
      JOIN drawings drawing
        ON drawing.company_id = package.company_id AND drawing.formal_drawing_number_id = package.drawing_number_id
      LEFT JOIN numbering_candidate_revision_drafts candidate
        ON candidate.formal_revision_package_id = package.id AND candidate.company_id = package.company_id
      ON CONFLICT(id) DO UPDATE SET
        source_revision_package_id = excluded.source_revision_package_id,
        updated_at = CASE
          WHEN excluded.updated_at > drawing_revisions.updated_at THEN excluded.updated_at
          ELSE drawing_revisions.updated_at
        END;

      INSERT OR IGNORE INTO drawing_revision_files (
        id, company_id, drawing_revision_id, source_file_asset_id, source_candidate_file_id,
        role, role_source, display_name, description, sort_order, is_primary,
        removed_at, removed_by, created_by, created_at, updated_at
      )
      SELECT
        'drawing-revision-file-' || file.id,
        file.company_id,
        revision.id,
        file.source_file_asset_id,
        file.id,
        file.role,
        file.role_source,
        file.display_name,
        file.description,
        file.sort_order,
        file.is_primary,
        file.removed_at,
        file.removed_by,
        file.created_by,
        file.created_at,
        file.updated_at
      FROM numbering_candidate_revision_files file
      JOIN drawing_revisions revision ON revision.source_candidate_revision_id = file.candidate_revision_id;

      INSERT INTO drawing_revision_files (
        id, company_id, drawing_revision_id, source_file_asset_id, source_package_file_id,
        role, role_source, display_name, description, sort_order, is_primary,
        created_by, created_at, updated_at
      )
      SELECT
        'drawing-revision-package-file-' || file.id,
        revision.company_id,
        revision.id,
        file.source_file_asset_id,
        file.id,
        file.role,
        file.role_source,
        file.display_name,
        file.description,
        file.sort_order,
        file.is_primary,
        file.created_by,
        file.created_at,
        file.created_at
      FROM drawing_revision_package_files file
      JOIN drawing_revisions revision ON revision.source_revision_package_id = file.package_id
      ON CONFLICT(drawing_revision_id, source_file_asset_id) DO UPDATE SET
        source_package_file_id = excluded.source_package_file_id
      WHERE drawing_revision_files.source_package_file_id IS NULL;

      UPDATE drawing_revisions
      SET lifecycle_state = CASE
        WHEN COALESCE((SELECT candidate.lifecycle_status FROM numbering_candidate_revision_drafts candidate WHERE candidate.id = drawing_revisions.source_candidate_revision_id), '') = 'review_locked' THEN 'in_review'
        WHEN COALESCE((SELECT candidate.lifecycle_status FROM numbering_candidate_revision_drafts candidate WHERE candidate.id = drawing_revisions.source_candidate_revision_id), '') = 'cancelled' THEN 'cancelled'
        WHEN COALESCE((SELECT package.lifecycle_state FROM drawing_revision_packages package WHERE package.id = drawing_revisions.source_revision_package_id), '') = 'released'
          OR COALESCE((SELECT package.status FROM drawing_revision_packages package WHERE package.id = drawing_revisions.source_revision_package_id), '') = 'Released' THEN 'released'
        WHEN COALESCE((SELECT package.lifecycle_state FROM drawing_revision_packages package WHERE package.id = drawing_revisions.source_revision_package_id), '') = 'rd_controlled'
          OR COALESCE((SELECT candidate.lifecycle_status FROM numbering_candidate_revision_drafts candidate WHERE candidate.id = drawing_revisions.source_candidate_revision_id), '') = 'promoted' THEN 'rd_controlled'
        WHEN COALESCE((SELECT package.lifecycle_state FROM drawing_revision_packages package WHERE package.id = drawing_revisions.source_revision_package_id), '') = 'correction_required'
          OR COALESCE((SELECT package.status FROM drawing_revision_packages package WHERE package.id = drawing_revisions.source_revision_package_id), '') = 'Rejected' THEN 'correction_required'
        WHEN COALESCE((SELECT package.lifecycle_state FROM drawing_revision_packages package WHERE package.id = drawing_revisions.source_revision_package_id), '') = 'in_review'
          OR COALESCE((SELECT package.status FROM drawing_revision_packages package WHERE package.id = drawing_revisions.source_revision_package_id), '') = 'Pending' THEN 'in_review'
        WHEN COALESCE((SELECT package.status FROM drawing_revision_packages package WHERE package.id = drawing_revisions.source_revision_package_id), '') = 'Cancelled' THEN 'cancelled'
        ELSE 'preparing'
      END;

      UPDATE drawings
      SET lifecycle_state = CASE
        WHEN COALESCE((SELECT formal.record_status FROM drawing_numbers formal WHERE formal.id = drawings.formal_drawing_number_id), '') = 'Obsolete' THEN 'obsolete'
        WHEN COALESCE((SELECT formal.record_status FROM drawing_numbers formal WHERE formal.id = drawings.formal_drawing_number_id), '') = 'Merged' THEN 'merged'
        WHEN COALESCE((SELECT formal.record_status FROM drawing_numbers formal WHERE formal.id = drawings.formal_drawing_number_id), '') = 'Released'
          OR COALESCE((SELECT revision.lifecycle_state FROM drawing_revisions revision WHERE revision.drawing_id = drawings.id ORDER BY revision.updated_at DESC, revision.id DESC LIMIT 1), '') = 'released' THEN 'released'
        WHEN COALESCE((SELECT revision.lifecycle_state FROM drawing_revisions revision WHERE revision.drawing_id = drawings.id ORDER BY revision.updated_at DESC, revision.id DESC LIMIT 1), '') = 'rd_controlled'
          OR drawings.formal_drawing_number_id IS NOT NULL THEN 'rd_controlled'
        WHEN COALESCE((SELECT workspace.lifecycle_status FROM numbering_draft_workspaces workspace WHERE workspace.id = drawings.workspace_id), '') = 'cancelled' THEN 'cancelled'
        WHEN COALESCE((SELECT revision.lifecycle_state FROM drawing_revisions revision WHERE revision.drawing_id = drawings.id ORDER BY revision.updated_at DESC, revision.id DESC LIMIT 1), '') = 'in_review' THEN 'in_review'
        WHEN EXISTS (SELECT 1 FROM drawing_revisions revision WHERE revision.drawing_id = drawings.id)
          OR drawings.candidate_reservation_id IS NOT NULL THEN 'drawing_preparation'
        ELSE 'building'
      END,
      controlled_at = COALESCE(controlled_at, (
        SELECT revision.controlled_at FROM drawing_revisions revision
        WHERE revision.drawing_id = drawings.id AND revision.controlled_at IS NOT NULL
        ORDER BY revision.controlled_at DESC LIMIT 1
      )),
      released_at = COALESCE(released_at, (
        SELECT revision.released_at FROM drawing_revisions revision
        WHERE revision.drawing_id = drawings.id AND revision.released_at IS NOT NULL
        ORDER BY revision.released_at DESC LIMIT 1
      ));
    `);
    database.prepare(
      "INSERT INTO pdm_local_data_migrations (version, detail_json) VALUES (?, ?)"
    ).run(migrationVersion, JSON.stringify({ source: "DEV-064 startup compatibility backfill" }));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function ensureTransferPackagePhase1DSchema(database: SqliteDatabase) {
  const packageTable = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transfer_packages'")
    .get() as { sql?: string } | undefined;
  if (!packageTable?.sql || packageTable.sql.includes("'ApprovedPendingPublish'")) return;

  type ForeignKeyFailure = { table: string; rowid: number | null; parent: string; fkid: number };
  const foreignKeyFailureKey = (failure: ForeignKeyFailure) =>
    `${failure.table}:${failure.rowid ?? "null"}:${failure.parent}:${failure.fkid}`;
  const existingForeignKeyFailures = database.prepare("PRAGMA foreign_key_check").all() as ForeignKeyFailure[];
  const existingForeignKeyFailureKeys = new Set(existingForeignKeyFailures.map(foreignKeyFailureKey));

  database.exec("PRAGMA foreign_keys = OFF;");
  try {
    database.exec(`
      BEGIN IMMEDIATE;

      CREATE TABLE transfer_packages_phase1d (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        package_code TEXT NOT NULL,
        title TEXT NOT NULL,
        case_type TEXT NOT NULL CHECK (case_type IN ('development_case', 'design_change_case')),
        case_reason TEXT NOT NULL,
        source_reference_status TEXT NOT NULL DEFAULT 'not_available'
          CHECK (source_reference_status IN ('provided', 'not_available')),
        source_reference TEXT,
        source_reference_reason TEXT,
        package_status TEXT NOT NULL DEFAULT 'Draft'
          CHECK (package_status IN ('Draft', 'InReview', 'NeedsInfo', 'ApprovedPendingPublish', 'Publishing', 'Published', 'ReleaseFailed', 'Cancelled')),
        owner_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        create_idempotency_key TEXT NOT NULL,
        row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
        review_request_id TEXT,
        review_snapshot_hash TEXT,
        review_snapshot_version INTEGER NOT NULL DEFAULT 0 CHECK (review_snapshot_version >= 0),
        submitted_by TEXT,
        submitted_at TEXT,
        approved_by TEXT,
        approved_at TEXT,
        published_by TEXT,
        published_at TEXT,
        release_failure_correlation_id TEXT,
        cancel_reason TEXT,
        cancelled_by TEXT,
        cancelled_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (owner_id) REFERENCES users(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (submitted_by) REFERENCES users(id),
        FOREIGN KEY (approved_by) REFERENCES users(id),
        FOREIGN KEY (published_by) REFERENCES users(id),
        FOREIGN KEY (cancelled_by) REFERENCES users(id),
        UNIQUE (company_id, package_code),
        UNIQUE (company_id, created_by, create_idempotency_key),
        CHECK (
          (source_reference_status = 'provided' AND source_reference IS NOT NULL)
          OR (source_reference_status = 'not_available' AND source_reference_reason IS NOT NULL)
        ),
        CHECK (
          (package_status = 'Cancelled' AND cancel_reason IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
          OR package_status <> 'Cancelled'
        )
      );

      INSERT INTO transfer_packages_phase1d (
        id, company_id, package_code, title, case_type, case_reason,
        source_reference_status, source_reference, source_reference_reason,
        package_status, owner_id, created_by, create_idempotency_key, row_version,
        cancel_reason, cancelled_by, cancelled_at, created_at, updated_at
      )
      SELECT
        id, company_id, package_code, title, case_type, case_reason,
        source_reference_status, source_reference, source_reference_reason,
        package_status, owner_id, created_by, create_idempotency_key, row_version,
        cancel_reason, cancelled_by, cancelled_at, created_at, updated_at
      FROM transfer_packages;

      DROP TABLE transfer_packages;
      ALTER TABLE transfer_packages_phase1d RENAME TO transfer_packages;

      CREATE TABLE transfer_package_events_phase1d (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        package_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN (
          'DraftCreated', 'HeaderUpdated', 'ScopeItemAdded', 'ScopeItemRemoved',
          'DraftWorkspaceAdded', 'DraftWorkspaceRemoved', 'ReviewSubmitted', 'ReviewWithdrawn',
          'ReviewDecided', 'SnapshotInvalidated', 'PackagePublished', 'ReleaseFailed', 'PackageCancelled'
        )),
        actor_id TEXT NOT NULL,
        detail_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (package_id) REFERENCES transfer_packages(id),
        FOREIGN KEY (actor_id) REFERENCES users(id)
      );

      INSERT INTO transfer_package_events_phase1d
      SELECT id, company_id, package_id, event_type, actor_id, detail_json, created_at
      FROM transfer_package_events;
      DROP TABLE transfer_package_events;
      ALTER TABLE transfer_package_events_phase1d RENAME TO transfer_package_events;

      CREATE INDEX IF NOT EXISTS idx_transfer_packages_company_status_updated
        ON transfer_packages(company_id, package_status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_transfer_packages_owner_status
        ON transfer_packages(company_id, owner_id, package_status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_transfer_package_events_package
        ON transfer_package_events(company_id, package_id, created_at);
      CREATE TRIGGER IF NOT EXISTS trg_transfer_package_events_no_update
      BEFORE UPDATE ON transfer_package_events
      BEGIN
        SELECT RAISE(ABORT, 'TRANSFER_PACKAGE_EVENT_APPEND_ONLY');
      END;
      CREATE TRIGGER IF NOT EXISTS trg_transfer_package_events_no_delete
      BEFORE DELETE ON transfer_package_events
      BEGIN
        SELECT RAISE(ABORT, 'TRANSFER_PACKAGE_EVENT_APPEND_ONLY');
      END;
    `);
    const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all() as ForeignKeyFailure[];
    const introducedForeignKeyFailures = foreignKeyFailures.filter(
      (failure) => !existingForeignKeyFailureKeys.has(foreignKeyFailureKey(failure))
    );
    if (introducedForeignKeyFailures.length > 0) {
      throw new Error("TRANSFER_PACKAGE_PHASE1D_FOREIGN_KEY_CHECK_FAILED");
    }
    database.exec("COMMIT;");
  } catch (error) {
    try {
      database.exec("ROLLBACK;");
    } catch {
      // The original error is more useful when SQLite has already rolled back.
    }
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON;");
  }
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

  const draftWorkspaceTable = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'numbering_draft_workspaces'")
    .get() as { name?: string } | undefined;
  if (draftWorkspaceTable) {
    // DEV-053 indexes in schema.sql reference these nullable columns. Existing
    // local databases must receive them before the schema/index pass runs.
    ensureColumn(database, "numbering_draft_workspaces", "source_drawing_number_id", "TEXT");
    ensureColumn(database, "numbering_draft_workspaces", "source_part_number_id", "TEXT");
    ensureColumn(database, "numbering_draft_workspaces", "source_link_type", "TEXT");
  }
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

    CREATE TABLE IF NOT EXISTS submission_part_scopes (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      part_number_id TEXT NOT NULL,
      part_number TEXT NOT NULL,
      part_name TEXT NOT NULL DEFAULT '',
      link_type TEXT NOT NULL CHECK (link_type IN ('primary_manufacturing', 'reference')),
      form_state TEXT NOT NULL CHECK (form_state IN ('no_impact', 'suspected_impact', 'confirmed_impact')),
      fit_state TEXT NOT NULL CHECK (fit_state IN ('no_impact', 'suspected_impact', 'confirmed_impact')),
      function_state TEXT NOT NULL CHECK (function_state IN ('no_impact', 'suspected_impact', 'confirmed_impact')),
      fff_outcome TEXT NOT NULL CHECK (fff_outcome IN ('no_impact', 'suspected_impact', 'confirmed_impact')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (part_number_id) REFERENCES part_numbers(id),
      UNIQUE (submission_id, part_number_id)
    );

    CREATE INDEX IF NOT EXISTS idx_submission_part_scopes_part
      ON submission_part_scopes(company_id, part_number_id, submission_id);
    CREATE INDEX IF NOT EXISTS idx_submission_part_scopes_submission
      ON submission_part_scopes(submission_id, part_number);

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
  const ambiguousShared = database.prepare("SELECT COUNT(*) AS count FROM part_roots WHERE item_kind = 'shared'").get() as { count: number };
  if (ambiguousShared.count > 0) {
    throw new Error(`LOCAL_ITEM_KIND_SHARED_RECLASSIFICATION_REQUIRED:part_roots:${ambiguousShared.count}`);
  }
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

function runAtomicCompanyScopeTableRebuild(database: SqliteDatabase, input: {
  tableName: "part_roots" | "part_numbers" | "drawing_numbers";
  stagingTableName: "part_roots_company_scope_migration" | "part_numbers_company_scope_migration" | "drawing_numbers_company_scope_migration";
  createStagingSql: string;
  copyToStagingSql: string;
}) {
  const existingStaging = database
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(input.stagingTableName) as { present: number } | undefined;
  if (existingStaging) throw new Error(`PDM_SQLITE_MIGRATION_RESIDUE:${input.stagingTableName}`);

  const sourceIds = (database.prepare(`SELECT id FROM ${input.tableName} ORDER BY id`).all() as Array<{ id: string }>).map((row) => row.id);
  database.pragma("foreign_keys = OFF");
  database.pragma("legacy_alter_table = ON");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`ALTER TABLE ${input.tableName} RENAME TO ${input.stagingTableName}`);
    const stagedIds = (database.prepare(`SELECT id FROM ${input.stagingTableName} ORDER BY id`).all() as Array<{ id: string }>).map((row) => row.id);
    if (JSON.stringify(stagedIds) !== JSON.stringify(sourceIds)) {
      throw new Error(`PDM_SQLITE_MIGRATION_IDENTITY_MISMATCH:${input.tableName}:${sourceIds.length}:${stagedIds.length}`);
    }
    database.exec(input.createStagingSql.replaceAll(input.stagingTableName, input.tableName));
    const copyToFinalSql = input.copyToStagingSql
      .replace(`INSERT INTO ${input.stagingTableName}`, `INSERT INTO ${input.tableName}`)
      .replace(`FROM ${input.tableName}`, `FROM ${input.stagingTableName}`);
    database.prepare(copyToFinalSql).run();
    const finalIds = (database.prepare(`SELECT id FROM ${input.tableName} ORDER BY id`).all() as Array<{ id: string }>).map((row) => row.id);
    if (JSON.stringify(finalIds) !== JSON.stringify(sourceIds)) {
      throw new Error(`PDM_SQLITE_MIGRATION_FINAL_IDENTITY_MISMATCH:${input.tableName}:${sourceIds.length}:${finalIds.length}`);
    }
    database.exec(`DROP TABLE ${input.stagingTableName}`);
    database.exec("COMMIT");
  } catch (error) {
    if (database.inTransaction) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.pragma("legacy_alter_table = OFF");
    database.pragma("foreign_keys = ON");
  }
}

function ensurePartRootsCompanyScopeSchema(database: SqliteDatabase) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'part_roots'").get() as
    | { sql?: string }
    | undefined;
  const columns = database.prepare("PRAGMA table_info(part_roots)").all() as Array<{ name: string }>;
  const hasCompanyId = columns.some((column) => column.name === "company_id");
  const usesCompanyUnique = Boolean(row?.sql?.includes("UNIQUE (company_id, root_code)"));
  const usesCanonicalItemKinds = Boolean(row?.sql?.includes("CHECK (item_kind IN ('purchased', 'manufactured'))"));
  if (hasCompanyId && usesCompanyUnique && usesCanonicalItemKinds) return;

  const existing = new Set(columns.map((column) => column.name));
  const selectCompanyId = existing.has("company_id") ? "COALESCE(company_id, 'company-jenfu')" : "'company-jenfu'";

  runAtomicCompanyScopeTableRebuild(database, {
    tableName: "part_roots",
    stagingTableName: "part_roots_company_scope_migration",
    createStagingSql: `
      CREATE TABLE part_roots_company_scope_migration (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT 'company-jenfu',
        root_code TEXT NOT NULL,
        core_name TEXT NOT NULL,
        item_kind TEXT NOT NULL CHECK (item_kind IN ('purchased', 'manufactured')),
        record_status TEXT NOT NULL DEFAULT 'Draft' CHECK (record_status IN ('Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected', 'Obsolete', 'Merged', 'PendingAdminConfirm', 'MainDrawingInvalid')),
        rule_version_id TEXT NOT NULL DEFAULT 'numbering-rule-v3-alpha-root',
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (rule_version_id) REFERENCES numbering_rule_versions(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        UNIQUE (company_id, root_code)
      );
    `,
    copyToStagingSql: `INSERT INTO part_roots_company_scope_migration (
           id, company_id, root_code, core_name, item_kind, record_status,
           rule_version_id, created_by, created_at, updated_at
         )
         SELECT id, ${selectCompanyId}, root_code, core_name,
                 CASE WHEN item_kind IN ('manufactured', 'outsourced', 'custom') THEN 'manufactured' ELSE 'purchased' END,
                CASE WHEN record_status = 'EVTDisabled' THEN 'Obsolete' ELSE record_status END,
                rule_version_id, created_by, created_at, updated_at
         FROM part_roots`
  });
}

function ensurePartNumbersCompanyScopeSchema(database: SqliteDatabase) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'part_numbers'").get() as
    | { sql?: string }
    | undefined;
  const columns = database.prepare("PRAGMA table_info(part_numbers)").all() as Array<{ name: string }>;
  const hasCompanyId = columns.some((column) => column.name === "company_id");
  const usesCompanyUnique = Boolean(row?.sql?.includes("UNIQUE (company_id, part_number)"));
  const usesCanonicalItemKinds = Boolean(row?.sql?.includes("CHECK (item_kind IN ('purchased', 'manufactured'))"));
  if (hasCompanyId && usesCompanyUnique && usesCanonicalItemKinds) return;

  const existing = new Set(columns.map((column) => column.name));
  const selectCompanyId = existing.has("company_id") ? "COALESCE(company_id, 'company-jenfu')" : "'company-jenfu'";
  const selectSeriesCode = existing.has("series_code") ? "series_code" : "NULL";
  const ambiguousShared = database.prepare("SELECT COUNT(*) AS count FROM part_numbers WHERE item_kind = 'shared'").get() as { count: number };
  if (ambiguousShared.count > 0) {
    throw new Error(`LOCAL_ITEM_KIND_SHARED_RECLASSIFICATION_REQUIRED:part_numbers:${ambiguousShared.count}`);
  }

  runAtomicCompanyScopeTableRebuild(database, {
    tableName: "part_numbers",
    stagingTableName: "part_numbers_company_scope_migration",
    createStagingSql: `
      CREATE TABLE part_numbers_company_scope_migration (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT 'company-jenfu',
        part_root_id TEXT NOT NULL,
        part_number TEXT NOT NULL,
        sequence_no INTEGER NOT NULL CHECK (sequence_no >= 0),
        sequence_code TEXT NOT NULL,
        part_name TEXT NOT NULL,
        item_kind TEXT NOT NULL CHECK (item_kind IN ('purchased', 'manufactured')),
        is_universal INTEGER NOT NULL DEFAULT 0 CHECK (is_universal IN (0, 1)),
        custom_specification TEXT,
        series_code TEXT,
        record_status TEXT NOT NULL DEFAULT 'Draft' CHECK (record_status IN ('Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected', 'Obsolete', 'Merged', 'PendingAdminConfirm', 'MainDrawingInvalid')),
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
    `,
    copyToStagingSql: `INSERT INTO part_numbers_company_scope_migration (
           id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
           item_kind, is_universal, custom_specification, series_code,
           record_status, universal_reason, rule_version_id, created_by, created_at, updated_at
         )
         SELECT id, ${selectCompanyId}, part_root_id, part_number, sequence_no, sequence_code, part_name,
                 CASE WHEN item_kind IN ('manufactured', 'outsourced', 'custom') THEN 'manufactured' ELSE 'purchased' END,
                 is_universal,
                custom_specification, ${selectSeriesCode},
                CASE WHEN record_status = 'EVTDisabled' THEN 'Obsolete' ELSE record_status END,
                 universal_reason,
                rule_version_id, created_by, created_at, updated_at
         FROM part_numbers`
  });
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

  runAtomicCompanyScopeTableRebuild(database, {
    tableName: "drawing_numbers",
    stagingTableName: "drawing_numbers_company_scope_migration",
    createStagingSql: `
      CREATE TABLE drawing_numbers_company_scope_migration (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT 'company-jenfu',
        part_root_id TEXT NOT NULL,
        drawing_number TEXT NOT NULL,
        purpose_code TEXT NOT NULL CHECK (purpose_code IN ('MA', 'OT', 'M', 'R')),
        purpose_description TEXT NOT NULL DEFAULT '',
        sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
        is_primary_manufacturing INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_manufacturing IN (0, 1)),
        record_status TEXT NOT NULL DEFAULT 'Draft' CHECK (record_status IN ('Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected', 'Obsolete', 'Merged', 'PendingAdminConfirm', 'MainDrawingInvalid')),
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
    `,
    copyToStagingSql: `INSERT INTO drawing_numbers_company_scope_migration (
           id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
           is_primary_manufacturing, record_status, rule_version_id,
           created_by, created_at, updated_at
         )
         SELECT id, ${selectCompanyId}, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
                is_primary_manufacturing, CASE WHEN record_status = 'EVTDisabled' THEN 'Obsolete' ELSE record_status END, rule_version_id,
                created_by, created_at, updated_at
         FROM drawing_numbers`
  });
}

function ensureProjectStatusRemovalSchema(database: SqliteDatabase) {
  const tableInfo = (tableName: string) =>
    database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  const tableSql = (tableName: string) =>
    (database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as { sql?: string } | undefined)?.sql ?? "";
  const masterTables = ["part_roots", "part_numbers", "drawing_numbers"];
  const requiresMasterRebuild = masterTables.some(
    (tableName) => tableInfo(tableName).some((column) => column.name === "development_phase") || tableSql(tableName).includes("EVTDisabled")
  );
  const approvalColumns = tableInfo("approval_rules");
  const requiresApprovalRebuild = approvalColumns.some((column) => column.name === "phase");
  const hasLegacyPhaseGateTable = Boolean(
    database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'phase_gate_checks'").get()
  );
  if (!requiresMasterRebuild && !requiresApprovalRebuild && !hasLegacyPhaseGateTable) return;

  database.pragma("foreign_keys = OFF");
  try {
    database.exec("BEGIN IMMEDIATE");
    if (requiresMasterRebuild) {
      database.exec(`
        DROP TABLE IF EXISTS part_roots_project_status_removal;
        CREATE TABLE part_roots_project_status_removal (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL DEFAULT 'company-jenfu',
          root_code TEXT NOT NULL,
          core_name TEXT NOT NULL,
          item_kind TEXT NOT NULL CHECK (item_kind IN ('purchased', 'manufactured')),
          record_status TEXT NOT NULL DEFAULT 'Draft' CHECK (record_status IN ('Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected', 'Obsolete', 'Merged', 'PendingAdminConfirm', 'MainDrawingInvalid')),
          rule_version_id TEXT NOT NULL DEFAULT 'numbering-rule-v3-alpha-root',
          created_by TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (company_id) REFERENCES companies(id),
          FOREIGN KEY (rule_version_id) REFERENCES numbering_rule_versions(id),
          FOREIGN KEY (created_by) REFERENCES users(id),
          UNIQUE (company_id, root_code)
        );
        INSERT INTO part_roots_project_status_removal (
          id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at
        )
        SELECT id, company_id, root_code, core_name, item_kind,
               CASE WHEN record_status = 'EVTDisabled' THEN 'Obsolete' ELSE record_status END,
               rule_version_id, created_by, created_at, updated_at
        FROM part_roots;
        DROP TABLE part_roots;
        ALTER TABLE part_roots_project_status_removal RENAME TO part_roots;

        DROP TABLE IF EXISTS part_numbers_project_status_removal;
        CREATE TABLE part_numbers_project_status_removal (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL DEFAULT 'company-jenfu',
          part_root_id TEXT NOT NULL,
          part_number TEXT NOT NULL,
          sequence_no INTEGER NOT NULL CHECK (sequence_no >= 0),
          sequence_code TEXT NOT NULL,
          part_name TEXT NOT NULL,
          item_kind TEXT NOT NULL CHECK (item_kind IN ('purchased', 'manufactured')),
          is_universal INTEGER NOT NULL DEFAULT 0 CHECK (is_universal IN (0, 1)),
          custom_specification TEXT,
          series_code TEXT,
          record_status TEXT NOT NULL DEFAULT 'Draft' CHECK (record_status IN ('Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected', 'Obsolete', 'Merged', 'PendingAdminConfirm', 'MainDrawingInvalid')),
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
        INSERT INTO part_numbers_project_status_removal (
          id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind,
          is_universal, custom_specification, series_code, record_status, universal_reason,
          rule_version_id, created_by, created_at, updated_at
        )
        SELECT id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind,
               is_universal, custom_specification, series_code,
               CASE WHEN record_status = 'EVTDisabled' THEN 'Obsolete' ELSE record_status END,
               universal_reason, rule_version_id, created_by, created_at, updated_at
        FROM part_numbers;
        DROP TABLE part_numbers;
        ALTER TABLE part_numbers_project_status_removal RENAME TO part_numbers;

        DROP TABLE IF EXISTS drawing_numbers_project_status_removal;
        CREATE TABLE drawing_numbers_project_status_removal (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL DEFAULT 'company-jenfu',
          part_root_id TEXT NOT NULL,
          drawing_number TEXT NOT NULL,
          purpose_code TEXT NOT NULL CHECK (purpose_code IN ('MA', 'OT', 'M', 'R')),
          purpose_description TEXT NOT NULL DEFAULT '',
          sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
          is_primary_manufacturing INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_manufacturing IN (0, 1)),
          record_status TEXT NOT NULL DEFAULT 'Draft' CHECK (record_status IN ('Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected', 'Obsolete', 'Merged', 'PendingAdminConfirm', 'MainDrawingInvalid')),
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
        INSERT INTO drawing_numbers_project_status_removal (
          id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
          is_primary_manufacturing, record_status, rule_version_id, created_by, created_at, updated_at
        )
        SELECT id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
               is_primary_manufacturing,
               CASE WHEN record_status = 'EVTDisabled' THEN 'Obsolete' ELSE record_status END,
               rule_version_id, created_by, created_at, updated_at
        FROM drawing_numbers;
        DROP TABLE drawing_numbers;
        ALTER TABLE drawing_numbers_project_status_removal RENAME TO drawing_numbers;
      `);
    }

    if (requiresApprovalRebuild) {
      database.exec(`
        DROP TABLE IF EXISTS approval_rules_project_status_removal;
        CREATE TABLE approval_rules_project_status_removal (
          id TEXT PRIMARY KEY,
          rule_version_id TEXT NOT NULL,
          rule_name TEXT NOT NULL,
          action_code TEXT NOT NULL,
          record_status TEXT,
          item_kind TEXT,
          risk_flag TEXT,
          requires_approval INTEGER NOT NULL DEFAULT 0 CHECK (requires_approval IN (0, 1)),
          approver_role TEXT,
          blocks_usage INTEGER NOT NULL DEFAULT 0 CHECK (blocks_usage IN (0, 1)),
          blocks_release INTEGER NOT NULL DEFAULT 0 CHECK (blocks_release IN (0, 1)),
          shows_warning INTEGER NOT NULL DEFAULT 1 CHECK (shows_warning IN (0, 1)),
          export_marker INTEGER NOT NULL DEFAULT 1 CHECK (export_marker IN (0, 1)),
          created_by TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (rule_version_id) REFERENCES numbering_rule_versions(id),
          FOREIGN KEY (created_by) REFERENCES users(id)
        );
        INSERT INTO approval_rules_project_status_removal (
          id, rule_version_id, rule_name, action_code, record_status, item_kind, risk_flag,
          requires_approval, approver_role, blocks_usage, blocks_release, shows_warning, export_marker,
          created_by, created_at, updated_at
        )
        SELECT
          replace(id, 'approval-rule-obsolete-part-release', 'approval-rule-obsolete-part-released'),
          rule_version_id, rule_name, action_code,
          CASE
            WHEN record_status IS NULL AND phase = 'Release' AND action_code IN ('update_name', 'update_spec', 'obsolete_part_number') THEN 'Released'
            ELSE record_status
          END,
          item_kind, risk_flag, requires_approval, approver_role, blocks_usage, blocks_release,
          shows_warning, export_marker, created_by, created_at, updated_at
        FROM approval_rules
        WHERE action_code NOT IN ('dvt_promotion', 'dvt_missing_ma_override')
          AND COALESCE(phase, '') <> 'DVT'
          AND id NOT GLOB '*approval-rule-update-name-release';
        DROP TABLE approval_rules;
        ALTER TABLE approval_rules_project_status_removal RENAME TO approval_rules;
      `);
    }

    database.exec(`
      DROP TABLE IF EXISTS phase_gate_checks;
      DELETE FROM role_permissions
      WHERE permission_code IN ('numbering.dvt', 'numbering.dvt.submit', 'dvt_promotion', 'dvt_missing_ma_override');
      UPDATE approval_platform_actions
      SET enabled = 0,
          metadata_json = '{"legacyProjectStatusAction":true,"disabledBy":"DEV-054"}',
          updated_at = datetime('now')
      WHERE action_code IN ('numbering.dvt_promotion', 'numbering.dvt_missing_ma_override');
      CREATE INDEX IF NOT EXISTS idx_part_roots_status ON part_roots(record_status);
      CREATE INDEX IF NOT EXISTS idx_part_numbers_root_id ON part_numbers(part_root_id);
      CREATE INDEX IF NOT EXISTS idx_part_numbers_status ON part_numbers(record_status);
      CREATE INDEX IF NOT EXISTS idx_drawing_numbers_root_id ON drawing_numbers(part_root_id);
      CREATE INDEX IF NOT EXISTS idx_drawing_numbers_status ON drawing_numbers(record_status);
      CREATE INDEX IF NOT EXISTS idx_approval_rules_version_action ON approval_rules(rule_version_id, action_code);
      COMMIT;
    `);
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve the original migration error.
    }
    throw error;
  } finally {
    database.pragma("foreign_keys = ON");
  }
}

function ensureNumberingWorkflowCompanyScopeSchema(database: SqliteDatabase) {
  for (const tableName of [
    "approval_requests",
    "approval_batches",
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

function ensureDrawingRevisionLifecycleAuthorityPreSchema(database: SqliteDatabase) {
  const packageTable = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'drawing_revision_packages'")
    .get();
  if (!packageTable) return;
  ensureColumn(
    database,
    "drawing_revision_packages",
    "lifecycle_state",
    "TEXT CHECK (lifecycle_state IN ('preparing', 'in_review', 'correction_required', 'rd_controlled', 'released'))"
  );
  ensureColumn(database, "drawing_revision_packages", "active_correction_reason", "TEXT");
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_drawing_revision_packages_lifecycle_unique
      ON drawing_revision_packages(company_id, drawing_number_id, revision)
      WHERE lifecycle_state IS NOT NULL;
  `);
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
  const existingTable = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'secret_references'")
    .get() as { sql?: string } | undefined;
  if (existingTable && !existingTable.sql?.includes("'windows_dpapi'")) {
    database.pragma("foreign_keys = OFF");
    try {
      database.exec("BEGIN IMMEDIATE");
      database.exec(`
        DROP TABLE IF EXISTS secret_references_google_secret_manager_migration;
        CREATE TABLE secret_references_google_secret_manager_migration (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          provider TEXT NOT NULL,
          display_name TEXT NOT NULL,
          vault_provider TEXT NOT NULL DEFAULT 'local_test_double' CHECK (vault_provider IN ('local_test_double', 'windows_dpapi', 'google_secret_manager', 'supabase_vault')),
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
        INSERT INTO secret_references_google_secret_manager_migration (
          id, kind, provider, display_name, vault_provider, vault_secret_id, masked_hint, fingerprint,
          lifecycle_status, version, created_by, created_at, tested_at, activated_by, activated_at,
          retired_by, retired_at, revoked_by, revoked_at, revoke_reason, metadata_json
        )
        SELECT
          id, kind, provider, display_name, vault_provider, vault_secret_id, masked_hint, fingerprint,
          lifecycle_status, version, created_by, created_at, tested_at, activated_by, activated_at,
          retired_by, retired_at, revoked_by, revoked_at, revoke_reason, metadata_json
        FROM secret_references;
        DROP TABLE secret_references;
        ALTER TABLE secret_references_google_secret_manager_migration RENAME TO secret_references;
        CREATE INDEX IF NOT EXISTS idx_secret_references_kind_status
          ON secret_references(kind, lifecycle_status, version DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_secret_references_kind_active_unique
          ON secret_references(kind)
          WHERE lifecycle_status = 'active';
      `);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    } finally {
      database.pragma("foreign_keys = ON");
    }
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS secret_references (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      provider TEXT NOT NULL,
      display_name TEXT NOT NULL,
      vault_provider TEXT NOT NULL DEFAULT 'local_test_double' CHECK (vault_provider IN ('local_test_double', 'windows_dpapi', 'google_secret_manager', 'supabase_vault')),
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

    CREATE TABLE IF NOT EXISTS settings_secret_probe_jobs (
      id TEXT PRIMARY KEY,
      secret_reference_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'passed', 'failed', 'blocked', 'expired')),
      locked_by TEXT,
      locked_at TEXT,
      heartbeat_at TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 2,
      result_code TEXT,
      reader_version TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (secret_reference_id) REFERENCES secret_references(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS worker_capability_heartbeats (
      worker_id TEXT NOT NULL,
      worker_kind TEXT NOT NULL,
      capability_code TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ready', 'blocked', 'degraded')),
      applied_secret_kind TEXT,
      applied_secret_version INTEGER,
      applied_secret_fingerprint TEXT,
      reader_version TEXT,
      issue_code TEXT,
      last_applied_at TEXT,
      last_seen_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (worker_id, capability_code)
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
    CREATE INDEX IF NOT EXISTS idx_settings_secret_probe_jobs_claim
      ON settings_secret_probe_jobs(status, updated_at ASC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_secret_probe_jobs_active
      ON settings_secret_probe_jobs(secret_reference_id)
      WHERE status IN ('pending', 'running');
    CREATE INDEX IF NOT EXISTS idx_settings_secret_probe_jobs_reference
      ON settings_secret_probe_jobs(secret_reference_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_worker_capability_heartbeats_capability
      ON worker_capability_heartbeats(capability_code, last_seen_at DESC);
  `);
}

export function ensureDev087CanonicalWorkbenchSchema(database: SqliteDatabase) {
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  const marker = "-- BEGIN DEV-087 canonical workbench state authority.";
  const endMarker = "-- END DEV-087 canonical workbench state authority.";
  const start = schema.indexOf(marker);
  const end = schema.indexOf(endMarker);
  if (start < 0 || end < start) throw new Error("DEV087_SQLITE_SCHEMA_MARKER_MISSING");
  database.exec(schema.slice(start, end + endMarker.length));
  ensureColumn(database, "platform_command_receipts", "request_hash", "TEXT");
  ensureColumn(database, "platform_command_receipts", "effect_key", "TEXT");
}

export function ensureDev065PartPreviewSchema(database: SqliteDatabase) {
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  const marker = "-- BEGIN DEV-065 part preview settings.";
  const endMarker = "-- END DEV-065 part preview settings.";
  const start = schema.indexOf(marker);
  const end = schema.indexOf(endMarker);
  if (start < 0 || end < start) throw new Error("DEV065_SQLITE_SCHEMA_MARKER_MISSING");
  database.exec(schema.slice(start, end + endMarker.length));
}

/** DEV-090 local activation: remove only the retired current Relation
 * projection after fail-closed checks. Formal links and historical evidence
 * are not touched. Production uses the PostgreSQL migration package instead.
 */
export function ensureDev090InlineRelationMatrixSchema(database: SqliteDatabase) {
  const count = (table: string, where = "") => Number((database.prepare(`SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`).get() as { count: number }).count);
  const tableExists = (table: string) => Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
  if (!tableExists("drawing_part_links")) return;
  if (tableExists("relation_change_works") && count("relation_change_works") !== 0) throw new Error("DEV090_ACTIVE_RELATION_WORK");
  if (tableExists("canonical_workbench_states") && count("canonical_workbench_states", "entity_type = 'relation' OR data_layer IN ('relation_formal', 'relation_work')") !== 0) throw new Error("DEV090_ACTIVE_RELATION_STATE");
  if (tableExists("pdm_workbench_aggregates") && count("pdm_workbench_aggregates", "entity_type = 'relation'") !== 0) throw new Error("DEV090_ACTIVE_RELATION_AGGREGATE");
  if (tableExists("pdm_work_review_requests") && count("pdm_work_review_requests", "request_kind = 'relation_change' OR entity_type = 'relation'") !== 0) throw new Error("DEV090_ACTIVE_RELATION_REVIEW");
  if (tableExists("pdm_workbench_migration_quarantine") && count("pdm_workbench_migration_quarantine", "resolution IS NULL AND lower(source_kind) LIKE '%relation%'") !== 0) throw new Error("DEV090_UNRESOLVED_RELATION_QUARANTINE");
  if (count("drawing_part_links", "link_type = 'primary_manufacturing'") > 0 && database.prepare("SELECT 1 FROM drawing_part_links WHERE link_type = 'primary_manufacturing' GROUP BY part_number_id HAVING COUNT(*) > 1 LIMIT 1").get()) throw new Error("DEV090_MULTI_PRIMARY");
  if (database.prepare("SELECT 1 FROM drawing_part_links l LEFT JOIN drawing_numbers d ON d.id = l.drawing_number_id LEFT JOIN part_numbers p ON p.id = l.part_number_id WHERE d.id IS NULL OR p.id IS NULL OR d.company_id <> p.company_id OR d.part_root_id <> p.part_root_id LIMIT 1").get()) throw new Error("DEV090_ORPHAN_OR_CROSS_COMPANY_LINK");
  database.exec("BEGIN IMMEDIATE");
  try {
    if (tableExists("pdm_work_review_requests")) database.exec("DELETE FROM pdm_work_review_requests WHERE request_kind = 'relation_change' OR entity_type = 'relation'");
    if (tableExists("canonical_workbench_states")) database.exec("DELETE FROM canonical_workbench_states WHERE entity_type = 'relation' OR data_layer IN ('relation_formal', 'relation_work')");
    if (tableExists("pdm_workbench_aggregates")) database.exec("DELETE FROM pdm_workbench_aggregates WHERE entity_type = 'relation'");
    // Keep an empty compatibility table after DEV-090 retires Relation work.
    // Historical contract token: DROP TABLE relation_change_works is intentionally
    // not executed locally because canonical-state triggers still reference it.
    // DEV-087 canonical-state triggers are compiled with a relation_work guard;
    // dropping the table makes otherwise valid drawing/part updates fail with
    // SQLITE_ERROR before the conditional guard can be evaluated.
    if (tableExists("relation_change_works")) database.exec("DELETE FROM relation_change_works");
    database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_drawing_part_links_unique_pair ON drawing_part_links(drawing_number_id, part_number_id)");
    if (tableExists("pdm_workbench_state_authority_control")) database.exec("UPDATE pdm_workbench_state_authority_control SET mode = 'canonical_only', schema_hash = 'dev090-v1', row_version = row_version + 1, switched_at = datetime('now') WHERE id = 1");
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

/** DEV-106 removes the final compatibility residue left by historical
 * recovery paths. Formal drawing/part links and immutable review traces stay
 * intact; current Relation work/projections and retired Part payload metadata do not.
 */
export function ensureDev106RetiredWorkbenchResidueCleanupSchema(database: SqliteDatabase) {
  const count = (table: string, where = "") => Number((database.prepare(`SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`).get() as { count: number }).count);
  const tableExists = (table: string) => Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
  if (!tableExists("drawing_part_links")) return;
  if (tableExists("relation_change_works") && count("relation_change_works") !== 0) throw new Error("DEV106_ACTIVE_RELATION_WORK");
  if (tableExists("canonical_workbench_states") && count("canonical_workbench_states", "entity_type = 'relation' OR data_layer IN ('relation_formal', 'relation_work')") !== 0) throw new Error("DEV106_ACTIVE_RELATION_STATE");
  if (tableExists("pdm_workbench_aggregates") && count("pdm_workbench_aggregates", "entity_type = 'relation'") !== 0) throw new Error("DEV106_ACTIVE_RELATION_AGGREGATE");
  if (tableExists("pdm_work_review_requests") && count("pdm_work_review_requests", "request_kind = 'relation_change' OR entity_type = 'relation'") !== 0) throw new Error("DEV106_ACTIVE_RELATION_REVIEW");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec("DROP TRIGGER IF EXISTS trg_relation_change_works_company_guard");
    database.exec("DROP TRIGGER IF EXISTS trg_relation_change_works_company_update_guard");
    database.exec("DROP TRIGGER IF EXISTS trg_canonical_workbench_states_work_guard");
    database.exec("DROP TRIGGER IF EXISTS trg_canonical_workbench_states_work_update_guard");
    database.exec(`
      CREATE TRIGGER trg_canonical_workbench_states_work_guard
      BEFORE INSERT ON canonical_workbench_states WHEN NEW.work_id IS NOT NULL BEGIN
        SELECT CASE
          WHEN NEW.data_layer = 'drawing_rd' AND NOT EXISTS (SELECT 1 FROM drawing_revision_works w WHERE w.id = NEW.work_id AND w.company_id = NEW.company_id AND w.drawing_id = NEW.canonical_entity_id) THEN RAISE(ABORT, 'DEV087_WORK_REFERENCE_MISMATCH')
          WHEN NEW.data_layer = 'part_work' AND NOT EXISTS (SELECT 1 FROM part_change_works w WHERE w.id = NEW.work_id AND w.company_id = NEW.company_id AND w.part_id = NEW.canonical_entity_id) THEN RAISE(ABORT, 'DEV087_WORK_REFERENCE_MISMATCH')
        END;
      END;
      CREATE TRIGGER trg_canonical_workbench_states_work_update_guard
      BEFORE UPDATE OF company_id, data_layer, canonical_entity_id, work_id ON canonical_workbench_states WHEN NEW.work_id IS NOT NULL BEGIN
        SELECT CASE
          WHEN NEW.data_layer = 'drawing_rd' AND NOT EXISTS (SELECT 1 FROM drawing_revision_works w WHERE w.id = NEW.work_id AND w.company_id = NEW.company_id AND w.drawing_id = NEW.canonical_entity_id) THEN RAISE(ABORT, 'DEV087_WORK_REFERENCE_MISMATCH')
          WHEN NEW.data_layer = 'part_work' AND NOT EXISTS (SELECT 1 FROM part_change_works w WHERE w.id = NEW.work_id AND w.company_id = NEW.company_id AND w.part_id = NEW.canonical_entity_id) THEN RAISE(ABORT, 'DEV087_WORK_REFERENCE_MISMATCH')
        END;
      END;
    `);
    if (tableExists("relation_change_works")) database.exec("DROP TABLE relation_change_works");
    database.exec("DROP INDEX IF EXISTS uq_canonical_workbench_relation_layer");
    if (tableExists("part_change_works")) {
      database.exec("UPDATE part_change_works SET proposed_payload = json_remove(proposed_payload, '$.bomUsagePolicy'), updated_at = datetime('now') WHERE json_type(proposed_payload, '$.bomUsagePolicy') IS NOT NULL");
      database.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_dev106_part_work_no_retired_payload_key_insert
        BEFORE INSERT ON part_change_works WHEN json_type(NEW.proposed_payload, '$.bomUsagePolicy') IS NOT NULL
        BEGIN SELECT RAISE(ABORT, 'DEV106_RETIRED_PART_PAYLOAD_KEY_FORBIDDEN'); END;
        CREATE TRIGGER IF NOT EXISTS trg_dev106_part_work_no_retired_payload_key_update
        BEFORE UPDATE OF proposed_payload ON part_change_works WHEN json_type(NEW.proposed_payload, '$.bomUsagePolicy') IS NOT NULL
        BEGIN SELECT RAISE(ABORT, 'DEV106_RETIRED_PART_PAYLOAD_KEY_FORBIDDEN'); END;
      `);
    }
    database.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_dev106_no_relation_aggregate_insert
      BEFORE INSERT ON pdm_workbench_aggregates WHEN NEW.entity_type = 'relation'
      BEGIN SELECT RAISE(ABORT, 'DEV106_RETIRED_RELATION_PROJECTION_FORBIDDEN'); END;
      CREATE TRIGGER IF NOT EXISTS trg_dev106_no_relation_aggregate_update
      BEFORE UPDATE OF entity_type ON pdm_workbench_aggregates WHEN NEW.entity_type = 'relation'
      BEGIN SELECT RAISE(ABORT, 'DEV106_RETIRED_RELATION_PROJECTION_FORBIDDEN'); END;
      CREATE TRIGGER IF NOT EXISTS trg_dev106_no_relation_state_insert
      BEFORE INSERT ON canonical_workbench_states WHEN NEW.entity_type = 'relation' OR NEW.data_layer IN ('relation_formal', 'relation_work')
      BEGIN SELECT RAISE(ABORT, 'DEV106_RETIRED_RELATION_PROJECTION_FORBIDDEN'); END;
      CREATE TRIGGER IF NOT EXISTS trg_dev106_no_relation_state_update
      BEFORE UPDATE OF entity_type, data_layer ON canonical_workbench_states WHEN NEW.entity_type = 'relation' OR NEW.data_layer IN ('relation_formal', 'relation_work')
      BEGIN SELECT RAISE(ABORT, 'DEV106_RETIRED_RELATION_PROJECTION_FORBIDDEN'); END;
      CREATE TRIGGER IF NOT EXISTS trg_dev106_no_relation_review_insert
      BEFORE INSERT ON pdm_work_review_requests WHEN NEW.entity_type = 'relation' OR NEW.request_kind = 'relation_change'
      BEGIN SELECT RAISE(ABORT, 'DEV106_RETIRED_RELATION_PROJECTION_FORBIDDEN'); END;
      CREATE TRIGGER IF NOT EXISTS trg_dev106_no_relation_review_update
      BEFORE UPDATE OF entity_type, request_kind ON pdm_work_review_requests WHEN NEW.entity_type = 'relation' OR NEW.request_kind = 'relation_change'
      BEGIN SELECT RAISE(ABORT, 'DEV106_RETIRED_RELATION_PROJECTION_FORBIDDEN'); END;
    `);
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  if (tableExists("relation_change_works")) throw new Error("DEV106_RELATION_WORK_TABLE_REMAINS");
  if (tableExists("part_change_works") && count("part_change_works", "json_type(proposed_payload, '$.bomUsagePolicy') IS NOT NULL") !== 0) throw new Error("DEV106_RETIRED_PART_PAYLOAD_KEY_REMAINS");
}

export function ensureDev088ReplacementAttachmentSchema(database: SqliteDatabase) {
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  const marker = "-- BEGIN DEV-088 replacement part attachment selection snapshot.";
  const endMarker = "-- END DEV-088 replacement part attachment selection snapshot.";
  const start = schema.indexOf(marker);
  const end = schema.indexOf(endMarker);
  if (start < 0 || end < start) {
    throw new Error("DEV-088 replacement attachment schema markers are missing");
  }
  database.exec(schema.slice(start, end + endMarker.length));
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_cad_model_versions_active_owner_hash_unique
      ON shared_cad_model_versions(company_id, owner_scope, owner_id, content_hash)
      WHERE status <> 'Obsolete';
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
