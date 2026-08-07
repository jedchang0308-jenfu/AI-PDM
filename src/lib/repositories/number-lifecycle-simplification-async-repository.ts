import crypto from "node:crypto";
import path from "node:path";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { PUBLICATION_EVIDENCE_RULE_VERSION } from "@/lib/publication-evidence";
import {
  buildRevisionPolicySnapshot,
  createRevisionSuggestion,
  type RevisionPolicySnapshot
} from "@/lib/revision-policy-engine";
import { normalizeRevisionCode, parseRevisionCode, type RevisionHistorySource } from "@/lib/revision-policy";
import {
  AsyncNumberStateFlowRepository,
  numberingCandidateSnapshotFacts,
  type NumberingDraftWorkspaceRecord,
  type NumberingPublicationResult
} from "@/lib/repositories/number-state-flow-async-repository";
import type { NumberingCandidateRevisionFileRecord } from "@/lib/number-lifecycle-simplification";

type WorkspaceRow = {
  id: string;
  company_id: string;
  lifecycle_status: string;
  owner_id: string;
  row_version: number | string;
};

type DrawingReservationRow = {
  drawing_draft_id: string;
  candidate_reservation_id: string;
  candidate_code: string;
  reservation_state: string;
  approval_request_id: string | null;
};

type CandidateRow = {
  id: string;
  company_id: string;
  workspace_id: string;
  drawing_draft_id: string;
  candidate_reservation_id: string;
  revision: string;
  workflow_intent: "rd_workspace";
  policy_snapshot_json: string | Record<string, unknown>;
  override_reason: string | null;
  lifecycle_status: "draft" | "review_locked" | "promoted" | "cancelled";
  row_version: number | string;
  approval_request_id: string | null;
  review_snapshot_hash: string | null;
  legacy_baseline_request_id: string | null;
  legacy_baseline_snapshot_hash: string | null;
  formal_drawing_number_id: string | null;
  formal_revision_package_id: string | null;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  promoted_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
};

type CandidateFileRow = {
  id: string;
  company_id: string;
  candidate_revision_id: string;
  source_file_asset_id: string;
  publication_evidence_id: string | null;
  role: NumberingCandidateRevisionFileRecord["role"];
  role_source: NumberingCandidateRevisionFileRecord["roleSource"];
  display_name: string;
  description: string;
  sort_order: number | string;
  is_primary: number | string | boolean;
  removed_at: string | null;
  removed_by: string | null;
};

type CandidateFileVerificationRow = CandidateFileRow & {
  asset_id: string;
  storage_provider: string | null;
  original_path: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
  storage_generation: string | null;
  file_name: string;
  mime_type: string;
  file_size: number | string;
  content_hash: string;
};

type FinalizedCandidateFileRow = {
  id: string;
  source_file_asset_id: string;
  publication_evidence_id: string;
  role: NumberingCandidateRevisionFileRecord["role"];
  is_primary: number | string | boolean;
  provider: string;
  bucket: string;
  object_key: string;
  generation: string;
  content_hash: string;
  media_type: string;
  finalized_at: string;
  rule_version: string;
};

type ApprovalRequestRow = {
  id: string;
  company_id: string;
  request_status: "pending" | "approved" | "rejected" | "needs_info" | "cancelled" | "apply_failed" | "applied";
  requested_by: string;
  apply_status: "not_ready" | "not_required" | "pending" | "applied" | "failed";
  apply_attempts: number | string;
  payload_json: string | Record<string, unknown>;
  workspace_id: string;
};

type BundleSnapshot = {
  snapshotVersion: "numbering-candidate-bundle-review-v1";
  mode: "full_bundle" | "legacy_addendum";
  numberFactsHash: string;
  numberFacts: ReturnType<typeof numberingCandidateSnapshotFacts>;
  workspaceRowVersion: number;
  lockedReservations: Array<{
    id: string;
    itemType: string;
    itemId: string;
    candidateCode: string;
    rowVersion: number;
  }>;
  candidateRevisions: Array<{
    id: string;
    drawingDraftId: string;
    candidateReservationId: string;
    revision: string;
    workflowIntent: "rd_workspace";
    policySnapshot: Record<string, unknown>;
    overrideReason: string | null;
    rowVersion: number;
    legacyBaselineRequestId: string | null;
    legacyBaselineSnapshotHash: string | null;
    files: Array<{
      id: string;
      sourceFileAssetId: string;
      publicationEvidenceId: string;
      role: NumberingCandidateRevisionFileRecord["role"];
      isPrimary: boolean;
      provider: string;
      bucket: string;
      objectKey: string;
      generation: string;
      contentHash: string;
      mediaType: string;
      finalizedAt: string;
      ruleVersion: string;
    }>;
  }>;
  submittedBy: string;
  companyId: string;
};

export type CandidateFileStorageInput = {
  assetId: string;
  fileId: string;
  storageProvider: string;
  originalPath: string | null;
  storageBucket: string | null;
  storageKey: string;
  storageGeneration: string | null;
  fileName: string;
  fileExt: string;
  mimeType: string;
  fileSize: number;
  contentHash: string;
  role: NumberingCandidateRevisionFileRecord["role"];
  roleSource: NumberingCandidateRevisionFileRecord["roleSource"];
  displayName: string;
  description: string;
  isPrimary: boolean;
  publicationEvidence?: {
    id: string;
    bucket: string;
    objectKey: string;
    generation: string;
    finalizedAt: string;
  } | null;
};

export type CandidateFileVerificationSource = {
  fileId: string;
  assetId: string;
  publicationEvidenceId: string | null;
  storageProvider: string | null;
  originalPath: string | null;
  storageBucket: string | null;
  storageKey: string | null;
  storageGeneration: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  contentHash: string;
};

export type BundleDecisionResult = {
  workspace: NumberingDraftWorkspaceRecord;
  requestId: string;
  decision: "approved" | "rejected" | "needs_info";
  applyFailed: boolean;
  publication: NumberingPublicationResult | null;
};

export class NumberLifecycleRepositoryFault extends Error {
  constructor(readonly faultPoint: string) {
    super(`NUMBER_LIFECYCLE_REPOSITORY_FAULT:${faultPoint}`);
    this.name = "NumberLifecycleRepositoryFault";
  }
}

const consumedEnvironmentFaultPoints = new Set<string>();
const allowedEnvironmentFaultPoints = new Set([
  "before_candidate_bundle_formalization",
  "before_formal_master_promotion",
  "after_formal_master_promotion",
  "after_revision_packages"
]);

function storageProviderForFileAsset(provider: string) {
  return provider === "local_repository" ? "j_drive" : provider;
}

function environmentFaultInjector() {
  const faultPoint = String(process.env.PDM_QC_NUMBER_LIFECYCLE_FAULT_POINT ?? "").trim();
  if (!faultPoint) return undefined;
  const dataDir = path.resolve(String(process.env.PDM_DATA_DIR ?? ""));
  const productionDataDir = path.resolve(process.cwd(), "data");
  const isolated =
    process.env.PDM_QC_ISOLATED_TARGET === "1" &&
    process.env.NODE_ENV !== "production" &&
    process.env.PDM_DB_PROVIDER === "sqlite" &&
    !String(process.env.PDM_POSTGRES_URL ?? "").trim() &&
    !String(process.env.DATABASE_URL ?? "").trim() &&
    Boolean(process.env.PDM_DATA_DIR) &&
    dataDir !== productionDataDir &&
    !dataDir.startsWith(`${productionDataDir}${path.sep}`);
  if (!isolated || !allowedEnvironmentFaultPoints.has(faultPoint)) {
    throw new Error("NUMBER_LIFECYCLE_QC_FAULT_GUARD_REJECTED");
  }
  return (actualPoint: string) => {
    if (actualPoint !== faultPoint || consumedEnvironmentFaultPoints.has(faultPoint)) return;
    consumedEnvironmentFaultPoints.add(faultPoint);
    throw new NumberLifecycleRepositoryFault(actualPoint);
  };
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)])
    );
  }
  return value;
}

export function canonicalNumberLifecycleJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseObject(value: string | Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function revisionIsValidForWorkspace(revision: string) {
  return parseRevisionCode(revision)?.kind === "minor";
}

export class AsyncNumberLifecycleSimplificationRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID(),
    private readonly faultInjector: ((faultPoint: string) => void) | undefined = environmentFaultInjector()
  ) {}

  private stateRepository(client: AsyncDatabaseClient = this.client) {
    return new AsyncNumberStateFlowRepository(client, this.clock, this.idFactory);
  }

  private async workspaceRow(workspaceId: string, companyId: string, lock = false) {
    return this.client.queryOne<WorkspaceRow>(
      `SELECT id, company_id, lifecycle_status, owner_id, row_version
       FROM numbering_draft_workspaces
       WHERE id = :workspaceId AND company_id = :companyId${lock && this.client.kind === "postgres" ? " FOR UPDATE" : ""}`,
      { workspaceId, companyId }
    );
  }

  private async candidateRow(candidateId: string, workspaceId: string, companyId: string, lock = false) {
    return this.client.queryOne<CandidateRow>(
      `SELECT * FROM numbering_candidate_revision_drafts
       WHERE id = :candidateId AND workspace_id = :workspaceId AND company_id = :companyId${lock && this.client.kind === "postgres" ? " FOR UPDATE" : ""}`,
      { candidateId, workspaceId, companyId }
    );
  }

  private async candidateFiles(candidateId: string) {
    return this.client.query<CandidateFileRow>(
      `SELECT * FROM numbering_candidate_revision_files
       WHERE candidate_revision_id = :candidateId
       ORDER BY sort_order, id`,
      { candidateId }
    );
  }

  private async audit(actorId: string, action: string, detail: Record<string, unknown>) {
    await this.client.execute(
      `INSERT INTO audit_logs (id, actor_id, action, detail_json, created_at)
       VALUES (:id, :actorId, :action, :detailJson, :createdAt)`,
      { id: this.idFactory(), actorId, action, detailJson: canonicalNumberLifecycleJson(detail), createdAt: this.clock() }
    );
  }

  private async approvalEvent(requestId: string, eventType: string, actorId: string, detail: Record<string, unknown>) {
    await this.client.execute(
      `INSERT INTO approval_platform_events (id, request_id, package_id, event_type, actor_id, detail_json, created_at)
       VALUES (:id, :requestId, NULL, :eventType, :actorId, :detailJson, :createdAt)`,
      {
        id: `APE-${this.idFactory()}`,
        requestId,
        eventType,
        actorId,
        detailJson: canonicalNumberLifecycleJson(detail),
        createdAt: this.clock()
      }
    );
  }

  async createCandidateRevision(input: {
    workspaceId: string;
    companyId: string;
    drawingDraftId: string;
    actorId: string;
    expectedWorkspaceRowVersion: number;
  }) {
    const workspace = await this.workspaceRow(input.workspaceId, input.companyId, true);
    if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
    if (workspace.lifecycle_status !== "active") throw new Error("WORKSPACE_NOT_ACTIVE");
    if (Number(workspace.row_version) !== input.expectedWorkspaceRowVersion) throw new Error("WORKSPACE_VERSION_CONFLICT");
    const existing = await this.client.queryOne<CandidateRow>(
      `SELECT * FROM numbering_candidate_revision_drafts
       WHERE drawing_draft_id = :drawingDraftId AND company_id = :companyId`,
      { drawingDraftId: input.drawingDraftId, companyId: input.companyId }
    );
    if (existing) throw new Error("CANDIDATE_REVISION_ALREADY_EXISTS");

    const drawing = await this.client.queryOne<DrawingReservationRow>(
      `SELECT drawing.id AS drawing_draft_id, reservation.id AS candidate_reservation_id,
              reservation.candidate_code, reservation.reservation_state, reservation.approval_request_id
       FROM numbering_draft_drawings drawing
       JOIN number_candidate_reservations reservation
         ON reservation.id = drawing.candidate_reservation_id
        AND reservation.draft_item_type = 'drawing'
        AND reservation.draft_item_id = drawing.id
       WHERE drawing.id = :drawingDraftId AND drawing.workspace_id = :workspaceId
         AND drawing.company_id = :companyId AND reservation.company_id = :companyId`,
      input
    );
    if (!drawing) throw new Error("DRAWING_DRAFT_NOT_FOUND");
    if (!new Set(["active", "approved_locked"]).has(drawing.reservation_state)) throw new Error("CANDIDATE_REVISION_LOCKED");

    const history = await this.client.query<RevisionHistorySource>(
      `SELECT revision, status, released_at AS releasedAt, created_at AS createdAt, updated_at AS updatedAt
       FROM drawing_revision_packages
       WHERE company_id = :companyId AND drawing_number = :drawingNumber
       ORDER BY created_at, id`,
      { companyId: input.companyId, drawingNumber: drawing.candidate_code }
    );
    const suggestion = createRevisionSuggestion({
      companyId: input.companyId,
      drawingNumber: drawing.candidate_code,
      workflowIntent: "rd_workspace",
      revisions: history,
      generatedAt: this.clock()
    });
    const policySnapshot = buildRevisionPolicySnapshot({ suggestion, selectedRevision: suggestion.suggestedRevision });
    let legacyBaselineRequestId: string | null = null;
    let legacyBaselineSnapshotHash: string | null = null;
    if (drawing.reservation_state === "approved_locked") {
      legacyBaselineRequestId = drawing.approval_request_id;
      if (!legacyBaselineRequestId) throw new Error("LEGACY_APPROVAL_BASELINE_REQUIRED");
      const snapshot = await this.client.queryOne<{ snapshot_hash: string }>(
        `SELECT snapshot_hash FROM approval_platform_impact_snapshots
         WHERE request_id = :requestId ORDER BY captured_at DESC, id DESC LIMIT 1`,
        { requestId: legacyBaselineRequestId }
      );
      legacyBaselineSnapshotHash = snapshot?.snapshot_hash ?? null;
      if (!legacyBaselineSnapshotHash) throw new Error("LEGACY_APPROVAL_BASELINE_REQUIRED");
    }

    const candidateId = `NCR-${this.idFactory()}`;
    const now = this.clock();
    await this.client.execute(
      `INSERT INTO numbering_candidate_revision_drafts (
         id, company_id, workspace_id, drawing_draft_id, candidate_reservation_id,
         revision, workflow_intent, policy_snapshot_json, override_reason, lifecycle_status,
         row_version, approval_request_id, review_snapshot_hash,
         legacy_baseline_request_id, legacy_baseline_snapshot_hash,
         created_by, created_at, updated_by, updated_at
       ) VALUES (
         :id, :companyId, :workspaceId, :drawingDraftId, :candidateReservationId,
         :revision, 'rd_workspace', :policySnapshotJson, NULL, 'draft',
         1, NULL, NULL, :legacyBaselineRequestId, :legacyBaselineSnapshotHash,
         :actorId, :createdAt, :actorId, :updatedAt
       )`,
      {
        id: candidateId,
        ...input,
        candidateReservationId: drawing.candidate_reservation_id,
        revision: suggestion.suggestedRevision,
        policySnapshotJson: canonicalNumberLifecycleJson(policySnapshot),
        legacyBaselineRequestId,
        legacyBaselineSnapshotHash,
        createdAt: now,
        updatedAt: now
      }
    );
    await this.client.execute(
      `UPDATE numbering_draft_workspaces
       SET row_version = row_version + 1, updated_at = :updatedAt
       WHERE id = :workspaceId AND company_id = :companyId AND row_version = :expectedWorkspaceRowVersion`,
      { ...input, updatedAt: now }
    );
    await this.audit(input.actorId, "pdm.numbering.create_candidate_revision", {
      companyId: input.companyId,
      workspaceId: input.workspaceId,
      candidateRevisionId: candidateId,
      drawingDraftId: input.drawingDraftId,
      revision: suggestion.suggestedRevision,
      legacyBaselineRequestId
    });
    return this.stateRepository().getWorkspace(input.workspaceId, input.companyId);
  }

  async updateCandidateRevision(input: {
    workspaceId: string;
    companyId: string;
    candidateRevisionId: string;
    actorId: string;
    expectedRowVersion: number;
    revision: string;
    overrideReason: string | null;
  }) {
    const row = await this.candidateRow(input.candidateRevisionId, input.workspaceId, input.companyId, true);
    if (!row) throw new Error("CANDIDATE_REVISION_NOT_FOUND");
    if (row.lifecycle_status !== "draft") throw new Error("CANDIDATE_REVISION_LOCKED");
    if (Number(row.row_version) !== input.expectedRowVersion) throw new Error("CANDIDATE_REVISION_VERSION_CONFLICT");
    const revision = normalizeRevisionCode(input.revision);
    if (!revisionIsValidForWorkspace(revision)) throw new Error("CANDIDATE_REVISION_INVALID");
    const previousPolicy = parseObject(row.policy_snapshot_json) as Partial<RevisionPolicySnapshot>;
    const suggestedRevision = String(previousPolicy.suggested_revision ?? "");
    if (revision !== suggestedRevision && !input.overrideReason) throw new Error("OVERRIDE_REASON_REQUIRED");
    const policySnapshot: RevisionPolicySnapshot = {
      workflow_intent: "rd_workspace",
      suggested_revision: suggestedRevision || row.revision,
      selected_revision: revision,
      override_reason: revision === suggestedRevision ? null : input.overrideReason,
      policy_version: "revision-policy-002.1",
      suggestion_basis_hash: String(previousPolicy.suggestion_basis_hash ?? ""),
      suggestion_generated_at: String(previousPolicy.suggestion_generated_at ?? row.created_at),
      accepted_or_overridden_at: this.clock()
    };
    const now = this.clock();
    await this.client.execute(
      `UPDATE numbering_candidate_revision_drafts
       SET revision = :revision, override_reason = :overrideReason,
           policy_snapshot_json = :policySnapshotJson, row_version = row_version + 1,
           updated_by = :actorId, updated_at = :updatedAt
       WHERE id = :candidateRevisionId AND workspace_id = :workspaceId AND company_id = :companyId
         AND lifecycle_status = 'draft' AND row_version = :expectedRowVersion`,
      {
        ...input,
        revision,
        overrideReason: policySnapshot.override_reason,
        policySnapshotJson: canonicalNumberLifecycleJson(policySnapshot),
        updatedAt: now
      }
    );
    await this.audit(input.actorId, "pdm.numbering.update_candidate_revision", {
      companyId: input.companyId,
      workspaceId: input.workspaceId,
      candidateRevisionId: input.candidateRevisionId,
      revision,
      override: Boolean(policySnapshot.override_reason)
    });
    return this.stateRepository().getWorkspace(input.workspaceId, input.companyId);
  }

  async addCandidateFile(input: {
    workspaceId: string;
    companyId: string;
    candidateRevisionId: string;
    actorId: string;
    expectedRowVersion: number;
    storage: CandidateFileStorageInput;
  }) {
    const candidate = await this.candidateRow(input.candidateRevisionId, input.workspaceId, input.companyId, true);
    if (!candidate) throw new Error("CANDIDATE_REVISION_NOT_FOUND");
    if (candidate.lifecycle_status !== "draft") throw new Error("CANDIDATE_REVISION_LOCKED");
    if (Number(candidate.row_version) !== input.expectedRowVersion) throw new Error("CANDIDATE_REVISION_VERSION_CONFLICT");
    const now = this.clock();
    const storageProvider = storageProviderForFileAsset(input.storage.storageProvider);
    await this.client.execute(
      `INSERT INTO file_assets (
         id, storage_provider, original_path, storage_bucket, storage_key, storage_generation,
         file_name, file_ext, mime_type, file_size, content_hash, hash_algorithm,
         linked_entity_type, linked_entity_id, document_category, display_name, description,
         revision, uploaded_by, gdrive_status, sync_status, created_at, updated_at
       ) VALUES (
         :assetId, :storageProvider, :originalPath, :storageBucket, :storageKey, :storageGeneration,
         :fileName, :fileExt, :mimeType, :fileSize, :contentHash, 'SHA-256',
         'numbering_candidate_revision', :candidateRevisionId, :role, :displayName, :description,
         :revision, :actorId, 'none', :syncStatus, :createdAt, :updatedAt
       )`,
      {
        ...input,
        ...input.storage,
        storageProvider,
        revision: candidate.revision,
        syncStatus: storageProvider === "j_drive" ? "local_only" : "migrated",
        createdAt: now,
        updatedAt: now
      }
    );
    let publicationEvidenceId: string | null = null;
    if (input.storage.publicationEvidence) {
      publicationEvidenceId = input.storage.publicationEvidence.id;
      await this.client.execute(
        `INSERT INTO numbering_publication_evidence (
           id, company_id, workspace_id, drawing_draft_id, provider, bucket, object_key,
           generation, content_hash, media_type, finalized_at, rule_version, created_at, updated_at
         ) VALUES (
           :id, :companyId, :workspaceId, :drawingDraftId, 'google_cloud_storage', :bucket, :objectKey,
           :generation, :contentHash, :mediaType, :finalizedAt, :ruleVersion, :createdAt, :updatedAt
         )`,
        {
          ...input.storage.publicationEvidence,
          companyId: input.companyId,
          workspaceId: input.workspaceId,
          drawingDraftId: candidate.drawing_draft_id,
          contentHash: input.storage.contentHash,
          mediaType: input.storage.mimeType,
          ruleVersion: PUBLICATION_EVIDENCE_RULE_VERSION,
          createdAt: now,
          updatedAt: now
        }
      );
    }
    if (input.storage.isPrimary) {
      await this.client.execute(
        `UPDATE numbering_candidate_revision_files
         SET is_primary = 0, updated_at = :updatedAt
         WHERE candidate_revision_id = :candidateRevisionId AND company_id = :companyId
           AND role = :role AND is_primary = 1 AND removed_at IS NULL`,
        { candidateRevisionId: input.candidateRevisionId, companyId: input.companyId, role: input.storage.role, updatedAt: now }
      );
    }
    const orderRow = await this.client.queryOne<{ next_order: number | string }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
       FROM numbering_candidate_revision_files WHERE candidate_revision_id = :candidateRevisionId`,
      { candidateRevisionId: input.candidateRevisionId }
    );
    await this.client.execute(
      `INSERT INTO numbering_candidate_revision_files (
         id, company_id, candidate_revision_id, source_file_asset_id, publication_evidence_id,
         role, role_source, display_name, description, sort_order, is_primary,
         created_by, created_at, updated_at
       ) VALUES (
         :fileId, :companyId, :candidateRevisionId, :assetId, :publicationEvidenceId,
         :role, :roleSource, :displayName, :description, :sortOrder, :isPrimary,
         :actorId, :createdAt, :updatedAt
       )`,
      {
        ...input,
        ...input.storage,
        publicationEvidenceId,
        sortOrder: Number(orderRow?.next_order ?? 0),
        isPrimary: input.storage.isPrimary ? 1 : 0,
        createdAt: now,
        updatedAt: now
      }
    );
    await this.client.execute(
      `UPDATE numbering_candidate_revision_drafts
       SET row_version = row_version + 1, updated_by = :actorId, updated_at = :updatedAt
       WHERE id = :candidateRevisionId AND company_id = :companyId
         AND lifecycle_status = 'draft' AND row_version = :expectedRowVersion`,
      { ...input, updatedAt: now }
    );
    await this.audit(input.actorId, "pdm.numbering.add_candidate_revision_file", {
      companyId: input.companyId,
      workspaceId: input.workspaceId,
      candidateRevisionId: input.candidateRevisionId,
      candidateFileId: input.storage.fileId,
      sourceFileAssetId: input.storage.assetId,
      role: input.storage.role,
      isPrimary: input.storage.isPrimary,
      evidenceFinalized: Boolean(publicationEvidenceId)
    });
    return this.stateRepository().getWorkspace(input.workspaceId, input.companyId);
  }

  async candidateFileVerificationSource(input: {
    workspaceId: string;
    companyId: string;
    candidateRevisionId: string;
    fileId: string;
    expectedRowVersion: number;
  }): Promise<CandidateFileVerificationSource> {
    const candidate = await this.candidateRow(input.candidateRevisionId, input.workspaceId, input.companyId, true);
    if (!candidate) throw new Error("CANDIDATE_REVISION_NOT_FOUND");
    if (candidate.lifecycle_status !== "draft") throw new Error("CANDIDATE_REVISION_LOCKED");
    if (Number(candidate.row_version) !== input.expectedRowVersion) throw new Error("CANDIDATE_REVISION_VERSION_CONFLICT");
    const row = await this.client.queryOne<CandidateFileVerificationRow>(
      `SELECT file.*, asset.id AS asset_id, asset.storage_provider, asset.original_path,
              asset.storage_bucket, asset.storage_key, asset.storage_generation,
              asset.file_name, asset.mime_type, asset.file_size, asset.content_hash
       FROM numbering_candidate_revision_files file
       JOIN file_assets asset ON asset.id = file.source_file_asset_id
       WHERE file.id = :fileId AND file.candidate_revision_id = :candidateRevisionId
         AND file.company_id = :companyId AND file.removed_at IS NULL`,
      input
    );
    if (!row) throw new Error("CANDIDATE_FILE_NOT_FOUND");
    return {
      fileId: row.id,
      assetId: row.asset_id,
      publicationEvidenceId: row.publication_evidence_id,
      storageProvider: row.storage_provider,
      originalPath: row.original_path,
      storageBucket: row.storage_bucket,
      storageKey: row.storage_key,
      storageGeneration: row.storage_generation,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSize: Number(row.file_size),
      contentHash: row.content_hash
    };
  }

  async verifyExistingCandidateFile(input: {
    workspaceId: string;
    companyId: string;
    candidateRevisionId: string;
    fileId: string;
    actorId: string;
    expectedRowVersion: number;
    expectedAssetId: string;
    expectedContentHash: string;
    evidence: {
      id: string;
      bucket: string;
      objectKey: string;
      generation: string;
      mediaType: string;
      finalizedAt: string;
    } | null;
  }) {
    const candidate = await this.candidateRow(input.candidateRevisionId, input.workspaceId, input.companyId, true);
    if (!candidate) throw new Error("CANDIDATE_REVISION_NOT_FOUND");
    if (candidate.lifecycle_status !== "draft") throw new Error("CANDIDATE_REVISION_LOCKED");
    if (Number(candidate.row_version) !== input.expectedRowVersion) throw new Error("CANDIDATE_REVISION_VERSION_CONFLICT");
    const file = await this.client.queryOne<CandidateFileVerificationRow>(
      `SELECT file.*, asset.id AS asset_id, asset.storage_provider, asset.original_path,
              asset.storage_bucket, asset.storage_key, asset.storage_generation,
              asset.file_name, asset.mime_type, asset.file_size, asset.content_hash
       FROM numbering_candidate_revision_files file
       JOIN file_assets asset ON asset.id = file.source_file_asset_id
       WHERE file.id = :fileId AND file.candidate_revision_id = :candidateRevisionId
         AND file.company_id = :companyId AND file.removed_at IS NULL`,
      input
    );
    if (!file) throw new Error("CANDIDATE_FILE_NOT_FOUND");
    if (file.publication_evidence_id) {
      return this.stateRepository().getWorkspace(input.workspaceId, input.companyId);
    }
    if (file.asset_id !== input.expectedAssetId || file.content_hash !== input.expectedContentHash) {
      throw new Error("CANDIDATE_FILE_VERIFICATION_STALE");
    }
    if (!input.evidence) throw new Error("CANDIDATE_FILE_EXISTING_VERIFICATION_NOT_AVAILABLE");
    const now = this.clock();
    await this.client.execute(
      `INSERT INTO numbering_publication_evidence (
         id, company_id, workspace_id, drawing_draft_id, provider, bucket, object_key,
         generation, content_hash, media_type, finalized_at, rule_version, created_at, updated_at
       ) VALUES (
         :id, :companyId, :workspaceId, :drawingDraftId, 'google_cloud_storage', :bucket, :objectKey,
         :generation, :contentHash, :mediaType, :finalizedAt, :ruleVersion, :createdAt, :updatedAt
       )`,
      {
        ...input.evidence,
        companyId: input.companyId,
        workspaceId: input.workspaceId,
        drawingDraftId: candidate.drawing_draft_id,
        contentHash: input.expectedContentHash,
        ruleVersion: PUBLICATION_EVIDENCE_RULE_VERSION,
        createdAt: now,
        updatedAt: now
      }
    );
    const linked = await this.client.queryOne<{ id: string }>(
      `UPDATE numbering_candidate_revision_files
       SET publication_evidence_id = :evidenceId, updated_at = :updatedAt
       WHERE id = :fileId AND candidate_revision_id = :candidateRevisionId
         AND company_id = :companyId AND publication_evidence_id IS NULL AND removed_at IS NULL
       RETURNING id`,
      { ...input, evidenceId: input.evidence.id, updatedAt: now }
    );
    if (!linked) throw new Error("CANDIDATE_FILE_VERIFICATION_STALE");
    const updated = await this.client.queryOne<{ id: string }>(
      `UPDATE numbering_candidate_revision_drafts
       SET row_version = row_version + 1, updated_by = :actorId, updated_at = :updatedAt
       WHERE id = :candidateRevisionId AND company_id = :companyId
         AND lifecycle_status = 'draft' AND row_version = :expectedRowVersion
       RETURNING id`,
      { ...input, updatedAt: now }
    );
    if (!updated) throw new Error("CANDIDATE_REVISION_VERSION_CONFLICT");
    await this.audit(input.actorId, "pdm.numbering.verify_existing_candidate_revision_file", {
      companyId: input.companyId,
      workspaceId: input.workspaceId,
      candidateRevisionId: input.candidateRevisionId,
      candidateFileId: input.fileId,
      sourceFileAssetId: input.expectedAssetId,
      contentHash: input.expectedContentHash,
      evidenceId: input.evidence.id
    });
    return this.stateRepository().getWorkspace(input.workspaceId, input.companyId);
  }

  async removeCandidateFile(input: {
    workspaceId: string;
    companyId: string;
    candidateRevisionId: string;
    fileId: string;
    actorId: string;
    expectedRowVersion: number;
    reason: string | null;
  }) {
    const candidate = await this.candidateRow(input.candidateRevisionId, input.workspaceId, input.companyId, true);
    if (!candidate) throw new Error("CANDIDATE_REVISION_NOT_FOUND");
    if (candidate.lifecycle_status !== "draft") throw new Error("CANDIDATE_REVISION_LOCKED");
    if (Number(candidate.row_version) !== input.expectedRowVersion) throw new Error("CANDIDATE_REVISION_VERSION_CONFLICT");
    const file = await this.client.queryOne<CandidateFileRow>(
      `SELECT * FROM numbering_candidate_revision_files
       WHERE id = :fileId AND candidate_revision_id = :candidateRevisionId
         AND company_id = :companyId AND removed_at IS NULL`,
      input
    );
    if (!file) throw new Error("CANDIDATE_FILE_NOT_FOUND");
    const now = this.clock();
    await this.client.execute(
      `UPDATE numbering_candidate_revision_files
       SET removed_at = :removedAt, removed_by = :removedBy, updated_at = :updatedAt
       WHERE id = :fileId AND candidate_revision_id = :candidateRevisionId
         AND company_id = :companyId AND removed_at IS NULL`,
      { ...input, removedAt: now, removedBy: input.actorId, updatedAt: now }
    );
    await this.client.execute(
      `UPDATE numbering_candidate_revision_drafts
       SET row_version = row_version + 1, updated_by = :actorId, updated_at = :updatedAt
       WHERE id = :candidateRevisionId AND company_id = :companyId
         AND lifecycle_status = 'draft' AND row_version = :expectedRowVersion`,
      { ...input, updatedAt: now }
    );
    await this.audit(input.actorId, "pdm.numbering.remove_candidate_revision_file", {
      companyId: input.companyId,
      workspaceId: input.workspaceId,
      candidateRevisionId: input.candidateRevisionId,
      candidateFileId: input.fileId,
      reason: input.reason
    });
    return this.stateRepository().getWorkspace(input.workspaceId, input.companyId);
  }

  private async finalizedCandidateFiles(candidateId: string) {
    return this.client.query<FinalizedCandidateFileRow>(
      `SELECT file.id, file.source_file_asset_id, file.publication_evidence_id, file.role, file.is_primary,
              evidence.provider, evidence.bucket, evidence.object_key, evidence.generation,
              evidence.content_hash, evidence.media_type, evidence.finalized_at, evidence.rule_version
       FROM numbering_candidate_revision_files file
       JOIN numbering_publication_evidence evidence ON evidence.id = file.publication_evidence_id
       WHERE file.candidate_revision_id = :candidateId AND file.removed_at IS NULL
       ORDER BY file.sort_order, file.id`,
      { candidateId }
    );
  }

  private async proposedBundleSnapshot(input: {
    workspace: NumberingDraftWorkspaceRecord;
    candidates: CandidateRow[];
    requestId: string;
    actorId: string;
  }): Promise<BundleSnapshot> {
    const candidateFacts: BundleSnapshot["candidateRevisions"] = [];
    for (const candidate of input.candidates.sort((left, right) => left.id.localeCompare(right.id))) {
      const files = await this.finalizedCandidateFiles(candidate.id);
      const activeFiles = await this.candidateFiles(candidate.id);
      if (!revisionIsValidForWorkspace(candidate.revision)) throw new Error("CANDIDATE_REVISION_INVALID");
      if (!activeFiles.some((file) => !file.removed_at && Number(file.is_primary) === 1)) throw new Error("BUNDLE_NOT_READY");
      if (!files.some((file) => Number(file.is_primary) === 1)) throw new Error("PUBLICATION_EVIDENCE_NOT_READY");
      candidateFacts.push({
        id: candidate.id,
        drawingDraftId: candidate.drawing_draft_id,
        candidateReservationId: candidate.candidate_reservation_id,
        revision: candidate.revision,
        workflowIntent: candidate.workflow_intent,
        policySnapshot: parseObject(candidate.policy_snapshot_json),
        overrideReason: candidate.override_reason,
        rowVersion: Number(candidate.row_version) + 1,
        legacyBaselineRequestId: candidate.legacy_baseline_request_id,
        legacyBaselineSnapshotHash: candidate.legacy_baseline_snapshot_hash,
        files: files.map((file) => ({
          id: file.id,
          sourceFileAssetId: file.source_file_asset_id,
          publicationEvidenceId: file.publication_evidence_id,
          role: file.role,
          isPrimary: Number(file.is_primary) === 1,
          provider: file.provider,
          bucket: file.bucket,
          objectKey: file.object_key,
          generation: file.generation,
          contentHash: file.content_hash,
          mediaType: file.media_type,
          finalizedAt: file.finalized_at,
          ruleVersion: file.rule_version
        }))
      });
    }
    const numberFacts = numberingCandidateSnapshotFacts(input.workspace);
    const activeReservations = input.workspace.reservations.filter((reservation) => reservation.state !== "recycled");
    const mode = activeReservations.every((reservation) => reservation.state === "approved_locked")
      ? "legacy_addendum"
      : "full_bundle";
    return {
      snapshotVersion: "numbering-candidate-bundle-review-v1",
      mode,
      numberFactsHash: sha256(canonicalNumberLifecycleJson(numberFacts)),
      numberFacts,
      workspaceRowVersion: input.workspace.rowVersion,
      lockedReservations: activeReservations.map((reservation) => ({
        id: reservation.id,
        itemType: reservation.itemType,
        itemId: reservation.itemId,
        candidateCode: reservation.candidateCode,
        rowVersion: mode === "full_bundle" ? reservation.rowVersion + 1 : reservation.rowVersion
      })).sort((left, right) => left.id.localeCompare(right.id)),
      candidateRevisions: candidateFacts,
      submittedBy: input.actorId,
      companyId: input.workspace.companyId
    };
  }

  async submitBundleReview(input: {
    workspaceId: string;
    companyId: string;
    actorId: string;
    expectedWorkspaceRowVersion: number;
    reason: string | null;
  }) {
    const row = await this.workspaceRow(input.workspaceId, input.companyId, true);
    if (!row) throw new Error("WORKSPACE_NOT_FOUND");
    if (row.lifecycle_status !== "active") throw new Error("WORKSPACE_NOT_ACTIVE");
    if (Number(row.row_version) !== input.expectedWorkspaceRowVersion) throw new Error("WORKSPACE_VERSION_CONFLICT");
    const workspace = await this.stateRepository().getWorkspace(input.workspaceId, input.companyId);
    const activeReservations = workspace.reservations.filter((reservation) => reservation.state !== "recycled");
    const fullBundle = activeReservations.length > 0 && activeReservations.every((reservation) => reservation.state === "active");
    const legacyAddendum = activeReservations.length > 0 && activeReservations.every((reservation) => reservation.state === "approved_locked");
    if (!fullBundle && !legacyAddendum) throw new Error("BUNDLE_NOT_READY");
    const relationshipOnlyReady = workspace.draftMode === "append_part"
      && Boolean(workspace.sourceDrawingNumberId)
      && workspace.parts.length > 0;
    if (!relationshipOnlyReady && (workspace.drawings.length === 0 || (workspace.relations.length === 0 && workspace.parts.length > 0))) {
      throw new Error("BUNDLE_NOT_READY");
    }
    const candidates = await this.client.query<CandidateRow>(
      `SELECT * FROM numbering_candidate_revision_drafts
       WHERE workspace_id = :workspaceId AND company_id = :companyId AND lifecycle_status = 'draft'
       ORDER BY created_at, id${this.client.kind === "postgres" ? " FOR UPDATE" : ""}`,
      input
    );
    if (candidates.length !== workspace.drawings.length) throw new Error("BUNDLE_NOT_READY");
    const action = await this.client.queryOne<{ action_code: string }>(
      `SELECT action_code FROM approval_platform_actions
       WHERE action_code = 'numbering.candidate_bundle_review' AND enabled = 1`
    );
    if (!action) throw new Error("APPROVAL_ACTION_NOT_REGISTERED");
    const pending = await this.client.queryOne<{ id: string }>(
      `SELECT request.id FROM approval_platform_requests request
       JOIN approval_platform_targets target ON target.request_id = request.id
       WHERE request.company_id = :companyId AND request.action_code = 'numbering.candidate_bundle_review'
         AND request.request_status = 'pending' AND target.target_type = 'numbering_draft_workspace'
         AND target.target_id = :workspaceId LIMIT 1`,
      input
    );
    if (pending) throw new Error("BUNDLE_REVIEW_ALREADY_PENDING");
    const requestId = `APR-${this.idFactory()}`;
    const snapshot = await this.proposedBundleSnapshot({ workspace, candidates, requestId, actorId: input.actorId });
    const snapshotJson = canonicalNumberLifecycleJson(snapshot);
    const snapshotHash = sha256(snapshotJson);
    const now = this.clock();
    await this.client.execute(
      `INSERT INTO approval_platform_requests (
         id, company_id, package_id, action_code, domain_code, request_status, title, reason,
         requested_by, requested_at, apply_status, payload_json, created_at, updated_at
       ) VALUES (
         :id, :companyId, NULL, 'numbering.candidate_bundle_review', 'numbering', 'pending', :title, :reason,
         :requestedBy, :requestedAt, 'pending', :payloadJson, :createdAt, :updatedAt
       )`,
      {
        id: requestId,
        companyId: input.companyId,
        title: `候選圖料號與首版整包審核：${workspace.root?.coreName ?? workspace.sourceRootId ?? workspace.id}`,
        reason: input.reason ?? "",
        requestedBy: input.actorId,
        requestedAt: now,
        payloadJson: canonicalNumberLifecycleJson({
          workspaceId: input.workspaceId,
          snapshotVersion: snapshot.snapshotVersion,
          snapshotHash,
          numberFactsHash: snapshot.numberFactsHash,
          mode: snapshot.mode
        }),
        createdAt: now,
        updatedAt: now
      }
    );
    if (fullBundle) {
      await this.client.execute(
        `UPDATE number_candidate_reservations
         SET reservation_state = 'review_locked', approval_request_id = :requestId,
             row_version = row_version + 1, updated_at = :updatedAt
         WHERE workspace_id = :workspaceId AND company_id = :companyId AND reservation_state = 'active'`,
        { ...input, requestId, updatedAt: now }
      );
    }
    await this.client.execute(
      `UPDATE numbering_candidate_revision_drafts
       SET lifecycle_status = 'review_locked', approval_request_id = :requestId,
           review_snapshot_hash = :snapshotHash, row_version = row_version + 1,
           updated_by = :actorId, updated_at = :updatedAt
       WHERE workspace_id = :workspaceId AND company_id = :companyId AND lifecycle_status = 'draft'`,
      { ...input, requestId, snapshotHash, updatedAt: now }
    );
    await this.client.execute(
      `INSERT INTO approval_platform_targets (
         id, request_id, target_role, target_type, target_id, target_code, target_label,
         target_status, snapshot_json, sort_order, created_at
       ) VALUES (
         :id, :requestId, 'primary', 'numbering_draft_workspace', :workspaceId, NULL, :targetLabel,
         'review_locked', :snapshotJson, 0, :createdAt
       )`,
      {
        id: `APT-${this.idFactory()}`,
        requestId,
        workspaceId: input.workspaceId,
        targetLabel: workspace.root?.coreName ?? workspace.sourceRootId ?? workspace.id,
        snapshotJson: canonicalNumberLifecycleJson({ rowVersion: workspace.rowVersion, numberFactsHash: snapshot.numberFactsHash }),
        createdAt: now
      }
    );
    for (const [index, candidate] of snapshot.candidateRevisions.entries()) {
      await this.client.execute(
        `INSERT INTO approval_platform_targets (
           id, request_id, target_role, target_type, target_id, target_code, target_label,
           target_status, snapshot_json, sort_order, created_at
         ) VALUES (
           :id, :requestId, 'child', 'numbering_candidate_revision', :targetId, NULL, :targetLabel,
           'review_locked', :snapshotJson, :sortOrder, :createdAt
         )`,
        {
          id: `APT-${this.idFactory()}`,
          requestId,
          targetId: candidate.id,
          targetLabel: `${candidate.revision} / ${candidate.drawingDraftId}`,
          snapshotJson: canonicalNumberLifecycleJson(candidate),
          sortOrder: index + 1,
          createdAt: now
        }
      );
    }
    await this.client.execute(
      `INSERT INTO approval_platform_impact_snapshots (
         id, request_id, package_id, snapshot_hash, snapshot_json, captured_by, captured_at
       ) VALUES (:id, :requestId, NULL, :snapshotHash, :snapshotJson, :capturedBy, :capturedAt)`,
      {
        id: `APIS-${this.idFactory()}`,
        requestId,
        snapshotHash,
        snapshotJson,
        capturedBy: input.actorId,
        capturedAt: now
      }
    );
    await this.approvalEvent(requestId, "approval_platform.request.submitted", input.actorId, {
      actionCode: "numbering.candidate_bundle_review",
      workspaceId: input.workspaceId,
      snapshotHash,
      mode: snapshot.mode
    });
    await this.audit(input.actorId, "pdm.numbering.submit_candidate_bundle_review", {
      companyId: input.companyId,
      workspaceId: input.workspaceId,
      requestId,
      snapshotHash,
      mode: snapshot.mode
    });
    return { workspace: await this.stateRepository().getWorkspace(input.workspaceId, input.companyId), requestId, snapshotHash };
  }

  async withdrawBundleReview(input: {
    workspaceId: string;
    companyId: string;
    actorId: string;
    expectedWorkspaceRowVersion: number;
    reason: string;
  }) {
    const row = await this.workspaceRow(input.workspaceId, input.companyId, true);
    if (!row) throw new Error("WORKSPACE_NOT_FOUND");
    if (row.lifecycle_status !== "active") throw new Error("WORKSPACE_NOT_ACTIVE");
    if (row.owner_id !== input.actorId) throw new Error("REVIEW_WITHDRAW_OWNER_REQUIRED");
    if (Number(row.row_version) !== input.expectedWorkspaceRowVersion) throw new Error("WORKSPACE_VERSION_CONFLICT");
    const request = await this.client.queryOne<ApprovalRequestRow>(
      `SELECT request.*, target.target_id AS workspace_id
       FROM approval_platform_requests request
       JOIN approval_platform_targets target ON target.request_id = request.id
       WHERE request.company_id = :companyId AND request.action_code = 'numbering.candidate_bundle_review'
         AND request.request_status = 'pending' AND target.target_type = 'numbering_draft_workspace'
         AND target.target_id = :workspaceId
       ORDER BY request.requested_at DESC, request.id DESC LIMIT 1${this.client.kind === "postgres" ? " FOR UPDATE OF request" : ""}`,
      input
    );
    if (!request) throw new Error("BUNDLE_REVIEW_NOT_PENDING");
    const payload = parseObject(request.payload_json);
    const mode = payload.mode === "legacy_addendum" ? "legacy_addendum" : "full_bundle";
    const now = this.clock();
    await this.client.execute(
      `UPDATE approval_platform_requests
       SET request_status = 'cancelled', apply_status = 'not_required', resolved_by = :actorId,
           resolved_at = :resolvedAt, updated_at = :updatedAt
       WHERE id = :requestId AND company_id = :companyId AND request_status = 'pending'`,
      { ...input, requestId: request.id, resolvedAt: now, updatedAt: now }
    );
    if (mode === "full_bundle") {
      await this.client.execute(
        `UPDATE number_candidate_reservations
         SET reservation_state = 'active', approval_request_id = NULL,
             row_version = row_version + 1, updated_at = :updatedAt
         WHERE workspace_id = :workspaceId AND company_id = :companyId
           AND reservation_state = 'review_locked' AND approval_request_id = :requestId`,
        { ...input, requestId: request.id, updatedAt: now }
      );
    }
    await this.client.execute(
      `UPDATE numbering_candidate_revision_drafts
       SET lifecycle_status = 'draft', approval_request_id = NULL, review_snapshot_hash = NULL,
           row_version = row_version + 1, updated_by = :actorId, updated_at = :updatedAt
       WHERE workspace_id = :workspaceId AND company_id = :companyId
         AND lifecycle_status = 'review_locked' AND approval_request_id = :requestId`,
      { ...input, requestId: request.id, updatedAt: now }
    );
    await this.approvalEvent(request.id, "approval_platform.request.withdrawn", input.actorId, {
      workspaceId: input.workspaceId,
      reason: input.reason,
      mode
    });
    await this.audit(input.actorId, "pdm.numbering.withdraw_candidate_bundle_review", {
      companyId: input.companyId,
      workspaceId: input.workspaceId,
      requestId: request.id,
      reason: input.reason
    });
    return { workspace: await this.stateRepository().getWorkspace(input.workspaceId, input.companyId), requestId: request.id };
  }

  private async requestForDecision(requestId: string, companyId: string) {
    return this.client.queryOne<ApprovalRequestRow>(
      `SELECT request.*, target.target_id AS workspace_id
       FROM approval_platform_requests request
       JOIN approval_platform_targets target
         ON target.request_id = request.id AND target.target_type = 'numbering_draft_workspace'
       WHERE request.id = :requestId AND request.company_id = :companyId
         AND request.action_code = 'numbering.candidate_bundle_review'${this.client.kind === "postgres" ? " FOR UPDATE OF request" : ""}`,
      { requestId, companyId }
    );
  }

  private async snapshotForRequest(requestId: string) {
    const row = await this.client.queryOne<{ snapshot_hash: string; snapshot_json: string | Record<string, unknown> }>(
      `SELECT snapshot_hash, snapshot_json FROM approval_platform_impact_snapshots
       WHERE request_id = :requestId ORDER BY captured_at DESC, id DESC LIMIT 1`,
      { requestId }
    );
    if (!row) throw new Error("APPROVAL_SNAPSHOT_STALE");
    return { hash: row.snapshot_hash, snapshot: parseObject(row.snapshot_json) as unknown as BundleSnapshot };
  }

  private async formalizeApprovedBundle(input: {
    request: ApprovalRequestRow;
    snapshot: BundleSnapshot;
    snapshotHash: string;
    actorId: string;
  }) {
    const workspaceId = input.request.workspace_id;
    const companyId = input.request.company_id;
    const workspace = await this.stateRepository().getWorkspace(workspaceId, companyId);
    if (sha256(canonicalNumberLifecycleJson(numberingCandidateSnapshotFacts(workspace))) !== input.snapshot.numberFactsHash) {
      throw new Error("APPROVAL_SNAPSHOT_STALE");
    }
    const candidates = await this.client.query<CandidateRow>(
      `SELECT * FROM numbering_candidate_revision_drafts
       WHERE workspace_id = :workspaceId AND company_id = :companyId
       ORDER BY created_at, id${this.client.kind === "postgres" ? " FOR UPDATE" : ""}`,
      { workspaceId, companyId }
    );
    const snapshotByCandidate = new Map(input.snapshot.candidateRevisions.map((candidate) => [candidate.id, candidate]));
    if (candidates.length !== input.snapshot.candidateRevisions.length) throw new Error("APPROVAL_SNAPSHOT_STALE");
    for (const candidate of candidates) {
      const locked = snapshotByCandidate.get(candidate.id);
      if (
        !locked || candidate.lifecycle_status !== "review_locked" || candidate.approval_request_id !== input.request.id ||
        candidate.review_snapshot_hash !== input.snapshotHash || Number(candidate.row_version) !== locked.rowVersion ||
        candidate.revision !== locked.revision
      ) throw new Error("APPROVAL_SNAPSHOT_STALE");
      const files = await this.finalizedCandidateFiles(candidate.id);
      const expectedFiles = canonicalNumberLifecycleJson(locked.files.map((file) => ({
        id: file.id,
        sourceFileAssetId: file.sourceFileAssetId,
        publicationEvidenceId: file.publicationEvidenceId,
        role: file.role,
        isPrimary: file.isPrimary,
        provider: file.provider,
        bucket: file.bucket,
        objectKey: file.objectKey,
        generation: file.generation,
        contentHash: file.contentHash,
        mediaType: file.mediaType,
        finalizedAt: file.finalizedAt,
        ruleVersion: file.ruleVersion
      })));
      const actualFiles = canonicalNumberLifecycleJson(files.map((file) => ({
        id: file.id,
        sourceFileAssetId: file.source_file_asset_id,
        publicationEvidenceId: file.publication_evidence_id,
        role: file.role,
        isPrimary: Number(file.is_primary) === 1,
        provider: file.provider,
        bucket: file.bucket,
        objectKey: file.object_key,
        generation: file.generation,
        contentHash: file.content_hash,
        mediaType: file.media_type,
        finalizedAt: file.finalized_at,
        ruleVersion: file.rule_version
      })));
      if (actualFiles !== expectedFiles) throw new Error("APPROVAL_SNAPSHOT_STALE");
    }
    const evidence = await new (await import("@/lib/publication-evidence")).DatabasePublicationEvidencePort(this.client).verify({
      companyId,
      workspaceId,
      snapshotHash: input.snapshotHash,
      draftDrawingIds: workspace.drawings.map((drawing) => drawing.id)
    });
    if (evidence.status === "not_ready") throw new Error("PUBLICATION_EVIDENCE_NOT_READY");
    if (input.snapshot.mode === "full_bundle") {
      await this.client.execute(
        `UPDATE number_candidate_reservations
         SET reservation_state = 'approved_locked', row_version = row_version + 1, updated_at = :updatedAt
         WHERE workspace_id = :workspaceId AND company_id = :companyId
           AND reservation_state = 'review_locked' AND approval_request_id = :requestId`,
        { workspaceId, companyId, requestId: input.request.id, updatedAt: this.clock() }
      );
    } else {
      await this.client.execute(
        `UPDATE number_candidate_reservations
         SET approval_request_id = :requestId, row_version = row_version + 1, updated_at = :updatedAt
         WHERE workspace_id = :workspaceId AND company_id = :companyId
           AND reservation_state = 'approved_locked'`,
        { workspaceId, companyId, requestId: input.request.id, updatedAt: this.clock() }
      );
    }
    this.faultInjector?.("before_formal_master_promotion");
    const publication = await this.stateRepository().publishApprovedWorkspace({
      workspaceId,
      companyId,
      actorId: input.actorId,
      evidence,
      approvalOverride: {
        requestId: input.request.id,
        snapshotHash: input.snapshotHash,
        factsHash: input.snapshot.numberFactsHash,
        lockedReservations: input.snapshot.lockedReservations.map((reservation) => ({
          id: reservation.id,
          candidateCode: reservation.candidateCode,
          rowVersion: reservation.rowVersion
        })),
        reservationVersionOffset: 1
      }
    });
    this.faultInjector?.("after_formal_master_promotion");
    const now = this.clock();
    for (const candidate of candidates) {
      const drawing = workspace.drawings.find((entry) => entry.id === candidate.drawing_draft_id);
      const drawingReservation = workspace.reservations.find((entry) => entry.id === candidate.candidate_reservation_id);
      if (!drawing || !drawingReservation) throw new Error("APPROVAL_SNAPSHOT_STALE");
      const drawingNumberId = `drawing-number-${candidate.candidate_reservation_id}`;
      const packageId = `drawing-revision-package-${candidate.id}`;
      const conflict = await this.client.queryOne<{ id: string }>(
        `SELECT id FROM drawing_revision_packages
         WHERE company_id = :companyId AND drawing_number_id = :drawingNumberId
           AND revision = :revision AND id <> :packageId
           AND status IN ('Draft', 'Pending', 'Released') LIMIT 1`,
        { companyId, drawingNumberId, revision: candidate.revision, packageId }
      );
      if (conflict) throw new Error("FORMAL_REVISION_CONFLICT");
      await this.client.execute(
        `INSERT INTO drawing_revision_packages (
           id, company_id, drawing_number_id, drawing_number, revision, status,
           source_submission_id, created_by, created_at, updated_at, submitted_at, snapshot_json
         ) VALUES (
           :id, :companyId, :drawingNumberId, :drawingNumber, :revision, 'Pending',
           NULL, :createdBy, :createdAt, :updatedAt, :submittedAt, :snapshotJson
         )`,
        {
          id: packageId,
          companyId,
          drawingNumberId,
          drawingNumber: drawingReservation.candidateCode,
          revision: candidate.revision,
          createdBy: input.actorId,
          createdAt: now,
          updatedAt: now,
          submittedAt: now,
          snapshotJson: canonicalNumberLifecycleJson({
            source: "candidate_bundle_approval",
            candidateRevisionId: candidate.id,
            approvalRequestId: input.request.id,
            reviewSnapshotHash: input.snapshotHash
          })
        }
      );
      const files = await this.candidateFiles(candidate.id);
      for (const file of files.filter((entry) => !entry.removed_at)) {
        const candidateAsset = await this.client.queryOne<{ id: string }>(
          `SELECT id FROM file_assets
           WHERE id = :sourceFileAssetId
             AND linked_entity_type = 'numbering_candidate_revision'
             AND linked_entity_id = :candidateRevisionId
             AND deleted_at IS NULL`,
          { sourceFileAssetId: file.source_file_asset_id, candidateRevisionId: candidate.id }
        );
        if (!candidateAsset) throw new Error("APPROVAL_SNAPSHOT_STALE");
        await this.client.execute(
          `UPDATE file_assets
           SET linked_entity_type = 'drawing_number', linked_entity_id = :drawingNumberId,
               updated_at = :updatedAt
           WHERE id = :sourceFileAssetId
             AND linked_entity_type = 'numbering_candidate_revision'
             AND linked_entity_id = :candidateRevisionId`,
          {
            sourceFileAssetId: file.source_file_asset_id,
            candidateRevisionId: candidate.id,
            drawingNumberId,
            updatedAt: now
          }
        );
        await this.client.execute(
          `INSERT INTO drawing_revision_package_files (
             id, package_id, source_file_asset_id, source_submission_file_id, role, role_source,
             display_name, description, sort_order, is_primary, created_by, created_at
           ) VALUES (
             :id, :packageId, :sourceFileAssetId, NULL, :role, :roleSource,
             :displayName, :description, :sortOrder, :isPrimary, :createdBy, :createdAt
           )`,
          {
            id: `DRPF-${this.idFactory()}`,
            packageId,
            sourceFileAssetId: file.source_file_asset_id,
            role: file.role,
            roleSource: file.role_source,
            displayName: file.display_name,
            description: file.description,
            sortOrder: Number(file.sort_order),
            isPrimary: Number(file.is_primary) === 1 ? 1 : 0,
            createdBy: input.actorId,
            createdAt: now
          }
        );
      }
      await this.client.execute(
        `INSERT INTO drawing_revision_package_review_approvals (
           package_id, company_id, candidate_revision_id, approval_request_id,
           snapshot_hash, approved_by, approved_at, created_at
         ) VALUES (
           :packageId, :companyId, :candidateRevisionId, :approvalRequestId,
           :snapshotHash, :approvedBy, :approvedAt, :createdAt
         )`,
        {
          packageId,
          companyId,
          candidateRevisionId: candidate.id,
          approvalRequestId: input.request.id,
          snapshotHash: input.snapshotHash,
          approvedBy: input.actorId,
          approvedAt: now,
          createdAt: now
        }
      );
      await this.client.execute(
        `UPDATE numbering_candidate_revision_drafts
         SET lifecycle_status = 'promoted', formal_drawing_number_id = :drawingNumberId,
             formal_revision_package_id = :packageId, promoted_at = :promotedAt,
             row_version = row_version + 1, updated_by = :actorId, updated_at = :updatedAt
         WHERE id = :candidateRevisionId AND company_id = :companyId
           AND lifecycle_status = 'review_locked' AND approval_request_id = :approvalRequestId
           AND review_snapshot_hash = :snapshotHash`,
        {
          drawingNumberId,
          packageId,
          promotedAt: now,
          actorId: input.actorId,
          updatedAt: now,
          candidateRevisionId: candidate.id,
          companyId,
          approvalRequestId: input.request.id,
          snapshotHash: input.snapshotHash
        }
      );
    }
    this.faultInjector?.("after_revision_packages");
    return publication;
  }

  async decideBundleReview(input: {
    requestId: string;
    companyId: string;
    actorId: string;
    actorRole: string;
    decision: "approved" | "rejected" | "needs_info";
    comment: string | null;
  }): Promise<BundleDecisionResult> {
    const request = await this.requestForDecision(input.requestId, input.companyId);
    if (!request) throw new Error("APPROVAL_REQUEST_NOT_FOUND");
    if (request.request_status !== "pending") throw new Error(`APPROVAL_REQUEST_ALREADY_RESOLVED:${request.request_status}`);
    const { hash: snapshotHash, snapshot } = await this.snapshotForRequest(input.requestId);
    const payload = parseObject(request.payload_json);
    if (payload.snapshotHash !== snapshotHash || snapshot.companyId !== input.companyId) throw new Error("APPROVAL_SNAPSHOT_STALE");
    const now = this.clock();
    await this.client.execute(
      `INSERT INTO approval_platform_decisions (
         id, request_id, approver_role, approver_id, decision, comment, decided_at
       ) VALUES (:id, :requestId, :approverRole, :approverId, :decision, :comment, :decidedAt)`,
      {
        id: `APD-${this.idFactory()}`,
        requestId: input.requestId,
        approverRole: input.actorRole,
        approverId: input.actorId,
        decision: input.decision,
        comment: input.comment,
        decidedAt: now
      }
    );
    if (input.decision !== "approved") {
      if (snapshot.mode === "full_bundle") {
        await this.client.execute(
          `UPDATE number_candidate_reservations
           SET reservation_state = 'active', approval_request_id = NULL,
               row_version = row_version + 1, updated_at = :updatedAt
           WHERE workspace_id = :workspaceId AND company_id = :companyId
             AND reservation_state = 'review_locked' AND approval_request_id = :requestId`,
          { workspaceId: request.workspace_id, companyId: input.companyId, requestId: input.requestId, updatedAt: now }
        );
      }
      await this.client.execute(
        `UPDATE numbering_candidate_revision_drafts
         SET lifecycle_status = 'draft', approval_request_id = NULL, review_snapshot_hash = NULL,
             row_version = row_version + 1, updated_by = :actorId, updated_at = :updatedAt
         WHERE workspace_id = :workspaceId AND company_id = :companyId
           AND lifecycle_status = 'review_locked' AND approval_request_id = :requestId`,
        { workspaceId: request.workspace_id, companyId: input.companyId, requestId: input.requestId, actorId: input.actorId, updatedAt: now }
      );
      await this.client.execute(
        `UPDATE approval_platform_requests
         SET request_status = :decision, apply_status = 'applied', apply_attempts = apply_attempts + 1,
             apply_error = NULL, resolved_by = :actorId, resolved_at = :resolvedAt,
             applied_by = :actorId, applied_at = :appliedAt, updated_at = :updatedAt
         WHERE id = :requestId AND company_id = :companyId`,
        { ...input, resolvedAt: now, appliedAt: now, updatedAt: now }
      );
      await this.approvalEvent(input.requestId, "approval_platform.request.decided", input.actorId, {
        decision: input.decision,
        applyStatus: "applied"
      });
      return {
        workspace: await this.stateRepository().getWorkspace(request.workspace_id, input.companyId),
        requestId: input.requestId,
        decision: input.decision,
        applyFailed: false,
        publication: null
      };
    }

    const savepoint = "candidate_bundle_formalization";
    await this.client.execute(`SAVEPOINT ${savepoint}`);
    try {
      this.faultInjector?.("before_candidate_bundle_formalization");
      const publication = await this.formalizeApprovedBundle({ request, snapshot, snapshotHash, actorId: input.actorId });
      await this.client.execute(
        `UPDATE approval_platform_requests
         SET request_status = 'approved', apply_status = 'applied', apply_attempts = apply_attempts + 1,
             apply_error = NULL, resolved_by = :actorId, resolved_at = :resolvedAt,
             applied_by = :actorId, applied_at = :appliedAt, updated_at = :updatedAt
         WHERE id = :requestId AND company_id = :companyId`,
        { ...input, resolvedAt: now, appliedAt: now, updatedAt: now }
      );
      await this.approvalEvent(input.requestId, "approval_platform.request.decided", input.actorId, {
        decision: "approved",
        applyStatus: "applied",
        formalizationSource: "bundle_approval"
      });
      await this.audit(input.actorId, "pdm.numbering.decide_candidate_bundle_review", {
        companyId: input.companyId,
        workspaceId: request.workspace_id,
        requestId: input.requestId,
        decision: "approved",
        snapshotHash,
        formalizationSource: "bundle_approval"
      });
      await this.client.execute(`RELEASE SAVEPOINT ${savepoint}`);
      return {
        workspace: await this.stateRepository().getWorkspace(request.workspace_id, input.companyId),
        requestId: input.requestId,
        decision: "approved",
        applyFailed: false,
        publication
      };
    } catch (error) {
      await this.client.execute(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await this.client.execute(`RELEASE SAVEPOINT ${savepoint}`);
      const applyError = error instanceof Error ? error.message.slice(0, 500) : "CANDIDATE_BUNDLE_FORMALIZATION_FAILED";
      const faultPoint = error instanceof NumberLifecycleRepositoryFault ? error.faultPoint : applyError;
      await this.client.execute(
        `UPDATE approval_platform_requests
         SET request_status = 'apply_failed', apply_status = 'failed', apply_attempts = apply_attempts + 1,
             apply_error = :applyError, resolved_by = :actorId, resolved_at = :resolvedAt, updated_at = :updatedAt
         WHERE id = :requestId AND company_id = :companyId`,
        { ...input, applyError, resolvedAt: now, updatedAt: now }
      );
      await this.approvalEvent(input.requestId, "approval_platform.request.apply_failed", input.actorId, {
        decision: "approved",
        faultPoint,
        noPartialFormalData: true
      });
      await this.audit(input.actorId, "pdm.numbering.candidate_bundle_apply_failed", {
        companyId: input.companyId,
        workspaceId: request.workspace_id,
        requestId: input.requestId,
        snapshotHash,
        faultPoint
      });
      return {
        workspace: await this.stateRepository().getWorkspace(request.workspace_id, input.companyId),
        requestId: input.requestId,
        decision: "approved",
        applyFailed: true,
        publication: null
      };
    }
  }

  async retryBundleApply(input: { requestId: string; companyId: string; actorId: string }) {
    const request = await this.requestForDecision(input.requestId, input.companyId);
    if (!request) throw new Error("APPROVAL_REQUEST_NOT_FOUND");
    if (request.request_status !== "apply_failed" || request.apply_status !== "failed") {
      throw new Error(`APPROVAL_REQUEST_NOT_READY_TO_APPLY:${request.request_status}`);
    }
    const decision = await this.client.queryOne<{ decision: string; approver_id: string }>(
      `SELECT decision, approver_id FROM approval_platform_decisions
       WHERE request_id = :requestId ORDER BY decided_at DESC, id DESC LIMIT 1`,
      { requestId: input.requestId }
    );
    if (decision?.decision !== "approved") throw new Error("APPROVAL_DECISION_NOT_FOUND");
    const { hash: snapshotHash, snapshot } = await this.snapshotForRequest(input.requestId);
    const savepoint = "candidate_bundle_formalization";
    const now = this.clock();
    await this.client.execute(`SAVEPOINT ${savepoint}`);
    try {
      const publication = await this.formalizeApprovedBundle({ request, snapshot, snapshotHash, actorId: decision.approver_id });
      await this.client.execute(
        `UPDATE approval_platform_requests
         SET request_status = 'approved', apply_status = 'applied', apply_attempts = apply_attempts + 1,
             apply_error = NULL, applied_by = :appliedBy, applied_at = :appliedAt, updated_at = :updatedAt
         WHERE id = :requestId AND company_id = :companyId`,
        { ...input, appliedBy: input.actorId, appliedAt: now, updatedAt: now }
      );
      await this.approvalEvent(input.requestId, "approval_platform.request.applied", input.actorId, {
        retry: true,
        originalApproverId: decision.approver_id,
        formalizationSource: "bundle_approval"
      });
      await this.audit(input.actorId, "pdm.numbering.retry_candidate_bundle_apply", {
        companyId: input.companyId,
        workspaceId: request.workspace_id,
        requestId: input.requestId,
        snapshotHash,
        originalApproverId: decision.approver_id
      });
      await this.client.execute(`RELEASE SAVEPOINT ${savepoint}`);
      return { workspace: await this.stateRepository().getWorkspace(request.workspace_id, input.companyId), requestId: input.requestId, publication };
    } catch (error) {
      await this.client.execute(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await this.client.execute(`RELEASE SAVEPOINT ${savepoint}`);
      const applyError = error instanceof Error ? error.message.slice(0, 500) : "CANDIDATE_BUNDLE_FORMALIZATION_FAILED";
      await this.client.execute(
        `UPDATE approval_platform_requests
         SET apply_attempts = apply_attempts + 1, apply_error = :applyError, updated_at = :updatedAt
         WHERE id = :requestId AND company_id = :companyId`,
        { ...input, applyError, updatedAt: now }
      );
      await this.approvalEvent(input.requestId, "approval_platform.request.apply_failed", input.actorId, {
        retry: true,
        noPartialFormalData: true,
        error: applyError
      });
      throw error;
    }
  }
}
