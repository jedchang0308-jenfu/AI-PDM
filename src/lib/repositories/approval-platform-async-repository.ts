import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { rewriteNumberingHumanTextDeep } from "@/lib/numbering-vocabulary";

export type ApprovalPlatformStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "needs_info"
  | "cancelled"
  | "apply_failed"
  | "applied";

export type ApprovalPlatformDecision = "approved" | "rejected" | "needs_info";
export type ApprovalPlatformSource =
  | "platform"
  | "legacy_numbering"
  | "legacy_submission"
  | "legacy_bom"
  | "legacy_drawing_package"
  | "legacy_drawing_revision_review";

export type ApprovalPlatformAction = {
  actionCode: string;
  domainCode: string;
  title: string;
  description: string;
  handlerKey: string;
  riskLevel: "low" | "normal" | "high" | "critical";
  allowBatch: boolean;
  requiresImpactSnapshot: boolean;
  enabled: boolean;
  metadata: Record<string, unknown>;
};

export type ApprovalPlatformTarget = {
  id: string;
  role: "primary" | "child" | "impact";
  type: string;
  targetId: string;
  code: string | null;
  label: string;
  status: string | null;
  snapshot: Record<string, unknown>;
};

export type ApprovalPlatformDecisionRecord = {
  id: string;
  requestId: string;
  approverRole: string;
  approverId: string;
  approverName: string | null;
  decision: ApprovalPlatformDecision;
  comment: string | null;
  decidedAt: string;
};

export type ApprovalPlatformEventRecord = {
  id: string;
  requestId: string | null;
  packageId: string | null;
  eventType: string;
  actorId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type ApprovalPlatformInboxItem = {
  id: string;
  source: ApprovalPlatformSource;
  companyId: string;
  actionCode: string;
  actionTitle: string;
  domainCode: string;
  title: string;
  status: ApprovalPlatformStatus;
  reason: string;
  requestedBy: string | null;
  requestedByName: string | null;
  requestedAt: string;
  packageId: string | null;
  packageCode: string | null;
  packageStatus: string | null;
  targetSummary: string;
  impactSummary: string | null;
  legacy: { table: string; id: string } | null;
  primaryTarget?: { type: string; targetId: string; code: string | null; label: string };
  ownerHref?: string;
};

export type ApprovalPlatformRequestDetail = ApprovalPlatformInboxItem & {
  payload: Record<string, unknown>;
  targets: ApprovalPlatformTarget[];
  impactSnapshots: Array<{
    id: string;
    snapshotHash: string;
    snapshot: Record<string, unknown>;
    capturedBy: string;
    capturedAt: string;
  }>;
  decisions: ApprovalPlatformDecisionRecord[];
  events: ApprovalPlatformEventRecord[];
  applyStatus: "not_ready" | "not_required" | "pending" | "applied" | "failed" | null;
  applyAttempts: number | null;
  applyError: string | null;
};

export type CreateApprovalPlatformRequestInput = {
  companyId?: string;
  actionCode: string;
  title: string;
  reason: string;
  requestedBy: string;
  payload?: Record<string, unknown>;
  targets: Array<{
    role?: "primary" | "child" | "impact";
    type: string;
    targetId: string;
    code?: string | null;
    label?: string | null;
    status?: string | null;
    snapshot?: Record<string, unknown>;
  }>;
  impactSnapshot: Record<string, unknown>;
  packageId?: string | null;
};

export type DecideApprovalPlatformRequestInput = {
  requestId: string;
  decision: ApprovalPlatformDecision;
  comment?: string | null;
  approverRole: string;
  approverId: string;
};

type ActionRow = {
  action_code: string;
  domain_code: string;
  title: string;
  description: string;
  handler_key: string;
  risk_level: ApprovalPlatformAction["riskLevel"];
  allow_batch: number;
  requires_impact_snapshot: number;
  enabled: number;
  metadata_json: string;
};

type NativeRequestRow = {
  id: string;
  company_id: string;
  package_id: string | null;
  action_code: string;
  domain_code: string;
  request_status: ApprovalPlatformStatus;
  title: string;
  reason: string;
  requested_by: string;
  requested_by_name: string | null;
  requested_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  apply_status: NonNullable<ApprovalPlatformRequestDetail["applyStatus"]>;
  apply_attempts: number;
  apply_error: string | null;
  payload_json: string;
  action_title: string;
  package_code: string | null;
  package_status: string | null;
};

type TargetRow = {
  request_id: string;
  id: string;
  target_role: ApprovalPlatformTarget["role"];
  target_type: string;
  target_id: string;
  target_code: string | null;
  target_label: string;
  target_status: string | null;
  snapshot_json: string;
};

type ImpactRow = {
  request_id: string;
  id: string;
  snapshot_hash: string;
  snapshot_json: string;
  captured_by: string;
  captured_at: string;
};

type DecisionRow = {
  id: string;
  request_id: string;
  approver_role: string;
  approver_id: string;
  approver_name: string | null;
  decision: ApprovalPlatformDecision;
  comment: string | null;
  decided_at: string;
};

type EventRow = {
  id: string;
  request_id: string | null;
  package_id: string | null;
  event_type: string;
  actor_id: string | null;
  detail_json: string;
  created_at: string;
};

type DrawingRevisionFffState = "no_impact" | "suspected_impact" | "confirmed_impact";
type DrawingRevisionFffOutcome = "no_impact" | "suspected_impact" | "confirmed_impact";

const DEFAULT_COMPANY_ID = "company-jenfu";

type ApprovalPlatformInboxFilter = {
  companyId?: string;
  actorId?: string;
  status?: "active" | "all" | ApprovalPlatformStatus;
  limit?: number;
  domainCode?: string;
  actionCode?: string;
};

function matchesInboxFilter(item: ApprovalPlatformInboxItem, input: ApprovalPlatformInboxFilter) {
  const domainCode = input.domainCode?.trim();
  const actionCode = input.actionCode?.trim();

  if (domainCode && item.domainCode !== domainCode) return false;
  if (actionCode && item.actionCode !== actionCode) return false;

  return true;
}

export function encodeLegacyApprovalId(source: Exclude<ApprovalPlatformSource, "platform">, legacyId: string) {
  return `legacy:${source}:${legacyId}`;
}

export function decodeLegacyApprovalId(id: string): { source: Exclude<ApprovalPlatformSource, "platform">; legacyId: string } | null {
  const match = /^legacy:(legacy_[a-z_]+):(.+)$/u.exec(id);
  if (!match) return null;
  const source = match[1] as Exclude<ApprovalPlatformSource, "platform">;
  if (
    source !== "legacy_numbering" &&
    source !== "legacy_submission" &&
    source !== "legacy_bom" &&
    source !== "legacy_drawing_package" &&
    source !== "legacy_drawing_revision_review"
  ) {
    return null;
  }
  return { source, legacyId: match[2] };
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    const rewritten = rewriteNumberingHumanTextDeep(parsed);
    return rewritten && typeof rewritten === "object" && !Array.isArray(rewritten) ? (rewritten as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stableJson(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

function snapshotHash(value: Record<string, unknown>) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function normalizeAction(row: ActionRow): ApprovalPlatformAction {
  return {
    actionCode: row.action_code,
    domainCode: row.domain_code,
    title: row.title,
    description: row.description,
    handlerKey: row.handler_key,
    riskLevel: row.risk_level,
    allowBatch: row.allow_batch === 1,
    requiresImpactSnapshot: row.requires_impact_snapshot === 1,
    enabled: row.enabled === 1,
    metadata: parseJsonObject(row.metadata_json)
  };
}

function normalizeStatus(value: string): ApprovalPlatformStatus {
  if (value === "PendingReview" || value === "Pending") return "pending";
  if (value === "Approved") return "approved";
  if (value === "Rejected") return "rejected";
  if (value === "Cancelled") return "cancelled";
  if (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "needs_info" ||
    value === "cancelled" ||
    value === "apply_failed" ||
    value === "applied"
  ) {
    return value;
  }
  return "pending";
}

function targetSummary(actionCode: string, targets: ApprovalPlatformTarget[], impactSnapshot?: Record<string, unknown>) {
  if (actionCode === "numbering.candidate_bundle_review") {
    const lockedReservations = Array.isArray(impactSnapshot?.lockedReservations)
      ? impactSnapshot.lockedReservations
      : [];
    const candidateCodes = lockedReservations
      .map((reservation) => {
        if (!reservation || typeof reservation !== "object" || Array.isArray(reservation)) return null;
        const code = (reservation as Record<string, unknown>).candidateCode;
        return typeof code === "string" && code.trim() ? code.trim() : null;
      })
      .filter((code): code is string => Boolean(code));
    const uniqueCandidateCodes = [...new Set(candidateCodes)];
    const drawingCodes = uniqueCandidateCodes.filter((code) => /-(?:M|R)\d+$/u.test(code));
    if (drawingCodes.length === 1) return drawingCodes[0];
    if (drawingCodes.length > 1) return `${drawingCodes[0]} 等 ${drawingCodes.length} 個圖號`;
    if (uniqueCandidateCodes.length > 0) return uniqueCandidateCodes[0];
  }
  const primary = targets.find((target) => target.role === "primary") ?? targets[0];
  if (!primary) return "未指定目標";
  return primary.code || primary.label || primary.targetId;
}

function mapTargetRow(row: TargetRow): ApprovalPlatformTarget {
  return {
    id: row.id,
    role: row.target_role,
    type: row.target_type,
    targetId: row.target_id,
    code: row.target_code,
    label: row.target_label,
    status: row.target_status,
    snapshot: parseJsonObject(row.snapshot_json)
  };
}

function firstMeaningfulText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = value?.trim();
    if (text) return text;
  }
  return null;
}

function normalizeFffState(value: string): DrawingRevisionFffState {
  if (value === "confirmed_impact" || value === "suspected_impact" || value === "no_impact") return value;
  return "no_impact";
}

function drawingRevisionOutcome(row: { form_state: string; fit_state: string; function_state: string }): DrawingRevisionFffOutcome {
  const states = [normalizeFffState(row.form_state), normalizeFffState(row.fit_state), normalizeFffState(row.function_state)];
  if (states.includes("confirmed_impact")) return "confirmed_impact";
  if (states.includes("suspected_impact")) return "suspected_impact";
  return "no_impact";
}

function drawingRevisionReviewStatus(row: { review_action: string | null }): ApprovalPlatformStatus {
  if (!row.review_action) return "pending";
  return row.review_action === "return_for_replacement_part" ? "rejected" : "approved";
}

function drawingRevisionAllowedDecisions(outcome: string | null): ApprovalPlatformDecision[] {
  if (outcome === "suspected_impact") return ["approved", "rejected"];
  return ["approved"];
}

function drawingRevisionRecommendedAction(outcome: string | null) {
  if (outcome === "confirmed_impact") return "approve_replacement_part_and_drawing_release";
  if (outcome === "suspected_impact") return "confirm_original_part_reuse";
  return "confirm_bom_no_revision";
}

function drawingRevisionReviewStatusPredicate(status: "active" | "all" | ApprovalPlatformStatus = "active") {
  if (status === "all") return "";
  if (status === "active" || status === "pending") return "AND rce.id IS NULL";
  if (status === "approved") return "AND rce.id IS NOT NULL AND rce.action <> 'return_for_replacement_part'";
  if (status === "rejected") return "AND rce.action = 'return_for_replacement_part'";
  return "AND 1 = 0";
}

export class AsyncApprovalPlatformRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async listActions(): Promise<ApprovalPlatformAction[]> {
    const rows = await this.client.query<ActionRow>(
      `
      SELECT *
      FROM approval_platform_actions
      WHERE enabled = 1
      ORDER BY domain_code ASC, action_code ASC
    `
    );
    return rows.map(normalizeAction);
  }

  async getAction(actionCode: string): Promise<ApprovalPlatformAction | null> {
    const row = await this.client.queryOne<ActionRow>(
      `
      SELECT *
      FROM approval_platform_actions
      WHERE action_code = :actionCode
    `,
      { actionCode }
    );
    return row ? normalizeAction(row) : null;
  }

  async createRequest(input: CreateApprovalPlatformRequestInput): Promise<ApprovalPlatformRequestDetail> {
    const action = await this.getAction(input.actionCode);
    if (!action || !action.enabled) throw new Error(`APPROVAL_ACTION_NOT_REGISTERED: ${input.actionCode}`);
    const reason = input.reason.trim();
    if (!reason) throw new Error("APPROVAL_REASON_REQUIRED");
    if (input.targets.length === 0) throw new Error("APPROVAL_TARGET_REQUIRED");

    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const requestId = `APR-${this.idFactory()}`;
    const impactId = `APIS-${this.idFactory()}`;
    const now = this.clock();
    const run = async (client: AsyncDatabaseClient) => {
      await client.execute(
        `
        INSERT INTO approval_platform_requests (
          id, company_id, package_id, action_code, domain_code, request_status, title, reason,
          requested_by, requested_at, apply_status, payload_json, created_at, updated_at
        ) VALUES (
          :id, :companyId, :packageId, :actionCode, :domainCode, 'pending', :title, :reason,
          :requestedBy, :requestedAt, :applyStatus, :payloadJson, :createdAt, :updatedAt
        )
      `,
        {
          id: requestId,
          companyId,
          packageId: input.packageId ?? null,
          actionCode: action.actionCode,
          domainCode: action.domainCode,
          title: input.title.trim() || action.title,
          reason,
          requestedBy: input.requestedBy,
          requestedAt: now,
          applyStatus: action.handlerKey === "platform.fake" ? "pending" : "not_ready",
          payloadJson: stableJson(input.payload ?? {}),
          createdAt: now,
          updatedAt: now
        }
      );

      let sortOrder = 0;
      for (const target of input.targets) {
        await client.execute(
          `
          INSERT INTO approval_platform_targets (
            id, request_id, target_role, target_type, target_id, target_code, target_label,
            target_status, snapshot_json, sort_order, created_at
          ) VALUES (
            :id, :requestId, :targetRole, :targetType, :targetId, :targetCode, :targetLabel,
            :targetStatus, :snapshotJson, :sortOrder, :createdAt
          )
        `,
          {
            id: `APT-${this.idFactory()}`,
            requestId,
            targetRole: target.role ?? (sortOrder === 0 ? "primary" : "child"),
            targetType: target.type,
            targetId: target.targetId,
            targetCode: target.code ?? null,
            targetLabel: target.label ?? target.code ?? target.targetId,
            targetStatus: target.status ?? null,
            snapshotJson: stableJson(target.snapshot ?? {}),
            sortOrder,
            createdAt: now
          }
        );
        sortOrder += 1;
      }

      await client.execute(
        `
        INSERT INTO approval_platform_impact_snapshots (
          id, request_id, package_id, snapshot_hash, snapshot_json, captured_by, captured_at
        ) VALUES (
          :id, :requestId, :packageId, :snapshotHash, :snapshotJson, :capturedBy, :capturedAt
        )
      `,
        {
          id: impactId,
          requestId,
          packageId: input.packageId ?? null,
          snapshotHash: snapshotHash(input.impactSnapshot),
          snapshotJson: stableJson(input.impactSnapshot),
          capturedBy: input.requestedBy,
          capturedAt: now
        }
      );

      await this.insertEvent(client, {
        requestId,
        packageId: input.packageId ?? null,
        eventType: "approval_platform.request.submitted",
        actorId: input.requestedBy,
        detail: { actionCode: action.actionCode, targetCount: input.targets.length }
      });
    };

    if (this.client.kind === "postgres") {
      await this.client.transaction(run);
    } else {
      await run(this.client);
    }
    const detail = await this.getRequestDetail(requestId);
    if (!detail) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${requestId}`);
    return detail;
  }

  async getNativeRequestRow(requestId: string): Promise<NativeRequestRow | null> {
    return this.client.queryOne<NativeRequestRow>(
      `
      SELECT
        r.*,
        requester.display_name AS requested_by_name,
        a.title AS action_title,
        p.package_code,
        p.package_status
      FROM approval_platform_requests r
      JOIN approval_platform_actions a ON a.action_code = r.action_code
      JOIN users requester ON requester.id = r.requested_by
      LEFT JOIN approval_platform_packages p ON p.id = r.package_id
      WHERE r.id = :requestId
    `,
      { requestId }
    );
  }

  async listInbox(input: ApprovalPlatformInboxFilter = {}) {
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
    const [nativeItems, numbering, submission, bom, supplement, drawingRevisionReviews] = await Promise.all([
      this.listNativeInbox({ companyId, actorId: input.actorId, status: input.status, limit }),
      this.listLegacyNumberingInbox({ companyId, status: input.status, limit }),
      this.listLegacySubmissionInbox({ status: input.status, limit }),
      this.listLegacyBomInbox({ status: input.status, limit }),
      this.listLegacyDrawingPackageInbox({ companyId, status: input.status, limit }),
      this.listLegacyDrawingRevisionReviewInbox({ companyId, status: input.status, limit })
    ]);
    return [...nativeItems, ...numbering, ...submission, ...bom, ...supplement, ...drawingRevisionReviews]
      .filter((item) => matchesInboxFilter(item, input))
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
      .slice(0, limit);
  }

  async getRequestDetail(id: string): Promise<ApprovalPlatformRequestDetail | null> {
    const legacy = decodeLegacyApprovalId(id);
    if (legacy) return this.getLegacyDetail(legacy.source, legacy.legacyId);
    const row = await this.getNativeRequestRow(id);
    if (!row) return null;
    const [targets, impactSnapshots, decisions, events] = await Promise.all([
      this.listTargets(row.id),
      this.listImpactSnapshots(row.id),
      this.listDecisions(row.id),
      this.listEvents(row.id)
    ]);
    return {
      id: row.id,
      source: "platform",
      companyId: row.company_id,
      actionCode: row.action_code,
      actionTitle: row.action_title,
      domainCode: row.domain_code,
      title: row.title,
      status: row.request_status,
      reason: row.reason,
      requestedBy: row.requested_by,
      requestedByName: row.requested_by_name,
      requestedAt: row.requested_at,
      packageId: row.package_id,
      packageCode: row.package_code,
      packageStatus: row.package_status,
      targetSummary: targetSummary(row.action_code, targets, impactSnapshots[0]?.snapshot),
      impactSummary: impactSnapshots[0]?.snapshotHash ?? null,
      legacy: null,
      payload: parseJsonObject(row.payload_json),
      targets,
      impactSnapshots,
      decisions,
      events,
      applyStatus: row.apply_status,
      applyAttempts: row.apply_attempts,
      applyError: row.apply_error
    };
  }

  async decideNativeRequest(input: DecideApprovalPlatformRequestInput): Promise<ApprovalPlatformRequestDetail> {
    const row = await this.getNativeRequestRow(input.requestId);
    if (!row) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
    if (row.request_status !== "pending") throw new Error(`APPROVAL_REQUEST_ALREADY_RESOLVED: ${row.request_status}`);
    const now = this.clock();
    const status: ApprovalPlatformStatus = input.decision === "approved" ? "approved" : input.decision;
    const run = async (client: AsyncDatabaseClient) => {
      await client.execute(
        `
        INSERT INTO approval_platform_decisions (
          id, request_id, approver_role, approver_id, decision, comment, decided_at
        ) VALUES (
          :id, :requestId, :approverRole, :approverId, :decision, :comment, :decidedAt
        )
      `,
        {
          id: `APD-${this.idFactory()}`,
          requestId: input.requestId,
          approverRole: input.approverRole,
          approverId: input.approverId,
          decision: input.decision,
          comment: input.comment?.trim() || null,
          decidedAt: now
        }
      );
      await client.execute(
        `
        UPDATE approval_platform_requests
        SET request_status = :status,
            resolved_by = :resolvedBy,
            resolved_at = :resolvedAt,
            apply_status = CASE WHEN :status = 'approved' THEN apply_status ELSE 'not_required' END,
            updated_at = :updatedAt
        WHERE id = :requestId
      `,
        {
          status,
          resolvedBy: input.approverId,
          resolvedAt: now,
          updatedAt: now,
          requestId: input.requestId
        }
      );
      await this.insertEvent(client, {
        requestId: input.requestId,
        packageId: row.package_id,
        eventType: "approval_platform.request.decided",
        actorId: input.approverId,
        detail: { decision: input.decision, approverRole: input.approverRole }
      });
    };
    if (this.client.kind === "postgres") {
      await this.client.transaction(run);
    } else {
      await run(this.client);
    }
    const detail = await this.getRequestDetail(input.requestId);
    if (!detail) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
    return detail;
  }

  async markApplyResult(input: {
    requestId: string;
    actorId: string;
    success: boolean;
    error?: string | null;
    detail?: Record<string, unknown>;
  }) {
    const row = await this.getNativeRequestRow(input.requestId);
    if (!row) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
    if (row.apply_status === "applied") return this.getRequestDetail(input.requestId);
    const now = this.clock();
    const requestStatus: ApprovalPlatformStatus = input.success ? "applied" : "apply_failed";
    await this.client.execute(
      `
      UPDATE approval_platform_requests
      SET request_status = :requestStatus,
          apply_status = :applyStatus,
          apply_attempts = apply_attempts + 1,
          apply_error = :applyError,
          applied_by = CASE WHEN :success = 1 THEN :actorId ELSE applied_by END,
          applied_at = CASE WHEN :success = 1 THEN :now ELSE applied_at END,
          updated_at = :now
      WHERE id = :requestId
    `,
      {
        requestStatus,
        applyStatus: input.success ? "applied" : "failed",
        applyError: input.success ? null : input.error ?? "APPROVAL_APPLY_FAILED",
        success: input.success ? 1 : 0,
        actorId: input.actorId,
        now,
        requestId: input.requestId
      }
    );
    await this.insertEvent(this.client, {
      requestId: input.requestId,
      packageId: row.package_id,
      eventType: input.success ? "approval_platform.request.applied" : "approval_platform.request.apply_failed",
      actorId: input.actorId,
      detail: input.detail ?? { error: input.error ?? null }
    });
    return this.getRequestDetail(input.requestId);
  }

  private async listNativeInbox(input: { companyId: string; actorId?: string; status?: "active" | "all" | ApprovalPlatformStatus; limit: number }) {
    const statusClause = this.statusWhereClause("r.request_status", input.status);
    const rows = await this.client.query<NativeRequestRow>(
      `
      SELECT
        r.*,
        requester.display_name AS requested_by_name,
        a.title AS action_title,
        p.package_code,
        p.package_status
      FROM approval_platform_requests r
      JOIN approval_platform_actions a ON a.action_code = r.action_code
      JOIN users requester ON requester.id = r.requested_by
      LEFT JOIN approval_platform_packages p ON p.id = r.package_id
      WHERE r.company_id = :companyId
        AND (
          r.action_code <> 'numbering.drawing_revision_lifecycle_review'
          OR (
            :actorId IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM drawing_revision_lifecycle_workflows lifecycle
              JOIN drawing_revision_lifecycle_reviewers reviewer ON reviewer.workflow_id = lifecycle.id
              WHERE lifecycle.approval_request_id = r.id
                AND lifecycle.state = 'active'
                AND reviewer.reviewer_id = :actorId
            )
          )
        )
        ${statusClause.sql}
      ORDER BY r.requested_at DESC, r.id DESC
      LIMIT :limit
    `,
      { companyId: input.companyId, actorId: input.actorId ?? null, limit: input.limit, ...statusClause.params }
    );
    const requestIds = rows.map((row) => row.id);
    const targetRows = requestIds.length
      ? await this.client.query<TargetRow>(
          `
          SELECT *
          FROM approval_platform_targets
          WHERE request_id IN (${requestIds.map((_, index) => `:requestId${index}`).join(", ")})
          ORDER BY request_id ASC, sort_order ASC, id ASC
        `,
          Object.fromEntries(requestIds.map((requestId, index) => [`requestId${index}`, requestId]))
        )
      : [];
    const impactRows = requestIds.length
      ? await this.client.query<ImpactRow>(
          `
          SELECT request_id, id, snapshot_hash, snapshot_json, captured_by, captured_at
          FROM approval_platform_impact_snapshots
          WHERE request_id IN (${requestIds.map((_, index) => `:impactRequestId${index}`).join(", ")})
          ORDER BY request_id ASC, captured_at DESC, id DESC
        `,
          Object.fromEntries(requestIds.map((requestId, index) => [`impactRequestId${index}`, requestId]))
        )
      : [];
    const targetsByRequestId = new Map<string, ApprovalPlatformTarget[]>();
    for (const targetRow of targetRows) {
      const targets = targetsByRequestId.get(targetRow.request_id) ?? [];
      targets.push(mapTargetRow(targetRow));
      targetsByRequestId.set(targetRow.request_id, targets);
    }
    const impactByRequestId = new Map<string, Record<string, unknown>>();
    for (const impactRow of impactRows) {
      if (!impactByRequestId.has(impactRow.request_id)) {
        impactByRequestId.set(impactRow.request_id, parseJsonObject(impactRow.snapshot_json));
      }
    }
    const items: ApprovalPlatformInboxItem[] = [];
    for (const row of rows) {
      const targets = targetsByRequestId.get(row.id) ?? [];
      items.push({
        id: row.id,
        source: "platform",
        companyId: row.company_id,
        actionCode: row.action_code,
        actionTitle: row.action_title,
        domainCode: row.domain_code,
        title: row.title,
        status: row.request_status,
        reason: row.reason,
        requestedBy: row.requested_by,
        requestedByName: row.requested_by_name,
        requestedAt: row.requested_at,
        packageId: row.package_id,
        packageCode: row.package_code,
        packageStatus: row.package_status,
        targetSummary: targetSummary(row.action_code, targets, impactByRequestId.get(row.id)),
        impactSummary: null,
        legacy: null,
        primaryTarget: (() => {
          const target = targets.find((item) => item.role === "primary") ?? targets[0];
          return target ? { type: target.type, targetId: target.targetId, code: target.code, label: target.label } : undefined;
        })()
      });
    }
    return items;
  }

  private statusWhereClause(column: string, status: "active" | "all" | ApprovalPlatformStatus = "active") {
    if (status === "all") return { sql: "", params: {} };
    if (status === "active") return { sql: `AND ${column} IN ('pending', 'needs_info', 'apply_failed')`, params: {} };
    return { sql: `AND ${column} = :status`, params: { status } };
  }

  private legacyStatusPredicate(column: string, status: "active" | "all" | ApprovalPlatformStatus = "active") {
    if (status === "all") return { sql: "", params: {} };
    if (status === "active") {
      return {
        sql: `AND ${column} IN ('pending', 'needs_info', 'PendingReview', 'Pending')`,
        params: {}
      };
    }
    const legacyValues: Record<ApprovalPlatformStatus, string[]> = {
      pending: ["pending", "PendingReview", "Pending"],
      approved: ["approved", "Approved"],
      rejected: ["rejected", "Rejected"],
      needs_info: ["needs_info"],
      cancelled: ["cancelled", "Cancelled"],
      apply_failed: ["apply_failed"],
      applied: ["applied"]
    };
    const values = legacyValues[status] ?? [status];
    const names = values.map((_, index) => `:status${index}`).join(", ");
    return {
      sql: `AND ${column} IN (${names})`,
      params: Object.fromEntries(values.map((value, index) => [`status${index}`, value]))
    };
  }

  private async listTargets(requestId: string): Promise<ApprovalPlatformTarget[]> {
    const rows = await this.client.query<TargetRow>(
      `
      SELECT *
      FROM approval_platform_targets
      WHERE request_id = :requestId
      ORDER BY sort_order ASC, id ASC
    `,
      { requestId }
    );
    return rows.map(mapTargetRow);
  }

  private async listImpactSnapshots(requestId: string): Promise<ApprovalPlatformRequestDetail["impactSnapshots"]> {
    const rows = await this.client.query<ImpactRow>(
      `
      SELECT *
      FROM approval_platform_impact_snapshots
      WHERE request_id = :requestId
      ORDER BY captured_at DESC, id DESC
    `,
      { requestId }
    );
    return rows.map((row) => ({
      id: row.id,
      snapshotHash: row.snapshot_hash,
      snapshot: parseJsonObject(row.snapshot_json),
      capturedBy: row.captured_by,
      capturedAt: row.captured_at
    }));
  }

  private async listDecisions(requestId: string): Promise<ApprovalPlatformDecisionRecord[]> {
    const rows = await this.client.query<DecisionRow>(
      `
      SELECT d.*, u.display_name AS approver_name
      FROM approval_platform_decisions d
      LEFT JOIN users u ON u.id = d.approver_id
      WHERE d.request_id = :requestId
      ORDER BY d.decided_at ASC, d.id ASC
    `,
      { requestId }
    );
    return rows.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      approverRole: row.approver_role,
      approverId: row.approver_id,
      approverName: row.approver_name,
      decision: row.decision,
      comment: row.comment,
      decidedAt: row.decided_at
    }));
  }

  private async listEvents(requestId: string): Promise<ApprovalPlatformEventRecord[]> {
    const rows = await this.client.query<EventRow>(
      `
      SELECT *
      FROM approval_platform_events
      WHERE request_id = :requestId
      ORDER BY created_at ASC, id ASC
    `,
      { requestId }
    );
    return rows.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      packageId: row.package_id,
      eventType: row.event_type,
      actorId: row.actor_id,
      detail: parseJsonObject(row.detail_json),
      createdAt: row.created_at
    }));
  }

  private async insertEvent(
    client: AsyncDatabaseClient,
    input: {
      requestId: string | null;
      packageId: string | null;
      eventType: string;
      actorId: string | null;
      detail: Record<string, unknown>;
    }
  ) {
    await client.execute(
      `
      INSERT INTO approval_platform_events (
        id, request_id, package_id, event_type, actor_id, detail_json, created_at
      ) VALUES (
        :id, :requestId, :packageId, :eventType, :actorId, :detailJson, :createdAt
      )
    `,
      {
        id: `APE-${this.idFactory()}`,
        requestId: input.requestId,
        packageId: input.packageId,
        eventType: input.eventType,
        actorId: input.actorId,
        detailJson: stableJson(input.detail),
        createdAt: this.clock()
      }
    );
  }

  private async listLegacyNumberingInbox(input: { companyId: string; status?: "active" | "all" | ApprovalPlatformStatus; limit: number }) {
    const status = this.legacyStatusPredicate("ar.request_status", input.status);
    const rows = await this.client.query<{
      id: string;
      company_id: string;
      action_code: string;
      entity_type: string;
      entity_id: string;
      request_status: string;
      reason: string;
      payload_json: string;
      requested_by: string;
      requested_by_name: string | null;
      requested_at: string;
      batch_id: string | null;
      batch_code: string | null;
      batch_status: string | null;
      target_code: string | null;
      target_label: string | null;
      target_status: string | null;
    }>(
      `
      SELECT
        ar.*,
        requester.display_name AS requested_by_name,
        abi.batch_id,
        ab.batch_code,
        ab.batch_status,
        COALESCE(pr.root_code, pn.part_number, dn.drawing_number, ar.entity_id) AS target_code,
        COALESCE(pr.core_name, pn.part_name, dn.purpose_description, ar.entity_type) AS target_label,
        COALESCE(pr.record_status, pn.record_status, dn.record_status) AS target_status
      FROM approval_requests ar
      LEFT JOIN users requester ON requester.id = ar.requested_by
      LEFT JOIN approval_batch_items abi ON abi.approval_request_id = ar.id
      LEFT JOIN approval_batches ab ON ab.id = abi.batch_id
      LEFT JOIN part_roots pr ON ar.entity_type = 'part_root' AND pr.id = ar.entity_id
      LEFT JOIN part_numbers pn ON ar.entity_type = 'part_number' AND pn.id = ar.entity_id
      LEFT JOIN drawing_numbers dn ON ar.entity_type = 'drawing_number' AND dn.id = ar.entity_id
      WHERE ar.company_id = :companyId
        ${status.sql}
      ORDER BY ar.requested_at DESC, ar.id DESC
      LIMIT :limit
    `,
      { companyId: input.companyId, limit: input.limit, ...status.params }
    );

    return rows.map((row): ApprovalPlatformInboxItem => ({
      id: encodeLegacyApprovalId("legacy_numbering", row.id),
      source: "legacy_numbering",
      companyId: row.company_id,
      actionCode: `numbering.${row.action_code}`,
      actionTitle: numberingActionTitle(row.action_code),
      domainCode: "numbering",
      title: `${numberingActionTitle(row.action_code)} - ${row.target_code ?? row.entity_id}`,
      status: normalizeStatus(row.request_status),
      reason: row.reason,
      requestedBy: row.requested_by,
      requestedByName: row.requested_by_name,
      requestedAt: row.requested_at,
      packageId: row.batch_id ? encodeLegacyApprovalId("legacy_numbering", row.batch_id) : null,
      packageCode: row.batch_code,
      packageStatus: row.batch_status,
      targetSummary: row.target_code ?? row.entity_id,
      impactSummary: firstMeaningfulText(row.target_status, row.entity_type),
      legacy: { table: "approval_requests", id: row.id },
      primaryTarget: { type: row.entity_type, targetId: row.entity_id, code: row.target_code, label: row.target_label ?? row.entity_type }
    }));
  }

  private async listLegacySubmissionInbox(input: { status?: "active" | "all" | ApprovalPlatformStatus; limit: number }) {
    const status = this.legacyStatusPredicate("r.request_status", input.status);
    const rows = await this.client.query<{
      id: string;
      submission_id: string;
      request_status: string;
      requested_by: string;
      requested_by_name: string | null;
      reason: string;
      requested_at: string;
      part_number: string | null;
      drawing_number: string | null;
      revision: string | null;
      company_id: string | null;
    }>(
      `
      SELECT
        r.*,
        requester.display_name AS requested_by_name,
        i.part_number,
        s.drawing_number,
        s.revision,
        s.company_id
      FROM submission_lifecycle_requests r
      JOIN submissions s ON s.id = r.submission_id
      JOIN items i ON i.id = s.item_id
      LEFT JOIN users requester ON requester.id = r.requested_by
      WHERE r.action_code = 'obsolete_submission'
        ${status.sql}
      ORDER BY r.requested_at DESC, r.id DESC
      LIMIT :limit
    `,
      { limit: input.limit, ...status.params }
    );
    return rows.map((row): ApprovalPlatformInboxItem => ({
      id: encodeLegacyApprovalId("legacy_submission", row.id),
      source: "legacy_submission",
      companyId: row.company_id ?? DEFAULT_COMPANY_ID,
      actionCode: "submission.obsolete",
      actionTitle: "送審單作廢審核",
      domainCode: "submission",
      title: `送審單作廢 - ${row.drawing_number ?? row.submission_id}`,
      status: normalizeStatus(row.request_status),
      reason: row.reason,
      requestedBy: row.requested_by,
      requestedByName: row.requested_by_name,
      requestedAt: row.requested_at,
      packageId: null,
      packageCode: null,
      packageStatus: null,
      targetSummary: [row.drawing_number, row.part_number, row.revision].filter(Boolean).join(" / ") || row.submission_id,
      impactSummary: "Released -> Obsolete",
      legacy: { table: "submission_lifecycle_requests", id: row.id }
    }));
  }

  private async listLegacyBomInbox(input: { status?: "active" | "all" | ApprovalPlatformStatus; limit: number }) {
    const status = this.legacyStatusPredicate("rr.status", input.status);
    const rows = await this.client.query<{
      id: string;
      bom_draft_id: string;
      status: string;
      lifecycle_action: string;
      submitted_by: string;
      requested_by_name: string | null;
      change_reason: string;
      submitted_at: string;
      draft_name: string;
      parent_submission_id: string;
      parent_revision: string;
    }>(
      `
      SELECT
        rr.*,
        requester.display_name AS requested_by_name,
        bd.draft_name,
        bd.parent_submission_id,
        bd.parent_revision
      FROM bom_review_requests rr
      JOIN bom_drafts bd ON bd.id = rr.bom_draft_id
      LEFT JOIN users requester ON requester.id = rr.submitted_by
      WHERE 1 = 1
        ${status.sql}
      ORDER BY rr.submitted_at DESC, rr.id DESC
      LIMIT :limit
    `,
      { limit: input.limit, ...status.params }
    );
    return rows.map((row): ApprovalPlatformInboxItem => ({
      id: encodeLegacyApprovalId("legacy_bom", row.id),
      source: "legacy_bom",
      companyId: DEFAULT_COMPANY_ID,
      actionCode: row.lifecycle_action === "obsolete" ? "bom.obsolete_review" : "bom.release_review",
      actionTitle: row.lifecycle_action === "obsolete" ? "BOM 作廢審核" : "BOM 發行審核",
      domainCode: "bom",
      title: `${row.lifecycle_action === "obsolete" ? "BOM 作廢" : "BOM 發行"} - ${row.draft_name}`,
      status: normalizeStatus(row.status),
      reason: row.change_reason,
      requestedBy: row.submitted_by,
      requestedByName: row.requested_by_name,
      requestedAt: row.submitted_at,
      packageId: null,
      packageCode: null,
      packageStatus: null,
      targetSummary: `${row.draft_name} / ${row.parent_revision}`,
      impactSummary: row.lifecycle_action,
      legacy: { table: "bom_review_requests", id: row.id }
    }));
  }

  private async listLegacyDrawingPackageInbox(input: { companyId: string; status?: "active" | "all" | ApprovalPlatformStatus; limit: number }) {
    const status = this.legacyStatusPredicate("s.status", input.status);
    const rows = await this.client.query<{
      id: string;
      package_id: string;
      status: string;
      reason_code: string;
      reason_note: string | null;
      requested_by: string;
      requested_by_name: string | null;
      requested_at: string;
      source_submission_id: string;
      drawing_number: string;
      revision: string;
      company_id: string;
    }>(
      `
      SELECT
        s.*,
        requester.display_name AS requested_by_name,
        p.source_submission_id,
        p.drawing_number,
        p.revision,
        p.company_id
      FROM drawing_revision_package_supplements s
      JOIN drawing_revision_packages p ON p.id = s.package_id
      LEFT JOIN users requester ON requester.id = s.requested_by
      WHERE p.company_id = :companyId
        ${status.sql}
      ORDER BY s.requested_at DESC, s.id DESC
      LIMIT :limit
    `,
      { companyId: input.companyId, limit: input.limit, ...status.params }
    );
    return rows.map((row): ApprovalPlatformInboxItem => ({
      id: encodeLegacyApprovalId("legacy_drawing_package", row.id),
      source: "legacy_drawing_package",
      companyId: row.company_id,
      actionCode: "drawing_package.supplement_review",
      actionTitle: "圖面補件審核",
      domainCode: "drawing_package",
      title: `圖面補件 - ${row.drawing_number} rev ${row.revision}`,
      status: normalizeStatus(row.status),
      reason: firstMeaningfulText(row.reason_note, row.reason_code) ?? row.reason_code,
      requestedBy: row.requested_by,
      requestedByName: row.requested_by_name,
      requestedAt: row.requested_at,
      packageId: row.package_id,
      packageCode: row.package_id,
      packageStatus: null,
      targetSummary: `${row.drawing_number} / rev ${row.revision}`,
      impactSummary: row.reason_code,
      legacy: { table: "drawing_revision_package_supplements", id: row.id }
    }));
  }

  private async listLegacyDrawingRevisionReviewInbox(input: {
    companyId: string;
    status?: "active" | "all" | ApprovalPlatformStatus;
    limit: number;
  }) {
    const statusSql = drawingRevisionReviewStatusPredicate(input.status);
    const rows = await this.client.query<{
      id: string;
      company_id: string;
      drawing_number_id: string;
      revision: string;
      submission_id: string | null;
      review_package_id: string | null;
      replacement_part_number_draft_id: string | null;
      detected_part_number: string | null;
      corrected_part_number: string | null;
      form_state: string;
      fit_state: string;
      function_state: string;
      reason_category: string;
      note: string | null;
      assessed_by: string | null;
      assessed_by_name: string | null;
      assessed_at: string;
      drawing_number: string | null;
      replacement_reserved_part_number: string | null;
      review_action: string | null;
      review_result: string | null;
      review_occurred_at: string | null;
    }>(
      `
      SELECT
        a.*,
        assessor.display_name AS assessed_by_name,
        dn.drawing_number,
        pnd.reserved_part_number AS replacement_reserved_part_number,
        rce.action AS review_action,
        rce.result AS review_result,
        rce.occurred_at AS review_occurred_at
      FROM drawing_revision_fff_assessments a
      LEFT JOIN users assessor ON assessor.id = a.assessed_by
      LEFT JOIN drawing_numbers dn ON dn.id = a.drawing_number_id
      LEFT JOIN part_number_drafts pnd ON pnd.id = a.replacement_part_number_draft_id
      LEFT JOIN review_confirmation_events rce ON rce.id = (
        SELECT latest.id
        FROM review_confirmation_events latest
        WHERE latest.company_id = a.company_id
          AND latest.review_id = a.id
        ORDER BY latest.occurred_at DESC, latest.id DESC
        LIMIT 1
      )
      WHERE a.company_id = :companyId
        AND NOT EXISTS (
          SELECT 1
          FROM drawing_revision_lifecycle_workflows lifecycle
          WHERE lifecycle.legacy_fff_assessment_id = a.id
        )
        ${statusSql}
      ORDER BY COALESCE(rce.occurred_at, a.assessed_at) DESC, a.id DESC
      LIMIT :limit
    `,
      { companyId: input.companyId, limit: input.limit }
    );

    return rows.map((row): ApprovalPlatformInboxItem => {
      const outcome = drawingRevisionOutcome(row);
      const targetSummary = [
        `${row.drawing_number ?? row.drawing_number_id} / rev ${row.revision}`,
        row.replacement_reserved_part_number ? `新料號 ${row.replacement_reserved_part_number}` : null
      ]
        .filter(Boolean)
        .join(" / ");
      return {
        id: encodeLegacyApprovalId("legacy_drawing_revision_review", row.id),
        source: "legacy_drawing_revision_review",
        companyId: row.company_id,
        actionCode: "numbering.drawing_revision_impact_review",
        actionTitle: "圖面進版影響審核",
        domainCode: "numbering",
        title: `圖面進版影響審核 - ${row.drawing_number ?? row.drawing_number_id} rev ${row.revision}`,
        status: drawingRevisionReviewStatus(row),
        reason: firstMeaningfulText(row.note, row.reason_category) ?? row.reason_category,
        requestedBy: row.assessed_by,
        requestedByName: row.assessed_by_name,
        requestedAt: row.assessed_at,
        packageId: row.review_package_id ?? row.submission_id,
        packageCode: row.review_package_id ?? row.submission_id,
        packageStatus: null,
        targetSummary,
        impactSummary: outcome,
        legacy: { table: "drawing_revision_fff_assessments", id: row.id }
      };
    });
  }

  private async getLegacyDetail(source: Exclude<ApprovalPlatformSource, "platform">, legacyId: string) {
    const lists = {
      legacy_numbering: () => this.listLegacyNumberingInbox({ companyId: DEFAULT_COMPANY_ID, status: "all", limit: 500 }),
      legacy_submission: () => this.listLegacySubmissionInbox({ status: "all", limit: 500 }),
      legacy_bom: () => this.listLegacyBomInbox({ status: "all", limit: 500 }),
      legacy_drawing_package: () => this.listLegacyDrawingPackageInbox({ companyId: DEFAULT_COMPANY_ID, status: "all", limit: 500 }),
      legacy_drawing_revision_review: () =>
        this.listLegacyDrawingRevisionReviewInbox({ companyId: DEFAULT_COMPANY_ID, status: "all", limit: 500 })
    };
    const encoded = encodeLegacyApprovalId(source, legacyId);
    const base = (await lists[source]()).find((item) => item.id === encoded);
    if (!base) return null;
    const isDrawingRevisionReview = source === "legacy_drawing_revision_review";
    const payload = isDrawingRevisionReview
      ? {
          outcome: base.impactSummary,
          allowedDecisions: drawingRevisionAllowedDecisions(base.impactSummary),
          recommendedAction: drawingRevisionRecommendedAction(base.impactSummary)
        }
      : {};
    const impactSnapshot = isDrawingRevisionReview
      ? {
          targetSummary: base.targetSummary,
          outcome: base.impactSummary,
          allowedDecisions: drawingRevisionAllowedDecisions(base.impactSummary),
          recommendedAction: drawingRevisionRecommendedAction(base.impactSummary),
          legacy: base.legacy
        }
      : { targetSummary: base.targetSummary, impactSummary: base.impactSummary, legacy: base.legacy };
    const targets: ApprovalPlatformTarget[] = [
      {
        id: `${encoded}:target`,
        role: "primary",
        type: base.legacy?.table ?? source,
        targetId: legacyId,
        code: base.targetSummary,
        label: base.targetSummary,
        status: base.status,
        snapshot: { legacy: base.legacy }
      }
    ];
    return {
      ...base,
      payload,
      targets,
      impactSnapshots: [
        {
          id: `${encoded}:impact`,
          snapshotHash: snapshotHash(impactSnapshot),
          snapshot: impactSnapshot,
          capturedBy: base.requestedBy ?? "legacy",
          capturedAt: base.requestedAt
        }
      ],
      decisions: await this.listLegacyDecisions(source, legacyId),
      events: [],
      applyStatus: null,
      applyAttempts: null,
      applyError: null
    } satisfies ApprovalPlatformRequestDetail;
  }

  private async listLegacyDecisions(
    source: Exclude<ApprovalPlatformSource, "platform">,
    legacyId: string
  ): Promise<ApprovalPlatformDecisionRecord[]> {
    if (source === "legacy_numbering") {
      const rows = await this.client.query<{
        id: string;
        approval_request_id: string;
        approver_role: string;
        approver_id: string;
        approver_name: string | null;
        decision: ApprovalPlatformDecision;
        comment: string | null;
        decided_at: string;
      }>(
        `
        SELECT d.*, u.display_name AS approver_name
        FROM approval_decisions d
        LEFT JOIN users u ON u.id = d.approver_id
        WHERE d.approval_request_id = :legacyId
        ORDER BY d.decided_at ASC, d.id ASC
      `,
        { legacyId }
      );
      return rows.map((row) => ({
        id: row.id,
        requestId: encodeLegacyApprovalId(source, legacyId),
        approverRole: row.approver_role,
        approverId: row.approver_id,
        approverName: row.approver_name,
        decision: row.decision,
        comment: row.comment,
        decidedAt: row.decided_at
      }));
    }

    if (source === "legacy_drawing_revision_review") {
      const rows = await this.client.query<{
        id: string;
        review_id: string;
        action: string;
        reviewer_user_id: string;
        reviewer_name: string | null;
        reviewer_role: string | null;
        result: string;
        occurred_at: string;
      }>(
        `
        SELECT
          rce.*,
          reviewer.display_name AS reviewer_name,
          reviewer.role AS reviewer_role
        FROM review_confirmation_events rce
        LEFT JOIN users reviewer ON reviewer.id = rce.reviewer_user_id
        WHERE rce.review_id = :legacyId
        ORDER BY rce.occurred_at ASC, rce.id ASC
      `,
        { legacyId }
      );
      return rows.map((row) => ({
        id: row.id,
        requestId: encodeLegacyApprovalId(source, legacyId),
        approverRole: row.reviewer_role ?? "R&D Manager",
        approverId: row.reviewer_user_id,
        approverName: row.reviewer_name,
        decision: row.action === "return_for_replacement_part" ? "rejected" : "approved",
        comment: row.result,
        decidedAt: row.occurred_at
      }));
    }

    return [];
  }
}

function numberingActionTitle(actionCode: string) {
  const titles: Record<string, string> = {
    release: "發行審核",
    same_drawing_variant_after_release: "同圖多料號審核",
    release_missing_ma_confirm: "發行缺製造圖確認",
    main_drawing_restore: "主圖恢復審核",
    obsolete_part_number: "料號作廢審核",
    obsolete_ma_drawing: "圖號作廢審核",
    obsolete_part_root: "主根作廢審核"
  };
  return titles[actionCode] ?? actionCode;
}
