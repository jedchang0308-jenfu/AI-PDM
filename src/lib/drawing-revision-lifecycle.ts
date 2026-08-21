import crypto from "node:crypto";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { hasPdmNonOwnerEditScope } from "@/lib/pdm-edit-scope-policy";
import {
  DrawingSubmissionWorkbenchError,
  resolveDrawingSubmissionContext,
  type DrawingSubmissionContext
} from "@/lib/drawing-submission-workbench";
import { normalizeRevisionWorkflowIntent, type RevisionPolicySuggestionResponse } from "@/lib/revision-policy-engine";
import type { RevisionPackageFileRole } from "@/lib/revision-package";
import {
  drawingRevisionLifecycleMode,
  type DrawingRevisionLifecycleMode
} from "@/lib/number-state-flow-feature";
import {
  AsyncDrawingRevisionLifecycleRepository,
  DrawingRevisionLifecycleRepositoryError,
  type DrawingRevisionLifecycleProjection
} from "@/lib/repositories/drawing-revision-lifecycle-async-repository";

export type { DrawingRevisionLifecycleMode } from "@/lib/number-state-flow-feature";

export type DrawingRevisionLifecycleSemanticAction =
  | "continue_preparation"
  | "submit_for_review"
  | "open_exact_review"
  | "view_progress"
  | "withdraw_before_decision"
  | "correct_and_resubmit"
  | "create_revision"
  | "none";

export type DrawingRevisionLifecycleResult = {
  packageId: string;
  requestId: string | null;
  drawingNumber: string;
  drawingNumberId: string;
  revision: string;
  lifecycleState: DrawingRevisionLifecycleProjection["lifecycleState"];
  displayStatus: "準備中" | "送審中" | "退回修改" | "研發受控" | "已發布";
  primaryAction: DrawingRevisionLifecycleSemanticAction;
  secondaryActions: DrawingRevisionLifecycleSemanticAction[];
  canonicalHref: string;
  correctionReason: string | null;
  cleanupPending: boolean;
  idempotentReplay: boolean;
};

export class DrawingRevisionLifecycleError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400, readonly canonicalHref?: string) {
    super(message);
    this.name = "DrawingRevisionLifecycleError";
  }
}

export function resolveDrawingRevisionLifecycleMode(env: Record<string, string | undefined> = process.env): DrawingRevisionLifecycleMode {
  return drawingRevisionLifecycleMode(env);
}

export function isDrawingRevisionLifecycleEnforced(env: Record<string, string | undefined> = process.env) {
  return resolveDrawingRevisionLifecycleMode(env) === "enforced";
}

export async function submitDrawingRevisionLifecycle(input: {
  company: DrawingSubmissionContext["pdmCompany"];
  drawingNumber: string;
  currentPartNumberId?: string | null;
  partNumberIds?: string[];
  fffAssessment: {
    formState: "no_impact" | "suspected_impact" | "confirmed_impact";
    fitState: "no_impact" | "suspected_impact" | "confirmed_impact";
    functionState: "no_impact" | "suspected_impact" | "confirmed_impact";
  };
  expectedRevision: string;
  workflowIntent?: string | null;
  revisionPolicySuggestion?: RevisionPolicySuggestionResponse | null;
  revisionOverrideReason?: string | null;
  selectedAttachmentIds: string[];
  packageFileRoles?: Array<{ attachmentId: string; role: RevisionPackageFileRole }>;
  reasonCategory: string;
  note: string;
  submittedBy: string;
  idempotencyKey: string;
}) {
  if (!isDrawingRevisionLifecycleEnforced()) {
    throw new DrawingRevisionLifecycleError("DRAWING_LIFECYCLE_NOT_ENFORCED", "圖面生命週期新流程尚未啟用。", 409);
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new DrawingRevisionLifecycleError("DRAWING_LIFECYCLE_IDEMPOTENCY_REQUIRED", "送審缺少防重複識別碼，請重新整理後再試。", 400);
  }
  const expectedRevision = input.expectedRevision.trim();
  if (!expectedRevision) throw new DrawingRevisionLifecycleError("DRAWING_LIFECYCLE_INVALID_COMMAND", "請輸入本次版次。", 400);
  const selectedIds = unique(input.selectedAttachmentIds);
  if (selectedIds.length === 0) {
    throw new DrawingRevisionLifecycleError("DRAWING_SUBMISSION_ATTACHMENT_REQUIRED", "請至少選擇一個主要圖面檔案。", 400);
  }
  const workflowIntent = normalizeRevisionWorkflowIntent(input.workflowIntent ?? "rd_workspace", "rd_workspace");
  let context: DrawingSubmissionContext;
  try {
    context = await resolveDrawingSubmissionContext({
      company: input.company,
      drawingNumber: input.drawingNumber,
      currentPartNumberId: input.currentPartNumberId,
      partNumberIds: input.partNumberIds,
      targetRevision: expectedRevision,
      workflowIntent
    });
  } catch (error) {
    throw normalizeLifecycleError(error);
  }
  if (context.blockers.length > 0) {
    const blocker = context.blockers[0];
    throw new DrawingRevisionLifecycleError(blocker.code, blocker.message, 409, blocker.recoveryHref);
  }
  if (context.submissionParts.length === 0) {
    throw new DrawingRevisionLifecycleError("DRAWING_LIFECYCLE_PART_SCOPE_REQUIRED", "本次進版至少要包含一個有效料號。", 409);
  }
  const missingItem = context.submissionParts.find((part) => !part.itemId);
  if (missingItem) {
    throw new DrawingRevisionLifecycleError(
      "DRAWING_LIFECYCLE_ITEM_MASTER_REQUIRED",
      `料號 ${missingItem.partNumber} 尚未建立可追溯的 item master，請先補齊後再送審。`,
      409
    );
  }
  const outcome = fffOutcome(input.fffAssessment);
  if (outcome === "confirmed_impact" && context.submissionParts.length > 1) {
    throw new DrawingRevisionLifecycleError(
      "DRAWING_SUBMISSION_MULTI_PART_REPLACEMENT_REQUIRED",
      "多料號批次若確認有影響，必須先完成逐料號替代契約；目前不能送審。",
      409
    );
  }
  const attachmentById = new Map(context.attachments.map((attachment) => [attachment.id, attachment]));
  const selected = selectedIds.map((id) => attachmentById.get(id));
  if (selected.some((attachment) => !attachment)) {
    throw new DrawingRevisionLifecycleError("DRAWING_SUBMISSION_ATTACHMENT_NOT_FOUND", "選取的附件不存在或已刪除。", 404);
  }
  const attachments = selected.filter((attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment));
  const ineligible = attachments.filter((attachment) => !attachment.eligibleForSubmission);
  if (ineligible.length > 0) {
    throw new DrawingRevisionLifecycleError(
      "DRAWING_SUBMISSION_ATTACHMENT_INELIGIBLE",
      `以下檔案不能作為主要圖面：${ineligible.map((item) => item.fileName).join("、")}`,
      400
    );
  }
  const mismatched = attachments.filter((attachment) => attachment.revision?.trim() !== expectedRevision);
  if (mismatched.length > 0) {
    throw new DrawingRevisionLifecycleError(
      "DRAWING_SUBMISSION_REVISION_MISMATCH",
      `選取檔案的版次必須都是 ${expectedRevision}。`,
      400
    );
  }
  const roleById = new Map((input.packageFileRoles ?? []).map((item) => [item.attachmentId.trim(), item.role]));
  const snapshot = {
    version: "drawing_revision_lifecycle_v1",
    drawing: { id: context.drawing.id, number: context.drawing.drawingNumber, revision: expectedRevision },
    root: { id: context.root.id, code: context.root.rootCode },
    parts: context.submissionParts.map((part) => ({
      id: part.id,
      number: part.partNumber,
      linkType: part.linkType,
      fff: input.fffAssessment,
      outcome
    })),
    files: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.fileName,
      revision: attachment.revision,
      role: roleById.get(attachment.id) ?? null
    })),
    revisionPolicy: input.revisionPolicySuggestion
      ? {
          version: input.revisionPolicySuggestion.policyVersion,
          basisHash: input.revisionPolicySuggestion.basisHash,
          suggestedRevision: input.revisionPolicySuggestion.suggestedRevision,
          overrideReason: input.revisionOverrideReason?.trim() || null
        }
      : null,
    reasonCategory: input.reasonCategory
  };
  const snapshotHash = hashStable(snapshot);
  const repository = lifecycleRepository();
  try {
    const result = await repository.submit({
      companyId: input.company.companyId,
      drawingNumberId: context.drawing.id,
      drawingNumber: context.drawing.drawingNumber,
      revision: expectedRevision,
      submittedBy: input.submittedBy,
      idempotencyKeyHash: commandHash("submit:key", idempotencyKey),
      scopeHash: commandHash("submit:scope", stableJson({
        drawingNumberId: context.drawing.id,
        revision: expectedRevision,
        snapshotHash
      })),
      snapshotHash,
      snapshot,
      note: input.note.trim(),
      files: attachments.map((attachment) => ({
        assetId: attachment.id,
        filename: attachment.fileName,
        displayName: attachment.displayName,
        description: "",
        documentCategory: attachment.documentCategory,
        role: roleById.get(attachment.id) ?? null
      })),
      parts: context.submissionParts.map((part) => ({
        itemId: part.itemId as string,
        partNumberId: part.id,
        partNumber: part.partNumber,
        partName: part.partName,
        linkType: part.linkType,
        formState: input.fffAssessment.formState,
        fitState: input.fffAssessment.fitState,
        functionState: input.fffAssessment.functionState,
        fffOutcome: outcome
      }))
    });
    return lifecycleResult(result.projection, input.submittedBy, false, result.idempotentReplay);
  } catch (error) {
    throw normalizeLifecycleError(error);
  }
}

export async function decideDrawingRevisionLifecycle(input: {
  requestId: string;
  actorId: string;
  actorRole: string;
  decision: "approved" | "returned_for_correction" | "needs_info";
  reason?: string | null;
  idempotencyKey: string;
}) {
  const key = input.idempotencyKey.trim();
  if (!key) throw new DrawingRevisionLifecycleError("DRAWING_LIFECYCLE_IDEMPOTENCY_REQUIRED", "審核缺少防重複識別碼。", 400);
  const repository = lifecycleRepository();
  try {
    const decided = await repository.decide({
      requestId: input.requestId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      decision: input.decision,
      reason: input.reason?.trim() || null,
      keyHash: commandHash("decision:key", key),
      scopeHash: commandHash("decision:scope", stableJson({ requestId: input.requestId, decision: input.decision }))
    });
    if (!decided.projection) {
      return null;
    }
    let cleanupPending = decided.cleanupPending;
    if (decided.workflowId) {
      try {
        await repository.cleanupTerminalWorkflow(decided.workflowId);
        cleanupPending = false;
      } catch {
        cleanupPending = true;
      }
    }
    return lifecycleResult(decided.projection, input.actorId, cleanupPending, decided.idempotentReplay);
  } catch (error) {
    throw normalizeLifecycleError(error);
  }
}

export async function withdrawDrawingRevisionLifecycle(input: {
  requestId: string;
  actorId: string;
  actorRole: string;
  idempotencyKey: string;
}) {
  const key = input.idempotencyKey.trim();
  if (!key) throw new DrawingRevisionLifecycleError("DRAWING_LIFECYCLE_IDEMPOTENCY_REQUIRED", "撤回缺少防重複識別碼。", 400);
  const repository = lifecycleRepository();
  try {
    const withdrawn = await repository.withdraw({
      requestId: input.requestId,
      actorId: input.actorId,
      allowNonSubmitter: hasPdmNonOwnerEditScope({ role: input.actorRole }),
      keyHash: commandHash("withdraw:key", key),
      scopeHash: commandHash("withdraw:scope", input.requestId)
    });
    if (!withdrawn.projection) return null;
    let cleanupPending = withdrawn.cleanupPending;
    if (withdrawn.workflowId) {
      try {
        await repository.cleanupTerminalWorkflow(withdrawn.workflowId);
        cleanupPending = false;
      } catch {
        cleanupPending = true;
      }
    }
    return lifecycleResult(withdrawn.projection, input.actorId, cleanupPending, withdrawn.idempotentReplay);
  } catch (error) {
    throw normalizeLifecycleError(error);
  }
}

export async function getDrawingRevisionLifecycleProjectionByRequest(requestId: string) {
  return lifecycleRepository().getProjectionByRequest(requestId);
}

export async function isDrawingRevisionLifecycleReviewer(requestId: string, actorId: string) {
  return lifecycleRepository().isAssignedReviewer(requestId, actorId);
}

export async function getDrawingRevisionLifecycleCleanupStateByRequest(requestId: string) {
  const row = await lifecycleRepository().getCleanupPendingByRequest(requestId);
  return row ? { pending: true, workflowId: row.workflow_id } : { pending: false, workflowId: null };
}

export async function retryDrawingRevisionLifecycleCleanupForRequest(input: {
  requestId: string;
  actorId: string;
  actorRole: string;
  companyId: string;
  idempotencyKey: string;
}) {
  const repository = lifecycleRepository();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new DrawingRevisionLifecycleError("DRAWING_LIFECYCLE_IDEMPOTENCY_REQUIRED", "流程整理重試缺少防重複識別碼。", 400);
  }
  const keyHash = commandHash("cleanup:key", idempotencyKey);
  const scopeHash = commandHash("cleanup:scope", stableJson({ requestId: input.requestId, companyId: input.companyId }));
  const existingToken = await repository.getLifecycleCommandToken(keyHash);
  if (existingToken) {
    if (existingToken.scope_hash !== scopeHash) {
      throw new DrawingRevisionLifecycleError("DRAWING_LIFECYCLE_IDEMPOTENCY_CONFLICT", "同一防重複識別碼已用於不同流程整理。", 409);
    }
    if (existingToken.status === "completed") {
      return { cleaned: true, alreadyCleaned: true, idempotentReplay: true };
    }
  }
  const pending = await repository.getCleanupPendingByRequest(input.requestId);
  if (!pending) {
    throw new DrawingRevisionLifecycleError("DRAWING_LIFECYCLE_CLEANUP_NOT_PENDING", "此流程目前沒有待整理內容。", 409);
  }
  if (!(await repository.isAssignedReviewer(input.requestId, input.actorId)) || !["R&D Manager", "Admin"].includes(input.actorRole)) {
    throw new DrawingRevisionLifecycleError("DRAWING_LIFECYCLE_REVIEWER_NOT_ASSIGNED", "你不是此案目前指派的審核人。", 403);
  }
  try {
    return await repository.cleanupTerminalWorkflow(pending.workflow_id, { keyHash, scopeHash });
  } catch (error) {
    throw normalizeLifecycleError(error);
  }
}

export async function retryDrawingRevisionLifecycleCleanup(limit = 25) {
  const repository = lifecycleRepository();
  const workflows = await repository.listCleanupPending(limit);
  const results: Array<{ workflowId: string; cleaned: boolean }> = [];
  for (const workflow of workflows) {
    try {
      await repository.cleanupTerminalWorkflow(workflow.id);
      results.push({ workflowId: workflow.id, cleaned: true });
    } catch {
      results.push({ workflowId: workflow.id, cleaned: false });
    }
  }
  await repository.purgeExpiredTokens();
  return results;
}

export function drawingRevisionLifecycleLatestHref(input: { drawingNumber: string; drawingNumberId?: string | null }) {
  const params = new URLSearchParams({ view: "all", query: input.drawingNumber });
  if (input.drawingNumberId) params.set("detail", `drawing:${input.drawingNumberId}`);
  return `/numbering/drawings?${params.toString()}`;
}

export function drawingRevisionLifecycleErrorPayload(error: unknown) {
  const normalized = normalizeLifecycleError(error);
  return {
    status: normalized.status,
    body: {
      error: normalized.code,
      code: normalized.code,
      message: normalized.message,
      canonicalHref: normalized.canonicalHref ?? null
    }
  };
}

function lifecycleRepository() {
  return new AsyncDrawingRevisionLifecycleRepository(getAsyncDatabaseClient());
}

function lifecycleResult(
  projection: DrawingRevisionLifecycleProjection,
  actorId: string,
  cleanupPending: boolean,
  idempotentReplay: boolean
): DrawingRevisionLifecycleResult {
  const isReviewer = projection.reviewerIds.includes(actorId);
  const latestHref = drawingRevisionLifecycleLatestHref(projection);
  if (projection.lifecycleState === "in_review") {
    return {
      packageId: projection.packageId,
      requestId: projection.requestId,
      drawingNumber: projection.drawingNumber,
      drawingNumberId: projection.drawingNumberId,
      revision: projection.revision,
      lifecycleState: projection.lifecycleState,
      displayStatus: "送審中",
      primaryAction: isReviewer ? "open_exact_review" : "view_progress",
      secondaryActions: projection.submittedBy === actorId && projection.decisionCount === 0 ? ["withdraw_before_decision"] : [],
      canonicalHref: isReviewer && projection.requestId
        ? `/approvals?requestId=${encodeURIComponent(projection.requestId)}&drawing=${encodeURIComponent(projection.drawingNumber)}`
        : latestHref,
      correctionReason: null,
      cleanupPending,
      idempotentReplay
    };
  }
  const stateMap = {
    preparing: { displayStatus: "準備中", primaryAction: "continue_preparation" },
    correction_required: { displayStatus: "退回修改", primaryAction: "correct_and_resubmit" },
    rd_controlled: { displayStatus: "研發受控", primaryAction: "create_revision" },
    released: { displayStatus: "已發布", primaryAction: "create_revision" }
  } as const;
  const state = stateMap[projection.lifecycleState];
  return {
    packageId: projection.packageId,
    requestId: projection.requestId,
    drawingNumber: projection.drawingNumber,
    drawingNumberId: projection.drawingNumberId,
    revision: projection.revision,
    lifecycleState: projection.lifecycleState,
    displayStatus: state.displayStatus,
    primaryAction: state.primaryAction,
    secondaryActions: [],
    canonicalHref: projection.lifecycleState === "preparing" || projection.lifecycleState === "correction_required"
      ? `/numbering/revisions?drawingNumber=${encodeURIComponent(projection.drawingNumber)}&revision=${encodeURIComponent(projection.revision)}`
      : latestHref,
    correctionReason: projection.correctionReason,
    cleanupPending,
    idempotentReplay
  };
}

function normalizeLifecycleError(error: unknown): DrawingRevisionLifecycleError {
  if (error instanceof DrawingRevisionLifecycleError) return error;
  if (error instanceof DrawingRevisionLifecycleRepositoryError) {
    return new DrawingRevisionLifecycleError(error.code, error.message, error.status);
  }
  if (error instanceof DrawingSubmissionWorkbenchError) {
    return new DrawingRevisionLifecycleError(error.code, error.message, error.status, error.options.recoveryHref);
  }
  if (
    error instanceof Error &&
    (
      error.message.includes("idx_drawing_revision_packages_lifecycle_unique") ||
      error.message.includes("drawing_revision_packages.company_id, drawing_revision_packages.drawing_number_id, drawing_revision_packages.revision")
    )
  ) {
    return new DrawingRevisionLifecycleError(
      "DRAWING_LIFECYCLE_STATE_CONFLICT",
      "此圖號版次已有進行中或已完成的生命週期資料，請重新整理後查看目前狀態。",
      409
    );
  }
  return new DrawingRevisionLifecycleError(
    "DRAWING_LIFECYCLE_APPLY_FAILED",
    "圖面生命週期操作未完成，請重新整理後再試；若持續發生請通知系統管理員。",
    500
  );
}

function fffOutcome(input: { formState: string; fitState: string; functionState: string }) {
  const states = [input.formState, input.fitState, input.functionState];
  if (states.includes("confirmed_impact")) return "confirmed_impact";
  if (states.includes("suspected_impact")) return "suspected_impact";
  return "no_impact";
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(",")}}`;
}

function hashStable(value: unknown) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function commandHash(scope: string, value: string) {
  const secret = process.env.PDM_AUTH_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new DrawingRevisionLifecycleError("DRAWING_LIFECYCLE_SECRET_REQUIRED", "系統缺少防重複命令密鑰。", 503);
    return crypto.createHash("sha256").update(`dev-only:${scope}:${value}`).digest("hex");
  }
  return crypto.createHmac("sha256", secret).update(`${scope}:${value}`).digest("hex");
}
