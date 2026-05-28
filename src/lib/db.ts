import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createDefaultDatabaseProvider, type DatabaseProvider, type SqliteDatabase } from "@/lib/db-provider";
import { hashPassword } from "@/lib/password";
import { getActiveItemLock } from "@/lib/repositories/item-lock-repository";
import { getReleasePackageBySubmissionId } from "@/lib/repositories/release-repository";
import type {
  BomDetail,
  BomDiffResult,
  DesignReuseCandidate,
  DuplicateGeometryCandidate,
  FileReference,
  ItemRevisionHistoryEntry,
  SubmissionDetail,
  SubmissionFile,
  SubmissionSummary,
  WhereUsedEntry
} from "@/lib/types";

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
export { getActiveItemLock };
export {
  createItemLock,
  expireItemLocks,
  findActiveItemLockForSubmissionIdentifiers,
  releaseItemLock
} from "@/lib/repositories/item-lock-repository";
export { getReleasePackageBySubmissionId };
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

type UserRole = "Engineer" | "R&D Manager" | "Admin";

let dbProvider: DatabaseProvider | null = null;

const DEMO_PASSWORD = "pdm-demo";

export function getAuthMode() {
  return process.env.PDM_AUTH_MODE === "managed" ? "managed" : "demo";
}

function shouldSeedDemoUsers() {
  return getAuthMode() === "demo";
}

function parseBootstrapUsers(): Array<{
  id?: string;
  displayName: string;
  email: string;
  password: string;
  role: UserRole;
}> {
  const raw = process.env.PDM_BOOTSTRAP_USERS?.trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("INVALID_BOOTSTRAP_USERS: PDM_BOOTSTRAP_USERS must be a JSON array");
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`INVALID_BOOTSTRAP_USERS: entry ${index} must be an object`);
    }

    const value = entry as Record<string, unknown>;
    const id = value.id ? String(value.id).trim() : undefined;
    const displayName = String(value.displayName ?? "").trim();
    const email = String(value.email ?? "").trim();
    const password = String(value.password ?? "");
    const role = String(value.role ?? "") as UserRole;

    if (!displayName || !email || !password || !["Engineer", "R&D Manager", "Admin"].includes(role)) {
      throw new Error(`INVALID_BOOTSTRAP_USERS: entry ${index} requires displayName, email, password, and valid role`);
    }

    return { id, displayName, email, password, role };
  });
}

function upsertUser(input: {
  id: string;
  displayName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  now: string;
  database: SqliteDatabase;
}) {
  input.database
    .prepare(
      `INSERT INTO users (id, display_name, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         display_name = excluded.display_name,
         password_hash = excluded.password_hash,
         role = excluded.role,
         updated_at = excluded.updated_at`
    )
    .run(input.id, input.displayName, input.email, input.passwordHash, input.role, input.now, input.now);
}

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

  const now = new Date().toISOString();
  if (shouldSeedDemoUsers()) {
    const demoHash = hashPassword(DEMO_PASSWORD);
    upsertUser({
      id: "user-engineer-demo",
      displayName: "Demo Engineer",
      email: "engineer@example.com",
      passwordHash: demoHash,
      role: "Engineer",
      now,
      database
    });
    upsertUser({
      id: "user-manager-demo",
      displayName: "R&D Manager",
      email: "manager@example.com",
      passwordHash: demoHash,
      role: "R&D Manager",
      now,
      database
    });
  }

  for (const user of parseBootstrapUsers()) {
    upsertUser({
      id: user.id ?? `user-${crypto.createHash("sha256").update(user.email.toLowerCase()).digest("hex").slice(0, 12)}`,
      displayName: user.displayName,
      email: user.email,
      passwordHash: hashPassword(user.password),
      role: user.role,
      now,
      database
    });
  }
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

function reconcileItemCurrentRevisions(database: SqliteDatabase) {
  database.exec(`
    UPDATE items
    SET current_revision = (
          SELECT s.revision
          FROM submissions s
          WHERE s.item_id = items.id
            AND s.status = 'Released'
          ORDER BY datetime(COALESCE(s.released_at, s.updated_at, s.created_at)) DESC
          LIMIT 1
        ),
        updated_at = CASE
          WHEN EXISTS (
            SELECT 1
            FROM submissions s
            WHERE s.item_id = items.id
              AND s.status = 'Released'
          )
          THEN updated_at
          ELSE updated_at
        END
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

export type DbUser = {
  id: string;
  display_name: string;
  email: string | null;
  role: UserRole;
};

export type DbUserWithPassword = DbUser & { password_hash: string | null };

export function getUserById(id: string) {
  return getDb().prepare("SELECT id, display_name, email, role FROM users WHERE id = ?").get(id) as DbUser | undefined;
}

export function getUserByEmail(email: string) {
  return getDb()
    .prepare("SELECT id, display_name, email, role FROM users WHERE lower(email) = lower(?)")
    .get(email) as DbUser | undefined;
}

export function getUserByEmailWithPassword(email: string) {
  return getDb()
    .prepare("SELECT id, display_name, email, password_hash, role FROM users WHERE lower(email) = lower(?)")
    .get(email) as DbUserWithPassword | undefined;
}

export function createUser(input: {
  displayName: string;
  email: string;
  passwordHash: string;
  role: DbUser["role"];
}) {
  const id = `user-${crypto.randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      "INSERT INTO users (id, display_name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(id, input.displayName, input.email, input.passwordHash, input.role, now, now);
  return id;
}

export function updateUserPassword(userId: string, passwordHash: string) {
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(passwordHash, now, userId);
}

export function listSubmissions(
  status?: string,
  submittedBy?: string,
  options: { limit?: number; offset?: number } = {}
): SubmissionSummary[] {
  const database = getDb();
  const now = new Date().toISOString();
  const baseSql = `
    SELECT
      s.id,
      s.drawing_number,
      s.revision,
      s.material,
      s.surface_finish,
      s.document_type,
      s.status,
      s.submitted_by,
      s.created_at,
      s.updated_at,
      s.released_at,
      i.part_number,
      i.part_name,
      u.display_name AS submitted_by_name,
      COUNT(DISTINCT f.id) AS file_count,
      GROUP_CONCAT(DISTINCT f.file_role) AS file_roles,
      CASE WHEN rp.id IS NULL THEN 0 ELSE 1 END AS has_release_package,
      MAX(CASE WHEN il.id IS NULL THEN 0 ELSE 1 END) AS has_active_lock
    FROM submissions s
    JOIN items i ON i.id = s.item_id
    JOIN users u ON u.id = s.submitted_by
    LEFT JOIN submission_files f ON f.submission_id = s.id
    LEFT JOIN release_packages rp ON rp.submission_id = s.id
    LEFT JOIN item_locks il ON il.item_id = s.item_id AND il.expires_at > ?
  `;
  const filters = [];
  const values: unknown[] = [now];
  if (status) {
    filters.push("s.status = ?");
    values.push(status);
  }
  if (submittedBy) {
    filters.push("s.submitted_by = ?");
    values.push(submittedBy);
  }
  const whereSql = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 500) : null;
  const offset = Math.max(options.offset ?? 0, 0);
  if (limit) {
    values.push(limit, offset);
  }
  const paginationSql = limit ? " LIMIT ? OFFSET ?" : "";
  const sql = `${baseSql} ${whereSql} GROUP BY s.id ORDER BY s.created_at DESC${paginationSql}`;
  return database.prepare(sql).all(...values) as SubmissionSummary[];
}

export function getSubmission(id: string): SubmissionDetail | null {
  const database = getDb();
  const row = database
    .prepare(
      `
      SELECT
        s.*,
        i.part_number,
        i.part_name,
        u.display_name AS submitted_by_name,
        COUNT(DISTINCT f.id) AS file_count,
        GROUP_CONCAT(DISTINCT f.file_role) AS file_roles,
        CASE WHEN rp.id IS NULL THEN 0 ELSE 1 END AS has_release_package
      FROM submissions s
      JOIN items i ON i.id = s.item_id
      JOIN users u ON u.id = s.submitted_by
      LEFT JOIN submission_files f ON f.submission_id = s.id
      LEFT JOIN release_packages rp ON rp.submission_id = s.id
      WHERE s.id = ?
      GROUP BY s.id
    `
    )
    .get(id) as SubmissionSummary | undefined;

  if (!row) return null;

  const files = database
    .prepare("SELECT * FROM submission_files WHERE submission_id = ? ORDER BY created_at ASC")
    .all(id) as SubmissionFile[];
  const references = database
    .prepare("SELECT * FROM file_references WHERE submission_id = ? ORDER BY source_filename, referenced_filename")
    .all(id) as FileReference[];
  const approvals = database
    .prepare(
      `
      SELECT a.*, u.display_name AS reviewer_name
      FROM approval_steps a
      JOIN users u ON u.id = a.reviewer_id
      WHERE a.submission_id = ?
      ORDER BY a.sequence_no, a.decided_at
    `
    )
    .all(id) as SubmissionDetail["approvals"];
  const auditLogs = database
    .prepare("SELECT id, actor_id, action, detail_json, created_at FROM audit_logs WHERE submission_id = ? ORDER BY created_at DESC")
    .all(id) as SubmissionDetail["audit_logs"];
  const bom = getBomBySubmissionId(id);
  const activeLock = getActiveItemLock(row.item_id);
  const releasePackage = getReleasePackageBySubmissionId(id) ?? null;

  return {
    ...row,
    files,
    references,
    bom,
    active_lock: activeLock,
    release_package: releasePackage,
    approvals,
    audit_logs: auditLogs
  };
}

export type SubmissionSearchFilters = {
  productLine?: string;
  customer?: string;
  projectCode?: string;
  processName?: string;
  machine?: string;
  material?: string;
  surfaceFinish?: string;
  status?: string;
  parentDrawing?: string;
  childDrawingNumber?: string;
  childPartNumber?: string;
  bomIssue?: string;
};

export function searchSubmissions(input: {
  query?: string;
  status?: string;
  submittedBy?: string;
  filters?: SubmissionSearchFilters;
  limit?: number;
}) {
  const query = (input.query ?? "").trim();
  const normalizedFilters = normalizeSearchFilters({ ...(input.filters ?? {}), status: input.filters?.status ?? input.status });
  if (!query && Object.keys(normalizedFilters).length === 0) return [];

  const database = getDb();
  const filters = [];
  const values: unknown[] = [new Date().toISOString()];

  if (query) {
    const like = toLike(query);
    filters.push(`(
        lower(s.id) LIKE ?
        OR lower(s.drawing_number) LIKE ?
        OR lower(s.revision) LIKE ?
        OR lower(s.product_line) LIKE ?
        OR lower(s.customer) LIKE ?
        OR lower(s.project_code) LIKE ?
        OR lower(s.process_name) LIKE ?
        OR lower(s.machine) LIKE ?
        OR lower(s.material) LIKE ?
        OR lower(s.surface_finish) LIKE ?
        OR lower(s.document_type) LIKE ?
        OR lower(s.change_description) LIKE ?
        OR lower(s.status) LIKE ?
        OR lower(i.part_number) LIKE ?
        OR lower(i.part_name) LIKE ?
        OR lower(u.display_name) LIKE ?
        OR lower(f.original_filename) LIKE ?
        OR lower(r.referenced_filename) LIKE ?
      )`);
    values.push(like, like, like, like, like, like, like, like, like, like, like, like, like, like, like, like, like, like);
  }

  if (normalizedFilters.status && normalizedFilters.status !== "All") {
    filters.push("s.status = ?");
    values.push(normalizedFilters.status);
  }
  if (input.submittedBy) {
    filters.push("s.submitted_by = ?");
    values.push(input.submittedBy);
  }
  addLikeFilter(filters, values, "s.product_line", normalizedFilters.productLine);
  addLikeFilter(filters, values, "s.customer", normalizedFilters.customer);
  addLikeFilter(filters, values, "s.project_code", normalizedFilters.projectCode);
  addLikeFilter(filters, values, "s.process_name", normalizedFilters.processName);
  addLikeFilter(filters, values, "s.machine", normalizedFilters.machine);
  addLikeFilter(filters, values, "s.material", normalizedFilters.material);
  addLikeFilter(filters, values, "s.surface_finish", normalizedFilters.surfaceFinish);
  addLikeFilter(filters, values, "s.drawing_number", normalizedFilters.parentDrawing);
  if (normalizedFilters.childDrawingNumber) {
    const childDrawingLike = toLike(normalizedFilters.childDrawingNumber);
    filters.push(`(
      lower(r.referenced_drawing_number) LIKE ?
      OR EXISTS (
        SELECT 1
        FROM bom_headers child_drawing_bh
        JOIN bom_lines child_drawing_bl ON child_drawing_bl.bom_header_id = child_drawing_bh.id
        JOIN items child_drawing_i ON upper(child_drawing_i.part_number) = upper(child_drawing_bl.child_part_number)
        JOIN submissions child_drawing_s ON child_drawing_s.item_id = child_drawing_i.id
        WHERE child_drawing_bh.parent_submission_id = s.id
          AND (child_drawing_bl.child_revision IS NULL OR upper(child_drawing_s.revision) = upper(child_drawing_bl.child_revision))
          AND lower(child_drawing_s.drawing_number) LIKE ?
      )
    )`);
    values.push(childDrawingLike, childDrawingLike);
  }
  if (normalizedFilters.childPartNumber) {
    const childLike = toLike(normalizedFilters.childPartNumber);
    filters.push(`(
      lower(r.referenced_part_number) LIKE ?
      OR EXISTS (
        SELECT 1
        FROM bom_headers child_bh
        JOIN bom_lines child_bl ON child_bl.bom_header_id = child_bh.id
        WHERE child_bh.parent_submission_id = s.id
          AND lower(child_bl.child_part_number) LIKE ?
      )
    )`);
    values.push(childLike, childLike);
  }
  if (normalizedFilters.bomIssue === "unreleased") {
    filters.push(`EXISTS (
      SELECT 1
      FROM bom_headers issue_bh
      JOIN bom_lines issue_bl ON issue_bl.bom_header_id = issue_bh.id
      LEFT JOIN items issue_i ON upper(issue_i.part_number) = upper(issue_bl.child_part_number)
      LEFT JOIN submissions issue_s ON issue_s.id = (
        SELECT cs.id
        FROM submissions cs
        WHERE cs.item_id = issue_i.id
          AND (issue_bl.child_revision IS NULL OR upper(cs.revision) = upper(issue_bl.child_revision))
        ORDER BY
          CASE WHEN cs.status = 'Released' THEN 0 ELSE 1 END,
          datetime(COALESCE(cs.released_at, cs.updated_at, cs.created_at)) DESC,
          cs.rowid DESC
        LIMIT 1
      )
      WHERE issue_bh.parent_submission_id = s.id
        AND (issue_s.id IS NULL OR issue_s.status <> 'Released')
    )`);
  } else if (normalizedFilters.bomIssue === "outdated") {
    filters.push(`EXISTS (
      SELECT 1
      FROM bom_headers issue_bh
      JOIN bom_lines issue_bl ON issue_bl.bom_header_id = issue_bh.id
      JOIN items issue_i ON upper(issue_i.part_number) = upper(issue_bl.child_part_number)
      JOIN submissions latest_released ON latest_released.id = (
        SELECT lr.id
        FROM submissions lr
        WHERE lr.item_id = issue_i.id
          AND lr.status = 'Released'
        ORDER BY datetime(COALESCE(lr.released_at, lr.updated_at, lr.created_at)) DESC, lr.rowid DESC
        LIMIT 1
      )
      WHERE issue_bh.parent_submission_id = s.id
        AND issue_bl.child_revision IS NOT NULL
        AND upper(issue_bl.child_revision) <> upper(latest_released.revision)
    )`);
  }

  const whereSql = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);

  return database
    .prepare(
      `
      SELECT
        s.id,
        s.drawing_number,
        s.revision,
        s.material,
        s.surface_finish,
        s.document_type,
        s.status,
        s.submitted_by,
        s.created_at,
        s.updated_at,
        s.released_at,
        i.part_number,
        i.part_name,
        u.display_name AS submitted_by_name,
        COUNT(DISTINCT f.id) AS file_count,
        GROUP_CONCAT(DISTINCT f.file_role) AS file_roles,
        CASE WHEN rp.id IS NULL THEN 0 ELSE 1 END AS has_release_package,
        MAX(CASE WHEN il.id IS NULL THEN 0 ELSE 1 END) AS has_active_lock
      FROM submissions s
      JOIN items i ON i.id = s.item_id
      JOIN users u ON u.id = s.submitted_by
      LEFT JOIN submission_files f ON f.submission_id = s.id
      LEFT JOIN release_packages rp ON rp.submission_id = s.id
      LEFT JOIN item_locks il ON il.item_id = s.item_id AND il.expires_at > ?
      LEFT JOIN file_references r ON r.submission_id = s.id
      ${whereSql}
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT ${limit}
    `
    )
    .all(...values) as SubmissionSummary[];
}

function normalizeSearchFilters(filters: SubmissionSearchFilters) {
  const normalized: SubmissionSearchFilters = {};
  for (const [key, value] of Object.entries(filters) as Array<[keyof SubmissionSearchFilters, string | undefined]>) {
    const trimmed = value?.trim();
    if (trimmed) normalized[key] = trimmed;
  }
  return normalized;
}

function toLike(value: string) {
  return `%${value.toLowerCase()}%`;
}

function addLikeFilter(filters: string[], values: unknown[], column: string, value?: string) {
  if (!value) return;
  filters.push(`lower(${column}) LIKE ?`);
  values.push(toLike(value));
}

type ReuseCandidateRow = SubmissionSummary & {
  file_names: string | null;
};

type DuplicateGeometryRow = SubmissionSummary & {
  file_fingerprints: string | null;
};

export function listDesignReuseCandidates(input: { submissionId: string; submittedBy?: string; limit?: number }) {
  const source = getSubmission(input.submissionId);
  if (!source) return [];

  const database = getDb();
  const filters = ["s.id <> ?"];
  const values: unknown[] = [source.id];
  if (input.submittedBy) {
    filters.push("s.submitted_by = ?");
    values.push(input.submittedBy);
  }

  const rows = database
    .prepare(
      `
      SELECT
        s.*,
        i.part_number,
        i.part_name,
        u.display_name AS submitted_by_name,
        COUNT(DISTINCT f.id) AS file_count,
        GROUP_CONCAT(DISTINCT f.original_filename) AS file_names
      FROM submissions s
      JOIN items i ON i.id = s.item_id
      JOIN users u ON u.id = s.submitted_by
      LEFT JOIN submission_files f ON f.submission_id = s.id
      WHERE ${filters.join(" AND ")}
      GROUP BY s.id
      ORDER BY datetime(s.created_at) DESC
      LIMIT 300
    `
    )
    .all(...values) as ReuseCandidateRow[];

  const sourceFiles = source.files.map((file) => file.original_filename);
  const candidates = rows
    .map((row) => scoreDesignReuseCandidate(source, sourceFiles, row))
    .filter((candidate): candidate is DesignReuseCandidate => Boolean(candidate))
    .sort((a, b) => b.score - a.score || Date.parse(b.created_at) - Date.parse(a.created_at));

  return candidates.slice(0, Math.min(Math.max(input.limit ?? 6, 1), 20));
}

export function listDuplicateGeometryCandidates(input: { submissionId: string; submittedBy?: string; limit?: number }) {
  const source = getSubmission(input.submissionId);
  if (!source) return [];

  const database = getDb();
  const filters = ["s.id <> ?"];
  const values: unknown[] = [source.id];
  if (input.submittedBy) {
    filters.push("s.submitted_by = ?");
    values.push(input.submittedBy);
  }

  const rows = database
    .prepare(
      `
      SELECT
        s.*,
        i.part_number,
        i.part_name,
        u.display_name AS submitted_by_name,
        COUNT(DISTINCT f.id) AS file_count,
        GROUP_CONCAT(DISTINCT f.file_role || ':' || f.original_filename || ':' || f.sha256 || ':' || f.file_size) AS file_fingerprints
      FROM submissions s
      JOIN items i ON i.id = s.item_id
      JOIN users u ON u.id = s.submitted_by
      LEFT JOIN submission_files f ON f.submission_id = s.id
      WHERE ${filters.join(" AND ")}
      GROUP BY s.id
      ORDER BY datetime(s.created_at) DESC
      LIMIT 400
    `
    )
    .all(...values) as DuplicateGeometryRow[];

  const sourceFiles = source.files.map((file) => ({
    role: file.file_role,
    filename: file.original_filename,
    sha256: file.sha256,
    size: file.file_size
  }));
  const candidates = rows
    .map((row) => scoreDuplicateGeometryCandidate(source, sourceFiles, row))
    .filter((candidate): candidate is DuplicateGeometryCandidate => Boolean(candidate))
    .sort((a, b) => b.fingerprint_score - a.fingerprint_score || Date.parse(b.created_at) - Date.parse(a.created_at));

  return candidates.slice(0, Math.min(Math.max(input.limit ?? 6, 1), 20));
}

function scoreDesignReuseCandidate(source: SubmissionDetail, sourceFiles: string[], row: ReuseCandidateRow): DesignReuseCandidate | null {
  let score = 0;
  const reasons: string[] = [];
  const candidateFiles = splitGroupConcat(row.file_names);
  const matchedFiles: string[] = [];

  if (partFamily(source.part_number) && partFamily(source.part_number) === partFamily(row.part_number)) {
    score += 28;
    reasons.push(`Same part family ${partFamily(row.part_number)}`);
  } else {
    const partOverlap = tokenOverlap(tokens(source.part_number), tokens(row.part_number));
    if (partOverlap > 0) {
      score += Math.min(18, partOverlap * 9);
      reasons.push("Part number token match");
    }
  }

  const nameOverlap = tokenOverlap(tokens(source.part_name), tokens(row.part_name));
  if (nameOverlap > 0) {
    score += Math.min(24, nameOverlap * 8);
    reasons.push("Part name keyword match");
  }

  if (sameText(source.material, row.material)) {
    score += 18;
    reasons.push(`Same material ${row.material}`);
  }

  if (sameText(source.surface_finish, row.surface_finish)) {
    score += 14;
    reasons.push(`Same surface finish ${row.surface_finish}`);
  }

  if (sameText(source.document_type, row.document_type)) {
    score += 6;
    reasons.push(`Same document type ${row.document_type}`);
  }

  const fileOverlap = filenameOverlap(sourceFiles, candidateFiles);
  if (fileOverlap.score > 0) {
    score += fileOverlap.score;
    reasons.push("Filename similarity");
    matchedFiles.push(...fileOverlap.matchedFiles);
  }

  if (row.status === "Released") {
    score += 4;
    reasons.push("Released design");
  }

  if (score < 24 || reasons.length === 0) return null;
  const { file_names: _fileNames, ...summary } = row;
  void _fileNames;
  return {
    ...summary,
    score,
    match_reasons: reasons,
    matched_files: matchedFiles
  };
}

function scoreDuplicateGeometryCandidate(
  source: SubmissionDetail,
  sourceFiles: Array<{ role: string; filename: string; sha256: string; size: number }>,
  row: DuplicateGeometryRow
): DuplicateGeometryCandidate | null {
  let score = 0;
  const signals: string[] = [];
  const matchedFiles = new Set<string>();
  const candidateFiles = parseFileFingerprints(row.file_fingerprints);

  for (const sourceFile of sourceFiles) {
    const sourceStem = fileStem(sourceFile.filename);
    for (const candidateFile of candidateFiles) {
      if (sourceFile.sha256 && sourceFile.sha256 === candidateFile.sha256) {
        score += isNativeCadRole(sourceFile.role) || isNativeCadRole(candidateFile.role) ? 75 : 58;
        signals.push(`Exact ${candidateFile.role.toUpperCase()} file hash match`);
        matchedFiles.add(candidateFile.filename);
      }

      if (isNativeCadRole(sourceFile.role) && isNativeCadRole(candidateFile.role)) {
        const candidateStem = fileStem(candidateFile.filename);
        if (sourceStem && sourceStem === candidateStem) {
          score += 24;
          signals.push(`Same native CAD filename stem ${candidateStem}`);
          matchedFiles.add(candidateFile.filename);
        } else {
          const overlap = tokenOverlap(tokens(sourceStem), tokens(candidateStem));
          if (overlap > 0) {
            score += Math.min(16, overlap * 8);
            signals.push("Native CAD filename token overlap");
            matchedFiles.add(candidateFile.filename);
          }
        }
      }

      if (sourceFile.role === candidateFile.role && sourceFile.size > 0 && candidateFile.size > 0) {
        const ratio = Math.abs(sourceFile.size - candidateFile.size) / Math.max(sourceFile.size, candidateFile.size);
        if (ratio <= 0.03) {
          score += 10;
          signals.push(`${candidateFile.role.toUpperCase()} file size within 3%`);
        }
      }
    }
  }

  if (sameText(source.material, row.material)) {
    score += 12;
    signals.push(`Same material ${row.material}`);
  }
  if (sameText(source.surface_finish, row.surface_finish)) {
    score += 8;
    signals.push(`Same surface finish ${row.surface_finish}`);
  }
  if (sameText(source.document_type, row.document_type)) {
    score += 5;
    signals.push(`Same document type ${row.document_type}`);
  }

  const partOverlap = tokenOverlap(tokens(source.part_number), tokens(row.part_number));
  if (partOverlap > 0) {
    score += Math.min(10, partOverlap * 5);
    signals.push("Part number token overlap");
  }

  const uniqueSignals = Array.from(new Set(signals));
  if (score < 35 || uniqueSignals.length === 0) return null;

  const { file_fingerprints: _fileFingerprints, ...summary } = row;
  void _fileFingerprints;
  const fingerprintScore = Math.min(100, score);
  return {
    ...summary,
    fingerprint_score: fingerprintScore,
    duplicate_level: fingerprintScore >= 80 ? "exact" : fingerprintScore >= 55 ? "strong" : "possible",
    fingerprint_signals: uniqueSignals,
    matched_files: Array.from(matchedFiles).slice(0, 6)
  };
}

function parseFileFingerprints(value: string | null) {
  return splitGroupConcat(value).map((item) => {
    const [role = "other", filename = "", sha256 = "", size = "0"] = item.split(":");
    return { role, filename, sha256, size: Number(size) || 0 };
  });
}

function fileStem(filename: string) {
  const normalized = normalize(filename);
  const basename = normalized.split(/[\\/]/u).pop() ?? normalized;
  return basename.replace(/\.[^.]+$/u, "");
}

function isNativeCadRole(role: string) {
  return role === "sldprt" || role === "sldasm" || role === "slddrw";
}

function splitGroupConcat(value: string | null) {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function sameText(left: string | null | undefined, right: string | null | undefined) {
  return normalize(left) !== "" && normalize(left) === normalize(right);
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function partFamily(partNumber: string) {
  const parts = normalize(partNumber).split(/[-_\s]+/u).filter(Boolean);
  return parts.length >= 3 ? parts.slice(0, 3).join("-") : parts.slice(0, 2).join("-");
}

function tokens(value: string) {
  return new Set(
    normalize(value)
      .replace(/\.[^.]+$/u, "")
      .split(/[^a-z0-9\u4e00-\u9fff]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  );
}

function tokenOverlap(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) count += 1;
  }
  return count;
}

function filenameOverlap(sourceFiles: string[], candidateFiles: string[]) {
  let score = 0;
  const matchedFiles: string[] = [];
  for (const sourceFile of sourceFiles) {
    const sourceTokens = tokens(sourceFile);
    for (const candidateFile of candidateFiles) {
      const overlap = tokenOverlap(sourceTokens, tokens(candidateFile));
      if (overlap > 0) {
        score += Math.min(12, overlap * 6);
        matchedFiles.push(candidateFile);
      }
    }
  }
  return { score: Math.min(score, 18), matchedFiles: Array.from(new Set(matchedFiles)).slice(0, 4) };
}

export function listManufacturingHandoffEntries(input: { submittedBy?: string; limit?: number } = {}) {
  const filters = ["s.status = 'Released'"];
  const values: unknown[] = [];
  if (input.submittedBy) {
    filters.push("s.submitted_by = ?");
    values.push(input.submittedBy);
  }
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);

  const rows = getDb()
    .prepare(
      `
      SELECT s.id
      FROM submissions s
      WHERE ${filters.join(" AND ")}
        AND NOT EXISTS (
          SELECT 1
          FROM submissions newer
          WHERE newer.item_id = s.item_id
            AND newer.status = 'Released'
            AND datetime(COALESCE(newer.released_at, newer.updated_at, newer.created_at)) >
                datetime(COALESCE(s.released_at, s.updated_at, s.created_at))
        )
      ORDER BY datetime(COALESCE(s.released_at, s.updated_at, s.created_at)) DESC
      LIMIT ${limit}
    `
    )
    .all(...values) as Array<{ id: string }>;

  return rows.map((row) => getSubmission(row.id)).filter((submission): submission is SubmissionDetail => Boolean(submission));
}

export function getBomBySubmissionId(submissionId: string): BomDetail | null {
  const database = getDb();
  const header = database
    .prepare(
      `
      SELECT
        h.*,
        i.part_number AS parent_part_number,
        i.part_name AS parent_part_name,
        s.drawing_number AS parent_drawing_number,
        s.material AS parent_material,
        s.surface_finish AS parent_surface_finish,
        s.status AS parent_status
      FROM bom_headers h
      JOIN items i ON i.id = h.parent_item_id
      JOIN submissions s ON s.id = h.parent_submission_id
      WHERE h.parent_submission_id = ?
    `
    )
    .get(submissionId) as Omit<BomDetail, "lines"> | undefined;

  if (!header) return null;

  const lines = database
    .prepare(
      `
      SELECT
        l.*,
        child_i.part_name AS child_part_name,
        child_s.id AS child_submission_id,
        child_s.drawing_number AS child_drawing_number,
        child_s.material AS child_material,
        child_s.surface_finish AS child_surface_finish,
        child_s.revision AS child_submission_revision,
        child_s.status AS child_status,
        latest_any.revision AS child_latest_revision,
        latest_released.revision AS child_latest_released_revision
      FROM bom_lines l
      LEFT JOIN items child_i ON upper(child_i.part_number) = upper(l.child_part_number)
      LEFT JOIN submissions child_s ON child_s.id = (
        SELECT cs.id
        FROM submissions cs
        WHERE cs.item_id = child_i.id
          AND (l.child_revision IS NULL OR upper(cs.revision) = upper(l.child_revision))
        ORDER BY
          CASE WHEN cs.status = 'Released' THEN 0 ELSE 1 END,
          datetime(COALESCE(cs.released_at, cs.updated_at, cs.created_at)) DESC,
          cs.rowid DESC
        LIMIT 1
      )
      LEFT JOIN submissions latest_any ON latest_any.id = (
        SELECT la.id
        FROM submissions la
        WHERE la.item_id = child_i.id
        ORDER BY datetime(COALESCE(la.released_at, la.updated_at, la.created_at)) DESC, la.rowid DESC
        LIMIT 1
      )
      LEFT JOIN submissions latest_released ON latest_released.id = (
        SELECT lr.id
        FROM submissions lr
        WHERE lr.item_id = child_i.id
          AND lr.status = 'Released'
        ORDER BY datetime(COALESCE(lr.released_at, lr.updated_at, lr.created_at)) DESC, lr.rowid DESC
        LIMIT 1
      )
      WHERE l.bom_header_id = ?
      ORDER BY l.line_no ASC
    `
    )
    .all(header.id) as BomDetail["lines"];

  return { ...header, lines };
}

export function materializeBomDraftFromReferences(submissionId: string) {
  const submission = getSubmission(submissionId);
  if (!submission) return null;

  const database = getDb();
  const now = new Date().toISOString();
  const headerId = crypto.randomUUID();
  const references = database
    .prepare(
      `
      SELECT *
      FROM file_references
      WHERE submission_id = ?
        AND reference_type = 'assembly_component'
        AND referenced_part_number IS NOT NULL
        AND trim(referenced_part_number) <> ''
      ORDER BY source_filename, referenced_part_number, referenced_filename
    `
    )
    .all(submissionId) as FileReference[];

  const existing = getBomBySubmissionId(submissionId);
  const targetHeaderId = existing?.id ?? headerId;

  const tx = database.transaction(() => {
    database
      .prepare(
        `
        INSERT INTO bom_headers (
          id, parent_item_id, parent_submission_id, parent_revision, status, source, line_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(parent_submission_id) DO UPDATE SET
          parent_revision = excluded.parent_revision,
          source = excluded.source,
          line_count = excluded.line_count,
          updated_at = excluded.updated_at
      `
      )
      .run(
        targetHeaderId,
        submission.item_id,
        submission.id,
        submission.revision,
        submission.status === "Released" ? "ReleasedSnapshot" : "Draft",
        "cad_references",
        references.length,
        now,
        now
      );

    database.prepare("DELETE FROM bom_lines WHERE bom_header_id = ?").run(targetHeaderId);

    const insertLine = database.prepare(
      `
      INSERT INTO bom_lines (
        id, bom_header_id, line_no, child_part_number, child_revision, quantity,
        source_file_id, source_reference_id, source_filename, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );

    references.forEach((reference, index) => {
      insertLine.run(
        crypto.randomUUID(),
        targetHeaderId,
        index + 1,
        reference.referenced_part_number,
        reference.referenced_revision,
        reference.quantity,
        reference.source_file_id,
        reference.id,
        reference.source_filename,
        now
      );
    });
  });

  tx();

  createAuditLog({
    submissionId,
    actorId: null,
    action: "BomDraftMaterialized",
    detail: { source: "file_references", lineCount: references.length }
  });

  return getBomBySubmissionId(submissionId);
}

function bomDiffKey(line: BomDetail["lines"][number]) {
  return line.child_part_number.trim().toUpperCase();
}

export function findPreviousBomSubmissionId(targetSubmissionId: string) {
  const target = getSubmission(targetSubmissionId);
  if (!target) return null;

  const rows = getDb()
    .prepare(
      `
      SELECT s.id
      FROM submissions s
      JOIN bom_headers h ON h.parent_submission_id = s.id
      WHERE s.item_id = ?
      ORDER BY datetime(s.created_at) ASC, s.rowid ASC
    `
    )
    .all(target.item_id) as Array<{ id: string }>;

  const targetIndex = rows.findIndex((row) => row.id === targetSubmissionId);
  if (targetIndex <= 0) return null;
  return rows[targetIndex - 1]?.id ?? null;
}

export function getBomDiffBetweenSubmissions(input: { baseSubmissionId: string; targetSubmissionId: string }): BomDiffResult | null {
  const baseSubmission = getSubmission(input.baseSubmissionId);
  const targetSubmission = getSubmission(input.targetSubmissionId);
  const baseBom = getBomBySubmissionId(input.baseSubmissionId);
  const targetBom = getBomBySubmissionId(input.targetSubmissionId);
  if (!baseSubmission || !targetSubmission || !baseBom || !targetBom) return null;

  const baseByKey = new Map(baseBom.lines.map((line) => [bomDiffKey(line), line]));
  const targetByKey = new Map(targetBom.lines.map((line) => [bomDiffKey(line), line]));
  const keys = Array.from(new Set([...baseByKey.keys(), ...targetByKey.keys()])).sort();
  const lines: BomDiffResult["lines"] = keys.map((key) => {
    const baseLine = baseByKey.get(key) ?? null;
    const targetLine = targetByKey.get(key) ?? null;
    const changeType = !baseLine
      ? "added"
      : !targetLine
        ? "removed"
        : baseLine.child_revision !== targetLine.child_revision || Number(baseLine.quantity) !== Number(targetLine.quantity)
          ? "changed"
          : "unchanged";

    return {
      key,
      change_type: changeType,
      child_part_number: targetLine?.child_part_number ?? baseLine?.child_part_number ?? key,
      from_revision: baseLine?.child_revision ?? null,
      to_revision: targetLine?.child_revision ?? null,
      from_quantity: baseLine ? Number(baseLine.quantity) : null,
      to_quantity: targetLine ? Number(targetLine.quantity) : null,
      from_source_filename: baseLine?.source_filename ?? null,
      to_source_filename: targetLine?.source_filename ?? null
    };
  });

  return {
    base_submission_id: baseSubmission.id,
    target_submission_id: targetSubmission.id,
    base_revision: baseSubmission.revision,
    target_revision: targetSubmission.revision,
    base_created_at: baseSubmission.created_at,
    target_created_at: targetSubmission.created_at,
    added_count: lines.filter((line) => line.change_type === "added").length,
    removed_count: lines.filter((line) => line.change_type === "removed").length,
    changed_count: lines.filter((line) => line.change_type === "changed").length,
    unchanged_count: lines.filter((line) => line.change_type === "unchanged").length,
    lines
  };
}

export function listWhereUsed(input: { partNumber: string; submittedBy?: string }) {
  const filters = ["upper(l.child_part_number) = upper(?)"];
  const values: unknown[] = [input.partNumber.trim()];
  if (input.submittedBy) {
    filters.push("s.submitted_by = ?");
    values.push(input.submittedBy);
  }

  return getDb()
    .prepare(
      `
      SELECT
        h.parent_submission_id,
        h.parent_item_id,
        i.part_number AS parent_part_number,
        i.part_name AS parent_part_name,
        s.drawing_number AS parent_drawing_number,
        s.revision AS parent_revision,
        s.status AS parent_status,
        s.submitted_by AS parent_submitted_by,
        u.display_name AS parent_submitted_by_name,
        h.id AS bom_header_id,
        h.status AS bom_status,
        l.child_part_number,
        l.child_revision,
        child_s.id AS child_submission_id,
        child_s.drawing_number AS child_drawing_number,
        child_s.status AS child_status,
        latest_released.revision AS child_latest_released_revision,
        CASE
          WHEN l.child_revision IS NOT NULL
            AND latest_released.revision IS NOT NULL
            AND upper(l.child_revision) <> upper(latest_released.revision)
          THEN 1
          ELSE 0
        END AS child_is_outdated,
        l.quantity,
        l.source_filename,
        s.created_at AS parent_created_at,
        s.released_at AS parent_released_at
      FROM bom_lines l
      JOIN bom_headers h ON h.id = l.bom_header_id
      JOIN submissions s ON s.id = h.parent_submission_id
      JOIN items i ON i.id = h.parent_item_id
      JOIN users u ON u.id = s.submitted_by
      LEFT JOIN items child_i ON upper(child_i.part_number) = upper(l.child_part_number)
      LEFT JOIN submissions child_s ON child_s.id = (
        SELECT cs.id
        FROM submissions cs
        WHERE cs.item_id = child_i.id
          AND (l.child_revision IS NULL OR upper(cs.revision) = upper(l.child_revision))
        ORDER BY
          CASE WHEN cs.status = 'Released' THEN 0 ELSE 1 END,
          datetime(COALESCE(cs.released_at, cs.updated_at, cs.created_at)) DESC,
          cs.rowid DESC
        LIMIT 1
      )
      LEFT JOIN submissions latest_released ON latest_released.id = (
        SELECT lr.id
        FROM submissions lr
        WHERE lr.item_id = child_i.id
          AND lr.status = 'Released'
        ORDER BY datetime(COALESCE(lr.released_at, lr.updated_at, lr.created_at)) DESC, lr.rowid DESC
        LIMIT 1
      )
      WHERE ${filters.join(" AND ")}
      ORDER BY child_is_outdated DESC, datetime(COALESCE(s.released_at, s.updated_at, s.created_at)) DESC, s.id DESC
    `
    )
    .all(...values) as WhereUsedEntry[];
}

export function listItemRevisionHistory(input: { partNumber: string; submittedBy?: string }) {
  const filters = ["i.part_number = ?"];
  const values = [input.partNumber];
  if (input.submittedBy) {
    filters.push("s.submitted_by = ?");
    values.push(input.submittedBy);
  }

  return getDb()
    .prepare(
      `
      SELECT
        s.id AS submission_id,
        s.item_id,
        i.part_number,
        i.part_name,
        s.drawing_number,
        s.revision,
        s.status,
        s.submitted_by,
        u.display_name AS submitted_by_name,
        s.approval_required,
        s.created_at,
        s.released_at,
        s.rejected_at,
        s.superseded_by_submission_id,
        s.obsolete_at,
        s.obsolete_by
      FROM submissions s
      JOIN items i ON i.id = s.item_id
      JOIN users u ON u.id = s.submitted_by
      WHERE ${filters.join(" AND ")}
      ORDER BY s.created_at DESC, s.revision DESC
    `
    )
    .all(...values) as ItemRevisionHistoryEntry[];
}

export function submissionRevisionExists(input: { drawingNumber: string; revision: string }) {
  const existing = getDb()
    .prepare("SELECT id FROM submissions WHERE drawing_number = ? AND revision = ?")
    .get(input.drawingNumber, input.revision) as { id: string } | undefined;
  return Boolean(existing);
}

export function findOrCreateItem(input: { partNumber: string; partName: string; revision: string }) {
  const database = getDb();
  const existing = database.prepare("SELECT id FROM items WHERE part_number = ?").get(input.partNumber) as
    | { id: string }
    | undefined;

  const now = new Date().toISOString();
  if (existing) {
    database
      .prepare("UPDATE items SET part_name = ?, updated_at = ? WHERE id = ?")
      .run(input.partName, now, existing.id);
    return existing.id;
  }

  const id = crypto.randomUUID();
  database
    .prepare("INSERT INTO items (id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, input.partNumber, input.partName, null, now, now);
  return id;
}

export function createSubmissionRecord(input: {
  drawingNumber: string;
  partNumber: string;
  partName: string;
  revision: string;
  productLine?: string;
  customer?: string;
  projectCode?: string;
  processName?: string;
  machine?: string;
  material: string;
  surfaceFinish: string;
  documentType: string;
  changeDescription: string;
  submittedBy: string;
  approvalRequired?: 1 | 2;
  files: Array<{
    fileRole: string;
    originalFilename: string;
    localPath: string;
    gdriveFileId?: string | null;
    sha256: string;
    fileSize: number;
  }>;
  references?: Array<{
    sourceFilename: string;
    sourceFileRole: FileReference["source_file_role"];
    referencedFilename: string;
    referencedPartNumber?: string;
    referencedDrawingNumber?: string;
    referencedRevision?: string;
    referenceType: FileReference["reference_type"];
    quantity: number;
    extractionMethod: string;
    confidence: FileReference["confidence"];
  }>;
}) {
  const database = getDb();
  const now = new Date().toISOString();
  const submissionId = `SUB-${now.slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const itemId = findOrCreateItem({
    partNumber: input.partNumber,
    partName: input.partName,
    revision: input.revision
  });

  database
    .prepare(
      `
      INSERT INTO submissions (
        id, item_id, drawing_number, revision, product_line, customer, project_code, process_name,
        machine, material, surface_finish, document_type,
        change_description, status, submitted_by, approval_required, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      submissionId,
      itemId,
      input.drawingNumber,
      input.revision,
      input.productLine?.trim() ?? "",
      input.customer?.trim() ?? "",
      input.projectCode?.trim() ?? "",
      input.processName?.trim() ?? "",
      input.machine?.trim() ?? "",
      input.material,
      input.surfaceFinish,
      input.documentType,
      input.changeDescription,
      "Pending",
      input.submittedBy,
      input.approvalRequired ?? 1,
      now,
      now
    );

  const fileIdByName = new Map<string, { id: string; role: string }>();

  for (const file of input.files) {
    const fileId = crypto.randomUUID();
    database
      .prepare(
        `
        INSERT INTO submission_files (
          id, submission_id, file_role, original_filename, local_path, gdrive_file_id,
          sha256, file_size, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        fileId,
        submissionId,
        file.fileRole,
        file.originalFilename,
        file.localPath,
        file.gdriveFileId ?? null,
        file.sha256,
        file.fileSize,
        now
      );
    fileIdByName.set(file.originalFilename, { id: fileId, role: file.fileRole });
  }

  const references = input.references ?? [];
  if (references.length > 0) {
    const insertReference = database.prepare(
      `
      INSERT INTO file_references (
        id, submission_id, source_file_id, source_filename, source_file_role,
        referenced_filename, referenced_part_number, referenced_drawing_number,
        referenced_revision, reference_type, quantity, extraction_method, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );

    for (const reference of references) {
      const sourceFile = fileIdByName.get(reference.sourceFilename);
      insertReference.run(
        crypto.randomUUID(),
        submissionId,
        sourceFile?.id ?? null,
        reference.sourceFilename,
        sourceFile?.role ?? reference.sourceFileRole,
        reference.referencedFilename,
        reference.referencedPartNumber ?? null,
        reference.referencedDrawingNumber ?? null,
        reference.referencedRevision ?? null,
        reference.referenceType,
        reference.quantity,
        reference.extractionMethod,
        reference.confidence,
        now
      );
    }
  }

  createAuditLog({
    submissionId,
    actorId: input.submittedBy,
    action: "Submit",
    detail: { fileCount: input.files.length }
  });

  if (references.some((reference) => reference.referenceType === "assembly_component")) {
    materializeBomDraftFromReferences(submissionId);
  }

  return submissionId;
}

export function updateSubmissionStatus(input: {
  id: string;
  status: string;
  releaseError?: string | null;
  rejectReason?: string | null;
}) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE submissions
      SET status = ?,
          updated_at = ?,
          released_at = CASE WHEN ? = 'Released' THEN ? ELSE released_at END,
          rejected_at = CASE WHEN ? = 'Rejected' THEN ? ELSE rejected_at END,
          release_error = ?,
          reject_reason = ?
      WHERE id = ?
    `
    )
    .run(
      input.status,
      now,
      input.status,
      now,
      input.status,
      now,
      input.releaseError ?? null,
      input.rejectReason ?? null,
      input.id
    );
}

export function markSubmissionReleasedAndObsoletePrevious(input: { id: string; actorId: string }) {
  const database = getDb();
  const now = new Date().toISOString();
  const submission = database
    .prepare("SELECT id, item_id, revision FROM submissions WHERE id = ?")
    .get(input.id) as { id: string; item_id: string; revision: string } | undefined;
  if (!submission) throw new Error("找不到送審資料");

  const obsoleteRows = database
    .prepare("SELECT id FROM submissions WHERE item_id = ? AND id <> ? AND status = 'Released'")
    .all(submission.item_id, submission.id) as Array<{ id: string }>;

  const tx = database.transaction(() => {
    database
      .prepare(
        `
        UPDATE submissions
        SET status = 'Released',
            released_at = COALESCE(released_at, ?),
            updated_at = ?,
            release_error = NULL
        WHERE id = ?
      `
      )
      .run(now, now, submission.id);

    database
      .prepare("UPDATE items SET current_revision = ?, updated_at = ? WHERE id = ?")
      .run(submission.revision, now, submission.item_id);

    if (obsoleteRows.length > 0) {
      const obsoleteSubmission = database.prepare(
        `
        UPDATE submissions
        SET status = 'Obsolete',
            superseded_by_submission_id = ?,
            obsolete_at = ?,
            obsolete_by = ?,
            updated_at = ?
        WHERE id = ?
          AND status = 'Released'
      `
      );
      const insertAudit = database.prepare(
        "INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      );

      for (const row of obsoleteRows) {
        obsoleteSubmission.run(submission.id, now, input.actorId, now, row.id);
        insertAudit.run(
          crypto.randomUUID(),
          row.id,
          input.actorId,
          "ObsoleteByRevision",
          JSON.stringify({ supersededBySubmissionId: submission.id, supersededByRevision: submission.revision }),
          now
        );
      }
    }
  });

  tx();
  return { obsolete_count: obsoleteRows.length, obsolete_submission_ids: obsoleteRows.map((row) => row.id) };
}

export function ensureDemoUser(input: {
  id: string;
  displayName: string;
  email: string;
  role: DbUser["role"];
  password?: string;
}) {
  if (!shouldSeedDemoUsers()) return;

  const now = new Date().toISOString();
  const pwHash = hashPassword(input.password ?? DEMO_PASSWORD);
  upsertUser({
    id: input.id,
    displayName: input.displayName,
    email: input.email,
    passwordHash: pwHash,
    role: input.role,
    now,
    database: getDb()
  });
}
