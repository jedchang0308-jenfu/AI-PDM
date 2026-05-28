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
  findPreviousBomSubmissionId,
  getBomBySubmissionId,
  getBomDiffBetweenSubmissions,
  listWhereUsed,
  materializeBomDraftFromReferences
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
  ensureSubmissionsLifecycleSchema(database);
  reconcileItemCurrentRevisions(database);
  ensureColumn(database, "review_issues", "assignee_id", "TEXT");
  ensureColumn(database, "sandbox_branches", "merged_by", "TEXT");
  ensureColumn(database, "sandbox_branches", "merge_summary_json", "TEXT");
  ensureColumn(database, "sandbox_branches", "merged_at", "TEXT");
  seedConfiguredUsers(database);
}

function ensureColumn(database: SqliteDatabase, table: string, column: string, definition: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const submissionLifecycleColumns = [
  "id",
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
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (submitted_by) REFERENCES users(id),
      FOREIGN KEY (superseded_by_submission_id) REFERENCES submissions(id),
      FOREIGN KEY (obsolete_by) REFERENCES users(id),
      UNIQUE (drawing_number, revision)
    )
  `;
}

function ensureSubmissionsLifecycleSchema(database: SqliteDatabase) {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'submissions'").get() as
    | { sql: string }
    | undefined;
  const columns = database.prepare("PRAGMA table_info(submissions)").all() as Array<{ name: string }>;
  const hasObsoleteStatus = Boolean(row?.sql.includes("'Obsolete'"));

  if (hasObsoleteStatus) {
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
