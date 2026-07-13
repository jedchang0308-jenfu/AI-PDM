import crypto from "node:crypto";
import { createAuditLog, getDb } from "@/lib/db";
import { getBomBySubmissionId, materializeBomDraftFromReferences } from "@/lib/repositories/bom-repository";
import { findOrCreateItem } from "@/lib/repositories/item-repository";
import { getActiveItemLock } from "@/lib/repositories/item-lock-repository";
import { getReleasePackageBySubmissionId } from "@/lib/repositories/release-repository";
import { compareRevisionCodes } from "@/lib/revision-policy";
import type {
  DesignReuseCandidate,
  DuplicateGeometryCandidate,
  FileReference,
  SubmissionDetail,
  SubmissionFile,
  SubmissionSummary
} from "@/lib/types";

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
    audit_logs: auditLogs,
    lifecycle_requests: []
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

export function createSubmissionRecord(input: {
  companyId?: string;
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
    storageProvider?: "local_repository" | "supabase_storage" | "s3_compatible" | "google_cloud_storage";
    storageBucket?: string | null;
    storageKey?: string | null;
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
  const companyId = input.companyId ?? "company-jenfu";
  const submissionId = `SUB-${now.slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const itemId = findOrCreateItem({
    companyId,
    partNumber: input.partNumber,
    partName: input.partName,
    revision: input.revision
  });

  database
    .prepare(
      `
      INSERT INTO submissions (
        id, company_id, item_id, drawing_number, revision, product_line, customer, project_code, process_name,
        machine, material, surface_finish, document_type,
        change_description, status, submitted_by, approval_required, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      submissionId,
      companyId,
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
          id, submission_id, file_role, original_filename, local_path, storage_provider, storage_bucket, storage_key, gdrive_file_id,
          sha256, file_size, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        fileId,
        submissionId,
        file.fileRole,
        file.originalFilename,
        file.localPath,
        file.storageProvider ?? "local_repository",
        file.storageBucket ?? null,
        file.storageKey ?? null,
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

  const releasedRows = database
    .prepare("SELECT id, revision, status FROM submissions WHERE item_id = ? AND id <> ? AND status IN ('Released', 'Obsolete')")
    .all(submission.item_id, submission.id) as ReleaseRevisionSubmission[];
  assertNoFormalDuplicateRevision(submission, releasedRows);
  const releasePlan = buildRevisionCurrentPlan(submission, releasedRows);

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
      .run(releasePlan.latest.revision, now, submission.item_id);

    database
      .prepare(
        `
        UPDATE submissions
        SET status = 'Released',
            superseded_by_submission_id = NULL,
            obsolete_at = NULL,
            obsolete_by = NULL,
            updated_at = ?
        WHERE id = ?
          AND status IN ('Released', 'Obsolete')
        `
      )
      .run(now, releasePlan.latest.id);

    if (releasePlan.newlyObsolete.length > 0) {
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

      for (const row of releasePlan.newlyObsolete) {
        obsoleteSubmission.run(releasePlan.latest.id, now, input.actorId, now, row.id);
        insertAudit.run(
          crypto.randomUUID(),
          row.id,
          input.actorId,
          "ObsoleteByRevision",
          JSON.stringify({
            supersededBySubmissionId: releasePlan.latest.id,
            supersededByRevision: releasePlan.latest.revision,
            acceptedSubmissionId: submission.id,
            acceptedRevision: submission.revision
          }),
          now
        );
      }
    }
  });

  tx();
  return {
    obsolete_count: releasePlan.newlyObsolete.length,
    obsolete_submission_ids: releasePlan.newlyObsolete.map((row) => row.id),
    latest_submission_id: releasePlan.latest.id,
    latest_revision: releasePlan.latest.revision,
    history_submission_ids: releasePlan.history.map((row) => row.id),
    accepted_submission_id: submission.id,
    accepted_revision: submission.revision,
    accepted_as_history: releasePlan.acceptedAsHistory
  };
}

type ReleaseRevisionSubmission = {
  id: string;
  revision: string;
  status?: "Released" | "Obsolete";
};

function assertNoFormalDuplicateRevision(submission: ReleaseRevisionSubmission, releasedRows: ReleaseRevisionSubmission[]) {
  const blockingRow = releasedRows.find((row) => compareReleaseRevisions(row.revision, submission.revision) === 0);
  if (!blockingRow) return;

  throw new Error(
    `版次 ${submission.revision} 已有正式紀錄（${blockingRow.id}），不能重複核准同一版次。請開啟既有版次補件或改用新的版次。`
  );
}

function compareReleaseRevisions(left: string, right: string) {
  return compareRevisionCodes(left, right, { allowLegacy: true });
}

function buildRevisionCurrentPlan(submission: ReleaseRevisionSubmission, formalRows: ReleaseRevisionSubmission[]) {
  const accepted: ReleaseRevisionSubmission = { id: submission.id, revision: submission.revision, status: "Released" };
  const allRows = [...formalRows, accepted];
  const latest = allRows.reduce((current, row) => (compareReleaseRevisions(row.revision, current.revision) > 0 ? row : current), accepted);
  const history = allRows.filter((row) => row.id !== latest.id);
  const newlyObsolete = history.filter((row) => row.status === "Released");
  return {
    latest,
    history,
    newlyObsolete,
    acceptedAsHistory: latest.id !== submission.id
  };
}
