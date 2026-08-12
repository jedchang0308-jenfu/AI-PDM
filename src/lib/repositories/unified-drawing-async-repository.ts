import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export const UNIFIED_DRAWING_LIFECYCLE_STATES = [
  "building",
  "drawing_preparation",
  "bundle_ready",
  "in_review",
  "auto_finalizing",
  "recovery_required",
  "rd_controlled",
  "released",
  "obsolete",
  "merged",
  "cancelled"
] as const;

export type UnifiedDrawingLifecycleState = typeof UNIFIED_DRAWING_LIFECYCLE_STATES[number];
export type UnifiedDrawingRevisionLifecycleState =
  | "preparing"
  | "in_review"
  | "correction_required"
  | "rd_controlled"
  | "released"
  | "superseded"
  | "cancelled";

type UnifiedDrawingRow = {
  id: string;
  company_id: string;
  drawing_number: string | null;
  lifecycle_state: UnifiedDrawingLifecycleState;
  workspace_id: string | null;
  drawing_draft_id: string | null;
  candidate_reservation_id: string | null;
  formal_drawing_number_id: string | null;
  part_root_id: string | null;
  purpose_code: "MA" | "OT" | "M" | "R" | null;
  purpose_description: string;
  sequence_no: number | string | null;
  is_primary_manufacturing: number | boolean;
  owner_id: string | null;
  rule_version_id: string | null;
  row_version: number | string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  controlled_at: string | null;
  released_at: string | null;
  terminal_at: string | null;
};

type WorkspaceDrawingSourceRow = {
  drawing_draft_id: string;
  company_id: string;
  workspace_id: string;
  workspace_lifecycle_status: "active" | "cancelled" | "published";
  workspace_owner_id: string;
  workspace_created_by: string;
  workspace_created_at: string;
  workspace_updated_at: string;
  purpose_code: "MA" | "OT" | "M" | "R";
  purpose_description: string;
  is_primary_manufacturing: number | boolean;
  draft_updated_at: string;
  reservation_id: string | null;
  candidate_code: string | null;
  sequence_no: number | string | null;
  reservation_state: string | null;
  reservation_updated_at: string | null;
  promoted_master_id: string | null;
  candidate_revision_id: string | null;
  revision: string | null;
  policy_snapshot_json: string | Record<string, unknown> | null;
  override_reason: string | null;
  candidate_lifecycle_status: "draft" | "review_locked" | "promoted" | "cancelled" | null;
  candidate_row_version: number | string | null;
  approval_request_id: string | null;
  review_snapshot_hash: string | null;
  approval_request_status: string | null;
  formal_drawing_number_id: string | null;
  formal_revision_package_id: string | null;
  candidate_created_by: string | null;
  candidate_created_at: string | null;
  candidate_updated_by: string | null;
  candidate_updated_at: string | null;
  candidate_promoted_at: string | null;
  candidate_cancelled_at: string | null;
  formal_part_root_id: string | null;
  formal_rule_version_id: string | null;
  formal_record_status: string | null;
  formal_updated_at: string | null;
  package_status: string | null;
  package_lifecycle_state: string | null;
  package_released_at: string | null;
  package_updated_at: string | null;
  active_file_count: number | string;
  evidenced_primary_file_count: number | string;
};

type CandidateFileSourceRow = {
  id: string;
  company_id: string;
  candidate_revision_id: string;
  source_file_asset_id: string;
  role: "cad_3d" | "drawing_2d" | "intermediate" | "pdf" | "dwg_dxf" | "other";
  role_source: "extension" | "user" | "migration" | "system";
  display_name: string;
  description: string;
  sort_order: number | string;
  is_primary: number | boolean;
  removed_at: string | null;
  removed_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type PackageFileSourceRow = {
  id: string;
  package_id: string;
  source_file_asset_id: string;
  role: CandidateFileSourceRow["role"];
  role_source: CandidateFileSourceRow["role_source"];
  display_name: string;
  description: string;
  sort_order: number | string;
  is_primary: number | boolean;
  created_by: string | null;
  created_at: string;
};

type FormalDrawingSourceRow = {
  id: string;
  company_id: string;
  drawing_number: string;
  part_root_id: string;
  purpose_code: "MA" | "OT" | "M" | "R";
  purpose_description: string;
  sequence_no: number | string;
  is_primary_manufacturing: number | boolean;
  record_status: string;
  rule_version_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  drawing_draft_id: string | null;
  workspace_id: string | null;
  reservation_id: string | null;
  owner_id: string | null;
};

type FormalRevisionSourceRow = {
  package_id: string;
  company_id: string;
  drawing_number_id: string;
  revision: string;
  status: string;
  lifecycle_state: string | null;
  active_correction_reason: string | null;
  snapshot_json: string | Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  released_at: string | null;
  cancelled_at: string | null;
  candidate_revision_id: string | null;
  approval_request_id: string | null;
  review_snapshot_hash: string | null;
};

export type UnifiedDrawingRecord = {
  id: string;
  companyId: string;
  drawingNumber: string | null;
  lifecycleState: UnifiedDrawingLifecycleState;
  workspaceId: string | null;
  drawingDraftId: string | null;
  candidateReservationId: string | null;
  formalDrawingNumberId: string | null;
  partRootId: string | null;
  purposeCode: UnifiedDrawingRow["purpose_code"];
  purposeDescription: string;
  sequenceNo: number | null;
  isPrimaryManufacturing: boolean;
  ownerId: string | null;
  ruleVersionId: string | null;
  rowVersion: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  controlledAt: string | null;
  releasedAt: string | null;
  terminalAt: string | null;
};

const controlledRevisionStates = new Set<UnifiedDrawingRevisionLifecycleState>([
  "rd_controlled",
  "released",
  "superseded"
]);

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: number | boolean) {
  return value === true || Number(value) === 1;
}

function asJson(value: string | Record<string, unknown> | null | undefined) {
  if (!value) return "{}";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function mapDrawing(row: UnifiedDrawingRow): UnifiedDrawingRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    drawingNumber: row.drawing_number,
    lifecycleState: row.lifecycle_state,
    workspaceId: row.workspace_id,
    drawingDraftId: row.drawing_draft_id,
    candidateReservationId: row.candidate_reservation_id,
    formalDrawingNumberId: row.formal_drawing_number_id,
    partRootId: row.part_root_id,
    purposeCode: row.purpose_code,
    purposeDescription: row.purpose_description,
    sequenceNo: toNumber(row.sequence_no),
    isPrimaryManufacturing: toBoolean(row.is_primary_manufacturing),
    ownerId: row.owner_id,
    ruleVersionId: row.rule_version_id,
    rowVersion: Number(row.row_version),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    controlledAt: row.controlled_at,
    releasedAt: row.released_at,
    terminalAt: row.terminal_at
  };
}

function revisionLifecycleFromSource(input: {
  candidateStatus?: WorkspaceDrawingSourceRow["candidate_lifecycle_status"];
  packageStatus?: string | null;
  packageLifecycle?: string | null;
}): UnifiedDrawingRevisionLifecycleState {
  if (input.packageLifecycle === "released" || input.packageStatus === "Released") return "released";
  if (input.packageLifecycle === "rd_controlled" || input.candidateStatus === "promoted") return "rd_controlled";
  if (input.packageLifecycle === "correction_required" || input.packageStatus === "Rejected") return "correction_required";
  if (input.packageLifecycle === "in_review" || input.packageStatus === "Pending" || input.candidateStatus === "review_locked") return "in_review";
  if (input.packageStatus === "Cancelled" || input.candidateStatus === "cancelled") return "cancelled";
  return "preparing";
}

function drawingLifecycleFromWorkspace(row: WorkspaceDrawingSourceRow): UnifiedDrawingLifecycleState {
  if (row.formal_record_status === "Obsolete") return "obsolete";
  if (row.formal_record_status === "Merged") return "merged";
  const revisionState = revisionLifecycleFromSource({
    candidateStatus: row.candidate_lifecycle_status,
    packageStatus: row.package_status,
    packageLifecycle: row.package_lifecycle_state
  });
  if (row.formal_record_status === "Released" || revisionState === "released") return "released";
  if (revisionState === "rd_controlled" || row.formal_drawing_number_id || row.promoted_master_id) return "rd_controlled";
  if (row.workspace_lifecycle_status === "cancelled" || revisionState === "cancelled") return "cancelled";
  if (row.approval_request_status === "apply_failed") return "recovery_required";
  if (revisionState === "in_review") return "in_review";
  if (revisionState === "correction_required") return "drawing_preparation";
  if (row.candidate_revision_id && Number(row.evidenced_primary_file_count) >= 2) return "bundle_ready";
  if (row.candidate_revision_id || row.reservation_id) return "drawing_preparation";
  return "building";
}

function drawingLifecycleFromFormal(row: FormalDrawingSourceRow, revisions: FormalRevisionSourceRow[]) {
  if (row.record_status === "Obsolete") return "obsolete" as const;
  if (row.record_status === "Merged") return "merged" as const;
  if (["Draft", "NeedInfo", "Rejected"].includes(row.record_status)) return "drawing_preparation" as const;
  if (row.record_status === "PendingReview") return "in_review" as const;
  const latest = revisions[0];
  const revisionState = latest
    ? revisionLifecycleFromSource({
        packageStatus: latest.status,
        packageLifecycle: latest.lifecycle_state,
        candidateStatus: latest.candidate_revision_id ? "promoted" : null
      })
    : null;
  if (row.record_status === "Released" || revisionState === "released") return "released" as const;
  if (revisionState === "in_review") return "in_review" as const;
  if (revisionState === "correction_required") return "drawing_preparation" as const;
  return "rd_controlled" as const;
}

export class UnifiedDrawingAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async findByIdOrFormalId(input: { drawingId: string; companyId: string }) {
    const row = await this.client.queryOne<UnifiedDrawingRow>(
      `SELECT * FROM drawings
       WHERE company_id = :companyId
         AND (id = :drawingId OR formal_drawing_number_id = :drawingId)
       ORDER BY CASE WHEN id = :drawingId THEN 0 ELSE 1 END, id
       LIMIT 1`,
      input
    );
    return row ? mapDrawing(row) : null;
  }

  async findFirstByWorkspace(input: { workspaceId: string; companyId: string }) {
    const row = await this.client.queryOne<UnifiedDrawingRow>(
      `SELECT * FROM drawings
       WHERE company_id = :companyId AND workspace_id = :workspaceId
       ORDER BY CASE WHEN drawing_number IS NULL THEN 1 ELSE 0 END, drawing_number, id
       LIMIT 1`,
      input
    );
    return row ? mapDrawing(row) : null;
  }

  async getByIds(drawingIds: string[], companyId: string) {
    if (drawingIds.length === 0) return [];
    const params: Record<string, unknown> = { companyId };
    const placeholders = drawingIds.map((id, index) => {
      params[`drawingId${index}`] = id;
      return `:drawingId${index}`;
    });
    const rows = await this.client.query<UnifiedDrawingRow>(
      `SELECT * FROM drawings
       WHERE company_id = :companyId AND id IN (${placeholders.join(", ")})`,
      params
    );
    return rows.map(mapDrawing);
  }

  async synchronizeWorkspace(input: { workspaceId: string; companyId: string }) {
    const rows = await this.client.query<WorkspaceDrawingSourceRow>(
      `SELECT
         draft.id AS drawing_draft_id,
         draft.company_id,
         draft.workspace_id,
         workspace.lifecycle_status AS workspace_lifecycle_status,
         workspace.owner_id AS workspace_owner_id,
         workspace.created_by AS workspace_created_by,
         workspace.created_at AS workspace_created_at,
         workspace.updated_at AS workspace_updated_at,
         draft.purpose_code,
         draft.purpose_description,
         draft.is_primary_manufacturing,
         draft.updated_at AS draft_updated_at,
         reservation.id AS reservation_id,
         reservation.candidate_code,
         reservation.sequence_no,
         reservation.reservation_state,
         reservation.updated_at AS reservation_updated_at,
         CASE WHEN reservation.promoted_master_type = 'drawing_number' THEN reservation.promoted_master_id END AS promoted_master_id,
         candidate.id AS candidate_revision_id,
         candidate.revision,
         candidate.policy_snapshot_json,
         candidate.override_reason,
         candidate.lifecycle_status AS candidate_lifecycle_status,
         candidate.row_version AS candidate_row_version,
         candidate.approval_request_id,
         candidate.review_snapshot_hash,
         request.request_status AS approval_request_status,
         candidate.formal_drawing_number_id,
         candidate.formal_revision_package_id,
         candidate.created_by AS candidate_created_by,
         candidate.created_at AS candidate_created_at,
         candidate.updated_by AS candidate_updated_by,
         candidate.updated_at AS candidate_updated_at,
         candidate.promoted_at AS candidate_promoted_at,
         candidate.cancelled_at AS candidate_cancelled_at,
         formal.part_root_id AS formal_part_root_id,
         formal.rule_version_id AS formal_rule_version_id,
         formal.record_status AS formal_record_status,
         formal.updated_at AS formal_updated_at,
         package.status AS package_status,
         package.lifecycle_state AS package_lifecycle_state,
         package.released_at AS package_released_at,
         package.updated_at AS package_updated_at,
         (SELECT COUNT(*) FROM numbering_candidate_revision_files file
          WHERE file.candidate_revision_id = candidate.id AND file.removed_at IS NULL) AS active_file_count,
         (SELECT COUNT(*) FROM numbering_candidate_revision_files file
          WHERE file.candidate_revision_id = candidate.id AND file.removed_at IS NULL
            AND file.is_primary = 1 AND file.publication_evidence_id IS NOT NULL
            AND file.role IN ('drawing_2d', 'cad_3d')) AS evidenced_primary_file_count
       FROM numbering_draft_drawings draft
       JOIN numbering_draft_workspaces workspace
         ON workspace.id = draft.workspace_id AND workspace.company_id = draft.company_id
       LEFT JOIN number_candidate_reservations reservation
         ON reservation.id = draft.candidate_reservation_id AND reservation.company_id = draft.company_id
       LEFT JOIN numbering_candidate_revision_drafts candidate
         ON candidate.drawing_draft_id = draft.id AND candidate.company_id = draft.company_id
       LEFT JOIN drawing_numbers formal
         ON formal.id = COALESCE(candidate.formal_drawing_number_id,
           CASE WHEN reservation.promoted_master_type = 'drawing_number' THEN reservation.promoted_master_id END)
       LEFT JOIN drawing_revision_packages package ON package.id = candidate.formal_revision_package_id
       LEFT JOIN approval_platform_requests request ON request.id = candidate.approval_request_id
       WHERE draft.workspace_id = :workspaceId AND draft.company_id = :companyId
       ORDER BY draft.created_at, draft.id`,
      input
    );

    for (const row of rows) await this.synchronizeWorkspaceDrawing(row);
    return this.getByIds(rows.map((row) => `drawing-${row.drawing_draft_id}`), input.companyId);
  }

  async synchronizeFormalDrawing(input: { drawingNumberId: string; companyId: string }) {
    const formal = await this.client.queryOne<FormalDrawingSourceRow>(
      `SELECT
         formal.*,
         reservation.draft_item_id AS drawing_draft_id,
         reservation.workspace_id,
         reservation.id AS reservation_id,
         workspace.owner_id
       FROM drawing_numbers formal
       LEFT JOIN number_candidate_reservations reservation
         ON reservation.company_id = formal.company_id
        AND reservation.promoted_master_type = 'drawing_number'
        AND reservation.promoted_master_id = formal.id
       LEFT JOIN numbering_draft_workspaces workspace
         ON workspace.id = reservation.workspace_id AND workspace.company_id = reservation.company_id
       WHERE formal.id = :drawingNumberId AND formal.company_id = :companyId
       ORDER BY reservation.promoted_at DESC, reservation.id DESC
       LIMIT 1`,
      input
    );
    if (!formal) return null;

    const revisions = await this.client.query<FormalRevisionSourceRow>(
      `SELECT
         package.id AS package_id,
         package.company_id,
         package.drawing_number_id,
         package.revision,
         package.status,
         package.lifecycle_state,
         package.active_correction_reason,
         package.snapshot_json,
         package.created_by,
         package.created_at,
         package.updated_at,
         package.submitted_at,
         package.released_at,
         package.cancelled_at,
         candidate.id AS candidate_revision_id,
         candidate.approval_request_id,
         candidate.review_snapshot_hash
       FROM drawing_revision_packages package
       LEFT JOIN numbering_candidate_revision_drafts candidate
         ON candidate.formal_revision_package_id = package.id AND candidate.company_id = package.company_id
       WHERE package.drawing_number_id = :drawingNumberId AND package.company_id = :companyId
       ORDER BY package.updated_at DESC, package.id DESC`,
      input
    );
    const existing = await this.findByIdOrFormalId({ drawingId: formal.id, companyId: formal.company_id });
    const drawingId = existing?.id ?? (formal.drawing_draft_id ? `drawing-${formal.drawing_draft_id}` : `drawing-formal-${formal.id}`);
    const lifecycleState = drawingLifecycleFromFormal(formal, revisions);
    await this.upsertDrawing({
      id: drawingId,
      companyId: formal.company_id,
      drawingNumber: formal.drawing_number,
      lifecycleState,
      workspaceId: formal.workspace_id,
      drawingDraftId: formal.drawing_draft_id,
      reservationId: formal.reservation_id,
      formalDrawingNumberId: formal.id,
      partRootId: formal.part_root_id,
      purposeCode: formal.purpose_code,
      purposeDescription: formal.purpose_description,
      sequenceNo: Number(formal.sequence_no),
      primary: toBoolean(formal.is_primary_manufacturing),
      ownerId: formal.owner_id,
      ruleVersionId: formal.rule_version_id,
      createdBy: formal.created_by,
      createdAt: formal.created_at,
      updatedAt: formal.updated_at,
      controlledAt: lifecycleState === "rd_controlled" ? formal.updated_at : null,
      releasedAt: lifecycleState === "released" ? revisions[0]?.released_at ?? formal.updated_at : null,
      terminalAt: ["obsolete", "merged"].includes(lifecycleState) ? formal.updated_at : null
    });

    for (const revision of revisions) await this.synchronizeFormalRevision(drawingId, revision);
    return this.findByIdOrFormalId({ drawingId, companyId: formal.company_id });
  }

  private async synchronizeWorkspaceDrawing(row: WorkspaceDrawingSourceRow) {
    const drawingId = `drawing-${row.drawing_draft_id}`;
    const lifecycleState = drawingLifecycleFromWorkspace(row);
    const formalDrawingNumberId = row.formal_drawing_number_id ?? row.promoted_master_id;
    const updatedAt = [row.workspace_updated_at, row.draft_updated_at, row.reservation_updated_at, row.candidate_updated_at, row.formal_updated_at]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? row.workspace_updated_at;
    await this.upsertDrawing({
      id: drawingId,
      companyId: row.company_id,
      drawingNumber: row.candidate_code,
      lifecycleState,
      workspaceId: row.workspace_id,
      drawingDraftId: row.drawing_draft_id,
      reservationId: row.reservation_id,
      formalDrawingNumberId,
      partRootId: row.formal_part_root_id,
      purposeCode: row.purpose_code,
      purposeDescription: row.purpose_description,
      sequenceNo: toNumber(row.sequence_no),
      primary: toBoolean(row.is_primary_manufacturing),
      ownerId: row.workspace_owner_id,
      ruleVersionId: row.formal_rule_version_id,
      createdBy: row.workspace_created_by,
      createdAt: row.workspace_created_at,
      updatedAt,
      controlledAt: lifecycleState === "rd_controlled" ? row.candidate_promoted_at ?? row.package_updated_at ?? updatedAt : null,
      releasedAt: lifecycleState === "released" ? row.package_released_at ?? updatedAt : null,
      terminalAt: ["obsolete", "merged", "cancelled"].includes(lifecycleState) ? updatedAt : null
    });

    if (!row.candidate_revision_id || !row.revision) {
      if (formalDrawingNumberId) await this.synchronizeFormalDrawing({ drawingNumberId: formalDrawingNumberId, companyId: row.company_id });
      return;
    }
    const targetState = revisionLifecycleFromSource({
      candidateStatus: row.candidate_lifecycle_status,
      packageStatus: row.package_status,
      packageLifecycle: row.package_lifecycle_state
    });
    const revisionId = `drawing-revision-${row.candidate_revision_id}`;
    await this.upsertRevisionPreparing({
      id: revisionId,
      companyId: row.company_id,
      drawingId,
      revision: row.revision,
      policySnapshotJson: asJson(row.policy_snapshot_json),
      overrideReason: row.override_reason,
      rowVersion: Number(row.candidate_row_version ?? 1),
      approvalRequestId: row.approval_request_id,
      reviewSnapshotHash: row.review_snapshot_hash,
      candidateRevisionId: row.candidate_revision_id,
      packageId: row.formal_revision_package_id,
      createdBy: row.candidate_created_by,
      createdAt: row.candidate_created_at ?? row.workspace_created_at,
      updatedBy: row.candidate_updated_by,
      updatedAt: row.candidate_updated_at ?? updatedAt,
      submittedAt: row.candidate_lifecycle_status === "review_locked" ? row.candidate_updated_at : null,
      controlledAt: row.candidate_promoted_at,
      releasedAt: row.package_released_at,
      cancelledAt: row.candidate_cancelled_at
    });
    await this.synchronizeCandidateFiles(revisionId, row.company_id, row.candidate_revision_id);
    if (row.formal_revision_package_id) await this.synchronizePackageFiles(revisionId, row.company_id, row.formal_revision_package_id);
    await this.transitionRevision(revisionId, row.company_id, targetState, row.candidate_updated_by, updatedAt);
  }

  private async synchronizeFormalRevision(drawingId: string, row: FormalRevisionSourceRow) {
    const revisionId = row.candidate_revision_id
      ? `drawing-revision-${row.candidate_revision_id}`
      : `drawing-revision-package-${row.package_id}`;
    const targetState = revisionLifecycleFromSource({
      candidateStatus: row.candidate_revision_id ? "promoted" : null,
      packageStatus: row.status,
      packageLifecycle: row.lifecycle_state
    });
    await this.upsertRevisionPreparing({
      id: revisionId,
      companyId: row.company_id,
      drawingId,
      revision: row.revision,
      policySnapshotJson: asJson(row.snapshot_json),
      overrideReason: row.active_correction_reason,
      rowVersion: 1,
      approvalRequestId: row.approval_request_id,
      reviewSnapshotHash: row.review_snapshot_hash,
      candidateRevisionId: row.candidate_revision_id,
      packageId: row.package_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedBy: row.created_by,
      updatedAt: row.updated_at,
      submittedAt: row.submitted_at,
      controlledAt: targetState === "rd_controlled" ? row.updated_at : null,
      releasedAt: row.released_at,
      cancelledAt: row.cancelled_at
    });
    await this.synchronizePackageFiles(revisionId, row.company_id, row.package_id);
    await this.transitionRevision(revisionId, row.company_id, targetState, row.created_by, row.updated_at);
  }

  private async upsertDrawing(input: {
    id: string;
    companyId: string;
    drawingNumber: string | null;
    lifecycleState: UnifiedDrawingLifecycleState;
    workspaceId: string | null;
    drawingDraftId: string | null;
    reservationId: string | null;
    formalDrawingNumberId: string | null;
    partRootId: string | null;
    purposeCode: UnifiedDrawingRow["purpose_code"];
    purposeDescription: string;
    sequenceNo: number | null;
    primary: boolean;
    ownerId: string | null;
    ruleVersionId: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
    controlledAt: string | null;
    releasedAt: string | null;
    terminalAt: string | null;
  }) {
    await this.client.execute(
      `INSERT INTO drawings (
         id, company_id, drawing_number, lifecycle_state, workspace_id, drawing_draft_id,
         candidate_reservation_id, formal_drawing_number_id, part_root_id, purpose_code,
         purpose_description, sequence_no, is_primary_manufacturing, owner_id,
         rule_version_id, row_version, created_by, created_at, updated_at,
         controlled_at, released_at, terminal_at
       ) VALUES (
         :id, :companyId, :drawingNumber, :lifecycleState, :workspaceId, :drawingDraftId,
         :reservationId, :formalDrawingNumberId, :partRootId, :purposeCode,
         :purposeDescription, :sequenceNo, :primary, :ownerId,
         :ruleVersionId, 1, :createdBy, :createdAt, :updatedAt,
         :controlledAt, :releasedAt, :terminalAt
       )
       ON CONFLICT(id) DO UPDATE SET
         drawing_number = COALESCE(excluded.drawing_number, drawings.drawing_number),
         lifecycle_state = excluded.lifecycle_state,
         workspace_id = COALESCE(excluded.workspace_id, drawings.workspace_id),
         drawing_draft_id = COALESCE(excluded.drawing_draft_id, drawings.drawing_draft_id),
         candidate_reservation_id = COALESCE(excluded.candidate_reservation_id, drawings.candidate_reservation_id),
         formal_drawing_number_id = COALESCE(excluded.formal_drawing_number_id, drawings.formal_drawing_number_id),
         part_root_id = COALESCE(excluded.part_root_id, drawings.part_root_id),
         purpose_code = COALESCE(excluded.purpose_code, drawings.purpose_code),
         purpose_description = CASE WHEN excluded.purpose_description <> '' THEN excluded.purpose_description ELSE drawings.purpose_description END,
         sequence_no = COALESCE(excluded.sequence_no, drawings.sequence_no),
         is_primary_manufacturing = excluded.is_primary_manufacturing,
         owner_id = COALESCE(excluded.owner_id, drawings.owner_id),
         rule_version_id = COALESCE(excluded.rule_version_id, drawings.rule_version_id),
         row_version = drawings.row_version + 1,
         updated_at = excluded.updated_at,
         controlled_at = COALESCE(drawings.controlled_at, excluded.controlled_at),
         released_at = COALESCE(drawings.released_at, excluded.released_at),
         terminal_at = COALESCE(drawings.terminal_at, excluded.terminal_at)`,
      { ...input, primary: input.primary ? 1 : 0 }
    );
  }

  private async upsertRevisionPreparing(input: {
    id: string;
    companyId: string;
    drawingId: string;
    revision: string;
    policySnapshotJson: string;
    overrideReason: string | null;
    rowVersion: number;
    approvalRequestId: string | null;
    reviewSnapshotHash: string | null;
    candidateRevisionId: string | null;
    packageId: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedBy: string | null;
    updatedAt: string;
    submittedAt: string | null;
    controlledAt: string | null;
    releasedAt: string | null;
    cancelledAt: string | null;
  }) {
    const policyValue = this.client.kind === "postgres" ? "CAST(:policySnapshotJson AS JSONB)" : ":policySnapshotJson";
    await this.client.execute(
      `INSERT INTO drawing_revisions (
         id, company_id, drawing_id, revision, lifecycle_state, policy_snapshot_json,
         override_reason, row_version, approval_request_id, review_snapshot_hash,
         source_candidate_revision_id, source_revision_package_id, created_by,
         created_at, updated_by, updated_at, submitted_at, controlled_at, released_at, cancelled_at
       ) VALUES (
         :id, :companyId, :drawingId, :revision, 'preparing', ${policyValue},
         :overrideReason, :rowVersion, :approvalRequestId, :reviewSnapshotHash,
         :candidateRevisionId, :packageId, :createdBy,
         :createdAt, :updatedBy, :updatedAt, :submittedAt, :controlledAt, :releasedAt, :cancelledAt
       )
       ON CONFLICT(id) DO UPDATE SET
         revision = CASE WHEN drawing_revisions.lifecycle_state IN ('rd_controlled', 'released', 'superseded') THEN drawing_revisions.revision ELSE excluded.revision END,
         policy_snapshot_json = CASE WHEN drawing_revisions.lifecycle_state IN ('rd_controlled', 'released', 'superseded') THEN drawing_revisions.policy_snapshot_json ELSE excluded.policy_snapshot_json END,
         override_reason = CASE WHEN drawing_revisions.lifecycle_state IN ('rd_controlled', 'released', 'superseded') THEN drawing_revisions.override_reason ELSE excluded.override_reason END,
         row_version = CASE WHEN excluded.row_version > drawing_revisions.row_version THEN excluded.row_version ELSE drawing_revisions.row_version END,
         approval_request_id = COALESCE(excluded.approval_request_id, drawing_revisions.approval_request_id),
         review_snapshot_hash = COALESCE(excluded.review_snapshot_hash, drawing_revisions.review_snapshot_hash),
         source_candidate_revision_id = COALESCE(excluded.source_candidate_revision_id, drawing_revisions.source_candidate_revision_id),
         source_revision_package_id = COALESCE(excluded.source_revision_package_id, drawing_revisions.source_revision_package_id),
         updated_by = COALESCE(excluded.updated_by, drawing_revisions.updated_by),
         updated_at = excluded.updated_at,
         submitted_at = COALESCE(drawing_revisions.submitted_at, excluded.submitted_at),
         controlled_at = COALESCE(drawing_revisions.controlled_at, excluded.controlled_at),
         released_at = COALESCE(drawing_revisions.released_at, excluded.released_at),
         cancelled_at = COALESCE(drawing_revisions.cancelled_at, excluded.cancelled_at)`,
      input
    );
  }

  private async synchronizeCandidateFiles(revisionId: string, companyId: string, candidateRevisionId: string) {
    const files = await this.client.query<CandidateFileSourceRow>(
      `SELECT * FROM numbering_candidate_revision_files
       WHERE company_id = :companyId AND candidate_revision_id = :candidateRevisionId
       ORDER BY sort_order, id`,
      { companyId, candidateRevisionId }
    );
    await this.synchronizeFiles(revisionId, companyId, files, []);
  }

  private async synchronizePackageFiles(revisionId: string, companyId: string, packageId: string) {
    const files = await this.client.query<PackageFileSourceRow>(
      `SELECT * FROM drawing_revision_package_files
       WHERE package_id = :packageId
       ORDER BY sort_order, id`,
      { packageId }
    );
    const revision = await this.client.queryOne<{ lifecycle_state: UnifiedDrawingRevisionLifecycleState }>(
      "SELECT lifecycle_state FROM drawing_revisions WHERE id = :revisionId AND company_id = :companyId",
      { revisionId, companyId }
    );
    if (revision && !controlledRevisionStates.has(revision.lifecycle_state)) {
      const params: Record<string, unknown> = { revisionId, companyId };
      const keep = files.map((file, index) => {
        params[`assetId${index}`] = file.source_file_asset_id;
        return `:assetId${index}`;
      });
      await this.client.execute(
        `DELETE FROM drawing_revision_files
         WHERE drawing_revision_id = :revisionId AND company_id = :companyId
           AND source_package_file_id IS NOT NULL
           AND source_candidate_file_id IS NULL
           ${keep.length > 0 ? `AND source_file_asset_id NOT IN (${keep.join(", ")})` : ""}`,
        params
      );
    }
    await this.synchronizeFiles(revisionId, companyId, [], files);
  }

  private async synchronizeFiles(
    revisionId: string,
    companyId: string,
    candidateFiles: CandidateFileSourceRow[],
    packageFiles: PackageFileSourceRow[]
  ) {
    const revision = await this.client.queryOne<{ lifecycle_state: UnifiedDrawingRevisionLifecycleState }>(
      "SELECT lifecycle_state FROM drawing_revisions WHERE id = :revisionId AND company_id = :companyId",
      { revisionId, companyId }
    );
    if (!revision) throw new Error("UNIFIED_DRAWING_REVISION_NOT_FOUND");
    const existingFiles = await this.client.query<{ source_file_asset_id: string }>(
      "SELECT source_file_asset_id FROM drawing_revision_files WHERE drawing_revision_id = :revisionId AND company_id = :companyId",
      { revisionId, companyId }
    );
    const existingAssets = new Set(existingFiles.map((file) => file.source_file_asset_id));
    const incomingAssets = new Set([
      ...candidateFiles.map((file) => file.source_file_asset_id),
      ...packageFiles.map((file) => file.source_file_asset_id)
    ]);
    if (controlledRevisionStates.has(revision.lifecycle_state)) {
      for (const assetId of incomingAssets) {
        if (!existingAssets.has(assetId)) throw new Error("UNIFIED_DRAWING_CONTROLLED_FILE_DRIFT");
      }
      for (const file of candidateFiles) {
        await this.client.execute(
          `UPDATE drawing_revision_files
           SET source_candidate_file_id = COALESCE(source_candidate_file_id, :sourceCandidateFileId),
               updated_at = :updatedAt
           WHERE drawing_revision_id = :revisionId AND company_id = :companyId
             AND source_file_asset_id = :sourceFileAssetId`,
          {
            sourceCandidateFileId: file.id,
            updatedAt: file.updated_at,
            revisionId,
            companyId,
            sourceFileAssetId: file.source_file_asset_id
          }
        );
      }
      for (const file of packageFiles) {
        await this.client.execute(
          `UPDATE drawing_revision_files
           SET source_package_file_id = COALESCE(source_package_file_id, :sourcePackageFileId),
               updated_at = :updatedAt
           WHERE drawing_revision_id = :revisionId AND company_id = :companyId
             AND source_file_asset_id = :sourceFileAssetId`,
          {
            sourcePackageFileId: file.id,
            updatedAt: file.created_at,
            revisionId,
            companyId,
            sourceFileAssetId: file.source_file_asset_id
          }
        );
      }
      return;
    }

    for (const file of candidateFiles) {
      await this.client.execute(
        `INSERT INTO drawing_revision_files (
           id, company_id, drawing_revision_id, source_file_asset_id, source_candidate_file_id,
           role, role_source, display_name, description, sort_order, is_primary,
           removed_at, removed_by, created_by, created_at, updated_at
         ) VALUES (
           :id, :companyId, :revisionId, :sourceFileAssetId, :sourceCandidateFileId,
           :role, :roleSource, :displayName, :description, :sortOrder, :isPrimary,
           :removedAt, :removedBy, :createdBy, :createdAt, :updatedAt
         )
         ON CONFLICT(drawing_revision_id, source_file_asset_id) DO UPDATE SET
           source_candidate_file_id = COALESCE(drawing_revision_files.source_candidate_file_id, excluded.source_candidate_file_id),
           role = CASE WHEN drawing_revision_files.removed_at IS NULL THEN excluded.role ELSE drawing_revision_files.role END,
           role_source = CASE WHEN drawing_revision_files.removed_at IS NULL THEN excluded.role_source ELSE drawing_revision_files.role_source END,
           display_name = CASE WHEN drawing_revision_files.removed_at IS NULL THEN excluded.display_name ELSE drawing_revision_files.display_name END,
           description = CASE WHEN drawing_revision_files.removed_at IS NULL THEN excluded.description ELSE drawing_revision_files.description END,
           sort_order = CASE WHEN drawing_revision_files.removed_at IS NULL THEN excluded.sort_order ELSE drawing_revision_files.sort_order END,
           is_primary = CASE WHEN drawing_revision_files.removed_at IS NULL THEN excluded.is_primary ELSE drawing_revision_files.is_primary END,
           removed_at = excluded.removed_at,
           removed_by = excluded.removed_by,
           updated_at = excluded.updated_at`,
        {
          id: `drawing-revision-file-${file.id}`,
          companyId,
          revisionId,
          sourceFileAssetId: file.source_file_asset_id,
          sourceCandidateFileId: file.id,
          role: file.role,
          roleSource: file.role_source,
          displayName: file.display_name,
          description: file.description,
          sortOrder: Number(file.sort_order),
          isPrimary: toBoolean(file.is_primary) ? 1 : 0,
          removedAt: file.removed_at,
          removedBy: file.removed_by,
          createdBy: file.created_by,
          createdAt: file.created_at,
          updatedAt: file.updated_at
        }
      );
    }

    for (const file of packageFiles) {
      await this.client.execute(
        `INSERT INTO drawing_revision_files (
           id, company_id, drawing_revision_id, source_file_asset_id, source_package_file_id,
           role, role_source, display_name, description, sort_order, is_primary,
           created_by, created_at, updated_at
         ) VALUES (
           :id, :companyId, :revisionId, :sourceFileAssetId, :sourcePackageFileId,
           :role, :roleSource, :displayName, :description, :sortOrder, :isPrimary,
           :createdBy, :createdAt, :updatedAt
         )
         ON CONFLICT(drawing_revision_id, source_file_asset_id) DO UPDATE SET
           source_package_file_id = COALESCE(drawing_revision_files.source_package_file_id, excluded.source_package_file_id),
           updated_at = excluded.updated_at`,
        {
          id: `drawing-revision-package-file-${file.id}`,
          companyId,
          revisionId,
          sourceFileAssetId: file.source_file_asset_id,
          sourcePackageFileId: file.id,
          role: file.role,
          roleSource: file.role_source,
          displayName: file.display_name,
          description: file.description,
          sortOrder: Number(file.sort_order),
          isPrimary: toBoolean(file.is_primary) ? 1 : 0,
          createdBy: file.created_by,
          createdAt: file.created_at,
          updatedAt: file.created_at
        }
      );
    }
  }

  private async transitionRevision(
    revisionId: string,
    companyId: string,
    lifecycleState: UnifiedDrawingRevisionLifecycleState,
    actorId: string | null,
    updatedAt: string
  ) {
    await this.client.execute(
      `UPDATE drawing_revisions
       SET lifecycle_state = :lifecycleState,
           row_version = row_version + CASE WHEN lifecycle_state = :lifecycleState THEN 0 ELSE 1 END,
           updated_by = COALESCE(:actorId, updated_by),
           updated_at = :updatedAt,
           controlled_at = CASE WHEN :lifecycleState = 'rd_controlled' THEN COALESCE(controlled_at, :updatedAt) ELSE controlled_at END,
           released_at = CASE WHEN :lifecycleState = 'released' THEN COALESCE(released_at, :updatedAt) ELSE released_at END,
           cancelled_at = CASE WHEN :lifecycleState = 'cancelled' THEN COALESCE(cancelled_at, :updatedAt) ELSE cancelled_at END
       WHERE id = :revisionId AND company_id = :companyId`,
      { revisionId, companyId, lifecycleState, actorId, updatedAt }
    );
  }
}
