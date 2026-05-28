import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { hashPassword } from "@/lib/password";
import type {
  BomDetail,
  BomDiffResult,
  ApprovalMatrixRequirement,
  ChangeRequest,
  DesignReuseCandidate,
  DiscussionComment,
  DuplicateGeometryCandidate,
  FileReference,
  ItemLock,
  ItemRevisionHistoryEntry,
  NotificationItem,
  NotificationSummary,
  PhaseGateCheck,
  PdfMarkup,
  ProcurementSyncRun,
  ReadonlyShare,
  ReleasePackage,
  ReviewIssue,
  SandboxBranch,
  SubmissionDetail,
  SubmissionFile,
  SubmissionSummary,
  SupplierPortalResponse,
  WhereUsedEntry
} from "@/lib/types";

type SqliteDatabase = import("better-sqlite3").Database;

type UserRole = "Engineer" | "R&D Manager" | "Admin";

let db: SqliteDatabase | null = null;

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
  if (!db) {
    const dataDir = getDataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(getRepositoryDir(), { recursive: true });
    db = new Database(path.join(dataDir, "ai-pdm.sqlite"));
    initDatabase(db);
  }
  return db;
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

function sandboxBranchSelectSql() {
  return `
    SELECT
      b.*,
      created_user.display_name AS created_by_name,
      promoted_user.display_name AS promoted_by_name,
      closed_user.display_name AS closed_by_name,
      merged_user.display_name AS merged_by_name,
      source.drawing_number AS source_drawing_number,
      source.revision AS source_revision,
      sandbox.drawing_number AS sandbox_drawing_number,
      sandbox.revision AS sandbox_revision,
      sandbox.status AS sandbox_status
    FROM sandbox_branches b
    JOIN users created_user ON created_user.id = b.created_by
    LEFT JOIN users promoted_user ON promoted_user.id = b.promoted_by
    LEFT JOIN users closed_user ON closed_user.id = b.closed_by
    LEFT JOIN users merged_user ON merged_user.id = b.merged_by
    JOIN submissions source ON source.id = b.source_submission_id
    JOIN submissions sandbox ON sandbox.id = b.sandbox_submission_id
  `;
}

function normalizeFileForMerge(file: SubmissionFile) {
  return {
    file_role: file.file_role,
    original_filename: file.original_filename,
    sha256: file.sha256,
    file_size: file.file_size
  };
}

function normalizeReferenceForMerge(reference: FileReference) {
  return {
    source_filename: reference.source_filename,
    referenced_filename: reference.referenced_filename,
    referenced_part_number: reference.referenced_part_number,
    referenced_drawing_number: reference.referenced_drawing_number,
    referenced_revision: reference.referenced_revision,
    reference_type: reference.reference_type,
    quantity: reference.quantity
  };
}

function keyedDiff<T>(sourceItems: T[], sandboxItems: T[], keyOf: (item: T) => string, normalize: (item: T) => unknown) {
  const sourceByKey = new Map(sourceItems.map((item) => [keyOf(item), item]));
  const sandboxByKey = new Map(sandboxItems.map((item) => [keyOf(item), item]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;

  for (const [key, sandboxItem] of sandboxByKey) {
    const sourceItem = sourceByKey.get(key);
    if (!sourceItem) {
      added.push(key);
      continue;
    }
    if (JSON.stringify(normalize(sourceItem)) === JSON.stringify(normalize(sandboxItem))) {
      unchanged += 1;
    } else {
      changed.push(key);
    }
  }

  for (const key of sourceByKey.keys()) {
    if (!sandboxByKey.has(key)) removed.push(key);
  }

  return { added, removed, changed, unchanged_count: unchanged };
}

export function getSandboxMergePreview(branchId: string) {
  const branch = getSandboxBranchById(branchId);
  if (!branch) return null;

  const source = getSubmission(branch.source_submission_id);
  const sandbox = getSubmission(branch.sandbox_submission_id);
  if (!source || !sandbox) return null;

  const fields = ["drawing_number", "revision", "material", "surface_finish", "document_type", "change_description", "approval_required"] as const;
  const field_changes = fields
    .map((field) => ({ field, source: String(source[field] ?? ""), sandbox: String(sandbox[field] ?? "") }))
    .filter((change) => change.source !== change.sandbox);

  const files = keyedDiff(
    source.files,
    sandbox.files,
    (file) => `${file.file_role}:${file.original_filename}`,
    normalizeFileForMerge
  );
  const references = keyedDiff(
    source.references,
    sandbox.references,
    (reference) =>
      [
        reference.source_filename,
        reference.referenced_filename,
        reference.referenced_part_number,
        reference.referenced_revision,
        reference.reference_type
      ].join("|"),
    normalizeReferenceForMerge
  );
  const change_count =
    field_changes.length +
    files.added.length +
    files.removed.length +
    files.changed.length +
    references.added.length +
    references.removed.length +
    references.changed.length;

  return {
    branch_id: branch.id,
    source_submission_id: branch.source_submission_id,
    sandbox_submission_id: branch.sandbox_submission_id,
    source_revision: source.revision,
    sandbox_revision: sandbox.revision,
    can_merge: branch.status === "active" && sandbox.status === "Pending",
    change_count,
    field_changes,
    files,
    references
  };
}

export function listSandboxBranchesForSubmission(submissionId: string): SandboxBranch[] {
  return getDb()
    .prepare(
      `
      ${sandboxBranchSelectSql()}
      WHERE b.source_submission_id = ? OR b.sandbox_submission_id = ?
      ORDER BY CASE b.status WHEN 'active' THEN 0 WHEN 'promoted' THEN 1 ELSE 2 END, b.created_at DESC
    `
    )
    .all(submissionId, submissionId) as SandboxBranch[];
}

export function getSandboxBranchById(branchId: string): SandboxBranch | null {
  const row = getDb()
    .prepare(`${sandboxBranchSelectSql()} WHERE b.id = ?`)
    .get(branchId) as SandboxBranch | undefined;
  return row ?? null;
}

export function getActiveSandboxBranchForSubmission(submissionId: string): SandboxBranch | null {
  const row = getDb()
    .prepare(`${sandboxBranchSelectSql()} WHERE b.sandbox_submission_id = ? AND b.status = 'active'`)
    .get(submissionId) as SandboxBranch | undefined;
  return row ?? null;
}

export function createSandboxBranch(input: {
  sourceSubmissionId: string;
  userId: string;
  branchName: string;
  reason: string;
}) {
  const database = getDb();
  const source = getSubmission(input.sourceSubmissionId);
  if (!source) return { ok: false as const, status: 404, error: "找不到送審資料" };
  if (source.status === "Releasing") return { ok: false as const, status: 409, error: "發布中的送審資料不可建立分支" };
  if (getActiveSandboxBranchForSubmission(source.id)) {
    return { ok: false as const, status: 409, error: "啟用中的試作送審不可再建立試作分支" };
  }

  const branchName = input.branchName.trim();
  const reason = input.reason.trim();
  if (branchName.length < 3 || branchName.length > 60) {
    return { ok: false as const, status: 400, error: "分支名稱需為 3 到 60 個字" };
  }
  if (reason.length < 3 || reason.length > 240) {
    return { ok: false as const, status: 400, error: "原因需為 3 到 240 個字" };
  }

  const duplicate = database
    .prepare("SELECT id FROM sandbox_branches WHERE source_submission_id = ? AND lower(branch_name) = lower(?)")
    .get(source.id, branchName) as { id: string } | undefined;
  if (duplicate) return { ok: false as const, status: 409, error: "此送審資料已有相同試作分支名稱" };

  const now = new Date().toISOString();
  const branchId = crypto.randomUUID();
  const sandboxSubmissionId = `SUB-${now.slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const sandboxRevision = `${source.revision}-SBX-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const fileIdBySourceId = new Map<string, string>();

  const createBranchTransaction = database.transaction(() => {
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
        sandboxSubmissionId,
        source.item_id,
        source.drawing_number,
        sandboxRevision,
        source.product_line,
        source.customer,
        source.project_code,
        source.process_name,
        source.machine,
        source.material,
        source.surface_finish,
        source.document_type,
        `[Sandbox: ${branchName}] ${reason}`,
        "Pending",
        input.userId,
        source.approval_required,
        now,
        now
      );

    const insertFile = database.prepare(
      `
      INSERT INTO submission_files (
        id, submission_id, file_role, original_filename, local_path, gdrive_file_id,
        sha256, file_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );
    for (const file of source.files) {
      const fileId = crypto.randomUUID();
      fileIdBySourceId.set(file.id, fileId);
      insertFile.run(
        fileId,
        sandboxSubmissionId,
        file.file_role,
        file.original_filename,
        file.local_path,
        null,
        file.sha256,
        file.file_size,
        now
      );
    }

    const insertReference = database.prepare(
      `
      INSERT INTO file_references (
        id, submission_id, source_file_id, source_filename, source_file_role,
        referenced_filename, referenced_part_number, referenced_drawing_number,
        referenced_revision, reference_type, quantity, extraction_method, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );
    for (const reference of source.references) {
      insertReference.run(
        crypto.randomUUID(),
        sandboxSubmissionId,
        reference.source_file_id ? fileIdBySourceId.get(reference.source_file_id) ?? null : null,
        reference.source_filename,
        reference.source_file_role,
        reference.referenced_filename,
        reference.referenced_part_number,
        reference.referenced_drawing_number,
        reference.referenced_revision,
        reference.reference_type,
        reference.quantity,
        reference.extraction_method,
        reference.confidence,
        now
      );
    }

    database
      .prepare(
        `
        INSERT INTO sandbox_branches (
          id, source_submission_id, sandbox_submission_id, branch_name, reason,
          status, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `
      )
      .run(branchId, source.id, sandboxSubmissionId, branchName, reason, input.userId, now, now);

    if (source.references.some((reference) => reference.reference_type === "assembly_component")) {
      materializeBomDraftFromReferences(sandboxSubmissionId);
    }
  });

  createBranchTransaction();

  createAuditLog({
    submissionId: source.id,
    actorId: input.userId,
    action: "SandboxBranchCreated",
    detail: { branchId, sandboxSubmissionId, branchName, reason }
  });
  createAuditLog({
    submissionId: sandboxSubmissionId,
    actorId: input.userId,
    action: "SandboxSubmissionCreated",
    detail: { branchId, sourceSubmissionId: source.id, branchName }
  });

  const branch = getSandboxBranchById(branchId);
  return { ok: true as const, branch, submissionId: sandboxSubmissionId };
}

export function updateSandboxBranchStatus(input: {
  branchId: string;
  userId: string;
  status: "promoted" | "closed";
}) {
  const branch = getSandboxBranchById(input.branchId);
  if (!branch) return { ok: false as const, status: 404, error: "找不到試作分支" };
  if (branch.status !== "active") {
    return { ok: false as const, status: 409, error: `Only active sandbox branches can be ${input.status}` };
  }

  const now = new Date().toISOString();
  if (input.status === "promoted") {
    getDb()
      .prepare("UPDATE sandbox_branches SET status = 'promoted', promoted_by = ?, promoted_at = ?, updated_at = ? WHERE id = ?")
      .run(input.userId, now, now, input.branchId);
  } else {
    getDb()
      .prepare("UPDATE sandbox_branches SET status = 'closed', closed_by = ?, closed_at = ?, updated_at = ? WHERE id = ?")
      .run(input.userId, now, now, input.branchId);
  }

  createAuditLog({
    submissionId: branch.sandbox_submission_id,
    actorId: input.userId,
    action: input.status === "promoted" ? "SandboxBranchPromoted" : "SandboxBranchClosed",
    detail: { branchId: input.branchId, sourceSubmissionId: branch.source_submission_id }
  });

  return { ok: true as const, branch: getSandboxBranchById(input.branchId) };
}

export function mergeSandboxBranch(input: { branchId: string; userId: string }) {
  const branch = getSandboxBranchById(input.branchId);
  if (!branch) return { ok: false as const, status: 404, error: "找不到試作分支" };
  if (branch.status !== "active") {
    return { ok: false as const, status: 409, error: "只有啟用中的試作分支可以合併" };
  }

  const sandbox = getSubmission(branch.sandbox_submission_id);
  if (!sandbox) return { ok: false as const, status: 404, error: "找不到試作送審資料" };
  if (sandbox.status !== "Pending") {
    return { ok: false as const, status: 409, error: `Only Pending sandbox submissions can be merged. Current status: ${sandbox.status}` };
  }

  const preview = getSandboxMergePreview(input.branchId);
  if (!preview) return { ok: false as const, status: 404, error: "找不到試作合併預覽" };

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE sandbox_branches
      SET status = 'promoted',
          promoted_by = ?,
          promoted_at = ?,
          merged_by = ?,
          merged_at = ?,
          merge_summary_json = ?,
          updated_at = ?
      WHERE id = ?
    `
    )
    .run(input.userId, now, input.userId, now, JSON.stringify(preview), now, input.branchId);

  createAuditLog({
    submissionId: branch.sandbox_submission_id,
    actorId: input.userId,
    action: "SandboxBranchMerged",
    detail: { branchId: input.branchId, sourceSubmissionId: branch.source_submission_id, changeCount: preview.change_count }
  });

  return { ok: true as const, branch: getSandboxBranchById(input.branchId), preview };
}

export function getActiveItemLock(itemId: string) {
  expireItemLocks();
  const row = getDb()
    .prepare(
      `
      SELECT
        l.*,
        i.part_number,
        i.part_name,
        u.display_name AS locked_by_name
      FROM item_locks l
      JOIN items i ON i.id = l.item_id
      JOIN users u ON u.id = l.locked_by
      WHERE l.item_id = ?
        AND l.released_at IS NULL
        AND datetime(l.expires_at) > datetime('now')
      ORDER BY l.created_at DESC
      LIMIT 1
    `
    )
    .get(itemId) as ItemLock | undefined;
  return row ?? null;
}

export function findActiveItemLockForSubmissionIdentifiers(input: { drawingNumber?: string; partNumber?: string }) {
  expireItemLocks();
  const drawingNumber = String(input.drawingNumber ?? "").trim();
  const partNumber = String(input.partNumber ?? "").trim();
  if (!drawingNumber && !partNumber) return null;

  const filters = [];
  const values: string[] = [];
  if (partNumber) {
    filters.push("upper(i.part_number) = upper(?)");
    values.push(partNumber);
  }
  if (drawingNumber) {
    filters.push(
      `EXISTS (
        SELECT 1
        FROM submissions s_match
        WHERE s_match.item_id = i.id
          AND upper(s_match.drawing_number) = upper(?)
      )`
    );
    values.push(drawingNumber);
  }

  const row = getDb()
    .prepare(
      `
      SELECT
        l.*,
        i.part_number,
        i.part_name,
        u.display_name AS locked_by_name,
        (
          SELECT s.drawing_number
          FROM submissions s
          WHERE s.item_id = i.id
          ORDER BY s.created_at DESC
          LIMIT 1
        ) AS drawing_number
      FROM item_locks l
      JOIN items i ON i.id = l.item_id
      JOIN users u ON u.id = l.locked_by
      WHERE l.released_at IS NULL
        AND datetime(l.expires_at) > datetime('now')
        AND (${filters.join(" OR ")})
      ORDER BY l.created_at DESC
      LIMIT 1
    `
    )
    .get(...values) as (ItemLock & { drawing_number: string | null }) | undefined;

  return row ?? null;
}

export function expireItemLocks() {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE item_locks
      SET released_at = ?, updated_at = ?
      WHERE released_at IS NULL
        AND datetime(expires_at) <= datetime('now')
    `
    )
    .run(now, now);
}

export function createItemLock(input: { submissionId: string; userId: string; reason: string; hours?: number }) {
  const submission = getSubmission(input.submissionId);
  if (!submission) return { ok: false as const, status: 404, error: "找不到送審資料" };

  expireItemLocks();
  const existing = getActiveItemLock(submission.item_id);
  if (existing) {
    if (existing.locked_by === input.userId) {
      return { ok: true as const, lock: existing, reused: true };
    }
    return { ok: false as const, status: 409, error: "ITEM_LOCKED", lock: existing };
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + (input.hours ?? 8) * 60 * 60 * 1000).toISOString();
  const lockId = crypto.randomUUID();
  getDb()
    .prepare(
      `
      INSERT INTO item_locks (id, item_id, locked_by, lock_reason, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(lockId, submission.item_id, input.userId, input.reason.trim() || "Edit reservation", expiresAt, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.userId,
    action: "CheckoutLockCreated",
    detail: { itemId: submission.item_id, reason: input.reason, expiresAt }
  });

  return { ok: true as const, lock: getActiveItemLock(submission.item_id), reused: false };
}

export function releaseItemLock(input: { submissionId: string; userId: string; force?: boolean }) {
  const submission = getSubmission(input.submissionId);
  if (!submission) return { ok: false as const, status: 404, error: "找不到送審資料" };

  const existing = getActiveItemLock(submission.item_id);
  if (!existing) return { ok: true as const, released: false };
  if (existing.locked_by !== input.userId && !input.force) {
    return { ok: false as const, status: 403, error: "只有預約者或系統管理員可以解除此預約", lock: existing };
  }

  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE item_locks SET released_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, existing.id);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.userId,
    action: "CheckoutLockReleased",
    detail: { itemId: submission.item_id, lockId: existing.id, forced: Boolean(input.force) }
  });

  return { ok: true as const, released: true };
}

export function getReleasePackageBySubmissionId(submissionId: string) {
  return getDb()
    .prepare("SELECT * FROM release_packages WHERE submission_id = ?")
    .get(submissionId) as ReleasePackage | undefined;
}

export function upsertReleasePackageRecord(input: {
  submissionId: string;
  packageFilename: string;
  localPath: string;
  sha256: string;
  fileSize: number;
  manifestJson: string;
  createdBy: string;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      INSERT INTO release_packages (
        id, submission_id, package_filename, local_path, sha256, file_size, manifest_json, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(submission_id) DO UPDATE SET
        package_filename = excluded.package_filename,
        local_path = excluded.local_path,
        sha256 = excluded.sha256,
        file_size = excluded.file_size,
        manifest_json = excluded.manifest_json,
        created_by = excluded.created_by,
        created_at = excluded.created_at
    `
    )
    .run(
      id,
      input.submissionId,
      input.packageFilename,
      input.localPath,
      input.sha256,
      input.fileSize,
      input.manifestJson,
      input.createdBy,
      now
    );

  return getReleasePackageBySubmissionId(input.submissionId);
}

type ReadonlyShareRow = Omit<ReadonlyShare, "created_by_name" | "revoked_by_name" | "status"> & {
  token_hash: string;
  created_by_name: string | null;
  revoked_by_name: string | null;
};

function normalizeReadonlyShare(row: ReadonlyShareRow): ReadonlyShare {
  const now = Date.now();
  const expired = Date.parse(row.expires_at) <= now;
  return {
    id: row.id,
    submission_id: row.submission_id,
    label: row.label,
    expires_at: row.expires_at,
    created_by: row.created_by,
    created_by_name: row.created_by_name ?? row.created_by,
    revoked_at: row.revoked_at,
    revoked_by: row.revoked_by,
    revoked_by_name: row.revoked_by_name,
    access_count: row.access_count,
    last_accessed_at: row.last_accessed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.revoked_at ? "revoked" : expired ? "expired" : "active",
    response_count: Number(row.response_count ?? 0),
    open_response_count: Number(row.open_response_count ?? 0),
    latest_response_at: row.latest_response_at
  };
}

const readonlyShareSelect = `
  SELECT
    rs.*,
    creator.display_name AS created_by_name,
    revoker.display_name AS revoked_by_name,
    COUNT(spr.id) AS response_count,
    SUM(CASE WHEN spr.status = 'open' THEN 1 ELSE 0 END) AS open_response_count,
    MAX(spr.created_at) AS latest_response_at
  FROM readonly_shares rs
  JOIN users creator ON creator.id = rs.created_by
  LEFT JOIN users revoker ON revoker.id = rs.revoked_by
  LEFT JOIN supplier_portal_responses spr ON spr.share_id = rs.id
`;

export function listReadonlyShares(submissionId: string): ReadonlyShare[] {
  const rows = getDb()
    .prepare(`${readonlyShareSelect} WHERE rs.submission_id = ? GROUP BY rs.id ORDER BY rs.created_at DESC`)
    .all(submissionId) as ReadonlyShareRow[];
  return rows.map(normalizeReadonlyShare);
}

export function createReadonlyShare(input: {
  submissionId: string;
  tokenHash: string;
  label: string;
  expiresAt: string;
  createdBy: string;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      INSERT INTO readonly_shares (
        id, submission_id, token_hash, label, expires_at, created_by, access_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `
    )
    .run(id, input.submissionId, input.tokenHash, input.label, input.expiresAt, input.createdBy, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.createdBy,
    action: "ReadonlyShareCreated",
    detail: { shareId: id, label: input.label, expiresAt: input.expiresAt }
  });

  return listReadonlyShares(input.submissionId).find((share) => share.id === id) ?? null;
}

export function revokeReadonlyShare(input: { submissionId: string; shareId: string; revokedBy: string }) {
  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      `
      UPDATE readonly_shares
      SET revoked_at = COALESCE(revoked_at, ?),
          revoked_by = COALESCE(revoked_by, ?),
          updated_at = ?
      WHERE id = ?
        AND submission_id = ?
    `
    )
    .run(now, input.revokedBy, now, input.shareId, input.submissionId);

  if (result.changes === 0) return null;

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.revokedBy,
    action: "ReadonlyShareRevoked",
    detail: { shareId: input.shareId }
  });

  return listReadonlyShares(input.submissionId).find((share) => share.id === input.shareId) ?? null;
}

export function getReadonlyShareByTokenHash(tokenHash: string): (ReadonlyShare & { token_hash: string }) | null {
  const row = getDb()
    .prepare(`${readonlyShareSelect} WHERE rs.token_hash = ? GROUP BY rs.id LIMIT 1`)
    .get(tokenHash) as ReadonlyShareRow | undefined;
  if (!row) return null;
  return { ...normalizeReadonlyShare(row), token_hash: row.token_hash };
}

export function recordReadonlyShareAccess(input: { shareId: string; submissionId: string }) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE readonly_shares
      SET access_count = access_count + 1,
          last_accessed_at = ?,
          updated_at = ?
      WHERE id = ?
        AND submission_id = ?
    `
    )
    .run(now, now, input.shareId, input.submissionId);
}

const supplierPortalResponseSelect = `
  SELECT
    spr.*,
    rs.label AS share_label,
    closer.display_name AS closed_by_name
  FROM supplier_portal_responses spr
  JOIN readonly_shares rs ON rs.id = spr.share_id
  LEFT JOIN users closer ON closer.id = spr.closed_by
`;

export function listSupplierPortalResponses(input: { submissionId: string; shareId?: string }) {
  const values = [input.submissionId];
  const filters = ["spr.submission_id = ?"];
  if (input.shareId) {
    filters.push("spr.share_id = ?");
    values.push(input.shareId);
  }

  return getDb()
    .prepare(
      `
      ${supplierPortalResponseSelect}
      WHERE ${filters.join(" AND ")}
      ORDER BY
        CASE spr.status WHEN 'open' THEN 0 ELSE 1 END,
        datetime(spr.created_at) DESC,
        spr.rowid DESC
    `
    )
    .all(...values) as SupplierPortalResponse[];
}

export function getSupplierPortalResponse(input: { submissionId: string; responseId: string }) {
  return (
    getDb()
      .prepare(`${supplierPortalResponseSelect} WHERE spr.submission_id = ? AND spr.id = ? LIMIT 1`)
      .get(input.submissionId, input.responseId) as SupplierPortalResponse | undefined
  ) ?? null;
}

export function createSupplierPortalResponse(input: {
  shareId: string;
  submissionId: string;
  responseKind: SupplierPortalResponse["response_kind"];
  supplierName: string;
  supplierEmail: string;
  message: string;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      INSERT INTO supplier_portal_responses (
        id, share_id, submission_id, response_kind, supplier_name, supplier_email, message, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `
    )
    .run(id, input.shareId, input.submissionId, input.responseKind, input.supplierName, input.supplierEmail, input.message, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: null,
    action: "SupplierPortalResponseCreated",
    detail: {
      shareId: input.shareId,
      responseId: id,
      responseKind: input.responseKind,
      supplierEmail: input.supplierEmail
    }
  });

  return getSupplierPortalResponse({ submissionId: input.submissionId, responseId: id });
}

export function closeSupplierPortalResponse(input: { submissionId: string; responseId: string; closedBy: string }) {
  const existing = getSupplierPortalResponse({ submissionId: input.submissionId, responseId: input.responseId });
  if (!existing) return { ok: false as const, status: 404, error: "找不到供應商入口回覆" };
  if (existing.status !== "open") return { ok: false as const, status: 409, error: "只有未結案的供應商回覆可以關閉" };

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE supplier_portal_responses
      SET status = 'closed', closed_by = ?, closed_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.closedBy, now, now, input.submissionId, input.responseId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.closedBy,
    action: "SupplierPortalResponseClosed",
    detail: { responseId: input.responseId }
  });

  return { ok: true as const, response: getSupplierPortalResponse({ submissionId: input.submissionId, responseId: input.responseId }) };
}

const procurementSyncRunSelect = `
  SELECT
    psr.*,
    s.drawing_number,
    s.revision,
    i.part_number,
    i.part_name,
    creator.display_name AS created_by_name,
    acknowledger.display_name AS acknowledged_by_name
  FROM procurement_sync_runs psr
  JOIN submissions s ON s.id = psr.submission_id
  JOIN items i ON i.id = s.item_id
  JOIN users creator ON creator.id = psr.created_by
  LEFT JOIN users acknowledger ON acknowledger.id = psr.acknowledged_by
`;

export function listProcurementSyncRuns(input: { submissionId?: string; targetSystem?: ProcurementSyncRun["target_system"] } = {}) {
  const filters: string[] = [];
  const values: string[] = [];
  if (input.submissionId) {
    filters.push("psr.submission_id = ?");
    values.push(input.submissionId);
  }
  if (input.targetSystem) {
    filters.push("psr.target_system = ?");
    values.push(input.targetSystem);
  }

  return getDb()
    .prepare(
      `
      ${procurementSyncRunSelect}
      ${filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : ""}
      ORDER BY datetime(psr.created_at) DESC, psr.rowid DESC
    `
    )
    .all(...values) as ProcurementSyncRun[];
}

export function getProcurementSyncRun(runId: string) {
  return (
    getDb()
      .prepare(`${procurementSyncRunSelect} WHERE psr.id = ? LIMIT 1`)
      .get(runId) as ProcurementSyncRun | undefined
  ) ?? null;
}

export function createProcurementSyncRun(input: {
  submissionId: string;
  targetSystem: ProcurementSyncRun["target_system"];
  payload: Record<string, unknown>;
  externalReference?: string;
  createdBy: string;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      INSERT INTO procurement_sync_runs (
        id, submission_id, target_system, status, payload_json, response_json, external_reference, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 'sent', ?, '{}', ?, ?, ?, ?)
    `
    )
    .run(id, input.submissionId, input.targetSystem, JSON.stringify(input.payload), input.externalReference ?? null, input.createdBy, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.createdBy,
    action: "ProcurementSyncSent",
    detail: { runId: id, targetSystem: input.targetSystem, externalReference: input.externalReference ?? null }
  });

  return getProcurementSyncRun(id);
}

export function decideProcurementSyncRun(input: {
  runId: string;
  actorId: string;
  status: "acknowledged" | "failed";
  externalReference?: string;
  response: Record<string, unknown>;
}) {
  const existing = getProcurementSyncRun(input.runId);
  if (!existing) return { ok: false as const, status: 404, error: "找不到採購同步紀錄" };
  if (existing.status !== "sent") return { ok: false as const, status: 409, error: "只有已送出的同步紀錄可以決議" };

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE procurement_sync_runs
      SET status = ?,
          response_json = ?,
          external_reference = COALESCE(?, external_reference),
          acknowledged_by = ?,
          acknowledged_at = ?,
          updated_at = ?
      WHERE id = ?
    `
    )
    .run(input.status, JSON.stringify(input.response), input.externalReference ?? null, input.actorId, now, now, input.runId);

  createAuditLog({
    submissionId: existing.submission_id,
    actorId: input.actorId,
    action: input.status === "acknowledged" ? "ProcurementSyncAcknowledged" : "ProcurementSyncFailed",
    detail: { runId: input.runId, externalReference: input.externalReference ?? existing.external_reference }
  });

  return { ok: true as const, run: getProcurementSyncRun(input.runId) };
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

export function getSubmissionFile(input: { submissionId: string; fileId: string }) {
  return getDb()
    .prepare("SELECT * FROM submission_files WHERE submission_id = ? AND id = ?")
    .get(input.submissionId, input.fileId) as SubmissionFile | undefined;
}

export function listDiscussionComments(submissionId: string) {
  return getDb()
    .prepare(
      `
      SELECT
        c.*,
        f.original_filename AS file_original_filename,
        author.display_name AS author_name,
        resolver.display_name AS resolved_by_name
      FROM discussion_comments c
      LEFT JOIN submission_files f ON f.id = c.file_id
      JOIN users author ON author.id = c.author_id
      LEFT JOIN users resolver ON resolver.id = c.resolved_by
      WHERE c.submission_id = ?
      ORDER BY datetime(c.created_at) ASC, c.rowid ASC
    `
    )
    .all(submissionId) as DiscussionComment[];
}

export function getDiscussionComment(input: { submissionId: string; commentId: string }) {
  return listDiscussionComments(input.submissionId).find((comment) => comment.id === input.commentId) ?? null;
}

export function createDiscussionComment(input: { submissionId: string; fileId?: string | null; authorId: string; body: string }) {
  const database = getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  database
    .prepare(
      `
      INSERT INTO discussion_comments (
        id, submission_id, file_id, author_id, body, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
    `
    )
    .run(id, input.submissionId, input.fileId ?? null, input.authorId, input.body, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.authorId,
    action: "DiscussionCommentCreated",
    detail: { commentId: id, fileId: input.fileId ?? null }
  });

  return getDiscussionComment({ submissionId: input.submissionId, commentId: id });
}

export function resolveDiscussionComment(input: { submissionId: string; commentId: string; resolvedBy: string }) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE discussion_comments
      SET status = 'resolved', resolved_by = ?, resolved_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.resolvedBy, now, now, input.submissionId, input.commentId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.resolvedBy,
    action: "DiscussionCommentResolved",
    detail: { commentId: input.commentId }
  });

  return getDiscussionComment({ submissionId: input.submissionId, commentId: input.commentId });
}

export function listReviewIssues(submissionId: string) {
  return getDb()
    .prepare(
      `
      SELECT
        i.*,
        f.original_filename AS file_original_filename,
        raiser.display_name AS raised_by_name,
        assignee.display_name AS assignee_name,
        resolver.display_name AS resolved_by_name
      FROM review_issues i
      LEFT JOIN submission_files f ON f.id = i.file_id
      JOIN users raiser ON raiser.id = i.raised_by
      LEFT JOIN users assignee ON assignee.id = i.assignee_id
      LEFT JOIN users resolver ON resolver.id = i.resolved_by
      WHERE i.submission_id = ?
      ORDER BY
        CASE i.status WHEN 'open' THEN 0 ELSE 1 END,
        datetime(i.created_at) ASC,
        i.rowid ASC
    `
    )
    .all(submissionId) as ReviewIssue[];
}

export function getReviewIssue(input: { submissionId: string; issueId: string }) {
  return listReviewIssues(input.submissionId).find((issue) => issue.id === input.issueId) ?? null;
}

export function createReviewIssue(input: {
  submissionId: string;
  fileId?: string | null;
  raisedBy: string;
  assigneeId?: string | null;
  title: string;
  description: string;
}) {
  const database = getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  database
    .prepare(
      `
      INSERT INTO review_issues (
        id, submission_id, file_id, title, description, status, raised_by, assignee_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
    `
    )
    .run(id, input.submissionId, input.fileId ?? null, input.title, input.description, input.raisedBy, input.assigneeId ?? null, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.raisedBy,
    action: "ReviewIssueCreated",
    detail: { issueId: id, fileId: input.fileId ?? null, assigneeId: input.assigneeId ?? null, title: input.title }
  });

  return getReviewIssue({ submissionId: input.submissionId, issueId: id });
}

export function resolveReviewIssue(input: { submissionId: string; issueId: string; resolvedBy: string; resolution: string }) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE review_issues
      SET status = 'resolved', resolved_by = ?, resolution = ?, resolved_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.resolvedBy, input.resolution, now, now, input.submissionId, input.issueId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.resolvedBy,
    action: "ReviewIssueResolved",
    detail: { issueId: input.issueId, resolution: input.resolution }
  });

  return getReviewIssue({ submissionId: input.submissionId, issueId: input.issueId });
}

export function listChangeRequests(submissionId: string) {
  return getDb()
    .prepare(
      `
      SELECT
        c.*,
        requester.display_name AS requested_by_name,
        decider.display_name AS decided_by_name
      FROM change_requests c
      JOIN users requester ON requester.id = c.requested_by
      LEFT JOIN users decider ON decider.id = c.decided_by
      WHERE c.submission_id = ?
      ORDER BY
        CASE c.status WHEN 'open' THEN 0 ELSE 1 END,
        datetime(c.created_at) ASC,
        c.rowid ASC
    `
    )
    .all(submissionId) as ChangeRequest[];
}

export function getChangeRequest(input: { submissionId: string; changeId: string }) {
  return listChangeRequests(input.submissionId).find((change) => change.id === input.changeId) ?? null;
}

export function createChangeRequest(input: {
  submissionId: string;
  requestedBy: string;
  kind: ChangeRequest["kind"];
  title: string;
  reason: string;
  impact: string;
}) {
  const database = getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  database
    .prepare(
      `
      INSERT INTO change_requests (
        id, submission_id, kind, title, reason, impact, status, requested_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `
    )
    .run(id, input.submissionId, input.kind, input.title, input.reason, input.impact, input.requestedBy, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.requestedBy,
    action: "ChangeRequestCreated",
    detail: { changeId: id, kind: input.kind, title: input.title }
  });

  return getChangeRequest({ submissionId: input.submissionId, changeId: id });
}

export function decideChangeRequest(input: {
  submissionId: string;
  changeId: string;
  decidedBy: string;
  status: "approved" | "rejected" | "closed";
  comment: string;
}) {
  const existing = getChangeRequest({ submissionId: input.submissionId, changeId: input.changeId });
  if (!existing) return { ok: false as const, status: 404, error: "找不到變更需求" };
  if (existing.status !== "open") {
    return { ok: false as const, status: 409, error: "只有未結案的變更需求可以決議" };
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE change_requests
      SET status = ?, decided_by = ?, decision_comment = ?, decided_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.status, input.decidedBy, input.comment, now, now, input.submissionId, input.changeId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.decidedBy,
    action: "ChangeRequestDecided",
    detail: { changeId: input.changeId, status: input.status, comment: input.comment }
  });

  return { ok: true as const, change: getChangeRequest({ submissionId: input.submissionId, changeId: input.changeId }) };
}

const DEFAULT_PHASE_GATE_CHECKS: Array<{
  gateCode: PhaseGateCheck["gate_code"];
  gateName: string;
  checklistItem: string;
  required: 0 | 1;
}> = [
  {
    gateCode: "concept",
    gateName: "概念關卡",
    checklistItem: "變更目的、零件範圍與業務原因已清楚定義。",
    required: 1
  },
  {
    gateCode: "design",
    gateName: "設計關卡",
    checklistItem: "CAD 檔案、圖面、材質與版次中繼資料皆可審閱。",
    required: 1
  },
  {
    gateCode: "verification",
    gateName: "驗證關卡",
    checklistItem: "BOM、使用處影響、風險提示或審核問題已檢查。",
    required: 1
  },
  {
    gateCode: "release",
    gateName: "發布關卡",
    checklistItem: "發布包、製造交接與外部影響已確認就緒。",
    required: 1
  }
];

export function listPhaseGateChecks(submissionId: string) {
  return getDb()
    .prepare(
      `
      SELECT
        p.*,
        creator.display_name AS created_by_name,
        decider.display_name AS decided_by_name
      FROM phase_gate_checks p
      JOIN users creator ON creator.id = p.created_by
      LEFT JOIN users decider ON decider.id = p.decided_by
      WHERE p.submission_id = ?
      ORDER BY
        CASE p.gate_code
          WHEN 'concept' THEN 1
          WHEN 'design' THEN 2
          WHEN 'verification' THEN 3
          WHEN 'release' THEN 4
          ELSE 5
        END,
        p.rowid ASC
    `
    )
    .all(submissionId) as PhaseGateCheck[];
}

export function getPhaseGateCheck(input: { submissionId: string; checkId: string }) {
  return listPhaseGateChecks(input.submissionId).find((check) => check.id === input.checkId) ?? null;
}

export function initializePhaseGateChecks(input: { submissionId: string; createdBy: string }) {
  const database = getDb();
  const existing = listPhaseGateChecks(input.submissionId);
  if (existing.length > 0) return { created: false, checks: existing };

  const now = new Date().toISOString();
  const insert = database.prepare(
    `
    INSERT INTO phase_gate_checks (
      id, submission_id, gate_code, gate_name, checklist_item, required, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `
  );
  const createDefaults = database.transaction(() => {
    for (const item of DEFAULT_PHASE_GATE_CHECKS) {
      insert.run(
        crypto.randomUUID(),
        input.submissionId,
        item.gateCode,
        item.gateName,
        item.checklistItem,
        item.required,
        input.createdBy,
        now,
        now
      );
    }
  });
  createDefaults();

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.createdBy,
    action: "PhaseGateInitialized",
    detail: { checkCount: DEFAULT_PHASE_GATE_CHECKS.length }
  });

  return { created: true, checks: listPhaseGateChecks(input.submissionId) };
}

export function decidePhaseGateCheck(input: {
  submissionId: string;
  checkId: string;
  decidedBy: string;
  status: "completed" | "waived";
  comment: string;
}) {
  const existing = getPhaseGateCheck({ submissionId: input.submissionId, checkId: input.checkId });
  if (!existing) return { ok: false as const, status: 404, error: "找不到階段關卡檢核項目" };
  if (existing.status !== "open") return { ok: false as const, status: 409, error: "只有未結案的階段關卡可以決議" };

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE phase_gate_checks
      SET status = ?, decided_by = ?, decision_comment = ?, decided_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.status, input.decidedBy, input.comment, now, now, input.submissionId, input.checkId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.decidedBy,
    action: "PhaseGateDecided",
    detail: { checkId: input.checkId, status: input.status, comment: input.comment }
  });

  return { ok: true as const, check: getPhaseGateCheck({ submissionId: input.submissionId, checkId: input.checkId }) };
}

export function listOpenRequiredPhaseGateChecks(submissionId: string) {
  return listPhaseGateChecks(submissionId).filter((check) => check.required === 1 && check.status === "open");
}

export function listPdfMarkups(submissionId: string) {
  return getDb()
    .prepare(
      `
      SELECT
        m.*,
        f.original_filename AS file_original_filename,
        author.display_name AS author_name,
        resolver.display_name AS resolved_by_name
      FROM pdf_markups m
      JOIN submission_files f ON f.id = m.file_id
      JOIN users author ON author.id = m.author_id
      LEFT JOIN users resolver ON resolver.id = m.resolved_by
      WHERE m.submission_id = ?
      ORDER BY
        CASE m.status WHEN 'open' THEN 0 ELSE 1 END,
        f.original_filename ASC,
        m.page_number ASC,
        m.y_percent ASC,
        m.x_percent ASC,
        datetime(m.created_at) ASC,
        m.rowid ASC
    `
    )
    .all(submissionId) as PdfMarkup[];
}

export function getPdfMarkup(input: { submissionId: string; markupId: string }) {
  return listPdfMarkups(input.submissionId).find((markup) => markup.id === input.markupId) ?? null;
}

export function createPdfMarkup(input: {
  submissionId: string;
  fileId: string;
  authorId: string;
  pageNumber: number;
  xPercent: number;
  yPercent: number;
  body: string;
}) {
  const database = getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  database
    .prepare(
      `
      INSERT INTO pdf_markups (
        id, submission_id, file_id, page_number, x_percent, y_percent, body, status, author_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `
    )
    .run(id, input.submissionId, input.fileId, input.pageNumber, input.xPercent, input.yPercent, input.body, input.authorId, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.authorId,
    action: "PdfMarkupCreated",
    detail: {
      markupId: id,
      fileId: input.fileId,
      pageNumber: input.pageNumber,
      xPercent: input.xPercent,
      yPercent: input.yPercent
    }
  });

  return getPdfMarkup({ submissionId: input.submissionId, markupId: id });
}

export function resolvePdfMarkup(input: { submissionId: string; markupId: string; resolvedBy: string }) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE pdf_markups
      SET status = 'resolved', resolved_by = ?, resolved_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.resolvedBy, now, now, input.submissionId, input.markupId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.resolvedBy,
    action: "PdfMarkupResolved",
    detail: { markupId: input.markupId }
  });

  return getPdfMarkup({ submissionId: input.submissionId, markupId: input.markupId });
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

export function addApproval(input: { submissionId: string; reviewerId: string; decision: "Approved" | "Rejected"; comment?: string }) {
  getDb()
    .prepare(
      `
      INSERT INTO approval_steps (id, submission_id, reviewer_id, sequence_no, decision, comment, decided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(crypto.randomUUID(), input.submissionId, input.reviewerId, 1, input.decision, input.comment ?? null, new Date().toISOString());
}

export function reviewerHasDecision(input: { submissionId: string; reviewerId: string }) {
  const row = getDb()
    .prepare("SELECT id FROM approval_steps WHERE submission_id = ? AND reviewer_id = ? LIMIT 1")
    .get(input.submissionId, input.reviewerId) as { id: string } | undefined;
  return Boolean(row);
}

export function getApprovalSummary(submissionId: string) {
  const rows = getDb()
    .prepare("SELECT decision, COUNT(*) AS count FROM approval_steps WHERE submission_id = ? GROUP BY decision")
    .all(submissionId) as Array<{ decision: string; count: number }>;

  return {
    approved: rows.find((row) => row.decision === "Approved")?.count ?? 0,
    rejected: rows.find((row) => row.decision === "Rejected")?.count ?? 0
  };
}

const DEFAULT_APPROVAL_MATRIX_REQUIREMENTS: Array<{
  requiredRole: ApprovalMatrixRequirement["required_role"];
  minCount: number;
}> = [
  { requiredRole: "R&D Manager", minCount: 1 },
  { requiredRole: "Admin", minCount: 1 }
];

export function listApprovalMatrixRequirements(submissionId: string) {
  return getDb()
    .prepare(
      `
      SELECT
        r.*,
        creator.display_name AS created_by_name,
        decider.display_name AS decided_by_name,
        COALESCE(approved.approved_count, 0) AS approved_count
      FROM approval_matrix_requirements r
      JOIN users creator ON creator.id = r.created_by
      LEFT JOIN users decider ON decider.id = r.decided_by
      LEFT JOIN (
        SELECT u.role AS required_role, COUNT(DISTINCT a.reviewer_id) AS approved_count
        FROM approval_steps a
        JOIN users u ON u.id = a.reviewer_id
        WHERE a.submission_id = ? AND a.decision = 'Approved'
        GROUP BY u.role
      ) approved ON approved.required_role = r.required_role
      WHERE r.submission_id = ?
      ORDER BY
        CASE r.required_role WHEN 'R&D Manager' THEN 1 WHEN 'Admin' THEN 2 ELSE 3 END,
        r.rowid ASC
    `
    )
    .all(submissionId, submissionId) as ApprovalMatrixRequirement[];
}

export function getApprovalMatrixRequirement(input: { submissionId: string; requirementId: string }) {
  return listApprovalMatrixRequirements(input.submissionId).find((requirement) => requirement.id === input.requirementId) ?? null;
}

export function initializeApprovalMatrixRequirements(input: {
  submissionId: string;
  createdBy: string;
  requirements?: Array<{ requiredRole: ApprovalMatrixRequirement["required_role"]; minCount: number }>;
}) {
  const existing = listApprovalMatrixRequirements(input.submissionId);
  if (existing.length > 0) return { created: false, requirements: refreshApprovalMatrixRequirements(input.submissionId) };

  const requirements = input.requirements?.length ? input.requirements : DEFAULT_APPROVAL_MATRIX_REQUIREMENTS;
  const now = new Date().toISOString();
  const insert = getDb().prepare(
    `
    INSERT INTO approval_matrix_requirements (
      id, submission_id, required_role, min_count, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'open', ?, ?, ?)
  `
  );
  const createDefaults = getDb().transaction(() => {
    for (const requirement of requirements) {
      insert.run(crypto.randomUUID(), input.submissionId, requirement.requiredRole, requirement.minCount, input.createdBy, now, now);
    }
  });
  createDefaults();

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.createdBy,
    action: "ApprovalMatrixInitialized",
    detail: { requirements: requirements.map((requirement) => ({ role: requirement.requiredRole, minCount: requirement.minCount })) }
  });

  return { created: true, requirements: refreshApprovalMatrixRequirements(input.submissionId) };
}

export function refreshApprovalMatrixRequirements(submissionId: string) {
  const now = new Date().toISOString();
  const requirements = listApprovalMatrixRequirements(submissionId);
  for (const requirement of requirements) {
    if (requirement.status === "open" && requirement.approved_count >= requirement.min_count) {
      getDb()
        .prepare(
          `
          UPDATE approval_matrix_requirements
          SET status = 'satisfied', updated_at = ?
          WHERE submission_id = ? AND id = ? AND status = 'open'
        `
        )
        .run(now, submissionId, requirement.id);
    }
  }
  return listApprovalMatrixRequirements(submissionId);
}

export function waiveApprovalMatrixRequirement(input: {
  submissionId: string;
  requirementId: string;
  decidedBy: string;
  comment: string;
}) {
  const existing = getApprovalMatrixRequirement({ submissionId: input.submissionId, requirementId: input.requirementId });
  if (!existing) return { ok: false as const, status: 404, error: "找不到簽核矩陣需求" };
  if (existing.status !== "open") return { ok: false as const, status: 409, error: "只有未結案的簽核矩陣需求可以豁免" };

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE approval_matrix_requirements
      SET status = 'waived', decided_by = ?, decision_comment = ?, decided_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.decidedBy, input.comment, now, now, input.submissionId, input.requirementId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.decidedBy,
    action: "ApprovalMatrixWaived",
    detail: { requirementId: input.requirementId, comment: input.comment }
  });

  return { ok: true as const, requirement: getApprovalMatrixRequirement({ submissionId: input.submissionId, requirementId: input.requirementId }) };
}

export function listOpenApprovalMatrixRequirements(submissionId: string) {
  return refreshApprovalMatrixRequirements(submissionId).filter((requirement) => requirement.status === "open");
}

export function getDashboardMetrics(submittedBy?: string) {
  const database = getDb();
  const statuses = (
    submittedBy
      ? database.prepare("SELECT status, COUNT(*) as count FROM submissions WHERE submitted_by = ? GROUP BY status").all(submittedBy)
      : database.prepare("SELECT status, COUNT(*) as count FROM submissions GROUP BY status").all()
  ) as Array<{ status: string; count: number }>;
  return {
    pending: statuses.find((row) => row.status === "Pending")?.count ?? 0,
    released: statuses.find((row) => row.status === "Released")?.count ?? 0,
    rejected: statuses.find((row) => row.status === "Rejected")?.count ?? 0,
    failed: statuses.find((row) => row.status === "ReleaseFailed")?.count ?? 0
  };
}

export type LlmConversation = {
  id: string;
  user_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
};

export function createLlmConversation(input: { userId: string; title: string }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO llm_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, input.userId, input.title, now, now);
  return id;
}

export function getLlmConversation(id: string) {
  return getDb()
    .prepare("SELECT id, user_id, title, created_at, updated_at FROM llm_conversations WHERE id = ?")
    .get(id) as LlmConversation | undefined;
}

export function addLlmMessage(input: { conversationId: string; role: "user" | "assistant" | "system"; content: string }) {
  const now = new Date().toISOString();
  const database = getDb();
  database
    .prepare("INSERT INTO llm_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), input.conversationId, input.role, input.content, now);
  database.prepare("UPDATE llm_conversations SET updated_at = ? WHERE id = ?").run(now, input.conversationId);
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

// ─── System Settings ────────────────────────────────────────────────────

export function getSystemSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM system_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSystemSetting(key: string, value: string, updatedBy: string) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO system_settings (key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .run(key, value, now, updatedBy);
}

export function getAllSystemSettings(): Record<string, string> {
  const rows = getDb()
    .prepare("SELECT key, value FROM system_settings")
    .all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
}

// ─── Google Drive File Status ───────────────────────────────────────────

export function updateFileGDriveStatus(
  fileId: string,
  gdriveStatus: string,
  gdriveFileId?: string | null
) {
  if (gdriveFileId !== undefined) {
    getDb()
      .prepare("UPDATE submission_files SET gdrive_status = ?, gdrive_file_id = ? WHERE id = ?")
      .run(gdriveStatus, gdriveFileId, fileId);
  } else {
    getDb()
      .prepare("UPDATE submission_files SET gdrive_status = ? WHERE id = ?")
      .run(gdriveStatus, fileId);
  }
}

export function getFilesNeedingUpload(submissionId: string) {
  return getDb()
    .prepare("SELECT * FROM submission_files WHERE submission_id = ? AND gdrive_status IN ('none', 'failed')")
    .all(submissionId) as SubmissionFile[];
}

export function findReleasedFilenameConflicts(input: {
  submissionId: string;
  files: Array<{ file_role: string; original_filename: string }>;
}) {
  if (input.files.length === 0) return [];

  const conflicts = [];
  const database = getDb();
  const query = database.prepare(
    `
    SELECT
      s.id AS submission_id,
      s.drawing_number,
      s.revision,
      f.file_role,
      f.original_filename
    FROM submission_files f
    JOIN submissions s ON s.id = f.submission_id
    JOIN submissions current_submission ON current_submission.id = ?
    WHERE s.status = 'Released'
      AND s.id <> current_submission.id
      AND s.item_id <> current_submission.item_id
      AND f.file_role = ?
      AND lower(f.original_filename) = lower(?)
    LIMIT 1
  `
  );

  for (const file of input.files) {
    const conflict = query.get(input.submissionId, file.file_role, file.original_filename) as
      | {
          submission_id: string;
          drawing_number: string;
          revision: string;
          file_role: string;
          original_filename: string;
        }
      | undefined;
    if (conflict) conflicts.push(conflict);
  }

  return conflicts;
}

type NotificationRow = {
  id: string;
  submission_id: string | null;
  drawing_number: string | null;
  revision: string | null;
  part_number: string | null;
  part_name: string | null;
  submitted_by: string | null;
  submitted_by_name: string | null;
  detail: string | null;
  created_at: string;
};

function notificationScopeSql(user: DbUser, alias = "s") {
  return user.role === "Engineer" ? { sql: ` AND ${alias}.submitted_by = ?`, values: [user.id] } : { sql: "", values: [] };
}

function submissionLabel(row: Pick<NotificationRow, "drawing_number" | "revision" | "part_number">) {
  const drawing = row.drawing_number ? `${row.drawing_number} Rev ${row.revision ?? "-"}` : "未知圖號";
  return row.part_number ? `${drawing} / ${row.part_number}` : drawing;
}

export function summarizeNotifications(items: NotificationItem[]): NotificationSummary {
  return {
    total: items.length,
    critical: items.filter((item) => item.severity === "critical").length,
    warning: items.filter((item) => item.severity === "warning").length,
    info: items.filter((item) => item.severity === "info").length
  };
}

export function listNotifications(user: DbUser): NotificationItem[] {
  const database = getDb();
  const scope = notificationScopeSql(user);
  const items: NotificationItem[] = [];

  const releaseFailedRows = database
    .prepare(
      `
      SELECT
        s.id,
        s.id AS submission_id,
        s.drawing_number,
        s.revision,
        i.part_number,
        i.part_name,
        s.submitted_by,
        u.display_name AS submitted_by_name,
        s.release_error AS detail,
        s.updated_at AS created_at
      FROM submissions s
      JOIN items i ON i.id = s.item_id
      JOIN users u ON u.id = s.submitted_by
      WHERE s.status = 'ReleaseFailed'${scope.sql}
      ORDER BY s.updated_at DESC
      LIMIT 20
    `
    )
    .all(...scope.values) as NotificationRow[];

  for (const row of releaseFailedRows) {
    items.push({
      id: `release_failed:${row.submission_id}`,
      kind: "release_failed",
      severity: "critical",
      title: "Release 失敗需要處理",
      message: `${submissionLabel(row)} 發布失敗：${row.detail ?? "未記錄錯誤原因"}`,
      submission_id: row.submission_id,
      drawing_number: row.drawing_number,
      revision: row.revision,
      part_number: row.part_number,
      part_name: row.part_name,
      created_at: row.created_at,
      action_url: row.submission_id ? `/api/submissions/${row.submission_id}` : null
    });
  }

  const pendingRows = database
    .prepare(
      `
      SELECT
        s.id,
        s.id AS submission_id,
        s.drawing_number,
        s.revision,
        i.part_number,
        i.part_name,
        s.submitted_by,
        u.display_name AS submitted_by_name,
        CAST((s.approval_required - COUNT(a.id)) AS TEXT) AS detail,
        s.created_at
      FROM submissions s
      JOIN items i ON i.id = s.item_id
      JOIN users u ON u.id = s.submitted_by
      LEFT JOIN approval_steps a ON a.submission_id = s.id AND a.decision = 'Approved'
      WHERE s.status = 'Pending'${scope.sql}
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 20
    `
    )
    .all(...scope.values) as NotificationRow[];

  for (const row of pendingRows) {
    const remaining = Math.max(1, Number.parseInt(row.detail ?? "1", 10) || 1);
    const isReviewer = user.role === "R&D Manager" || user.role === "Admin";
    items.push({
      id: `${isReviewer ? "pending_review" : "awaiting_review"}:${row.submission_id}`,
      kind: isReviewer ? "pending_review" : "awaiting_review",
      severity: isReviewer ? "warning" : "info",
      title: isReviewer ? "待審核送審" : "送審等待審核",
      message: isReviewer
        ? `${submissionLabel(row)} 尚需 ${remaining} 位審核者核准。`
        : `${submissionLabel(row)} 已送出，正在等待主管審核。`,
      submission_id: row.submission_id,
      drawing_number: row.drawing_number,
      revision: row.revision,
      part_number: row.part_number,
      part_name: row.part_name,
      created_at: row.created_at,
      action_url: row.submission_id ? `/api/submissions/${row.submission_id}` : null
    });
  }

  const uploadFailedRows = database
    .prepare(
      `
      SELECT
        f.id,
        s.id AS submission_id,
        s.drawing_number,
        s.revision,
        i.part_number,
        i.part_name,
        s.submitted_by,
        u.display_name AS submitted_by_name,
        f.original_filename AS detail,
        f.created_at
      FROM submission_files f
      JOIN submissions s ON s.id = f.submission_id
      JOIN items i ON i.id = s.item_id
      JOIN users u ON u.id = s.submitted_by
      WHERE f.gdrive_status = 'failed'${scope.sql}
      ORDER BY f.created_at DESC
      LIMIT 20
    `
    )
    .all(...scope.values) as NotificationRow[];

  for (const row of uploadFailedRows) {
    items.push({
      id: `drive_upload_failed:${row.id}`,
      kind: "drive_upload_failed",
      severity: "warning",
      title: "Google Drive 上傳失敗",
      message: `${submissionLabel(row)} 的檔案 ${row.detail ?? ""} 需要重新上傳。`,
      submission_id: row.submission_id,
      drawing_number: row.drawing_number,
      revision: row.revision,
      part_number: row.part_number,
      part_name: row.part_name,
      created_at: row.created_at,
      action_url: row.submission_id ? `/api/submissions/${row.submission_id}` : null
    });
  }

  const missingPackageRows = database
    .prepare(
      `
      SELECT
        s.id,
        s.id AS submission_id,
        s.drawing_number,
        s.revision,
        i.part_number,
        i.part_name,
        s.submitted_by,
        u.display_name AS submitted_by_name,
        NULL AS detail,
        s.updated_at AS created_at
      FROM submissions s
      JOIN items i ON i.id = s.item_id
      JOIN users u ON u.id = s.submitted_by
      LEFT JOIN release_packages p ON p.submission_id = s.id
      WHERE s.status = 'Released'
        AND p.id IS NULL${scope.sql}
      ORDER BY s.updated_at DESC
      LIMIT 20
    `
    )
    .all(...scope.values) as NotificationRow[];

  for (const row of missingPackageRows) {
    items.push({
      id: `release_package_missing:${row.submission_id}`,
      kind: "release_package_missing",
      severity: "warning",
      title: "Released 缺少發布包",
      message: `${submissionLabel(row)} 已發布，但尚未找到 ZIP release package。`,
      submission_id: row.submission_id,
      drawing_number: row.drawing_number,
      revision: row.revision,
      part_number: row.part_number,
      part_name: row.part_name,
      created_at: row.created_at,
      action_url: row.submission_id ? `/api/submissions/${row.submission_id}` : null
    });
  }

  const lockScope = user.role === "Engineer" ? "AND EXISTS (SELECT 1 FROM submissions s WHERE s.item_id = l.item_id AND s.submitted_by = ?)" : "";
  const lockRows = database
    .prepare(
      `
      SELECT
        l.id,
        (
          SELECT s.id
          FROM submissions s
          WHERE s.item_id = l.item_id
          ORDER BY s.updated_at DESC
          LIMIT 1
        ) AS submission_id,
        (
          SELECT s.drawing_number
          FROM submissions s
          WHERE s.item_id = l.item_id
          ORDER BY s.updated_at DESC
          LIMIT 1
        ) AS drawing_number,
        (
          SELECT s.revision
          FROM submissions s
          WHERE s.item_id = l.item_id
          ORDER BY s.updated_at DESC
          LIMIT 1
        ) AS revision,
        i.part_number,
        i.part_name,
        l.locked_by AS submitted_by,
        u.display_name AS submitted_by_name,
        l.lock_reason AS detail,
        l.created_at
      FROM item_locks l
      JOIN items i ON i.id = l.item_id
      JOIN users u ON u.id = l.locked_by
      WHERE l.released_at IS NULL
        AND datetime(l.expires_at) > datetime('now')
        ${lockScope}
      ORDER BY l.created_at DESC
      LIMIT 20
    `
    )
    .all(...(user.role === "Engineer" ? [user.id] : [])) as NotificationRow[];

  for (const row of lockRows) {
    items.push({
      id: `active_lock:${row.id}`,
      kind: "active_lock",
      severity: row.submitted_by === user.id ? "info" : "warning",
      title: row.submitted_by === user.id ? "你正在預約編輯" : "料號被預約編輯",
      message: `${row.part_number ?? "未知料號"} 目前由 ${row.submitted_by_name ?? "未知使用者"} 預約：${row.detail ?? "Edit reservation"}`,
      submission_id: row.submission_id,
      drawing_number: row.drawing_number,
      revision: row.revision,
      part_number: row.part_number,
      part_name: row.part_name,
      created_at: row.created_at,
      action_url: row.submission_id ? `/api/submissions/${row.submission_id}` : null
    });
  }

  const severityOrder = { critical: 0, warning: 1, info: 2 } as const;
  return items
    .sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.created_at.localeCompare(a.created_at);
    });
}
