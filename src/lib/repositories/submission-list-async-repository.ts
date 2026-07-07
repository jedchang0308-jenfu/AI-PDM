import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  evaluateRevisionPackageCompleteness,
  normalizeRevisionPackageFileRole,
  type RevisionPackageWarning
} from "@/lib/revision-package";
import type {
  BomDetail,
  DesignReuseCandidate,
  DuplicateGeometryCandidate,
  FileReference,
  ItemLock,
  ReleasePackage,
  SubmissionLifecycleRequest,
  SubmissionDetail,
  SubmissionFile,
  SubmissionSummary
} from "@/lib/types";

export type ListSubmissionsAsyncInput = {
  status?: string;
  submittedBy?: string;
  companyId?: string;
  limit?: number;
  offset?: number;
  includeHistory?: boolean;
};

export type SubmissionSearchFiltersAsync = {
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

export type SearchSubmissionsAsyncInput = {
  query?: string;
  status?: string;
  submittedBy?: string;
  companyId?: string;
  filters?: SubmissionSearchFiltersAsync;
  limit?: number;
  includeHistory?: boolean;
};

type SubmissionSummaryRow = SubmissionSummary & {
  file_count: number | string;
  has_release_package?: number | string;
  has_active_lock?: number | string;
};

type SubmissionDetailRow = SubmissionSummary & {
  has_release_package?: number | string;
};

type SubmissionSnapshotRow = {
  snapshot_json: string | null;
};

type ReuseCandidateRow = SubmissionSummaryRow & {
  file_names: string | null;
};

type DuplicateGeometryRow = SubmissionSummaryRow & {
  file_fingerprints: string | null;
};

type BomHeaderRow = Omit<BomDetail, "lines">;

export const SELECT_ASYNC_SUBMISSION_SUMMARIES_SQLITE = `
  SELECT
    s.id,
    s.company_id,
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
    s.resolved_by_submission_id,
    s.resolved_at,
    s.corrects_submission_id,
    i.part_number,
    i.part_name,
    u.display_name AS submitted_by_name,
    COUNT(DISTINCT f.id) AS file_count,
    GROUP_CONCAT(DISTINCT f.file_role) AS file_roles,
    MAX(CASE WHEN rp.id IS NULL THEN 0 ELSE 1 END) AS has_release_package,
    MAX(CASE WHEN il.id IS NULL THEN 0 ELSE 1 END) AS has_active_lock
  FROM submissions s
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  LEFT JOIN submission_files f ON f.submission_id = s.id
  LEFT JOIN release_packages rp ON rp.submission_id = s.id
  LEFT JOIN item_locks il ON il.item_id = s.item_id AND il.expires_at > :now
  WHERE (:status IS NULL OR s.status = :status)
    AND (:includeHistory = 1 OR s.status <> 'Obsolete')
    AND (:includeHistory = 1 OR s.status <> 'ReleaseFailed' OR s.resolved_by_submission_id IS NULL)
    AND (:submittedBy IS NULL OR s.submitted_by = :submittedBy)
    AND (:companyId IS NULL OR s.company_id = :companyId)
  GROUP BY
    s.id,
    s.company_id,
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
    s.resolved_by_submission_id,
    s.resolved_at,
    s.corrects_submission_id,
    i.part_number,
    i.part_name,
    u.display_name
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT :limit OFFSET :offset
`;

export const SELECT_ASYNC_SUBMISSION_SUMMARIES_POSTGRES = `
  SELECT
    s.id,
    s.company_id,
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
    s.resolved_by_submission_id,
    s.resolved_at,
    s.corrects_submission_id,
    i.part_number,
    i.part_name,
    u.display_name AS submitted_by_name,
    COUNT(DISTINCT f.id) AS file_count,
    STRING_AGG(DISTINCT f.file_role, ',') AS file_roles,
    MAX(CASE WHEN rp.id IS NULL THEN 0 ELSE 1 END) AS has_release_package,
    MAX(CASE WHEN il.id IS NULL THEN 0 ELSE 1 END) AS has_active_lock
  FROM submissions s
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  LEFT JOIN submission_files f ON f.submission_id = s.id
  LEFT JOIN release_packages rp ON rp.submission_id = s.id
  LEFT JOIN item_locks il ON il.item_id = s.item_id AND il.expires_at > :now
  WHERE (:status IS NULL OR s.status = :status)
    AND (:includeHistory = 1 OR s.status <> 'Obsolete')
    AND (:includeHistory = 1 OR s.status <> 'ReleaseFailed' OR s.resolved_by_submission_id IS NULL)
    AND (:submittedBy IS NULL OR s.submitted_by = :submittedBy)
    AND (:companyId IS NULL OR s.company_id = :companyId)
  GROUP BY
    s.id,
    s.company_id,
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
    s.resolved_by_submission_id,
    s.resolved_at,
    s.corrects_submission_id,
    i.part_number,
    i.part_name,
    u.display_name
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT :limit OFFSET :offset
`;

export const SELECT_ASYNC_SUBMISSION_SEARCH_SQLITE = `
  SELECT
    s.id,
    s.company_id,
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
    s.resolved_by_submission_id,
    s.resolved_at,
    s.corrects_submission_id,
    i.part_number,
    i.part_name,
    u.display_name AS submitted_by_name,
    COUNT(DISTINCT f.id) AS file_count,
    GROUP_CONCAT(DISTINCT f.file_role) AS file_roles,
    MAX(CASE WHEN rp.id IS NULL THEN 0 ELSE 1 END) AS has_release_package,
    MAX(CASE WHEN il.id IS NULL THEN 0 ELSE 1 END) AS has_active_lock
  FROM submissions s
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  LEFT JOIN submission_files f ON f.submission_id = s.id
  LEFT JOIN release_packages rp ON rp.submission_id = s.id
  LEFT JOIN item_locks il ON il.item_id = s.item_id AND il.expires_at > :now
  LEFT JOIN file_references r ON r.submission_id = s.id
  WHERE __SEARCH_WHERE__
  GROUP BY
    s.id,
    s.company_id,
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
    s.resolved_by_submission_id,
    s.resolved_at,
    s.corrects_submission_id,
    i.part_number,
    i.part_name,
    u.display_name
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT :limit
`;

export const SELECT_ASYNC_SUBMISSION_SEARCH_POSTGRES = `
  SELECT
    s.id,
    s.company_id,
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
    s.resolved_by_submission_id,
    s.resolved_at,
    s.corrects_submission_id,
    i.part_number,
    i.part_name,
    u.display_name AS submitted_by_name,
    COUNT(DISTINCT f.id) AS file_count,
    STRING_AGG(DISTINCT f.file_role, ',') AS file_roles,
    MAX(CASE WHEN rp.id IS NULL THEN 0 ELSE 1 END) AS has_release_package,
    MAX(CASE WHEN il.id IS NULL THEN 0 ELSE 1 END) AS has_active_lock
  FROM submissions s
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  LEFT JOIN submission_files f ON f.submission_id = s.id
  LEFT JOIN release_packages rp ON rp.submission_id = s.id
  LEFT JOIN item_locks il ON il.item_id = s.item_id AND il.expires_at > :now
  LEFT JOIN file_references r ON r.submission_id = s.id
  WHERE __SEARCH_WHERE__
  GROUP BY
    s.id,
    s.company_id,
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
    s.resolved_by_submission_id,
    s.resolved_at,
    s.corrects_submission_id,
    i.part_number,
    i.part_name,
    u.display_name
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT :limit
`;

export const SELECT_ASYNC_SUBMISSION_DETAIL_SQL = `
  SELECT
    s.*,
    i.part_number,
    i.part_name,
    u.display_name AS submitted_by_name,
    CASE WHEN rp.id IS NULL THEN 0 ELSE 1 END AS has_release_package
  FROM submissions s
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  LEFT JOIN release_packages rp ON rp.submission_id = s.id
  WHERE s.id = :id
`;

export const SELECT_ASYNC_SUBMISSION_SNAPSHOT_SQL = `
  SELECT snapshot_json
  FROM submission_snapshots
  WHERE submission_id = :id
  LIMIT 1
`;

export const SELECT_ASYNC_DESIGN_REUSE_CANDIDATES_SQLITE = `
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
    0 AS has_release_package,
    0 AS has_active_lock,
    GROUP_CONCAT(DISTINCT f.original_filename) AS file_names
  FROM submissions s
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  LEFT JOIN submission_files f ON f.submission_id = s.id
  WHERE s.id <> :submissionId
    AND (:submittedBy IS NULL OR s.submitted_by = :submittedBy)
  GROUP BY
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
    u.display_name
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT 300
`;

export const SELECT_ASYNC_DESIGN_REUSE_CANDIDATES_POSTGRES = `
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
    STRING_AGG(DISTINCT f.file_role, ',') AS file_roles,
    0 AS has_release_package,
    0 AS has_active_lock,
    STRING_AGG(DISTINCT f.original_filename, ',') AS file_names
  FROM submissions s
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  LEFT JOIN submission_files f ON f.submission_id = s.id
  WHERE s.id <> :submissionId
    AND (:submittedBy IS NULL OR s.submitted_by = :submittedBy)
  GROUP BY
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
    u.display_name
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT 300
`;

export const SELECT_ASYNC_DUPLICATE_GEOMETRY_CANDIDATES_SQLITE = `
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
    0 AS has_release_package,
    0 AS has_active_lock,
    GROUP_CONCAT(DISTINCT f.file_role || ':' || f.original_filename || ':' || f.sha256 || ':' || f.file_size) AS file_fingerprints
  FROM submissions s
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  LEFT JOIN submission_files f ON f.submission_id = s.id
  WHERE s.id <> :submissionId
    AND (:submittedBy IS NULL OR s.submitted_by = :submittedBy)
  GROUP BY
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
    u.display_name
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT 400
`;

export const SELECT_ASYNC_DUPLICATE_GEOMETRY_CANDIDATES_POSTGRES = `
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
    STRING_AGG(DISTINCT f.file_role, ',') AS file_roles,
    0 AS has_release_package,
    0 AS has_active_lock,
    STRING_AGG(DISTINCT f.file_role || ':' || f.original_filename || ':' || f.sha256 || ':' || f.file_size, ',') AS file_fingerprints
  FROM submissions s
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  LEFT JOIN submission_files f ON f.submission_id = s.id
  WHERE s.id <> :submissionId
    AND (:submittedBy IS NULL OR s.submitted_by = :submittedBy)
  GROUP BY
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
    u.display_name
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT 400
`;

export const SELECT_ASYNC_SUBMISSION_FILES_SQL = `
  SELECT *
  FROM submission_files
  WHERE submission_id = :id
  ORDER BY created_at ASC
`;

export const SELECT_ASYNC_SUBMISSION_REFERENCES_SQL = `
  SELECT *
  FROM file_references
  WHERE submission_id = :id
  ORDER BY source_filename, referenced_filename
`;

export const SELECT_ASYNC_SUBMISSION_APPROVALS_SQL = `
  SELECT a.*, u.display_name AS reviewer_name
  FROM approval_steps a
  JOIN users u ON u.id = a.reviewer_id
  WHERE a.submission_id = :id
  ORDER BY a.sequence_no, a.decided_at
`;

export const SELECT_ASYNC_SUBMISSION_AUDIT_LOGS_SQL = `
  SELECT id, actor_id, action, detail_json, created_at
  FROM audit_logs
  WHERE submission_id = :id
  ORDER BY created_at DESC
`;

export const SELECT_ASYNC_SUBMISSION_LIFECYCLE_REQUESTS_SQL = `
  SELECT
    r.*,
    requester.display_name AS requested_by_name,
    decider.display_name AS decided_by_name
  FROM submission_lifecycle_requests r
  JOIN users requester ON requester.id = r.requested_by
  LEFT JOIN users decider ON decider.id = r.decided_by
  WHERE r.submission_id = :id
  ORDER BY
    CASE r.request_status WHEN 'pending' THEN 0 ELSE 1 END,
    r.created_at DESC,
    r.id DESC
`;

export const SELECT_ASYNC_SUBMISSION_ACTIVE_LOCK_SQL = `
  SELECT
    l.*,
    i.part_number,
    i.part_name,
    u.display_name AS locked_by_name
  FROM item_locks l
  JOIN items i ON i.id = l.item_id
  JOIN users u ON u.id = l.locked_by
  WHERE l.item_id = :itemId
    AND l.released_at IS NULL
    AND l.expires_at > :now
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT 1
`;

export const SELECT_ASYNC_SUBMISSION_RELEASE_PACKAGE_SQL = `
  SELECT *
  FROM release_packages
  WHERE submission_id = :id
`;

export const SELECT_ASYNC_SUBMISSION_BOM_HEADER_SQL = `
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
  WHERE h.parent_submission_id = :id
`;

export const SELECT_ASYNC_SUBMISSION_BOM_LINES_SQL = `
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
      COALESCE(cs.released_at, cs.updated_at, cs.created_at) DESC,
      cs.id DESC
    LIMIT 1
  )
  LEFT JOIN submissions latest_any ON latest_any.id = (
    SELECT la.id
    FROM submissions la
    WHERE la.item_id = child_i.id
    ORDER BY COALESCE(la.released_at, la.updated_at, la.created_at) DESC, la.id DESC
    LIMIT 1
  )
  LEFT JOIN submissions latest_released ON latest_released.id = (
    SELECT lr.id
    FROM submissions lr
    WHERE lr.item_id = child_i.id
      AND lr.status = 'Released'
    ORDER BY COALESCE(lr.released_at, lr.updated_at, lr.created_at) DESC, lr.id DESC
    LIMIT 1
  )
  WHERE l.bom_header_id = :bomHeaderId
  ORDER BY l.line_no ASC
`;

export class AsyncSubmissionListRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async listSubmissions(input: ListSubmissionsAsyncInput = {}): Promise<SubmissionSummary[]> {
    const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 500) : 500;
    const offset = Math.max(input.offset ?? 0, 0);
    const sql = this.client.kind === "postgres" ? SELECT_ASYNC_SUBMISSION_SUMMARIES_POSTGRES : SELECT_ASYNC_SUBMISSION_SUMMARIES_SQLITE;
    const rows = await this.client.query<SubmissionSummaryRow>(sql, {
      now: new Date().toISOString(),
      status: input.status ?? null,
      includeHistory: input.includeHistory ? 1 : 0,
      submittedBy: input.submittedBy ?? null,
      companyId: input.companyId ?? null,
      limit,
      offset
    });

    return rows.map(normalizeSubmissionSummaryRow);
  }

  async searchSubmissions(input: SearchSubmissionsAsyncInput = {}): Promise<SubmissionSummary[]> {
    const query = (input.query ?? "").trim();
    const normalizedFilters = normalizeSearchFilters({ ...(input.filters ?? {}), status: input.filters?.status ?? input.status });
    if (!query && Object.keys(normalizedFilters).length === 0) return [];

    const { whereSql, params } = buildSearchWhere(input, normalizedFilters, query);
    const template = this.client.kind === "postgres" ? SELECT_ASYNC_SUBMISSION_SEARCH_POSTGRES : SELECT_ASYNC_SUBMISSION_SEARCH_SQLITE;
    const sql = template.replace("__SEARCH_WHERE__", whereSql);
    const rows = await this.client.query<SubmissionSummaryRow>(sql, {
      ...params,
      now: new Date().toISOString(),
      limit: Math.min(Math.max(input.limit ?? 25, 1), 100)
    });

    return rows.map(normalizeSubmissionSummaryRow);
  }

  async getSubmission(id: string): Promise<SubmissionDetail | null> {
    const row = await this.client.queryOne<SubmissionDetailRow>(SELECT_ASYNC_SUBMISSION_DETAIL_SQL, { id });
    if (!row) return null;

    const [files, references, approvals, auditLogs, lifecycleRequests, activeLock, releasePackage, bom, snapshot] = await Promise.all([
      this.client.query<SubmissionFile>(SELECT_ASYNC_SUBMISSION_FILES_SQL, { id }),
      this.client.query<FileReference>(SELECT_ASYNC_SUBMISSION_REFERENCES_SQL, { id }),
      this.client.query<SubmissionDetail["approvals"][number]>(SELECT_ASYNC_SUBMISSION_APPROVALS_SQL, { id }),
      this.client.query<SubmissionDetail["audit_logs"][number]>(SELECT_ASYNC_SUBMISSION_AUDIT_LOGS_SQL, { id }),
      this.client.query<SubmissionLifecycleRequest>(SELECT_ASYNC_SUBMISSION_LIFECYCLE_REQUESTS_SQL, { id }),
      this.client.queryOne<ItemLock>(SELECT_ASYNC_SUBMISSION_ACTIVE_LOCK_SQL, {
        itemId: row.item_id,
        now: new Date().toISOString()
      }),
      this.client.queryOne<ReleasePackage>(SELECT_ASYNC_SUBMISSION_RELEASE_PACKAGE_SQL, { id }),
      this.getSubmissionBom(id),
      this.client.queryOne<SubmissionSnapshotRow>(SELECT_ASYNC_SUBMISSION_SNAPSHOT_SQL, { id })
    ]);
    const fileRoles = [...new Set(files.map((file) => file.file_role))].join(",");
    const normalizedFiles = files.map(normalizeSubmissionFile);

    return {
      ...row,
      file_count: normalizedFiles.length,
      file_roles: fileRoles || null,
      has_release_package: Number(row.has_release_package ?? 0),
      files: normalizedFiles,
      references: references.map(normalizeFileReference),
      revision_package: buildSubmissionRevisionPackage(snapshot, normalizedFiles, row),
      bom,
      active_lock: activeLock,
      release_package: releasePackage,
      approvals: approvals.map(normalizeApproval),
      audit_logs: auditLogs,
      lifecycle_requests: lifecycleRequests
    };
  }

  async listDesignReuseCandidates(input: {
    submissionId: string;
    submittedBy?: string;
    limit?: number;
  }): Promise<DesignReuseCandidate[]> {
    const source = await this.getSubmission(input.submissionId);
    if (!source) return [];

    const sql =
      this.client.kind === "postgres"
        ? SELECT_ASYNC_DESIGN_REUSE_CANDIDATES_POSTGRES
        : SELECT_ASYNC_DESIGN_REUSE_CANDIDATES_SQLITE;
    const rows = await this.client.query<ReuseCandidateRow>(sql, {
      submissionId: source.id,
      submittedBy: input.submittedBy ?? null
    });
    const sourceFiles = source.files.map((file) => file.original_filename);
    const candidates = rows
      .map((row) => scoreDesignReuseCandidate(source, sourceFiles, normalizeReuseCandidateRow(row)))
      .filter((candidate): candidate is DesignReuseCandidate => Boolean(candidate))
      .sort((a, b) => b.score - a.score || Date.parse(b.created_at) - Date.parse(a.created_at));

    return candidates.slice(0, Math.min(Math.max(input.limit ?? 6, 1), 20));
  }

  async listDuplicateGeometryCandidates(input: {
    submissionId: string;
    submittedBy?: string;
    limit?: number;
  }): Promise<DuplicateGeometryCandidate[]> {
    const source = await this.getSubmission(input.submissionId);
    if (!source) return [];

    const sql =
      this.client.kind === "postgres"
        ? SELECT_ASYNC_DUPLICATE_GEOMETRY_CANDIDATES_POSTGRES
        : SELECT_ASYNC_DUPLICATE_GEOMETRY_CANDIDATES_SQLITE;
    const rows = await this.client.query<DuplicateGeometryRow>(sql, {
      submissionId: source.id,
      submittedBy: input.submittedBy ?? null
    });
    const sourceFiles = source.files.map((file) => ({
      role: file.file_role,
      filename: file.original_filename,
      sha256: file.sha256,
      size: file.file_size
    }));
    const candidates = rows
      .map((row) => scoreDuplicateGeometryCandidate(source, sourceFiles, normalizeDuplicateGeometryRow(row)))
      .filter((candidate): candidate is DuplicateGeometryCandidate => Boolean(candidate))
      .sort((a, b) => b.fingerprint_score - a.fingerprint_score || Date.parse(b.created_at) - Date.parse(a.created_at));

    return candidates.slice(0, Math.min(Math.max(input.limit ?? 6, 1), 20));
  }

  private async getSubmissionBom(id: string): Promise<BomDetail | null> {
    const header = await this.client.queryOne<BomHeaderRow>(SELECT_ASYNC_SUBMISSION_BOM_HEADER_SQL, { id });
    if (!header) return null;

    const lines = await this.client.query<BomDetail["lines"][number]>(SELECT_ASYNC_SUBMISSION_BOM_LINES_SQL, {
      bomHeaderId: header.id
    });

    return {
      ...header,
      line_count: Number(header.line_count ?? lines.length),
      lines: lines.map((line) => ({
        ...line,
        line_no: Number(line.line_no),
        quantity: Number(line.quantity)
      }))
    };
  }
}

function normalizeSubmissionSummaryRow(row: SubmissionSummaryRow): SubmissionSummary {
  return {
    ...row,
    file_count: Number(row.file_count ?? 0),
    has_release_package: Number(row.has_release_package ?? 0),
    has_active_lock: Number(row.has_active_lock ?? 0)
  };
}

function normalizeReuseCandidateRow(row: ReuseCandidateRow): ReuseCandidateRow {
  return {
    ...row,
    file_count: Number(row.file_count ?? 0),
    has_release_package: Number(row.has_release_package ?? 0),
    has_active_lock: Number(row.has_active_lock ?? 0)
  };
}

function normalizeDuplicateGeometryRow(row: DuplicateGeometryRow): DuplicateGeometryRow {
  return {
    ...row,
    file_count: Number(row.file_count ?? 0),
    has_release_package: Number(row.has_release_package ?? 0),
    has_active_lock: Number(row.has_active_lock ?? 0)
  };
}

function normalizeSubmissionFile(file: SubmissionFile): SubmissionFile {
  return {
    ...file,
    file_size: Number(file.file_size ?? 0)
  };
}

const revisionPackageWarningCodes = new Set<RevisionPackageWarning["code"]>([
  "missing_pdf",
  "missing_dwg_dxf",
  "missing_3d_cad",
  "unknown_file_role",
  "filename_revision_mismatch",
  "duplicate_category"
]);

function buildSubmissionRevisionPackage(
  snapshotRow: SubmissionSnapshotRow | null,
  files: SubmissionFile[],
  row: Pick<SubmissionDetailRow, "drawing_number" | "revision">
): SubmissionDetail["revision_package"] {
  const snapshot = parseSnapshotJson(snapshotRow?.snapshot_json);
  const revisionPackage = snapshot && isRecord(snapshot.revisionPackage) ? snapshot.revisionPackage : null;
  if (!revisionPackage || !Array.isArray(revisionPackage.files)) return null;

  const generatedAttachments = Array.isArray(snapshot?.attachments) ? snapshot.attachments.filter(isRecord) : [];
  const packageFiles = revisionPackage.files
    .filter(isRecord)
    .map((file) => {
      const role = normalizeRevisionPackageFileRole(file.role);
      const defaultRole = normalizeRevisionPackageFileRole(file.defaultRole) ?? role;
      const filename = String(file.filename ?? "").trim();
      if (!filename || !role || !defaultRole) return null;
      const sourceAttachmentId = nullableSnapshotText(file.sourceAttachmentId);
      const generated = generatedAttachments.find((attachment) => {
        const generatedSourceId = nullableSnapshotText(attachment.sourceMasterAttachmentId);
        const generatedFilename = String(attachment.originalFilename ?? "").trim();
        return (sourceAttachmentId && generatedSourceId === sourceAttachmentId) || generatedFilename === filename;
      });
      const submissionFile =
        files.find((candidate) => candidate.id === nullableSnapshotText(generated?.submissionFileId)) ??
        files.find((candidate) => candidate.source_master_attachment_id && candidate.source_master_attachment_id === sourceAttachmentId) ??
        files.find((candidate) => candidate.original_filename === filename) ??
        null;
      return {
        source_attachment_id: sourceAttachmentId,
        submission_file_id: submissionFile?.id ?? nullableSnapshotText(generated?.submissionFileId),
        filename,
        default_role: defaultRole,
        role,
        source: file.source === "user" ? ("user" as const) : ("extension" as const)
      };
    })
    .filter((file): file is NonNullable<typeof file> => Boolean(file));

  const snapshotWarnings = normalizeSnapshotRevisionPackageWarnings(revisionPackage.warnings);
  const warnings =
    snapshotWarnings.length > 0
      ? snapshotWarnings
      : evaluateRevisionPackageCompleteness({
          drawingNumber: row.drawing_number,
          revision: row.revision,
          files: packageFiles.map((file) => ({
            id: file.submission_file_id ?? file.source_attachment_id ?? undefined,
            filename: file.filename,
            role: file.role
          }))
        });

  return {
    files: packageFiles,
    warnings
  };
}

function normalizeSnapshotRevisionPackageWarnings(value: unknown): RevisionPackageWarning[] {
  if (!Array.isArray(value)) return [];
  const warnings: RevisionPackageWarning[] = [];
  for (const rawWarning of value) {
    if (!isRecord(rawWarning)) continue;
    const code = String(rawWarning.code ?? "").trim();
    if (!revisionPackageWarningCodes.has(code as RevisionPackageWarning["code"])) continue;
    const messageForSubmitter = String(rawWarning.messageForSubmitter ?? "").trim();
    const messageForReviewer = String(rawWarning.messageForReviewer ?? "").trim();
    if (!messageForSubmitter || !messageForReviewer) continue;
    const affectedFileIds = Array.isArray(rawWarning.affectedFileIds)
      ? rawWarning.affectedFileIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    warnings.push({
      code: code as RevisionPackageWarning["code"],
      severity: "warning",
      ...(affectedFileIds.length > 0 ? { affectedFileIds } : {}),
      messageForSubmitter,
      messageForReviewer
    });
  }
  return warnings;
}

function parseSnapshotJson(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nullableSnapshotText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeFileReference(reference: FileReference): FileReference {
  return {
    ...reference,
    quantity: Number(reference.quantity ?? 0)
  };
}

function normalizeApproval(approval: SubmissionDetail["approvals"][number]): SubmissionDetail["approvals"][number] {
  return {
    ...approval,
    sequence_no: Number(approval.sequence_no)
  };
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

function normalizeSearchFilters(filters: SubmissionSearchFiltersAsync) {
  const normalized: SubmissionSearchFiltersAsync = {};
  for (const [key, value] of Object.entries(filters) as Array<[keyof SubmissionSearchFiltersAsync, string | undefined]>) {
    const trimmed = value?.trim();
    if (trimmed) normalized[key] = trimmed;
  }
  return normalized;
}

function toLike(value: string) {
  return `%${value.toLowerCase()}%`;
}

function addLikeFilter(filters: string[], params: Record<string, unknown>, column: string, paramName: string, value?: string) {
  if (!value) return;
  filters.push(`lower(${column}) LIKE :${paramName}`);
  params[paramName] = toLike(value);
}

function buildSearchWhere(input: SearchSubmissionsAsyncInput, normalizedFilters: SubmissionSearchFiltersAsync, query: string) {
  const filters: string[] = [];
  const params: Record<string, unknown> = {};

  if (query) {
    filters.push(`(
      lower(s.id) LIKE :queryLike
      OR lower(s.drawing_number) LIKE :queryLike
      OR lower(s.revision) LIKE :queryLike
      OR lower(s.product_line) LIKE :queryLike
      OR lower(s.customer) LIKE :queryLike
      OR lower(s.project_code) LIKE :queryLike
      OR lower(s.process_name) LIKE :queryLike
      OR lower(s.machine) LIKE :queryLike
      OR lower(s.material) LIKE :queryLike
      OR lower(s.surface_finish) LIKE :queryLike
      OR lower(s.document_type) LIKE :queryLike
      OR lower(s.change_description) LIKE :queryLike
      OR lower(s.status) LIKE :queryLike
      OR lower(i.part_number) LIKE :queryLike
      OR lower(i.part_name) LIKE :queryLike
      OR lower(u.display_name) LIKE :queryLike
      OR lower(f.original_filename) LIKE :queryLike
      OR lower(r.referenced_filename) LIKE :queryLike
    )`);
    params.queryLike = toLike(query);
  }

  if (normalizedFilters.status && normalizedFilters.status !== "All") {
    filters.push("s.status = :status");
    params.status = normalizedFilters.status;
  } else if (!input.includeHistory) {
    filters.push("s.status <> 'Obsolete'");
  }
  if (!input.includeHistory) {
    filters.push("(s.status <> 'ReleaseFailed' OR s.resolved_by_submission_id IS NULL)");
  }
  if (input.submittedBy) {
    filters.push("s.submitted_by = :submittedBy");
    params.submittedBy = input.submittedBy;
  }
  if (input.companyId) {
    filters.push("s.company_id = :companyId");
    params.companyId = input.companyId;
  }
  addLikeFilter(filters, params, "s.product_line", "productLineLike", normalizedFilters.productLine);
  addLikeFilter(filters, params, "s.customer", "customerLike", normalizedFilters.customer);
  addLikeFilter(filters, params, "s.project_code", "projectCodeLike", normalizedFilters.projectCode);
  addLikeFilter(filters, params, "s.process_name", "processNameLike", normalizedFilters.processName);
  addLikeFilter(filters, params, "s.machine", "machineLike", normalizedFilters.machine);
  addLikeFilter(filters, params, "s.material", "materialLike", normalizedFilters.material);
  addLikeFilter(filters, params, "s.surface_finish", "surfaceFinishLike", normalizedFilters.surfaceFinish);
  addLikeFilter(filters, params, "s.drawing_number", "parentDrawingLike", normalizedFilters.parentDrawing);

  if (normalizedFilters.childDrawingNumber) {
    filters.push(`(
      lower(r.referenced_drawing_number) LIKE :childDrawingLike
      OR EXISTS (
        SELECT 1
        FROM bom_headers child_drawing_bh
        JOIN bom_lines child_drawing_bl ON child_drawing_bl.bom_header_id = child_drawing_bh.id
        JOIN items child_drawing_i ON upper(child_drawing_i.part_number) = upper(child_drawing_bl.child_part_number)
        JOIN submissions child_drawing_s ON child_drawing_s.item_id = child_drawing_i.id
        WHERE child_drawing_bh.parent_submission_id = s.id
          AND child_drawing_i.company_id = s.company_id
          AND (child_drawing_bl.child_revision IS NULL OR upper(child_drawing_s.revision) = upper(child_drawing_bl.child_revision))
          AND child_drawing_s.company_id = s.company_id
          AND lower(child_drawing_s.drawing_number) LIKE :childDrawingLike
      )
    )`);
    params.childDrawingLike = toLike(normalizedFilters.childDrawingNumber);
  }

  if (normalizedFilters.childPartNumber) {
    filters.push(`(
      lower(r.referenced_part_number) LIKE :childPartLike
      OR EXISTS (
        SELECT 1
        FROM bom_headers child_bh
        JOIN bom_lines child_bl ON child_bl.bom_header_id = child_bh.id
        WHERE child_bh.parent_submission_id = s.id
          AND lower(child_bl.child_part_number) LIKE :childPartLike
      )
    )`);
    params.childPartLike = toLike(normalizedFilters.childPartNumber);
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
          COALESCE(cs.released_at, cs.updated_at, cs.created_at) DESC,
          cs.id DESC
        LIMIT 1
      )
        WHERE issue_bh.parent_submission_id = s.id
          AND issue_i.company_id = s.company_id
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
          AND lr.company_id = s.company_id
          AND lr.status = 'Released'
        ORDER BY COALESCE(lr.released_at, lr.updated_at, lr.created_at) DESC, lr.id DESC
        LIMIT 1
      )
      WHERE issue_bh.parent_submission_id = s.id
        AND issue_i.company_id = s.company_id
        AND issue_bl.child_revision IS NOT NULL
        AND upper(issue_bl.child_revision) <> upper(latest_released.revision)
    )`);
  }

  return {
    whereSql: filters.length > 0 ? filters.join(" AND ") : "1 = 1",
    params
  };
}
