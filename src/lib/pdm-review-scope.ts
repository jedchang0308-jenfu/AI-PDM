import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmDetailSurface, PdmEntityKey } from "@/lib/pdm-entity-detail-contract";
import {
  AsyncApprovalPlatformRepository,
  decodeLegacyApprovalId,
  type ApprovalPlatformDecision,
  type ApprovalPlatformRequestDetail
} from "@/lib/repositories/approval-platform-async-repository";

export type PdmReviewScopeReceipt = {
  source: "platform" | "legacy";
  requestId: string;
  companyId: string;
  actionCode: string;
  actionTitle: string;
  actorId: string;
  entityKey: PdmEntityKey;
  ownerSurface: PdmDetailSurface;
  targetRefs: Array<{ type: string; id: string }>;
  targetAnchors: Array<{ id: string; label: string }>;
  status: string;
  requester: { id: string | null; label: string | null };
  allowedDecisions: Array<"approved" | "rejected" | "needs_info">;
  snapshotId: string | null;
  checkedAt: string | null;
  snapshotHash: string | null;
  currentAggregateHash: string | null;
  decisionReady: boolean;
};

export class PdmReviewScopeError extends Error {
  constructor(readonly code: "PDM_REVIEW_NOT_ACTIVE" | "PDM_REVIEW_NOT_ASSIGNED" | "PDM_REVIEW_AGGREGATE_AMBIGUOUS", message: string) {
    super(message);
    this.name = "PdmReviewScopeError";
  }
}

export const PDM_ACTIVE_REVIEW_STATUSES = ["pending", "needs_info", "apply_failed"] as const;
export const PDM_TERMINAL_REVIEW_EVIDENCE_STATUSES = ["approved", "rejected", "cancelled", "applied"] as const;
export const PDM_REVIEW_EVIDENCE_STATUSES = [
  ...PDM_ACTIVE_REVIEW_STATUSES,
  ...PDM_TERMINAL_REVIEW_EVIDENCE_STATUSES
] as const;

export type PdmReviewScopeAccess = "active_review" | "review_evidence";

export type PdmReviewScopeTargetRef = { type: string; id: string };

function normalizePdmReviewTargetRefs(targetRefs: PdmReviewScopeTargetRef[] | undefined) {
  const unique = new Map<string, PdmReviewScopeTargetRef>();
  for (const targetRef of targetRefs ?? []) {
    const type = targetRef.type.trim();
    const id = targetRef.id.trim();
    if (!type || !id) continue;
    unique.set(`${type}\u0000${id}`, { type, id });
  }
  return [...unique.values()];
}

function matchesPdmReviewTarget(
  target: { type: string; id: string },
  targetRefs: PdmReviewScopeTargetRef[],
  targetTypes: string[],
  targetIds: string[]
) {
  return targetRefs.length > 0
    ? targetRefs.some((targetRef) => targetRef.type === target.type && targetRef.id === target.id)
    : targetTypes.includes(target.type) && targetIds.includes(target.id);
}

export function pdmReviewTargetTypesForEntityKey(entityKey: PdmEntityKey) {
  if (entityKey.startsWith("candidate:")) return ["numbering_draft_workspace"];
  if (entityKey.startsWith("drawing:")) return ["drawing_number", "numbering_draft_drawing", "drawing_revision_package", "drawing_revision"];
  if (entityKey.startsWith("part:")) return ["part_number", "numbering_draft_part"];
  return ["part_root", "numbering_draft_root"];
}

export function pdmReviewEntityId(entityKey: PdmEntityKey) {
  return entityKey.slice(entityKey.indexOf(":") + 1);
}

export function pdmReviewOwnerSurface(entityKey: PdmEntityKey): PdmDetailSurface {
  return entityKey.startsWith("drawing:") ? "drawing" : entityKey.startsWith("part:") ? "part" : "relation";
}

/**
 * This resolver is intentionally request-scoped. The detail service supplies
 * the canonical aggregate hash after loading the same repeatable-read source.
 * The receipt never contains approval payload or snapshot JSON.
 */
export async function resolvePdmReviewScopeReceiptAsync(input: {
  client: AsyncDatabaseClient;
  requestId: string;
  companyId: string;
  actorId: string;
  entityKey: PdmEntityKey;
  targetTypes?: string[];
  targetIds?: string[];
  targetRefs?: PdmReviewScopeTargetRef[];
  access?: PdmReviewScopeAccess;
}) {
  const targetRefs = normalizePdmReviewTargetRefs(input.targetRefs);
  const targetTypes = input.targetTypes ?? pdmReviewTargetTypesForEntityKey(input.entityKey);
  const targetIds = [...new Set(input.targetIds ?? [pdmReviewEntityId(input.entityKey)])].filter(Boolean);
  const legacy = decodeLegacyApprovalId(input.requestId);
  if (legacy) {
    return resolveLegacyPdmReviewScopeReceiptAsync({ ...input, targetTypes, targetIds, targetRefs });
  }
  const targetPredicate = targetRefs.length > 0
    ? `(${targetRefs.map((_, index) => `(target.target_type = :scopePairType${index} AND target.target_id = :scopePairId${index})`).join(" OR ")})`
    : `target.target_type IN (${targetTypes.map((_, index) => `:scopeType${index}`).join(", ")})\n        AND target.target_id IN (${targetIds.map((_, index) => `:scopeId${index}`).join(", ")})`;
  const targetParameters = targetRefs.length > 0
    ? targetRefs.flatMap((targetRef, index) => [
        [`scopePairType${index}`, targetRef.type] as const,
        [`scopePairId${index}`, targetRef.id] as const
      ])
    : [
        ...targetTypes.map((type, index) => [`scopeType${index}`, type] as const),
        ...targetIds.map((id, index) => [`scopeId${index}`, id] as const)
      ];
  const request = await input.client.queryOne<{ id: string; company_id: string; action_code: string; action_title: string; request_status: string; requested_by: string | null; requested_by_name: string | null; impact_id: string | null; snapshot_hash: string | null; captured_at: string | null }>(
    `SELECT request.id, request.company_id, request.action_code, action.title AS action_title,
            request.request_status, request.requested_by, requester.display_name AS requested_by_name,
            impact.id AS impact_id, impact.snapshot_hash, impact.captured_at
       FROM approval_platform_requests request
       JOIN approval_platform_targets target ON target.request_id = request.id
       JOIN approval_platform_actions action ON action.action_code = request.action_code
       LEFT JOIN users requester ON requester.id = request.requested_by
       LEFT JOIN approval_platform_impact_snapshots impact ON impact.request_id = request.id
      WHERE request.id = :requestId
        AND request.company_id = :companyId
        AND ${targetPredicate}
      ORDER BY impact.captured_at DESC, impact.id DESC
      LIMIT 1`,
    Object.fromEntries([
      ["requestId", input.requestId],
      ["companyId", input.companyId],
      ...targetParameters
    ])
  );
  if (!request) return null;
  const readableStatuses = input.access === "review_evidence"
    ? PDM_REVIEW_EVIDENCE_STATUSES
    : PDM_ACTIVE_REVIEW_STATUSES;
  if (!(readableStatuses as readonly string[]).includes(request.request_status)) {
    throw new PdmReviewScopeError("PDM_REVIEW_NOT_ACTIVE", "此審核案已不在可查閱的進行中狀態。");
  }
  const targets = await input.client.query<{ target_type: string; target_id: string; target_label: string | null }>(
    `SELECT target_type, target_id, target_label
       FROM approval_platform_targets
      WHERE request_id = :requestId
      ORDER BY sort_order, id`,
    { requestId: request.id }
  );
  const matchesRequestedAggregate = targets.some((target) => matchesPdmReviewTarget(
    { type: target.target_type, id: target.target_id },
    targetRefs,
    targetTypes,
    targetIds
  ));
  if (!matchesRequestedAggregate) return null;
  const aggregateRows = await input.client.query<{ aggregate_key: string | null }>(
    `SELECT aggregate_key
       FROM (
         SELECT target.target_type, target.target_id,
                CASE
                  WHEN target.target_type = 'numbering_draft_workspace' THEN 'workspace:' || target.target_id
                  WHEN target.target_type IN ('numbering_draft_root', 'part_root') THEN 'root:' || target.target_id
                  WHEN target.target_type = 'numbering_draft_drawing' THEN 'draft-root:' || draft_drawing.root_draft_id
                  WHEN target.target_type = 'numbering_draft_part' THEN 'draft-root:' || draft_part.root_draft_id
                  WHEN target.target_type = 'drawing_revision_package' THEN 'root:' || formal_drawing.part_root_id
                  WHEN target.target_type = 'drawing_revision' THEN 'root:' || canonical_drawing.part_root_id
                  WHEN target.target_type = 'drawing_number' THEN 'root:' || drawing_number.part_root_id
                  WHEN target.target_type = 'part_number' THEN 'root:' || part.part_root_id
                END AS aggregate_key
           FROM approval_platform_targets target
           LEFT JOIN numbering_draft_drawings draft_drawing
             ON target.target_type = 'numbering_draft_drawing' AND draft_drawing.id = target.target_id
           LEFT JOIN numbering_draft_parts draft_part
             ON target.target_type = 'numbering_draft_part' AND draft_part.id = target.target_id
           LEFT JOIN drawing_revision_packages revision_package
             ON target.target_type = 'drawing_revision_package' AND revision_package.id = target.target_id
           LEFT JOIN drawing_numbers formal_drawing
             ON formal_drawing.id = revision_package.drawing_number_id
           LEFT JOIN drawing_revisions canonical_revision
             ON target.target_type = 'drawing_revision' AND canonical_revision.id = target.target_id
           LEFT JOIN drawings canonical_drawing
             ON canonical_drawing.id = canonical_revision.drawing_id
           LEFT JOIN drawing_numbers drawing_number
             ON target.target_type = 'drawing_number' AND drawing_number.id = target.target_id
           LEFT JOIN part_numbers part
             ON target.target_type = 'part_number' AND part.id = target.target_id
          WHERE target.request_id = :requestId
       ) scoped
      WHERE aggregate_key IS NOT NULL`,
    { requestId: request.id }
  );
  const aggregateKeys = new Set(aggregateRows.map((row) => row.aggregate_key).filter((key): key is string => Boolean(key)));
  if (aggregateKeys.size > 1) {
    throw new PdmReviewScopeError("PDM_REVIEW_AGGREGATE_AMBIGUOUS", "此審核範圍無法對應單一圖料明細。請由 PDM Admin 修正送審範圍。");
  }
  const assigned = await input.client.queryOne<{ assigned: number }>(
    `SELECT CASE WHEN EXISTS (
       SELECT 1
         FROM drawing_revision_lifecycle_workflows workflow
         JOIN drawing_revision_lifecycle_reviewers reviewer ON reviewer.workflow_id = workflow.id
        WHERE workflow.approval_request_id = :requestId
          AND (:allowCompletedEvidence = 1 OR workflow.state = 'active')
          AND reviewer.reviewer_id = :actorId
     ) OR (:allowRoleFallback = 1 AND EXISTS (
       SELECT 1 FROM users actor
        WHERE actor.id = :actorId
          AND actor.role IN ('R&D Manager', 'Admin')
          AND actor.account_status = 'active'
     )) THEN 1 ELSE 0 END AS assigned`,
    {
      requestId: request.id,
      actorId: input.actorId,
      allowCompletedEvidence: input.access === "review_evidence" ? 1 : 0,
      allowRoleFallback: request.action_code === "numbering.drawing_revision_lifecycle_review" ? 0 : 1
    }
  );
  const allowedDecisions: Array<"approved" | "rejected" | "needs_info"> = ["approved", "rejected", "needs_info"];
  const canDecide = Number(assigned?.assigned ?? 0) === 1 && request.request_status === "pending";
  if (Number(assigned?.assigned ?? 0) !== 1) {
    throw new PdmReviewScopeError("PDM_REVIEW_NOT_ASSIGNED", "你不是此案目前可處理的審核者。");
  }
  return {
    source: "platform",
    requestId: request.id,
    companyId: request.company_id,
    actionCode: request.action_code,
    actionTitle: request.action_title,
    actorId: input.actorId,
    entityKey: input.entityKey,
    ownerSurface: pdmReviewOwnerSurface(input.entityKey),
    targetRefs: targets.map((target) => ({ type: target.target_type, id: target.target_id })),
    targetAnchors: targets.map((target) => ({ id: `target:${target.target_type}:${target.target_id}`, label: target.target_label ?? "送審範圍" })),
    status: request.request_status,
    requester: { id: request.requested_by, label: request.requested_by_name },
    allowedDecisions,
    snapshotId: request.impact_id,
    checkedAt: request.captured_at,
    snapshotHash: request.snapshot_hash,
    currentAggregateHash: null,
    decisionReady: canDecide
  } satisfies PdmReviewScopeReceipt;
}

async function resolveLegacyPdmReviewScopeReceiptAsync(input: {
  client: AsyncDatabaseClient;
  requestId: string;
  companyId: string;
  actorId: string;
  entityKey: PdmEntityKey;
  targetTypes: string[];
  targetIds: string[];
  targetRefs: PdmReviewScopeTargetRef[];
  access?: PdmReviewScopeAccess;
}): Promise<PdmReviewScopeReceipt | null> {
  const detail = await new AsyncApprovalPlatformRepository(input.client).getRequestDetail(input.requestId, input.companyId);
  if (!detail || detail.companyId !== input.companyId) return null;
  const readableStatuses = input.access === "review_evidence"
    ? PDM_REVIEW_EVIDENCE_STATUSES
    : PDM_ACTIVE_REVIEW_STATUSES;
  if (!(readableStatuses as readonly string[]).includes(detail.status)) {
    throw new PdmReviewScopeError("PDM_REVIEW_NOT_ACTIVE", "此審核案已不在可查閱的進行中狀態。");
  }
  const matchesRequestedAggregate = detail.targets.some(
    (target) => matchesPdmReviewTarget(
      { type: target.type, id: target.targetId },
      input.targetRefs,
      input.targetTypes,
      input.targetIds
    )
  );
  if (!matchesRequestedAggregate) return null;

  const assigned = await input.client.queryOne<{ assigned: number }>(
    `SELECT CASE WHEN EXISTS (
       SELECT 1
         FROM users actor
        WHERE actor.id = :actorId
          AND actor.company_id = :companyId
          AND actor.role IN ('R&D Manager', 'Admin')
          AND actor.account_status = 'active'
          AND actor.system_role_enabled = 1
     ) THEN 1 ELSE 0 END AS assigned`,
    { actorId: input.actorId, companyId: input.companyId }
  );
  if (Number(assigned?.assigned ?? 0) !== 1) {
    throw new PdmReviewScopeError("PDM_REVIEW_NOT_ASSIGNED", "你不是此案目前可處理的審核者。");
  }

  const latestSnapshot = detail.impactSnapshots.at(-1) ?? null;
  const allowedDecisions = legacyAllowedDecisions(detail);
  return {
    source: "legacy",
    requestId: detail.id,
    companyId: detail.companyId,
    actionCode: detail.actionCode,
    actionTitle: detail.actionTitle,
    actorId: input.actorId,
    entityKey: input.entityKey,
    ownerSurface: pdmReviewOwnerSurface(input.entityKey),
    targetRefs: detail.targets.map((target) => ({ type: target.type, id: target.targetId })),
    targetAnchors: detail.targets.map((target) => ({ id: `target:${target.type}:${target.targetId}`, label: target.label || "送審範圍" })),
    status: detail.status,
    requester: { id: detail.requestedBy, label: detail.requestedByName },
    allowedDecisions,
    snapshotId: latestSnapshot?.id ?? null,
    checkedAt: latestSnapshot?.capturedAt ?? detail.requestedAt,
    // Legacy workflows did not capture the canonical PDM aggregate hash. Do
    // not compare their adapter snapshot hash with the live entity hash.
    snapshotHash: null,
    currentAggregateHash: null,
    decisionReady: detail.status === "pending"
  } satisfies PdmReviewScopeReceipt;
}

function legacyAllowedDecisions(detail: ApprovalPlatformRequestDetail): ApprovalPlatformDecision[] {
  void detail;
  return ["approved", "rejected", "needs_info"];
}
