import crypto from "node:crypto";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { NUMBERING_RULE_V3_ID } from "@/lib/numbering-identity";
import { createPdmCommand, type PdmCommandMetadata, type PlatformActorContext } from "@/lib/platform-command";
import { executePdmCommandWithOutbox } from "@/lib/platform-command-service";
import { checkNumberingPermissionAsync } from "@/lib/numbering-permission-async";
import { DatabasePublicationEvidencePort } from "@/lib/publication-evidence";
import {
  AsyncNumberStateFlowRepository,
  type NumberingDraftItemKind,
  type NumberingDraftLifecycle,
  type NumberingDraftMode,
  type NumberingDraftPurposeCode,
  type NumberingDraftWorkspaceRecord
} from "@/lib/repositories/number-state-flow-async-repository";

export class NumberStateFlowError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "NumberStateFlowError";
  }
}

export type NumberStateActor = {
  userId: string;
  companyId: string;
  role: string;
  roles?: string[];
};

const draftModes = new Set<NumberingDraftMode>(["new_bundle", "append_drawing", "append_part", "append_drawing_part"]);
const itemKinds = new Set<NumberingDraftItemKind>(["purchased", "manufactured", "outsourced", "shared", "custom"]);
const purposeCodes = new Set<NumberingDraftPurposeCode>(["MA", "OT", "M", "R"]);
const lifecycleStatuses = new Set<NumberingDraftLifecycle>(["active", "cancelled", "published"]);
const privilegedRoles = new Set(["Admin", "R&D Manager", "system_admin", "pdm_admin", "rd_manager"]);
const safeIdempotencyKey = /^[A-Za-z0-9._:/-]{1,200}$/u;

function text(value: unknown, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

function optionalSeriesCode(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (normalized.length > 80) {
    throw new NumberStateFlowError("numbering_series_code_too_long", "seriesCode must be 80 characters or fewer.", 400);
  }
  return normalized || null;
}

function requiredText(value: unknown, field: string, maximum = 500) {
  const normalized = text(value, maximum);
  if (!normalized) throw new NumberStateFlowError("numbering_invalid_request", `${field} is required.`, 400);
  return normalized;
}

function integer(value: unknown, code = "workspace_version_required") {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new NumberStateFlowError(code, "A current workspace row version is required.", 400);
  }
  return parsed;
}

function itemKind(value: unknown): NumberingDraftItemKind {
  const normalized = text(value, 40) as NumberingDraftItemKind;
  if (!itemKinds.has(normalized)) throw new NumberStateFlowError("numbering_invalid_item_kind", "Invalid item kind.", 400);
  return normalized;
}

function purposeCode(value: unknown): NumberingDraftPurposeCode {
  const normalized = text(value, 10).toUpperCase() as NumberingDraftPurposeCode;
  if (!purposeCodes.has(normalized)) throw new NumberStateFlowError("numbering_invalid_purpose", "Invalid drawing purpose.", 400);
  return normalized;
}

function isManufacturingPurpose(value: NumberingDraftPurposeCode) {
  return value === "M" || value === "MA";
}

function boolean(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function safeClientKey(value: unknown, fallback: string) {
  const normalized = text(value, 100) || fallback;
  if (!/^[A-Za-z0-9._:-]{1,100}$/u.test(normalized)) {
    throw new NumberStateFlowError("numbering_invalid_client_key", "Invalid draft item client key.", 400);
  }
  return normalized;
}

function validateIdempotencyKey(value: string) {
  const normalized = value.trim();
  if (!safeIdempotencyKey.test(normalized)) {
    throw new NumberStateFlowError("idempotency_key_required", "A valid Idempotency-Key is required.", 400);
  }
  return normalized;
}

function hasPrivilegedScope(actor: NumberStateActor | PlatformActorContext) {
  const roleValues = "userId" in actor ? [actor.role, ...(actor.roles ?? [])] : actor.roles;
  return roleValues.some((role) => privilegedRoles.has(role));
}

function assertWorkspaceScope(actor: NumberStateActor | PlatformActorContext, workspace: NumberingDraftWorkspaceRecord) {
  const userId = "userId" in actor ? actor.userId : actor.pdmUserId;
  const companyId = "userId" in actor ? actor.companyId : actor.organizationId;
  if (workspace.companyId !== companyId || (workspace.ownerId !== userId && !hasPrivilegedScope(actor))) {
    throw new NumberStateFlowError("workspace_not_found", "Draft workspace was not found.", 404);
  }
}

function normalizeRepositoryError(error: unknown): never {
  if (error instanceof NumberStateFlowError) throw error;
  const code = error instanceof Error ? error.message.split(":", 1)[0] : String(error);
  const mapping: Record<string, [string, string, number, boolean?]> = {
    WORKSPACE_NOT_FOUND: ["workspace_not_found", "Draft workspace was not found.", 404],
    SOURCE_ROOT_NOT_FOUND: ["source_root_not_found", "The source root was not found in this company.", 404],
    APPEND_REASON_REQUIRED: ["append_reason_required", "Appending to this root requires a reason.", 400],
    NUMBERING_RULE_REQUIRED: ["numbering_rule_required", "The numbering rule for this workspace could not be resolved.", 409],
    WORKSPACE_NOT_ACTIVE: ["workspace_not_active", "Only active draft workspaces can be changed.", 409],
    WORKSPACE_ALREADY_PUBLISHED: ["workspace_already_published", "This workspace was already published.", 409],
    WORKSPACE_VERSION_CONFLICT: ["workspace_version_conflict", "The draft changed. Refresh before retrying.", 409, true],
    WORKSPACE_ITEM_SET_MISMATCH: ["workspace_item_set_mismatch", "Phase 1A updates cannot add or remove draft items.", 409],
    CANDIDATE_RULE_VERSION_LOCKED: ["candidate_rule_version_locked", "The numbering rule cannot change after candidate allocation.", 409],
    CANDIDATE_REVIEW_LOCKED: ["candidate_review_locked", "The candidate is locked by review or publication state.", 409],
    CANDIDATE_ALREADY_ACQUIRED: ["candidate_already_acquired", "This workspace already has active candidate numbers.", 409],
    CANDIDATE_RECYCLE_BLOCKED: ["candidate_recycle_blocked", "The candidate cannot be recycled while locked or promoted.", 409],
    CANDIDATE_COLLISION: ["candidate_collision", "Candidate allocation conflicted after bounded retries.", 409, true],
    CANDIDATE_REQUIRED_BEFORE_REVIEW: ["candidate_required_before_review", "Acquire every required candidate number before review.", 409],
    CANDIDATE_REVIEW_ALREADY_PENDING: ["candidate_review_already_pending", "This draft already has a pending review.", 409],
    CANDIDATE_REVIEW_NOT_PENDING: ["candidate_review_not_pending", "This draft has no pending review to withdraw.", 409],
    CANDIDATE_REVIEW_LOCK_FAILED: ["candidate_review_lock_failed", "Candidate review locking did not complete.", 409],
    CANDIDATE_REVIEW_LOCK_MISMATCH: ["candidate_review_lock_mismatch", "Candidate review locks no longer match the approval request.", 409],
    REVIEW_WITHDRAW_OWNER_REQUIRED: ["review_withdraw_owner_required", "Only the draft owner may withdraw a pending review.", 403],
    APPROVAL_REQUEST_NOT_FOUND: ["approval_request_not_found", "Approval request was not found in this company.", 404],
    APPROVAL_REQUEST_NOT_READY_TO_APPLY: ["approval_request_not_ready_to_apply", "Approval apply retry is not available for this request.", 409],
    APPROVAL_DECISION_NOT_FOUND: ["approval_decision_not_found", "The approval decision required for retry was not found.", 409],
    APPROVAL_ACTION_NOT_REGISTERED: ["approval_action_not_registered", "Candidate publication review is not registered.", 503],
    CANDIDATE_APPROVAL_REQUIRED: ["candidate_approval_required", "Candidate review must be approved before publication.", 409],
    CANDIDATE_APPROVAL_LOCK_MISMATCH: ["candidate_approval_lock_mismatch", "Approved candidate locks no longer match the review.", 409],
    APPROVAL_SNAPSHOT_STALE: ["approval_snapshot_stale", "The approved snapshot no longer matches this draft.", 409],
    PUBLICATION_EVIDENCE_NOT_READY: ["publication_evidence_not_ready", "Required controlled-file evidence is not finalized.", 409],
    CANDIDATE_ROOT_REQUIRED: ["candidate_root_required", "The publication root candidate is missing.", 409],
    CANDIDATE_PART_REQUIRED: ["candidate_part_required", "A part candidate is missing from the publication bundle.", 409],
    CANDIDATE_DRAWING_REQUIRED: ["candidate_drawing_required", "A drawing candidate is missing from the publication bundle.", 409],
    PUBLISHED_WORKSPACE_INCONSISTENT: ["published_workspace_inconsistent", "Published workspace facts are inconsistent.", 500],
    PLATFORM_COMMAND_IN_PROGRESS: ["command_in_progress", "The same command is still processing.", 409, true]
  };
  const matched = mapping[code];
  if (matched) throw new NumberStateFlowError(matched[0], matched[1], matched[2], matched[3] ?? false);
  const providerCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const providerMessage = error instanceof Error ? error.message : String(error);
  const providerConstraint = error && typeof error === "object" && "constraint" in error ? String(error.constraint) : "";
  if (/^(ECONN|57P01|57P02|57P03|080)/u.test(providerCode)) {
    throw new NumberStateFlowError("numbering_authority_unavailable", "Numbering authority is unavailable. No number was issued.", 503, true);
  }
  if (
    (providerCode === "23505" || providerCode.startsWith("SQLITE_CONSTRAINT_UNIQUE")) &&
    (providerMessage.includes("number_candidate_reservations") || providerConstraint.startsWith("idx_number_candidate_reservations"))
  ) {
    throw new NumberStateFlowError("candidate_collision", "Candidate allocation conflicted after bounded retries.", 409, true);
  }
  if (
    (providerCode === "23505" || providerCode.startsWith("SQLITE_CONSTRAINT_UNIQUE")) &&
    /part_roots|part_numbers|drawing_numbers|drawing_part_links/iu.test(providerMessage)
  ) {
    throw new NumberStateFlowError("official_number_collision", "An official number already exists. No alternate number was assigned.", 409);
  }
  if (providerCode === "23505" || providerCode.startsWith("SQLITE_CONSTRAINT_UNIQUE")) {
    throw new NumberStateFlowError("numbering_conflict", "The requested draft facts conflict with an existing record.", 409);
  }
  throw error;
}

function normalizedCreateData(body: Record<string, unknown>, actor: PlatformActorContext) {
  const draftMode = text(body.draftMode ?? body.draft_mode, 40) as NumberingDraftMode;
  if (!draftModes.has(draftMode)) throw new NumberStateFlowError("numbering_invalid_draft_mode", "Invalid draft mode.", 400);
  const sourceRootId = text(body.sourceRootId ?? body.source_root_id, 200) || null;
  const rootInput = body.root && typeof body.root === "object" ? body.root as Record<string, unknown> : null;
  if (draftMode === "new_bundle" && (!rootInput || sourceRootId)) {
    throw new NumberStateFlowError("numbering_invalid_draft_scope", "A new bundle requires one draft root and no source root.", 400);
  }
  if (draftMode !== "new_bundle" && (rootInput || !sourceRootId)) {
    throw new NumberStateFlowError("numbering_invalid_draft_scope", "Append modes require one source root and no draft root.", 400);
  }
  const appendReason = draftMode === "new_bundle" ? null : text(body.appendReason ?? body.append_reason, 1000) || null;
  const rawParts = Array.isArray(body.parts) ? body.parts : [];
  const rawDrawings = Array.isArray(body.drawings) ? body.drawings : [];
  if (draftMode === "append_part" && (rawParts.length === 0 || rawDrawings.length > 0)) {
    throw new NumberStateFlowError("numbering_invalid_draft_scope", "append_part requires parts only.", 400);
  }
  if (draftMode === "append_drawing" && (rawDrawings.length === 0 || rawParts.length > 0)) {
    throw new NumberStateFlowError("numbering_invalid_draft_scope", "append_drawing requires drawings only.", 400);
  }
  if (draftMode === "append_drawing_part" && (rawParts.length === 0 || rawDrawings.length === 0)) {
    throw new NumberStateFlowError("numbering_invalid_draft_scope", "append_drawing_part requires at least one part and drawing.", 400);
  }
  const partByClientKey = new Map<string, string>();
  const drawingByClientKey = new Map<string, string>();
  const parts = rawParts.map((raw, index) => {
    const part = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const clientKey = safeClientKey(part.clientKey ?? part.client_key, `part-${index + 1}`);
    if (partByClientKey.has(clientKey)) throw new NumberStateFlowError("numbering_duplicate_client_key", "Duplicate part client key.", 400);
    const id = `draft-part-${crypto.randomUUID()}`;
    partByClientKey.set(clientKey, id);
    const kind = itemKind(part.itemKind ?? part.item_kind);
    const customSpecification = text(part.customSpecification ?? part.custom_specification, 2000) || null;
    const isUniversal = kind === "shared" || boolean(part.isUniversal ?? part.is_universal);
    const universalReason = text(part.universalReason ?? part.universal_reason, 1000) || null;
    const seriesCode = kind === "manufactured" && !isUniversal
      ? optionalSeriesCode(part.seriesCode ?? part.series_code)
      : null;
    if (kind === "custom" && !customSpecification) {
      throw new NumberStateFlowError("numbering_custom_specification_required", "Custom parts require a specification.", 400);
    }
    return {
      id,
      partName: requiredText(part.partName ?? part.part_name, "partName", 300),
      itemKind: kind,
      isUniversal,
      universalReason,
      customSpecification,
      seriesCode
    };
  });
  const drawings = rawDrawings.map((raw, index) => {
    const drawing = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const clientKey = safeClientKey(drawing.clientKey ?? drawing.client_key, `drawing-${index + 1}`);
    if (drawingByClientKey.has(clientKey)) throw new NumberStateFlowError("numbering_duplicate_client_key", "Duplicate drawing client key.", 400);
    const id = `draft-drawing-${crypto.randomUUID()}`;
    drawingByClientKey.set(clientKey, id);
    return {
      id,
      purposeCode: purposeCode(drawing.purposeCode ?? drawing.purpose_code),
      purposeDescription: text(drawing.purposeDescription ?? drawing.purpose_description, 1000),
      isPrimaryManufacturing: boolean(drawing.isPrimaryManufacturing ?? drawing.is_primary_manufacturing)
    };
  });
  const drawingsById = new Map(drawings.map((drawing) => [drawing.id, drawing]));
  const rawRelations = Array.isArray(body.relations) ? body.relations : [];
  const relations = rawRelations.map((raw) => {
    const relation = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const drawingDraftId = drawingByClientKey.get(requiredText(relation.drawingClientKey ?? relation.drawing_client_key, "drawingClientKey", 100));
    const partDraftId = partByClientKey.get(requiredText(relation.partClientKey ?? relation.part_client_key, "partClientKey", 100));
    if (!drawingDraftId || !partDraftId) {
      throw new NumberStateFlowError("numbering_invalid_relation", "Draft relation endpoints must exist in the same request.", 400);
    }
    const linkType = text(relation.linkType ?? relation.link_type, 40);
    if (linkType !== "primary_manufacturing" && linkType !== "reference") {
      throw new NumberStateFlowError("numbering_invalid_relation", "Invalid draft relation type.", 400);
    }
    const normalizedLinkType: "primary_manufacturing" | "reference" = linkType;
    const isPrimary = boolean(relation.isPrimary ?? relation.is_primary);
    const drawing = drawingsById.get(drawingDraftId);
    if (normalizedLinkType === "primary_manufacturing" && (!drawing || !isManufacturingPurpose(drawing.purposeCode))) {
      throw new NumberStateFlowError("numbering_invalid_relation", "Primary manufacturing relations require a manufacturing drawing.", 400);
    }
    if (normalizedLinkType === "primary_manufacturing" && !isPrimary) {
      throw new NumberStateFlowError("numbering_invalid_relation", "Primary manufacturing relations must be marked primary.", 400);
    }
    return {
      id: `draft-relation-${crypto.randomUUID()}`,
      drawingDraftId,
      partDraftId,
      linkType: normalizedLinkType,
      isPrimary
    };
  });
  return {
    id: `draft-workspace-${crypto.randomUUID()}`,
    companyId: actor.organizationId,
    draftMode,
    ownerId: actor.pdmUserId,
    createdBy: actor.pdmUserId,
    sourceRootId,
    appendReason,
    root: rootInput ? {
      id: `draft-root-${crypto.randomUUID()}`,
      coreName: requiredText(rootInput.coreName ?? rootInput.core_name, "coreName", 300),
      itemKind: itemKind(rootInput.itemKind ?? rootInput.item_kind),
      ruleVersionId: NUMBERING_RULE_V3_ID
    } : null,
    parts,
    drawings,
    relations
  };
}

type NumberStateActionPermissions = {
  submitReview: boolean;
  withdrawReview: boolean;
  publish: boolean;
};

async function resolveNumberStateActionPermissions(actor: NumberStateActor | PlatformActorContext): Promise<NumberStateActionPermissions> {
  const user = "userId" in actor
    ? { id: actor.userId, role: actor.role }
    : { id: actor.pdmUserId, role: actor.roles[0] ?? "" };
  const [submitReview, withdrawReview, publish] = await Promise.all([
    checkNumberingPermissionAsync({ user, permissionKind: "action", permissionCode: "numbering.candidate.review.submit" }),
    checkNumberingPermissionAsync({ user, permissionKind: "action", permissionCode: "numbering.candidate.review.withdraw" }),
    checkNumberingPermissionAsync({ user, permissionKind: "action", permissionCode: "numbering.publish" })
  ]);
  return { submitReview: submitReview.allowed, withdrawReview: withdrawReview.allowed, publish: publish.allowed };
}

async function applyActorCapabilities(
  workspace: NumberingDraftWorkspaceRecord,
  actor: NumberStateActor | PlatformActorContext,
  permissions: NumberStateActionPermissions
) {
  const actorId = "userId" in actor ? actor.userId : actor.pdmUserId;
  let canPublish = workspace.capabilities.canPublish && permissions.publish;
  let publishBlockedReason = workspace.capabilities.publishBlockedReason;
  if (workspace.capabilities.canPublish && !permissions.publish) publishBlockedReason = "numbering_publish_permission_required";
  if (canPublish && workspace.latestApproval?.snapshotHash) {
    const evidence = await new DatabasePublicationEvidencePort(getAsyncDatabaseClient()).verify({
      companyId: workspace.companyId,
      workspaceId: workspace.id,
      snapshotHash: workspace.latestApproval.snapshotHash,
      draftDrawingIds: workspace.drawings.map((drawing) => drawing.id)
    });
    canPublish = evidence.status !== "not_ready";
    publishBlockedReason = evidence.status === "not_ready" ? evidence.reason ?? "publication_evidence_not_ready" : null;
  }
  return {
    ...workspace,
    capabilities: {
      ...workspace.capabilities,
      canSubmitReview: workspace.capabilities.canSubmitReview && permissions.submitReview,
      canWithdrawReview: workspace.capabilities.canWithdrawReview && permissions.withdrawReview && workspace.ownerId === actorId,
      canPublish,
      publishBlockedReason
    }
  };
}

export async function createNumberingDraftWorkspace(input: {
  metadata: PdmCommandMetadata;
  body: Record<string, unknown>;
}) {
  try {
    const idempotencyKey = validateIdempotencyKey(input.metadata.idempotencyKey);
    const data = normalizedCreateData(input.body, input.metadata.actor);
    const command = createPdmCommand({
      commandName: "pdm.numbering.create_draft_workspace",
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { workspaceId: data.id, draftMode: data.draftMode }
    });
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      execute: (client) => new AsyncNumberStateFlowRepository(client).createWorkspace(data),
      event: (workspace) => ({
        aggregateType: "numbering_draft_workspace",
        aggregateId: workspace.id,
        eventType: "pdm.numbering.draft_workspace.created.v1",
        payload: {
          workspaceId: workspace.id,
          companyId: workspace.companyId,
          draftMode: workspace.draftMode,
          itemCounts: { root: workspace.root ? 1 : 0, parts: workspace.parts.length, drawings: workspace.drawings.length }
        }
      })
    });
    return { workspace: execution.result, idempotentReplay: execution.reusedFromCommandReceipt };
  } catch (error) {
    normalizeRepositoryError(error);
  }
}

export async function listNumberingDraftWorkspaces(input: {
  actor: NumberStateActor;
  owner?: "mine" | "all";
  lifecycleStatus?: unknown;
  seriesCode?: unknown;
  limit?: unknown;
}) {
  try {
    const lifecycle = text(input.lifecycleStatus, 40) as NumberingDraftLifecycle;
    const lifecycleStatus = lifecycle ? (lifecycleStatuses.has(lifecycle) ? lifecycle : null) : null;
    if (lifecycle && !lifecycleStatus) throw new NumberStateFlowError("numbering_invalid_lifecycle", "Invalid lifecycle status.", 400);
    const ownerId = input.owner === "all" && hasPrivilegedScope(input.actor) ? null : input.actor.userId;
    const seriesCode = text(input.seriesCode, 80) || null;
    const workspaces = await new AsyncNumberStateFlowRepository(getAsyncDatabaseClient()).listWorkspaces({
      companyId: input.actor.companyId,
      ownerId,
      lifecycleStatus,
      seriesCode,
      limit: Number(input.limit) || 100
    });
    const permissions = await resolveNumberStateActionPermissions(input.actor);
    return await Promise.all(workspaces.map((workspace) => applyActorCapabilities(workspace, input.actor, permissions)));
  } catch (error) {
    normalizeRepositoryError(error);
  }
}

export async function getNumberingDraftWorkspace(input: { actor: NumberStateActor; workspaceId: string }) {
  try {
    const workspace = await new AsyncNumberStateFlowRepository(getAsyncDatabaseClient()).getWorkspace(
      requiredText(input.workspaceId, "workspaceId", 200),
      input.actor.companyId
    );
    assertWorkspaceScope(input.actor, workspace);
    return await applyActorCapabilities(workspace, input.actor, await resolveNumberStateActionPermissions(input.actor));
  } catch (error) {
    normalizeRepositoryError(error);
  }
}

function normalizePatchBody(body: Record<string, unknown>) {
  const result: {
    root?: { id: string; coreName: string; itemKind: NumberingDraftItemKind; ruleVersionId: string } | null;
    parts?: Array<{ id: string; partName: string; itemKind: NumberingDraftItemKind; isUniversal: boolean; universalReason: string | null; customSpecification: string | null; seriesCode: string | null }>;
    drawings?: Array<{ id: string; purposeCode: NumberingDraftPurposeCode; purposeDescription: string; isPrimaryManufacturing: boolean }>;
  } = {};
  if (Object.hasOwn(body, "root")) {
    if (body.root === null) result.root = null;
    else {
      const root = body.root && typeof body.root === "object" ? body.root as Record<string, unknown> : {};
      result.root = {
        id: requiredText(root.id, "root.id", 200),
        coreName: requiredText(root.coreName ?? root.core_name, "root.coreName", 300),
        itemKind: itemKind(root.itemKind ?? root.item_kind),
        ruleVersionId: requiredText(root.ruleVersionId ?? root.rule_version_id, "root.ruleVersionId", 200)
      };
    }
  }
  if (Object.hasOwn(body, "parts")) {
    if (!Array.isArray(body.parts)) throw new NumberStateFlowError("numbering_invalid_request", "parts must be an array.", 400);
    result.parts = body.parts.map((raw) => {
      const part = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const kind = itemKind(part.itemKind ?? part.item_kind);
      const isUniversal = kind === "shared" || boolean(part.isUniversal ?? part.is_universal);
      const universalReason = text(part.universalReason ?? part.universal_reason, 1000) || null;
      return {
        id: requiredText(part.id, "part.id", 200),
        partName: requiredText(part.partName ?? part.part_name, "part.partName", 300),
        itemKind: kind,
        isUniversal,
        universalReason,
        customSpecification: text(part.customSpecification ?? part.custom_specification, 2000) || null,
        seriesCode: kind === "manufactured" && !isUniversal ? optionalSeriesCode(part.seriesCode ?? part.series_code) : null
      };
    });
  }
  if (Object.hasOwn(body, "drawings")) {
    if (!Array.isArray(body.drawings)) throw new NumberStateFlowError("numbering_invalid_request", "drawings must be an array.", 400);
    result.drawings = body.drawings.map((raw) => {
      const drawing = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      return {
        id: requiredText(drawing.id, "drawing.id", 200),
        purposeCode: purposeCode(drawing.purposeCode ?? drawing.purpose_code),
        purposeDescription: text(drawing.purposeDescription ?? drawing.purpose_description, 1000),
        isPrimaryManufacturing: boolean(drawing.isPrimaryManufacturing ?? drawing.is_primary_manufacturing)
      };
    });
  }
  if (Object.keys(result).length === 0) throw new NumberStateFlowError("numbering_invalid_request", "No editable draft facts were provided.", 400);
  return result;
}

export async function updateNumberingDraftWorkspace(input: {
  actor: PlatformActorContext;
  workspaceId: string;
  expectedRowVersion: unknown;
  body: Record<string, unknown>;
}) {
  try {
    const repository = new AsyncNumberStateFlowRepository(getAsyncDatabaseClient());
    const current = await repository.getWorkspace(requiredText(input.workspaceId, "workspaceId", 200), input.actor.organizationId);
    assertWorkspaceScope(input.actor, current);
    return await repository.updateWorkspace({
      workspaceId: current.id,
      companyId: current.companyId,
      actorId: input.actor.pdmUserId,
      expectedRowVersion: integer(input.expectedRowVersion),
      ...normalizePatchBody(input.body)
    });
  } catch (error) {
    normalizeRepositoryError(error);
  }
}

export async function acquireNumberingDraftCandidates(input: {
  metadata: PdmCommandMetadata;
  workspaceId: string;
  expectedRowVersion: unknown;
}) {
  try {
    const idempotencyKey = validateIdempotencyKey(input.metadata.idempotencyKey);
    const workspaceId = requiredText(input.workspaceId, "workspaceId", 200);
    const expectedRowVersion = integer(input.expectedRowVersion);
    const repository = new AsyncNumberStateFlowRepository(getAsyncDatabaseClient());
    const current = await repository.getWorkspace(workspaceId, input.metadata.actor.organizationId);
    assertWorkspaceScope(input.metadata.actor, current);
    const command = createPdmCommand({
      commandName: "pdm.numbering.acquire_candidate_numbers",
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { workspaceId, expectedRowVersion }
    });
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      execute: (client) => new AsyncNumberStateFlowRepository(client).acquireCandidates({
        workspaceId,
        companyId: input.metadata.actor.organizationId,
        actorId: input.metadata.actor.pdmUserId,
        expectedRowVersion
      }),
      event: (workspace) => ({
        aggregateType: "numbering_draft_workspace",
        aggregateId: workspace.id,
        eventType: "pdm.numbering.candidate_reserved.v1",
        payload: {
          workspaceId: workspace.id,
          companyId: workspace.companyId,
          reservations: workspace.reservations
            .filter((reservation) => reservation.state !== "recycled")
            .map((reservation) => ({
              id: reservation.id,
              itemType: reservation.itemType,
              itemId: reservation.itemId,
              candidateCode: reservation.candidateCode
            }))
        }
      })
    });
    return { workspace: execution.result, idempotentReplay: execution.reusedFromCommandReceipt };
  } catch (error) {
    normalizeRepositoryError(error);
  }
}

export async function cancelNumberingDraftWorkspace(input: {
  metadata: PdmCommandMetadata;
  workspaceId: string;
  expectedRowVersion: unknown;
  reason: unknown;
}) {
  try {
    const idempotencyKey = validateIdempotencyKey(input.metadata.idempotencyKey);
    const workspaceId = requiredText(input.workspaceId, "workspaceId", 200);
    const expectedRowVersion = integer(input.expectedRowVersion);
    const reason = requiredText(input.reason, "reason", 1000);
    const repository = new AsyncNumberStateFlowRepository(getAsyncDatabaseClient());
    const current = await repository.getWorkspace(workspaceId, input.metadata.actor.organizationId);
    assertWorkspaceScope(input.metadata.actor, current);
    const command = createPdmCommand({
      commandName: "pdm.numbering.cancel_draft_workspace",
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { workspaceId, expectedRowVersion, reasonCategory: "workspace_cancelled" }
    });
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      execute: (client) => new AsyncNumberStateFlowRepository(client).cancelWorkspace({
        workspaceId,
        companyId: input.metadata.actor.organizationId,
        actorId: input.metadata.actor.pdmUserId,
        expectedRowVersion,
        reason
      }),
      event: (workspace) => ({
        aggregateType: "numbering_draft_workspace",
        aggregateId: workspace.id,
        eventType: "pdm.numbering.candidate_recycled.v1",
        payload: {
          workspaceId: workspace.id,
          companyId: workspace.companyId,
          recycledReservations: workspace.reservations
            .filter((reservation) => reservation.state === "recycled")
            .map((reservation) => ({ id: reservation.id, itemType: reservation.itemType, candidateCode: reservation.candidateCode }))
        }
      })
    });
    return { workspace: execution.result, idempotentReplay: execution.reusedFromCommandReceipt };
  } catch (error) {
    normalizeRepositoryError(error);
  }
}

export async function submitNumberingCandidateReview(input: {
  metadata: PdmCommandMetadata;
  workspaceId: string;
  expectedRowVersion: unknown;
  reason: unknown;
}) {
  try {
    const idempotencyKey = validateIdempotencyKey(input.metadata.idempotencyKey);
    const workspaceId = requiredText(input.workspaceId, "workspaceId", 200);
    const expectedRowVersion = integer(input.expectedRowVersion);
    const reason = requiredText(input.reason, "reason", 1000);
    const current = await new AsyncNumberStateFlowRepository(getAsyncDatabaseClient()).getWorkspace(
      workspaceId,
      input.metadata.actor.organizationId
    );
    assertWorkspaceScope(input.metadata.actor, current);
    const command = createPdmCommand({
      commandName: "pdm.numbering.submit_candidate_review",
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { workspaceId, expectedRowVersion }
    });
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      execute: (client) => new AsyncNumberStateFlowRepository(client).submitCandidateReview({
        workspaceId,
        companyId: input.metadata.actor.organizationId,
        actorId: input.metadata.actor.pdmUserId,
        expectedRowVersion,
        reason
      }),
      event: (result) => ({
        aggregateType: "numbering_draft_workspace",
        aggregateId: result.workspace.id,
        eventType: "pdm.numbering.candidate_review_submitted.v1",
        payload: {
          workspaceId: result.workspace.id,
          companyId: result.workspace.companyId,
          approvalRequestId: result.requestId,
          snapshotHash: result.snapshotHash
        }
      })
    });
    const permissions = await resolveNumberStateActionPermissions(input.metadata.actor);
    return {
      ...execution.result,
      workspace: await applyActorCapabilities(execution.result.workspace, input.metadata.actor, permissions),
      idempotentReplay: execution.reusedFromCommandReceipt
    };
  } catch (error) {
    normalizeRepositoryError(error);
  }
}

export async function withdrawNumberingCandidateReview(input: {
  metadata: PdmCommandMetadata;
  workspaceId: string;
  expectedRowVersion: unknown;
}) {
  try {
    const idempotencyKey = validateIdempotencyKey(input.metadata.idempotencyKey);
    const workspaceId = requiredText(input.workspaceId, "workspaceId", 200);
    const expectedRowVersion = integer(input.expectedRowVersion);
    const current = await new AsyncNumberStateFlowRepository(getAsyncDatabaseClient()).getWorkspace(
      workspaceId,
      input.metadata.actor.organizationId
    );
    assertWorkspaceScope(input.metadata.actor, current);
    const command = createPdmCommand({
      commandName: "pdm.numbering.withdraw_candidate_review",
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { workspaceId, expectedRowVersion, approvalRequestId: current.latestApproval?.requestId ?? null }
    });
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      execute: (client) => new AsyncNumberStateFlowRepository(client).withdrawCandidateReview({
        workspaceId,
        companyId: input.metadata.actor.organizationId,
        actorId: input.metadata.actor.pdmUserId,
        expectedRowVersion
      }),
      event: (result) => ({
        aggregateType: "numbering_draft_workspace",
        aggregateId: result.workspace.id,
        eventType: "pdm.numbering.candidate_review_withdrawn.v1",
        payload: { workspaceId: result.workspace.id, companyId: result.workspace.companyId, approvalRequestId: result.requestId }
      })
    });
    const permissions = await resolveNumberStateActionPermissions(input.metadata.actor);
    return {
      ...execution.result,
      workspace: await applyActorCapabilities(execution.result.workspace, input.metadata.actor, permissions),
      idempotentReplay: execution.reusedFromCommandReceipt
    };
  } catch (error) {
    normalizeRepositoryError(error);
  }
}

export async function decideNumberingCandidateReview(input: {
  metadata: PdmCommandMetadata;
  requestId: string;
  decision: unknown;
  comment?: unknown;
}) {
  try {
    const idempotencyKey = validateIdempotencyKey(input.metadata.idempotencyKey);
    const requestId = requiredText(input.requestId, "requestId", 240);
    const decision = text(input.decision, 40);
    if (decision !== "approved" && decision !== "rejected" && decision !== "needs_info") {
      throw new NumberStateFlowError("numbering_invalid_review_decision", "Invalid review decision.", 400);
    }
    const comment = text(input.comment, 2000) || null;
    const command = createPdmCommand({
      commandName: "pdm.numbering.decide_candidate_review",
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { requestId, decision }
    });
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      execute: (client) => new AsyncNumberStateFlowRepository(client).decideCandidateReview({
        requestId,
        companyId: input.metadata.actor.organizationId,
        actorId: input.metadata.actor.pdmUserId,
        actorRole: input.metadata.actor.roles[0] ?? "reviewer",
        decision,
        comment
      }),
      event: (result) => ({
        aggregateType: "approval_request",
        aggregateId: result.requestId,
        eventType: result.applyFailed
          ? "pdm.numbering.candidate_review_apply_failed.v1"
          : "pdm.numbering.candidate_review_decided.v1",
        payload: {
          requestId: result.requestId,
          workspaceId: result.workspace.id,
          companyId: result.workspace.companyId,
          decision,
          applyFailed: result.applyFailed
        }
      })
    });
    return { ...execution.result, idempotentReplay: execution.reusedFromCommandReceipt };
  } catch (error) {
    normalizeRepositoryError(error);
  }
}

export async function retryNumberingCandidateReviewApply(input: {
  metadata: PdmCommandMetadata;
  requestId: string;
}) {
  try {
    const idempotencyKey = validateIdempotencyKey(input.metadata.idempotencyKey);
    const requestId = requiredText(input.requestId, "requestId", 240);
    const command = createPdmCommand({
      commandName: "pdm.numbering.retry_candidate_review_apply",
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { requestId }
    });
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      execute: (client) => new AsyncNumberStateFlowRepository(client).retryCandidateReviewApply({
        requestId,
        companyId: input.metadata.actor.organizationId,
        actorId: input.metadata.actor.pdmUserId
      }),
      event: (result) => ({
        aggregateType: "approval_request",
        aggregateId: result.requestId,
        eventType: "pdm.numbering.candidate_review_apply_retried.v1",
        payload: {
          requestId: result.requestId,
          workspaceId: result.workspace.id,
          companyId: result.workspace.companyId,
          decision: result.decision
        }
      })
    });
    return { ...execution.result, idempotentReplay: execution.reusedFromCommandReceipt };
  } catch (error) {
    normalizeRepositoryError(error);
  }
}

export async function publishNumberingDraftWorkspace(input: {
  metadata: PdmCommandMetadata;
  workspaceId: string;
  faultInjector?: (faultPoint: string) => void;
}) {
  try {
    const idempotencyKey = validateIdempotencyKey(input.metadata.idempotencyKey);
    const workspaceId = requiredText(input.workspaceId, "workspaceId", 200);
    const current = await new AsyncNumberStateFlowRepository(getAsyncDatabaseClient()).getWorkspace(
      workspaceId,
      input.metadata.actor.organizationId
    );
    assertWorkspaceScope(input.metadata.actor, current);
    if (!current.latestApproval?.snapshotHash) throw new Error("CANDIDATE_APPROVAL_REQUIRED");
    const command = createPdmCommand({
      commandName: "pdm.numbering.publish_official_numbers",
      idempotencyKey,
      actor: input.metadata.actor,
      payload: { workspaceId, approvalRequestId: current.latestApproval.requestId, snapshotHash: current.latestApproval.snapshotHash }
    });
    const execution = await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(),
      command,
      execute: async (client) => {
        const evidence = await new DatabasePublicationEvidencePort(client).verify({
          companyId: current.companyId,
          workspaceId: current.id,
          snapshotHash: current.latestApproval!.snapshotHash!,
          draftDrawingIds: current.drawings.map((drawing) => drawing.id)
        });
        if (evidence.status === "not_ready") throw new Error("PUBLICATION_EVIDENCE_NOT_READY");
        return new AsyncNumberStateFlowRepository(
          client,
          undefined,
          undefined,
          input.faultInjector
        ).publishApprovedWorkspace({
          workspaceId,
          companyId: input.metadata.actor.organizationId,
          actorId: input.metadata.actor.pdmUserId,
          evidence
        });
      },
      event: (result) => ({
        aggregateType: "numbering_draft_workspace",
        aggregateId: result.workspace.id,
        eventType: "pdm.numbering.official_number_published.v1",
        payload: {
          workspaceId: result.workspace.id,
          companyId: result.workspace.companyId,
          approvalRequestId: result.approvalRequestId,
          snapshotHash: result.snapshotHash,
          evidence: {
            status: result.evidence.status,
            ruleVersion: result.evidence.ruleVersion,
            references: result.evidence.references.map((reference) => ({
              evidenceId: reference.evidenceId,
              draftDrawingId: reference.draftDrawingId,
              generation: reference.generation,
              contentHash: reference.contentHash
            }))
          },
          masters: result.masters
        }
      }),
      faultInjector: input.faultInjector
    });
    const permissions = await resolveNumberStateActionPermissions(input.metadata.actor);
    return {
      ...execution.result,
      workspace: await applyActorCapabilities(execution.result.workspace, input.metadata.actor, permissions),
      idempotentReplay: execution.reusedFromCommandReceipt
    };
  } catch (error) {
    normalizeRepositoryError(error);
  }
}

export async function classifyLegacyNumberingDryRun(companyId: string) {
  try {
    return await new AsyncNumberStateFlowRepository(getAsyncDatabaseClient()).classifyLegacyNumberingDryRun(companyId);
  } catch (error) {
    normalizeRepositoryError(error);
  }
}
