export type NumberLifecycleStageV2 =
  | "drawing_preparation"
  | "bundle_ready"
  | "in_review"
  | "auto_finalizing"
  | "official_controlled"
  | "drawing_addendum_required"
  | "recovery_required"
  | "history_only";

export type NumberLifecycleReasonCodeV2 =
  | "new_or_legacy_active"
  | "bundle_complete"
  | "bundle_review_pending"
  | "legacy_number_review"
  | "legacy_number_approved_without_drawing"
  | "bundle_apply_failed"
  | "published"
  | "terminal"
  | "inconsistent";

export type NumberLifecyclePrimaryActionV2 =
  | "complete_first_drawing"
  | "submit_bundle_review"
  | "view_review"
  | "retry_formalization"
  | "continue_formal_revision"
  | "view_history"
  | "none";

export type CandidateRevisionLifecycleStatus = "draft" | "review_locked" | "promoted" | "cancelled";

export type NumberingCandidateRevisionFileRecord = {
  id: string;
  sourceFileAssetId: string;
  publicationEvidenceId: string | null;
  role: "cad_3d" | "drawing_2d" | "intermediate" | "pdf" | "dwg_dxf" | "other";
  roleSource: "extension" | "user" | "migration" | "system";
  displayName: string;
  description: string;
  sortOrder: number;
  isPrimary: boolean;
  removedAt: string | null;
  removedBy: string | null;
};

export type NumberingCandidateRevisionRecord = {
  id: string;
  companyId: string;
  workspaceId: string;
  drawingDraftId: string;
  candidateReservationId: string;
  revision: string;
  workflowIntent: "rd_workspace";
  policySnapshot: Record<string, unknown>;
  overrideReason: string | null;
  lifecycleStatus: CandidateRevisionLifecycleStatus;
  rowVersion: number;
  approvalRequestId: string | null;
  reviewSnapshotHash: string | null;
  legacyBaselineRequestId: string | null;
  legacyBaselineSnapshotHash: string | null;
  formalDrawingNumberId: string | null;
  formalRevisionPackageId: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  promotedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  files: NumberingCandidateRevisionFileRecord[];
  effectiveStatus: "ReviewApproved" | "Pending" | null;
};

export type NumberLifecycleProjectionV2 = {
  stage: NumberLifecycleStageV2;
  reasonCode: NumberLifecycleReasonCodeV2;
  primaryAction: NumberLifecyclePrimaryActionV2;
  exceptionKind: "none" | "legacy" | "blocked" | "recovery";
};

type ReservationFact = {
  itemType: "root" | "part" | "drawing";
  state: "active" | "review_locked" | "approved_locked" | "promoted" | "recycled";
};

type ApprovalFact = {
  status: "pending" | "approved" | "rejected" | "needs_info" | "cancelled" | "apply_failed" | "applied";
  applyStatus: "not_ready" | "not_required" | "pending" | "applied" | "failed";
} | null;

export type NumberLifecycleProjectionInput = {
  workspaceLifecycle: "active" | "cancelled" | "published";
  drawingDraftIds: string[];
  relationCount: number;
  relationshipOnlyReady?: boolean;
  reservations: ReservationFact[];
  legacyApproval: ApprovalFact;
  bundleApproval: ApprovalFact;
  candidateRevisions: NumberingCandidateRevisionRecord[];
};

export type CandidateRevisionReadiness = {
  ready: boolean;
  missing: Array<"revision" | "primary_file" | "finalized_evidence">;
};

export function evaluateCandidateRevisionReadiness(
  candidate: NumberingCandidateRevisionRecord
): CandidateRevisionReadiness {
  const missing: CandidateRevisionReadiness["missing"] = [];
  const activeFiles = candidate.files.filter((file) => !file.removedAt);
  if (!candidate.revision.trim()) missing.push("revision");
  if (!activeFiles.some((file) => file.isPrimary)) missing.push("primary_file");
  if (!activeFiles.some((file) => file.isPrimary && file.publicationEvidenceId)) {
    missing.push("finalized_evidence");
  }
  return { ready: missing.length === 0, missing };
}

function projection(
  stage: NumberLifecycleStageV2,
  reasonCode: NumberLifecycleReasonCodeV2,
  primaryAction: NumberLifecyclePrimaryActionV2,
  exceptionKind: NumberLifecycleProjectionV2["exceptionKind"] = "none"
): NumberLifecycleProjectionV2 {
  return { stage, reasonCode, primaryAction, exceptionKind };
}

export function projectNumberLifecycleV2(input: NumberLifecycleProjectionInput): NumberLifecycleProjectionV2 {
  const activeReservations = input.reservations.filter((reservation) => reservation.state !== "recycled");
  const reservationStates = new Set(activeReservations.map((reservation) => reservation.state));
  const allReservationsAre = (state: ReservationFact["state"]) =>
    activeReservations.length > 0 && activeReservations.every((reservation) => reservation.state === state);

  if (input.workspaceLifecycle === "cancelled" || (input.reservations.length > 0 && activeReservations.length === 0)) {
    return projection("history_only", "terminal", "view_history");
  }

  if (input.workspaceLifecycle === "published" || allReservationsAre("promoted")) {
    return projection("official_controlled", "published", "continue_formal_revision");
  }

  if (
    input.workspaceLifecycle !== "active" ||
    reservationStates.size > 1 ||
    input.candidateRevisions.some((candidate) => candidate.lifecycleStatus === "promoted")
  ) {
    return projection("recovery_required", "inconsistent", "view_history", "recovery");
  }

  if (input.bundleApproval?.status === "apply_failed" || input.bundleApproval?.applyStatus === "failed") {
    return projection("recovery_required", "bundle_apply_failed", "retry_formalization", "recovery");
  }

  if (
    input.bundleApproval?.status === "approved" &&
    ["not_ready", "pending"].includes(input.bundleApproval.applyStatus)
  ) {
    return projection("auto_finalizing", "bundle_review_pending", "none");
  }

  if (
    input.bundleApproval?.status === "pending" ||
    input.candidateRevisions.some((candidate) => candidate.lifecycleStatus === "review_locked")
  ) {
    return projection("in_review", "bundle_review_pending", "view_review");
  }

  if (allReservationsAre("review_locked")) {
    if (input.legacyApproval?.status === "pending") {
      return projection("in_review", "legacy_number_review", "view_review", "legacy");
    }
    return projection("recovery_required", "inconsistent", "view_history", "recovery");
  }

  if (allReservationsAre("approved_locked")) {
    if (input.legacyApproval?.status === "approved" && input.legacyApproval.applyStatus === "applied") {
      return projection(
        "drawing_addendum_required",
        "legacy_number_approved_without_drawing",
        "complete_first_drawing",
        "legacy"
      );
    }
    return projection("recovery_required", "inconsistent", "view_history", "recovery");
  }

  const activeCandidates = input.candidateRevisions.filter((candidate) => candidate.lifecycleStatus === "draft");
  const candidateByDrawing = new Map(activeCandidates.map((candidate) => [candidate.drawingDraftId, candidate]));
  const everyDrawingReady = Boolean(input.relationshipOnlyReady) || (input.drawingDraftIds.length > 0 && input.drawingDraftIds.every((drawingDraftId) => {
    const candidate = candidateByDrawing.get(drawingDraftId);
    return candidate ? evaluateCandidateRevisionReadiness(candidate).ready : false;
  }));
  const relationsReady = Boolean(input.relationshipOnlyReady) || input.relationCount > 0 || input.drawingDraftIds.length === 0;

  if (allReservationsAre("active") && everyDrawingReady && relationsReady) {
    return projection("bundle_ready", "bundle_complete", "submit_bundle_review");
  }

  if (activeReservations.length === 0 || allReservationsAre("active")) {
    return projection("drawing_preparation", "new_or_legacy_active", "complete_first_drawing");
  }

  return projection("recovery_required", "inconsistent", "view_history", "recovery");
}

const safeIdempotencyKey = /^[A-Za-z0-9._:/-]{1,200}$/u;
const candidateFileRoles = new Set<NumberingCandidateRevisionFileRecord["role"]>([
  "cad_3d",
  "drawing_2d",
  "intermediate",
  "pdf",
  "dwg_dxf",
  "other"
]);

function lifecycleText(value: unknown, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

function lifecycleRequiredText(value: unknown, field: string, maximum = 500) {
  const normalized = lifecycleText(value, maximum);
  if (!normalized) throw new NumberStateFlowError("candidate_revision_invalid", `${field} is required.`, 400);
  return normalized;
}

function lifecycleInteger(value: unknown, code: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new NumberStateFlowError(code, "A current row version is required.", 400);
  }
  return parsed;
}

function lifecycleIdempotencyKey(value: string) {
  const normalized = value.trim();
  if (!safeIdempotencyKey.test(normalized)) {
    throw new NumberStateFlowError("idempotency_key_required", "A valid Idempotency-Key is required.", 400);
  }
  return normalized;
}

function assertLifecycleV2Enabled() {
  if (!isNumberLifecycleV2Enabled()) {
    throw new NumberStateFlowError(
      "number_lifecycle_v2_not_enabled",
      "The simplified number lifecycle is not enabled.",
      503
    );
  }
}

function lifecycleReceipt(commandName: string, idempotencyKey: string, idempotentReplay: boolean) {
  return { commandName, idempotencyKey, idempotentReplay };
}

function lifecycleResponse(workspace: import("@/lib/repositories/number-state-flow-async-repository").NumberingDraftWorkspaceRecord) {
  return {
    workspace,
    candidateRevisions: workspace.candidateRevisions,
    lifecycleV2: workspace.lifecycleV2
  };
}

function lifecycleRepositoryError(error: unknown): never {
  if (error instanceof NumberStateFlowError) throw error;
  const raw = error instanceof Error ? error.message : String(error);
  const code = raw.split(":", 1)[0];
  const mappings: Record<string, [string, string, number, boolean?]> = {
    WORKSPACE_NOT_FOUND: ["workspace_not_found", "Workspace was not found.", 404],
    DRAWING_DRAFT_NOT_FOUND: ["workspace_not_found", "Drawing draft was not found in this workspace.", 404],
    CANDIDATE_REVISION_NOT_FOUND: ["candidate_revision_not_found", "Candidate revision was not found.", 404],
    CANDIDATE_FILE_NOT_FOUND: ["candidate_revision_not_found", "Candidate revision file was not found.", 404],
    APPROVAL_REQUEST_NOT_FOUND: ["approval_request_not_found", "Approval request was not found.", 404],
    WORKSPACE_VERSION_CONFLICT: ["workspace_version_stale", "Workspace changed. Refresh before continuing.", 409, true],
    CANDIDATE_REVISION_VERSION_CONFLICT: ["candidate_revision_version_stale", "Candidate revision changed. Refresh before continuing.", 409, true],
    CANDIDATE_FILE_VERIFICATION_STALE: ["candidate_file_verification_stale", "檔案狀態已變更，請重新整理後再驗證。", 409, true],
    CANDIDATE_FILE_EXISTING_VERIFICATION_NOT_AVAILABLE: ["candidate_file_existing_verification_not_available", "目前環境無法為既有檔案建立可信驗證證據；請改由受控儲存重新上傳。", 503],
    CANDIDATE_REVISION_LOCKED: ["candidate_revision_locked", "Candidate revision is locked by review or formalization.", 409],
    CANDIDATE_REVISION_ALREADY_EXISTS: ["candidate_revision_locked", "A candidate revision already exists for this drawing.", 409],
    CANDIDATE_REVISION_INVALID: ["candidate_revision_invalid", "Use a development revision such as 0.1 or 1.1.", 400],
    OVERRIDE_REASON_REQUIRED: ["override_reason_required", "Explain why the suggested revision is being overridden.", 400],
    BUNDLE_NOT_READY: ["bundle_not_ready", "Complete the first revision, primary files, and drawing relationships before review.", 409],
    PUBLICATION_EVIDENCE_NOT_READY: ["publication_evidence_not_ready", "Finalized Google Cloud Storage evidence is required.", 503, true],
    APPROVAL_SNAPSHOT_STALE: ["approval_snapshot_stale", "The approved bundle no longer matches current facts.", 409],
    FORMAL_REVISION_CONFLICT: ["formal_revision_conflict", "This formal drawing revision already exists.", 409],
    BUNDLE_REVIEW_ALREADY_PENDING: ["candidate_revision_locked", "This bundle is already in review.", 409],
    BUNDLE_REVIEW_NOT_PENDING: ["candidate_revision_locked", "No pending bundle review can be withdrawn.", 409],
    WORKSPACE_NOT_ACTIVE: ["candidate_revision_locked", "This workspace is no longer active.", 409],
    REVIEW_WITHDRAW_OWNER_REQUIRED: ["numbering_permission_required", "Only the workspace owner can withdraw this review.", 403],
    LEGACY_APPROVAL_BASELINE_REQUIRED: ["approval_snapshot_stale", "The legacy approval baseline is incomplete.", 409],
    APPROVAL_ACTION_NOT_REGISTERED: ["number_lifecycle_v2_not_enabled", "Bundle review action is not available.", 503],
    APPROVAL_DECISION_NOT_FOUND: ["approval_snapshot_stale", "The approved decision could not be verified.", 409]
  };
  if (code === "PLATFORM_COMMAND_IN_PROGRESS") {
    throw new NumberStateFlowError("command_in_progress", "This command is still processing.", 409, true);
  }
  if (code.startsWith("APPROVAL_REQUEST_ALREADY_RESOLVED") || code.startsWith("APPROVAL_REQUEST_NOT_READY_TO_APPLY")) {
    throw new NumberStateFlowError("candidate_revision_locked", "The approval request cannot be changed in its current state.", 409);
  }
  if (/PLATFORM_COMMAND.*PAYLOAD|IDEMPOTENCY.*MISMATCH/iu.test(raw)) {
    throw new NumberStateFlowError("idempotency_payload_mismatch", "This idempotency key was used with different input.", 409);
  }
  const mapped = mappings[code];
  if (mapped) throw new NumberStateFlowError(mapped[0], mapped[1], mapped[2], mapped[3] ?? false);
  throw error;
}

async function lifecycleRepository() {
  const { AsyncNumberLifecycleSimplificationRepository } = await import(
    "@/lib/repositories/number-lifecycle-simplification-async-repository"
  );
  return AsyncNumberLifecycleSimplificationRepository;
}

export async function createNumberingCandidateRevision(input: {
  metadata: PdmCommandMetadata;
  workspaceId: string;
  drawingDraftId: unknown;
  expectedWorkspaceRowVersion: unknown;
}) {
  assertLifecycleV2Enabled();
  const commandName = "pdm.numbering.create_candidate_revision";
  const idempotencyKey = lifecycleIdempotencyKey(input.metadata.idempotencyKey);
  const workspaceId = lifecycleRequiredText(input.workspaceId, "workspaceId", 200);
  const drawingDraftId = lifecycleRequiredText(input.drawingDraftId, "drawingDraftId", 200);
  const expectedWorkspaceRowVersion = lifecycleInteger(input.expectedWorkspaceRowVersion, "workspace_version_stale");
  try {
    const command = createPdmCommand({
      commandName,
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { workspaceId, drawingDraftId, expectedWorkspaceRowVersion }
    });
    const Repository = await lifecycleRepository();
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      idempotencyPayload: command.payload,
      execute: (client) => new Repository(client).createCandidateRevision({
        workspaceId,
        companyId: input.metadata.actor.organizationId,
        drawingDraftId,
        actorId: input.metadata.actor.pdmUserId,
        expectedWorkspaceRowVersion
      }),
      event: (workspace) => ({
        aggregateType: "numbering_candidate_revision",
        aggregateId: workspace.candidateRevisions.find((candidate) => candidate.drawingDraftId === drawingDraftId)?.id ?? drawingDraftId,
        eventType: "pdm.numbering.candidate_revision.created.v1",
        payload: { workspaceId, drawingDraftId, companyId: workspace.companyId }
      })
    });
    return {
      ...lifecycleResponse(execution.result),
      receipt: lifecycleReceipt(commandName, idempotencyKey, execution.reusedFromCommandReceipt)
    };
  } catch (error) {
    lifecycleRepositoryError(error);
  }
}

export async function updateNumberingCandidateRevision(input: {
  metadata: PdmCommandMetadata;
  workspaceId: string;
  candidateRevisionId: string;
  revision: unknown;
  overrideReason?: unknown;
  expectedRowVersion: unknown;
}) {
  assertLifecycleV2Enabled();
  const commandName = "pdm.numbering.update_candidate_revision";
  const idempotencyKey = lifecycleIdempotencyKey(input.metadata.idempotencyKey);
  const workspaceId = lifecycleRequiredText(input.workspaceId, "workspaceId", 200);
  const candidateRevisionId = lifecycleRequiredText(input.candidateRevisionId, "candidateRevisionId", 200);
  const revision = lifecycleRequiredText(input.revision, "revision", 40).replace(/\s+/gu, "");
  const overrideReason = lifecycleText(input.overrideReason, 1000) || null;
  const expectedRowVersion = lifecycleInteger(input.expectedRowVersion, "candidate_revision_version_stale");
  try {
    const command = createPdmCommand({
      commandName,
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { workspaceId, candidateRevisionId, revision, overrideReason, expectedRowVersion }
    });
    const Repository = await lifecycleRepository();
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      idempotencyPayload: command.payload,
      execute: (client) => new Repository(client).updateCandidateRevision({
        workspaceId,
        companyId: input.metadata.actor.organizationId,
        candidateRevisionId,
        actorId: input.metadata.actor.pdmUserId,
        expectedRowVersion,
        revision,
        overrideReason
      }),
      event: (workspace) => ({
        aggregateType: "numbering_candidate_revision",
        aggregateId: candidateRevisionId,
        eventType: "pdm.numbering.candidate_revision.updated.v1",
        payload: { workspaceId, candidateRevisionId, revision, companyId: workspace.companyId }
      })
    });
    return {
      ...lifecycleResponse(execution.result),
      receipt: lifecycleReceipt(commandName, idempotencyKey, execution.reusedFromCommandReceipt)
    };
  } catch (error) {
    lifecycleRepositoryError(error);
  }
}

function candidateFileRole(value: unknown): NumberingCandidateRevisionFileRecord["role"] {
  const normalized = lifecycleText(value, 40) as NumberingCandidateRevisionFileRecord["role"];
  if (!candidateFileRoles.has(normalized)) {
    throw new NumberStateFlowError("candidate_revision_invalid", "A valid candidate file role is required.", 400);
  }
  return normalized;
}

export async function addNumberingCandidateRevisionFile(input: {
  metadata: PdmCommandMetadata;
  workspaceId: string;
  candidateRevisionId: string;
  expectedRowVersion: unknown;
  file: File;
  role: unknown;
  isPrimary: unknown;
  displayName?: unknown;
  description?: unknown;
}) {
  assertLifecycleV2Enabled();
  if (!(input.file instanceof File) || input.file.size < 1) {
    throw new NumberStateFlowError("candidate_file_required", "A candidate revision file is required.", 400);
  }
  if (input.file.size > 250 * 1024 * 1024) {
    throw new NumberStateFlowError("candidate_revision_invalid", "Candidate revision files cannot exceed 250 MB.", 400);
  }
  const commandName = "pdm.numbering.add_candidate_revision_file";
  const idempotencyKey = lifecycleIdempotencyKey(input.metadata.idempotencyKey);
  const workspaceId = lifecycleRequiredText(input.workspaceId, "workspaceId", 200);
  const candidateRevisionId = lifecycleRequiredText(input.candidateRevisionId, "candidateRevisionId", 200);
  const expectedRowVersion = lifecycleInteger(input.expectedRowVersion, "candidate_revision_version_stale");
  const role = candidateFileRole(input.role);
  const isPrimary = input.isPrimary === true || input.isPrimary === "true" || input.isPrimary === "1" || input.isPrimary === 1;
  const fileName = input.file.name.trim().slice(0, 255) || "candidate-file";
  const displayName = lifecycleText(input.displayName, 300) || fileName;
  const description = lifecycleText(input.description, 2000);
  const fileExt = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase().slice(0, 30) : "";
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const mimeType = input.file.type || "application/octet-stream";
  const command = createPdmCommand({
    commandName,
    idempotencyKey,
    actor: input.metadata.actor,
    payload: {
      workspaceId,
      candidateRevisionId,
      expectedRowVersion,
      fileName,
      contentHash,
      role,
      isPrimary,
      displayName,
      description
    }
  });
  const storageService = createFileStorageService();
  const localDevelopmentEvidence = isLocalDevelopmentPublicationEvidenceEnabled();
  const cleanupTarget: { current: { key: string; provider: string } | null } = { current: null };
  let fileId = "";
  try {
    const Repository = await lifecycleRepository();
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      idempotencyPayload: command.payload,
      execute: async (client) => {
        const assetId = `FA-${crypto.randomUUID()}`;
        fileId = `NCRF-${crypto.randomUUID()}`;
        const requestedKey = buildStorageKey([
          "candidate-revisions",
          input.metadata.actor.organizationId,
          candidateRevisionId,
          `${fileId}-${fileName}`
        ]);
        const before = await storageService.getObjectMetadata(requestedKey);
        const stored = await storageService.putObject({ key: requestedKey, bytes, contentType: mimeType });
        if (!before && stored.key === requestedKey) cleanupTarget.current = { key: stored.key, provider: stored.provider };
        if (localDevelopmentEvidence) {
          const hashVerified = await storageService.verifyObjectHash(stored.key, stored.sha256);
          if (!hashVerified) {
            throw new NumberStateFlowError(
              "candidate_file_verification_failed",
              "檔案已收到，但完整性驗證未通過。請保留原檔並重新上傳。",
              502
            );
          }
        }
        const storage: CandidateFileStorageInput = {
          assetId,
          fileId,
          storageProvider: stored.provider,
          originalPath: stored.provider === "local_repository" ? stored.localPath : null,
          storageBucket: stored.bucket ?? null,
          storageKey: stored.key,
          storageGeneration: localDevelopmentEvidence ? `local-${stored.sha256.slice(0, 16)}` : null,
          fileName,
          fileExt,
          mimeType,
          fileSize: stored.bytes,
          contentHash: stored.sha256,
          role,
          roleSource: "user",
          displayName,
          description,
          isPrimary,
          publicationEvidence: localDevelopmentEvidence ? {
            id: `NPE-${crypto.randomUUID()}`,
            bucket: "local-development-validation",
            objectKey: stored.key,
            generation: `local-${stored.sha256.slice(0, 16)}`,
            finalizedAt: new Date().toISOString()
          } : null
        };
        return new Repository(client).addCandidateFile({
          workspaceId,
          companyId: input.metadata.actor.organizationId,
          candidateRevisionId,
          actorId: input.metadata.actor.pdmUserId,
          expectedRowVersion,
          storage
        });
      },
      event: (workspace) => ({
        aggregateType: "numbering_candidate_revision",
        aggregateId: candidateRevisionId,
        eventType: "pdm.numbering.candidate_revision.file_added.v1",
        payload: { workspaceId, candidateRevisionId, fileId, role, isPrimary, companyId: workspace.companyId }
      })
    });
    return {
      ...lifecycleResponse(execution.result),
      localDevelopmentEvidence,
      receipt: lifecycleReceipt(commandName, idempotencyKey, execution.reusedFromCommandReceipt)
    };
  } catch (error) {
    if (cleanupTarget.current) {
      const target = cleanupTarget.current;
      try {
        await storageService.deleteObject(target.key);
      } catch (cleanupError) {
        console.error("Candidate revision orphan cleanup failed.", {
          correlationId: input.metadata.actor.correlationId,
          storageProvider: target.provider,
          storageKey: target.key,
          cleanupError
        });
      }
    }
    lifecycleRepositoryError(error);
  }
}

export async function verifyExistingNumberingCandidateRevisionFile(input: {
  metadata: PdmCommandMetadata;
  workspaceId: string;
  candidateRevisionId: string;
  fileId: string;
  expectedRowVersion: unknown;
}) {
  assertLifecycleV2Enabled();
  const commandName = "pdm.numbering.verify_existing_candidate_revision_file";
  const idempotencyKey = lifecycleIdempotencyKey(input.metadata.idempotencyKey);
  const workspaceId = lifecycleRequiredText(input.workspaceId, "workspaceId", 200);
  const candidateRevisionId = lifecycleRequiredText(input.candidateRevisionId, "candidateRevisionId", 200);
  const fileId = lifecycleRequiredText(input.fileId, "fileId", 200);
  const expectedRowVersion = lifecycleInteger(input.expectedRowVersion, "candidate_revision_version_stale");
  try {
    const Repository = await lifecycleRepository();
    const localDevelopmentEvidence = isLocalDevelopmentPublicationEvidenceEnabled();
    const command = createPdmCommand({
      commandName,
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { workspaceId, candidateRevisionId, fileId, expectedRowVersion }
    });
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      idempotencyPayload: command.payload,
      execute: async (client) => {
        const repository = new Repository(client);
        const source = await repository.candidateFileVerificationSource({
          workspaceId,
          companyId: input.metadata.actor.organizationId,
          candidateRevisionId,
          fileId,
          expectedRowVersion
        });
        let evidence: {
          id: string;
          bucket: string;
          objectKey: string;
          generation: string;
          mediaType: string;
          finalizedAt: string;
        } | null = null;
        if (!source.publicationEvidenceId) {
          if (!localDevelopmentEvidence) {
            throw new NumberStateFlowError(
              "candidate_file_existing_verification_not_available",
              "目前環境無法驗證既有檔案。請由受控儲存重新上傳，或聯絡 PDM Admin。",
              503
            );
          }
          let pointer;
          try {
            pointer = storagePointerFromRecord({
              storage_provider: source.storageProvider,
              storage_bucket: source.storageBucket,
              storage_key: source.storageKey,
              original_path: source.originalPath
            });
          } catch {
            throw new NumberStateFlowError(
              "candidate_file_storage_missing",
              `找不到「${source.fileName}」的受控儲存位置，請重新上傳原檔。`,
              409
            );
          }
          const storageService = createFileStorageServiceForPointer(pointer);
          let verified = false;
          try {
            const metadata = await storageService.getObjectMetadata(pointer.key);
            verified = Boolean(metadata) && metadata?.bytes === source.fileSize
              && await storageService.verifyObjectHash(pointer.key, source.contentHash);
          } catch {
            throw new NumberStateFlowError(
              "candidate_file_storage_missing",
              `無法讀取「${source.fileName}」的已保存原檔，請確認儲存服務或重新上傳。`,
              409,
              true
            );
          }
          if (!verified) {
            throw new NumberStateFlowError(
              "candidate_file_verification_failed",
              `「${source.fileName}」與原上傳雜湊不一致，未建立送審證據；請重新上傳正確原檔。`,
              409
            );
          }
          evidence = {
            id: `NPE-${crypto.randomUUID()}`,
            bucket: "local-development-validation",
            objectKey: pointer.key,
            generation: `local-${source.contentHash.slice(0, 16)}`,
            mediaType: source.mimeType || "application/octet-stream",
            finalizedAt: new Date().toISOString()
          };
        }
        return repository.verifyExistingCandidateFile({
          workspaceId,
          companyId: input.metadata.actor.organizationId,
          candidateRevisionId,
          fileId,
          actorId: input.metadata.actor.pdmUserId,
          expectedRowVersion,
          expectedAssetId: source.assetId,
          expectedContentHash: source.contentHash,
          evidence
        });
      },
      event: (workspace) => ({
        aggregateType: "numbering_candidate_revision",
        aggregateId: candidateRevisionId,
        eventType: "pdm.numbering.candidate_revision.existing_file_verified.v1",
        payload: { workspaceId, candidateRevisionId, fileId, companyId: workspace.companyId }
      })
    });
    return {
      ...lifecycleResponse(execution.result),
      localDevelopmentEvidence,
      receipt: lifecycleReceipt(commandName, idempotencyKey, execution.reusedFromCommandReceipt)
    };
  } catch (error) {
    lifecycleRepositoryError(error);
  }
}

export async function removeNumberingCandidateRevisionFile(input: {
  metadata: PdmCommandMetadata;
  workspaceId: string;
  candidateRevisionId: string;
  fileId: string;
  expectedRowVersion: unknown;
  reason?: unknown;
}) {
  assertLifecycleV2Enabled();
  const commandName = "pdm.numbering.remove_candidate_revision_file";
  const idempotencyKey = lifecycleIdempotencyKey(input.metadata.idempotencyKey);
  const workspaceId = lifecycleRequiredText(input.workspaceId, "workspaceId", 200);
  const candidateRevisionId = lifecycleRequiredText(input.candidateRevisionId, "candidateRevisionId", 200);
  const fileId = lifecycleRequiredText(input.fileId, "fileId", 200);
  const expectedRowVersion = lifecycleInteger(input.expectedRowVersion, "candidate_revision_version_stale");
  const reason = lifecycleText(input.reason, 1000) || null;
  try {
    const command = createPdmCommand({
      commandName,
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { workspaceId, candidateRevisionId, fileId, expectedRowVersion, reason }
    });
    const Repository = await lifecycleRepository();
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      idempotencyPayload: command.payload,
      execute: (client) => new Repository(client).removeCandidateFile({
        workspaceId,
        companyId: input.metadata.actor.organizationId,
        candidateRevisionId,
        fileId,
        actorId: input.metadata.actor.pdmUserId,
        expectedRowVersion,
        reason
      }),
      event: (workspace) => ({
        aggregateType: "numbering_candidate_revision",
        aggregateId: candidateRevisionId,
        eventType: "pdm.numbering.candidate_revision.file_removed.v1",
        payload: { workspaceId, candidateRevisionId, fileId, companyId: workspace.companyId }
      })
    });
    return {
      ...lifecycleResponse(execution.result),
      receipt: lifecycleReceipt(commandName, idempotencyKey, execution.reusedFromCommandReceipt)
    };
  } catch (error) {
    lifecycleRepositoryError(error);
  }
}

export async function submitNumberingCandidateBundleReview(input: {
  metadata: PdmCommandMetadata;
  workspaceId: string;
  expectedWorkspaceRowVersion: unknown;
  reason?: unknown;
}) {
  assertLifecycleV2Enabled();
  const commandName = "pdm.numbering.submit_candidate_bundle_review";
  const idempotencyKey = lifecycleIdempotencyKey(input.metadata.idempotencyKey);
  const workspaceId = lifecycleRequiredText(input.workspaceId, "workspaceId", 200);
  const expectedWorkspaceRowVersion = lifecycleInteger(input.expectedWorkspaceRowVersion, "workspace_version_stale");
  const reason = lifecycleText(input.reason, 2000) || null;
  try {
    const command = createPdmCommand({
      commandName,
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { workspaceId, expectedWorkspaceRowVersion, reason }
    });
    const Repository = await lifecycleRepository();
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      idempotencyPayload: command.payload,
      execute: (client) => new Repository(client).submitBundleReview({
        workspaceId,
        companyId: input.metadata.actor.organizationId,
        actorId: input.metadata.actor.pdmUserId,
        expectedWorkspaceRowVersion,
        reason
      }),
      event: (result) => ({
        aggregateType: "numbering_draft_workspace",
        aggregateId: workspaceId,
        eventType: "pdm.numbering.candidate_bundle_review.submitted.v1",
        payload: { workspaceId, requestId: result.requestId, snapshotHash: result.snapshotHash }
      })
    });
    return {
      ...execution.result,
      candidateRevisions: execution.result.workspace.candidateRevisions,
      lifecycleV2: execution.result.workspace.lifecycleV2,
      receipt: lifecycleReceipt(commandName, idempotencyKey, execution.reusedFromCommandReceipt)
    };
  } catch (error) {
    lifecycleRepositoryError(error);
  }
}

export async function withdrawNumberingCandidateBundleReview(input: {
  metadata: PdmCommandMetadata;
  workspaceId: string;
  expectedWorkspaceRowVersion: unknown;
  reason: unknown;
}) {
  assertLifecycleV2Enabled();
  const commandName = "pdm.numbering.withdraw_candidate_bundle_review";
  const idempotencyKey = lifecycleIdempotencyKey(input.metadata.idempotencyKey);
  const workspaceId = lifecycleRequiredText(input.workspaceId, "workspaceId", 200);
  const expectedWorkspaceRowVersion = lifecycleInteger(input.expectedWorkspaceRowVersion, "workspace_version_stale");
  const reason = lifecycleRequiredText(input.reason, "reason", 2000);
  try {
    const command = createPdmCommand({ commandName, idempotencyKey, actor: input.metadata.actor, payload: { workspaceId, expectedWorkspaceRowVersion, reason } });
    const Repository = await lifecycleRepository();
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      idempotencyPayload: command.payload,
      execute: (client) => new Repository(client).withdrawBundleReview({
        workspaceId,
        companyId: input.metadata.actor.organizationId,
        actorId: input.metadata.actor.pdmUserId,
        expectedWorkspaceRowVersion,
        reason
      }),
      event: (result) => ({
        aggregateType: "numbering_draft_workspace",
        aggregateId: workspaceId,
        eventType: "pdm.numbering.candidate_bundle_review.withdrawn.v1",
        payload: { workspaceId, requestId: result.requestId }
      })
    });
    return {
      ...execution.result,
      candidateRevisions: execution.result.workspace.candidateRevisions,
      lifecycleV2: execution.result.workspace.lifecycleV2,
      receipt: lifecycleReceipt(commandName, idempotencyKey, execution.reusedFromCommandReceipt)
    };
  } catch (error) {
    lifecycleRepositoryError(error);
  }
}

export async function decideNumberingCandidateBundleReview(input: {
  metadata: PdmCommandMetadata;
  requestId: string;
  decision: "approved" | "rejected" | "needs_info";
  comment?: unknown;
}) {
  assertLifecycleV2Enabled();
  const commandName = "pdm.numbering.decide_candidate_bundle_review";
  const idempotencyKey = lifecycleIdempotencyKey(input.metadata.idempotencyKey);
  const requestId = lifecycleRequiredText(input.requestId, "requestId", 200);
  const comment = lifecycleText(input.comment, 2000) || null;
  try {
    const command = createPdmCommand({
      commandName,
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { requestId, decision: input.decision, comment }
    });
    const Repository = await lifecycleRepository();
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      idempotencyPayload: command.payload,
      execute: (client) => new Repository(client).decideBundleReview({
        requestId,
        companyId: input.metadata.actor.organizationId,
        actorId: input.metadata.actor.pdmUserId,
        actorRole: input.metadata.actor.roles[0] ?? "approver",
        decision: input.decision,
        comment
      }),
      event: (result) => ([
        {
          aggregateType: "approval_request",
          aggregateId: requestId,
          eventType: "pdm.numbering.candidate_bundle_review.decided.v1",
          payload: { requestId, decision: input.decision, applyFailed: result.applyFailed }
        },
        ...(result.publication ? [{
          aggregateType: "numbering_draft_workspace",
          aggregateId: result.workspace.id,
          eventType: "pdm.numbering.official_number_published.v1",
          idempotencyKeySuffix: "formalized",
          payload: {
            workspaceId: result.workspace.id,
            requestId,
            formalizationSource: "bundle_approval",
            drawingIds: result.publication.masters.drawingIds
          }
        }, {
          aggregateType: "numbering_candidate_revision",
          aggregateId: result.workspace.id,
          eventType: "pdm.numbering.candidate_revision.review_approved.v1",
          idempotencyKeySuffix: "review-approved",
          payload: { workspaceId: result.workspace.id, requestId, effectiveStatus: "ReviewApproved" }
        }] : [])
      ]),
    });
    return {
      ...execution.result,
      candidateRevisions: execution.result.workspace.candidateRevisions,
      lifecycleV2: execution.result.workspace.lifecycleV2,
      receipt: lifecycleReceipt(commandName, idempotencyKey, execution.reusedFromCommandReceipt)
    };
  } catch (error) {
    lifecycleRepositoryError(error);
  }
}

export async function retryNumberingCandidateBundleApply(input: {
  metadata: PdmCommandMetadata;
  requestId: string;
}) {
  assertLifecycleV2Enabled();
  const commandName = "pdm.numbering.retry_candidate_bundle_apply";
  const idempotencyKey = lifecycleIdempotencyKey(input.metadata.idempotencyKey);
  const requestId = lifecycleRequiredText(input.requestId, "requestId", 200);
  try {
    const command = createPdmCommand({ commandName, idempotencyKey, actor: input.metadata.actor, payload: { requestId } });
    const Repository = await lifecycleRepository();
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      idempotencyPayload: command.payload,
      execute: (client) => new Repository(client).retryBundleApply({
        requestId,
        companyId: input.metadata.actor.organizationId,
        actorId: input.metadata.actor.pdmUserId
      }),
      event: (result) => ([{
        aggregateType: "approval_request",
        aggregateId: requestId,
        eventType: "pdm.numbering.candidate_bundle_review.apply_retried.v1",
        payload: { requestId, workspaceId: result.workspace.id, formalizationSource: "bundle_approval" }
      }, {
        aggregateType: "numbering_draft_workspace",
        aggregateId: result.workspace.id,
        eventType: "pdm.numbering.official_number_published.v1",
        idempotencyKeySuffix: "formalized",
        payload: { workspaceId: result.workspace.id, requestId, formalizationSource: "bundle_approval" }
      }]),
    });
    return {
      ...execution.result,
      candidateRevisions: execution.result.workspace.candidateRevisions,
      lifecycleV2: execution.result.workspace.lifecycleV2,
      receipt: lifecycleReceipt(commandName, idempotencyKey, execution.reusedFromCommandReceipt)
    };
  } catch (error) {
    lifecycleRepositoryError(error);
  }
}
import crypto from "node:crypto";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  buildStorageKey,
  createFileStorageService,
  createFileStorageServiceForPointer,
  storagePointerFromRecord
} from "@/lib/file-storage";
import { NumberStateFlowError, type NumberStateActor } from "@/lib/number-state-flow";
import { isNumberLifecycleV2Enabled } from "@/lib/number-state-flow-feature";
import { createPdmCommand, type PdmCommandMetadata } from "@/lib/platform-command";
import { executePdmCommandWithOutbox } from "@/lib/platform-command-service";
import { isLocalDevelopmentPublicationEvidenceEnabled } from "@/lib/publication-evidence";
import type { CandidateFileStorageInput } from "@/lib/repositories/number-lifecycle-simplification-async-repository";
