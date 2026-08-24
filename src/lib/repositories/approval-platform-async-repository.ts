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
  | "bom_workbench"
  | "legacy_numbering"
  | "legacy_submission"
  | "legacy_bom"
  | "legacy_drawing_package"
  | "legacy_drawing_revision_review";

export type LegacyApprovalPlatformSource = Exclude<ApprovalPlatformSource, "platform" | "bom_workbench">;

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
  rowKey: string;
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
  historyOnly?: boolean;
  supersededByRequestId?: string | null;
  supersededAt?: string | null;
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
  superseded_by_request_id: string | null;
  superseded_at: string | null;
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
  allowedActionCodes?: string[];
  query?: string;
  cursor?: ApprovalPlatformInboxCursor | null;
};

export type ApprovalPlatformInboxCursor = {
  sortValue: string;
  rowKey: string;
  direction?: "after" | "before";
};

export type ApprovalPlatformInboxPage = {
  items: ApprovalPlatformInboxItem[];
  nextCursor: ApprovalPlatformInboxCursor | null;
  previousCursor: ApprovalPlatformInboxCursor | null;
  summary: {
    total: number;
    pending: number;
    needsInfo: number;
    applyFailed: number;
  };
};

export function approvalPlatformInboxRowKey(source: ApprovalPlatformSource, id: string) {
  return `approval:${source}:${id}`;
}

function matchesInboxFilter(item: ApprovalPlatformInboxItem, input: ApprovalPlatformInboxFilter) {
  const domainCode = input.domainCode?.trim();
  const actionCode = input.actionCode?.trim();
  const allowedActionCodes = input.allowedActionCodes?.map((value) => value.trim()).filter(Boolean);
  const query = input.query?.trim().toLocaleLowerCase("zh-Hant");

  if (domainCode && item.domainCode !== domainCode) return false;
  if (actionCode && item.actionCode !== actionCode) return false;
  if (allowedActionCodes?.length && !allowedActionCodes.some((value) => value === item.actionCode || value.replace(/^numbering\./u, "") === item.actionCode.replace(/^numbering\./u, ""))) return false;
  if (query) {
    const searchable = [
      item.targetSummary,
      item.title,
      item.actionTitle,
      item.requestedByName,
      item.requestedBy,
      item.packageCode
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("zh-Hant");
    if (!searchable.includes(query)) return false;
  }

  return true;
}

function approvalSearchPredicate(query: string | undefined, columns: string[]) {
  const normalized = query?.trim().toLocaleLowerCase("zh-Hant");
  if (!normalized) return { sql: "", params: {} as Record<string, string> };
  const escaped = normalized.replace(/[\\%_]/gu, (value) => `\\${value}`);
  return {
    sql: `AND (${columns.map((column) => `LOWER(COALESCE(${column}, '')) LIKE :queryLike ESCAPE '\\'`).join(" OR ")})`,
    params: { queryLike: `%${escaped}%` }
  };
}

function nativeApprovalSearchPredicate(query: string | undefined) {
  const base = approvalSearchPredicate(query, [
    "r.id",
    "r.title",
    "a.title",
    "requester.display_name",
    "p.package_code"
  ]);
  if (!base.sql) return base;
  const directConditions = base.sql.slice("AND (".length, -1);
  return {
    sql: `AND (
      ${directConditions}
      OR EXISTS (
        SELECT 1
        FROM approval_platform_targets search_target
        WHERE search_target.request_id = r.id
          AND (
            LOWER(COALESCE(search_target.target_code, '')) LIKE :queryLike ESCAPE '\\'
            OR LOWER(COALESCE(search_target.target_label, '')) LIKE :queryLike ESCAPE '\\'
            OR LOWER(COALESCE(search_target.target_id, '')) LIKE :queryLike ESCAPE '\\'
          )
      )
      OR EXISTS (
        SELECT 1
        FROM approval_platform_impact_snapshots search_snapshot
        WHERE search_snapshot.request_id = r.id
          AND LOWER(COALESCE(CAST(search_snapshot.snapshot_json AS TEXT), '')) LIKE :queryLike ESCAPE '\\'
      )
    )`,
    params: base.params
  };
}

function compareInboxItems(left: ApprovalPlatformInboxItem, right: ApprovalPlatformInboxItem) {
  return right.requestedAt.localeCompare(left.requestedAt) || left.rowKey.localeCompare(right.rowKey);
}

function isAfterInboxCursor(item: ApprovalPlatformInboxItem, cursor: ApprovalPlatformInboxCursor) {
  return item.requestedAt < cursor.sortValue || (item.requestedAt === cursor.sortValue && item.rowKey > cursor.rowKey);
}

function isBeforeInboxCursor(item: ApprovalPlatformInboxItem, cursor: ApprovalPlatformInboxCursor) {
  return item.requestedAt > cursor.sortValue || (item.requestedAt === cursor.sortValue && item.rowKey < cursor.rowKey);
}

export function encodeBomWorkbenchApprovalId(reviewId: string) {
  return `bom_workbench:${reviewId}`;
}

export function decodeBomWorkbenchApprovalId(id: string): string | null {
  const match = /^bom_workbench:(.+)$/u.exec(id);
  return match?.[1] ?? null;
}

export function encodeLegacyApprovalId(source: LegacyApprovalPlatformSource, legacyId: string) {
  return `legacy:${source}:${legacyId}`;
}

export function decodeLegacyApprovalId(id: string): { source: LegacyApprovalPlatformSource; legacyId: string } | null {
  const match = /^legacy:(legacy_[a-z_]+):(.+)$/u.exec(id);
  if (!match) return null;
  const source = match[1] as LegacyApprovalPlatformSource;
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

function drawingRevisionReviewStatus(row: { review_action: string | null; source_submission_status?: string | null }): ApprovalPlatformStatus {
  if (row.source_submission_status === "Cancelled") return "cancelled";
  if (!row.review_action) return "pending";
  if (row.review_action === "request_more_information") return "needs_info";
  return row.review_action === "return_for_replacement_part" ? "rejected" : "approved";
}

function drawingRevisionAllowedDecisions(): ApprovalPlatformDecision[] {
  return ["approved", "rejected", "needs_info"];
}

function drawingRevisionRecommendedAction(outcome: string | null) {
  if (outcome === "confirmed_impact") return "approve_replacement_part_and_drawing_release";
  if (outcome === "suspected_impact") return "confirm_original_part_reuse";
  return "confirm_bom_no_revision";
}

function drawingRevisionReviewStatusPredicate(status: "active" | "all" | ApprovalPlatformStatus = "active") {
  if (status === "all") return "";
  if (status === "cancelled") return "AND source_submission.status = 'Cancelled'";
  const activeSubmission = "AND COALESCE(source_submission.status, '') <> 'Cancelled'";
  const currentAssessment = `
    AND NOT EXISTS (
      SELECT 1
      FROM drawing_revision_fff_assessments newer_assessment
      WHERE newer_assessment.company_id = a.company_id
        AND newer_assessment.drawing_number_id = a.drawing_number_id
        AND newer_assessment.revision = a.revision
        AND (
          newer_assessment.assessed_at > a.assessed_at
          OR (newer_assessment.assessed_at = a.assessed_at AND newer_assessment.id > a.id)
        )
    )`;
  if (status === "active") return `${activeSubmission} AND rce.id IS NULL${currentAssessment}`;
  if (status === "pending") return `${activeSubmission} AND rce.id IS NULL${currentAssessment}`;
  if (status === "needs_info") return `${activeSubmission} AND rce.action = 'request_more_information'${currentAssessment}`;
  if (status === "approved") return `${activeSubmission} AND rce.id IS NOT NULL AND rce.action NOT IN ('return_for_replacement_part', 'request_more_information')`;
  if (status === "rejected") return `${activeSubmission} AND rce.action = 'return_for_replacement_part'`;
  return "AND 1 = 0";
}

const nativeSupersessionProjection = `
        (
          SELECT newer_request.id
          FROM approval_platform_targets current_workspace
          JOIN approval_platform_targets newer_workspace
            ON newer_workspace.target_type = current_workspace.target_type
           AND newer_workspace.target_id = current_workspace.target_id
          JOIN approval_platform_requests newer_request
            ON newer_request.id = newer_workspace.request_id
           AND newer_request.company_id = r.company_id
           AND newer_request.action_code = r.action_code
          WHERE r.action_code = 'numbering.candidate_bundle_review'
            AND r.request_status = 'needs_info'
            AND current_workspace.request_id = r.id
            AND current_workspace.target_type = 'numbering_draft_workspace'
            AND (
              newer_request.requested_at > r.requested_at
              OR (newer_request.requested_at = r.requested_at AND newer_request.id > r.id)
            )
          ORDER BY newer_request.requested_at DESC, newer_request.id DESC
          LIMIT 1
        ) AS superseded_by_request_id,
        (
          SELECT newer_request.requested_at
          FROM approval_platform_targets current_workspace
          JOIN approval_platform_targets newer_workspace
            ON newer_workspace.target_type = current_workspace.target_type
           AND newer_workspace.target_id = current_workspace.target_id
          JOIN approval_platform_requests newer_request
            ON newer_request.id = newer_workspace.request_id
           AND newer_request.company_id = r.company_id
           AND newer_request.action_code = r.action_code
          WHERE r.action_code = 'numbering.candidate_bundle_review'
            AND r.request_status = 'needs_info'
            AND current_workspace.request_id = r.id
            AND current_workspace.target_type = 'numbering_draft_workspace'
            AND (
              newer_request.requested_at > r.requested_at
              OR (newer_request.requested_at = r.requested_at AND newer_request.id > r.id)
            )
          ORDER BY newer_request.requested_at DESC, newer_request.id DESC
          LIMIT 1
        ) AS superseded_at`;

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
        ${nativeSupersessionProjection},
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

  async listInbox(input: ApprovalPlatformInboxFilter = {}): Promise<ApprovalPlatformInboxPage> {
    const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
    const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
    const sourceLimit = Math.min(500, Math.max(limit + 1, 100));
    const [nativeItems, numbering, submission, bom, supplement, drawingRevisionReviews] = await Promise.all([
      this.listNativeInbox({ companyId, actorId: input.actorId, status: input.status, query: input.query, limit: sourceLimit }),
      this.listLegacyNumberingInbox({ companyId, status: input.status, query: input.query, limit: sourceLimit }),
      this.listLegacySubmissionInbox({ companyId, status: input.status, query: input.query, limit: sourceLimit }),
      this.listLegacyBomInbox({ companyId, status: input.status, query: input.query, limit: sourceLimit }),
      this.listLegacyDrawingPackageInbox({ companyId, status: input.status, query: input.query, limit: sourceLimit }),
      this.listLegacyDrawingRevisionReviewInbox({ companyId, status: input.status, query: input.query, limit: sourceLimit })
    ]);
    const sorted = [...nativeItems, ...numbering, ...submission, ...bom, ...supplement, ...drawingRevisionReviews]
      .filter((item) => matchesInboxFilter(item, input))
      .sort(compareInboxItems);
    const cursor = input.cursor ?? null;
    const direction = cursor?.direction ?? "after";
    const eligible = cursor
      ? sorted.filter((item) => direction === "before" ? isBeforeInboxCursor(item, cursor) : isAfterInboxCursor(item, cursor))
      : sorted;
    const items = direction === "before" ? eligible.slice(Math.max(0, eligible.length - limit)) : eligible.slice(0, limit);
    const first = items[0];
    const last = items.at(-1);
    const firstIndex = first ? sorted.findIndex((item) => item.rowKey === first.rowKey) : -1;
    const lastIndex = last ? sorted.findIndex((item) => item.rowKey === last.rowKey) : -1;
    return {
      items,
      nextCursor: last && lastIndex >= 0 && lastIndex < sorted.length - 1
        ? { sortValue: last.requestedAt, rowKey: last.rowKey, direction: "after" }
        : null,
      previousCursor: first && firstIndex > 0
        ? { sortValue: first.requestedAt, rowKey: first.rowKey, direction: "before" }
        : null,
      summary: {
        total: sorted.length,
        pending: sorted.filter((item) => item.status === "pending").length,
        needsInfo: sorted.filter((item) => item.status === "needs_info").length,
        applyFailed: sorted.filter((item) => item.status === "apply_failed").length
      }
    };
  }

  async getRequestDetail(id: string, companyId = DEFAULT_COMPANY_ID): Promise<ApprovalPlatformRequestDetail | null> {
    const bomReviewId = decodeBomWorkbenchApprovalId(id);
    if (bomReviewId) return this.getLegacyDetail("legacy_bom", bomReviewId, companyId, "bom_workbench");
    const legacy = decodeLegacyApprovalId(id);
    if (legacy) return this.getLegacyDetail(legacy.source, legacy.legacyId, companyId);
    const row = await this.getNativeRequestRow(id);
    if (!row) return null;
    const [targets, impactSnapshots, decisions, events] = await Promise.all([
      this.listTargets(row.id),
      this.listImpactSnapshots(row.id),
      this.listDecisions(row.id),
      this.listEvents(row.id)
    ]);
    const primaryTarget = targets.find((target) => target.role === "primary") ?? targets[0];
    return {
      rowKey: approvalPlatformInboxRowKey("platform", row.id),
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
      primaryTarget: primaryTarget ? { type: primaryTarget.type, targetId: primaryTarget.targetId, code: primaryTarget.code, label: primaryTarget.label } : undefined,
      historyOnly: Boolean(row.superseded_by_request_id),
      supersededByRequestId: row.superseded_by_request_id,
      supersededAt: row.superseded_at,
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

  private async listNativeInbox(input: { companyId: string; actorId?: string; status?: "active" | "all" | ApprovalPlatformStatus; query?: string; limit: number }) {
    const statusClause = this.statusWhereClause("r.request_status", input.status);
    const hideSupersededNeedsInfo = input.status === undefined || input.status === "active" || input.status === "needs_info"
      ? `
        AND NOT (
          r.action_code = 'numbering.candidate_bundle_review'
          AND r.request_status = 'needs_info'
          AND EXISTS (
            SELECT 1
            FROM approval_platform_targets current_workspace
            JOIN approval_platform_targets newer_workspace
              ON newer_workspace.target_type = current_workspace.target_type
             AND newer_workspace.target_id = current_workspace.target_id
            JOIN approval_platform_requests newer_request
              ON newer_request.id = newer_workspace.request_id
             AND newer_request.company_id = r.company_id
             AND newer_request.action_code = r.action_code
            WHERE current_workspace.request_id = r.id
              AND current_workspace.target_type = 'numbering_draft_workspace'
              AND (
                newer_request.requested_at > r.requested_at
                OR (newer_request.requested_at = r.requested_at AND newer_request.id > r.id)
              )
          )
        )`
      : "";
    const searchClause = nativeApprovalSearchPredicate(input.query);
    const rows = await this.client.query<NativeRequestRow>(
      `
      SELECT
        r.*,
        ${nativeSupersessionProjection},
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
            EXISTS (
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
        ${hideSupersededNeedsInfo}
        ${searchClause.sql}
      ORDER BY r.requested_at DESC, r.id DESC
      LIMIT :limit
    `,
      { companyId: input.companyId, actorId: input.actorId ?? null, limit: input.limit, ...statusClause.params, ...searchClause.params }
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
        rowKey: approvalPlatformInboxRowKey("platform", row.id),
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
        historyOnly: Boolean(row.superseded_by_request_id),
        supersededByRequestId: row.superseded_by_request_id,
        supersededAt: row.superseded_at,
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

  private async listLegacyNumberingInbox(input: { companyId: string; status?: "active" | "all" | ApprovalPlatformStatus; query?: string; limit: number }) {
    const status = this.legacyStatusPredicate("ar.request_status", input.status);
    const search = approvalSearchPredicate(input.query, [
      "ar.id",
      "ar.action_code",
      "ar.entity_id",
      "requester.display_name",
      "ab.batch_code",
      "pr.root_code",
      "pr.core_name",
      "pn.part_number",
      "pn.part_name",
      "dn.drawing_number",
      "dn.purpose_description"
    ]);
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
        ${search.sql}
      ORDER BY ar.requested_at DESC, ar.id DESC
      LIMIT :limit
    `,
      { companyId: input.companyId, limit: input.limit, ...status.params, ...search.params }
    );

    return rows.map((row): ApprovalPlatformInboxItem => ({
      rowKey: approvalPlatformInboxRowKey("legacy_numbering", encodeLegacyApprovalId("legacy_numbering", row.id)),
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

  private async listLegacySubmissionInbox(input: { companyId: string; status?: "active" | "all" | ApprovalPlatformStatus; query?: string; limit: number }) {
    const status = this.legacyStatusPredicate("r.request_status", input.status);
    const search = approvalSearchPredicate(input.query, [
      "r.id",
      "r.submission_id",
      "requester.display_name",
      "i.part_number",
      "s.drawing_number",
      "s.revision"
    ]);
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
      WHERE s.company_id = :companyId
        AND r.action_code = 'obsolete_submission'
        ${status.sql}
        ${search.sql}
      ORDER BY r.requested_at DESC, r.id DESC
      LIMIT :limit
    `,
      { companyId: input.companyId, limit: input.limit, ...status.params, ...search.params }
    );
    return rows.map((row): ApprovalPlatformInboxItem => ({
      rowKey: approvalPlatformInboxRowKey("legacy_submission", encodeLegacyApprovalId("legacy_submission", row.id)),
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
      legacy: { table: "submission_lifecycle_requests", id: row.id },
      primaryTarget: {
        type: "submission",
        targetId: row.submission_id,
        code: row.drawing_number,
        label: [row.drawing_number, row.revision].filter(Boolean).join(" / ") || row.submission_id
      }
    }));
  }

  private async listLegacyBomInbox(input: { companyId: string; status?: "active" | "all" | ApprovalPlatformStatus; query?: string; limit: number }) {
    const status = this.legacyStatusPredicate("rr.status", input.status);
    const baseSearch = approvalSearchPredicate(input.query, [
      "rr.id",
      "rr.bom_draft_id",
      "rr.lifecycle_action",
      "requester.display_name",
      "bd.draft_name",
      "pn.part_number",
      "i.part_number",
      "bd.bom_revision",
      "bd.parent_revision"
    ]);
    const search = baseSearch.sql
      ? {
          ...baseSearch,
          sql: `${baseSearch.sql.slice(0, -1)} OR EXISTS (
            SELECT 1
            FROM bom_draft_parent_bindings search_parent
            JOIN part_numbers search_parent_number ON search_parent_number.id = search_parent.parent_part_number_id
            WHERE search_parent.bom_draft_id = bd.id
              AND LOWER(COALESCE(search_parent_number.part_number, '')) LIKE :queryLike ESCAPE '\\'
          ))`
        }
      : baseSearch;
    const rows = await this.client.query<{
      id: string;
      bom_draft_id: string;
      status: string;
      lifecycle_action: string;
      submitted_by: string;
      requested_by_name: string | null;
      change_reason: string;
      submitted_at: string;
      company_id: string | null;
      draft_name: string;
      parent_part_number: string;
      parent_submission_id: string;
      display_revision: string;
      review_schema_version: number | null;
      parent_count: number;
    }>(
      `
      SELECT
        rr.*,
        requester.display_name AS requested_by_name,
        bd.company_id,
        bd.draft_name,
        bd.parent_submission_id,
        rr.review_schema_version,
        (
          SELECT COUNT(*)
          FROM bom_draft_parent_bindings parent_binding
          WHERE parent_binding.bom_draft_id = bd.id
        ) AS parent_count,
        COALESCE(pn.part_number, i.part_number, '') AS parent_part_number,
        COALESCE(bd.bom_revision, bd.parent_revision, '-') AS display_revision
      FROM bom_review_requests rr
      JOIN bom_drafts bd ON bd.id = rr.bom_draft_id
      LEFT JOIN users requester ON requester.id = rr.submitted_by
      LEFT JOIN part_numbers pn ON pn.id = bd.owner_part_number_id
      LEFT JOIN items i ON i.id = bd.parent_item_id
      WHERE bd.company_id = :companyId
        ${status.sql}
        ${search.sql}
      ORDER BY rr.submitted_at DESC, rr.id DESC
      LIMIT :limit
    `,
      { companyId: input.companyId, limit: input.limit, ...status.params, ...search.params }
    );
    return rows.map((row): ApprovalPlatformInboxItem => {
      const isSharedBom = Number(row.review_schema_version ?? 0) >= 2;
      const source: ApprovalPlatformSource = isSharedBom ? "bom_workbench" : "legacy_bom";
      const id = isSharedBom
        ? encodeBomWorkbenchApprovalId(row.id)
        : encodeLegacyApprovalId("legacy_bom", row.id);
      return {
        rowKey: approvalPlatformInboxRowKey(source, id),
        id,
        source,
        companyId: row.company_id ?? input.companyId,
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
        targetSummary: row.parent_part_number
          ? `${row.parent_part_number} BOM Rev ${row.display_revision}`
          : /\bBOM\s+Rev\b/i.test(row.draft_name)
            ? row.draft_name
            : `${row.draft_name} / BOM Rev ${row.display_revision}`,
        impactSummary: isSharedBom ? `${row.parent_count} Parent(s) / ${row.lifecycle_action}` : row.lifecycle_action,
        legacy: { table: "bom_review_requests", id: row.id },
        primaryTarget: {
          type: isSharedBom ? "bom_definition" : "bom_draft",
          targetId: row.bom_draft_id,
          code: row.parent_part_number || null,
          label: row.draft_name
        }
      };
    });
  }

  private async listLegacyDrawingPackageInbox(input: { companyId: string; status?: "active" | "all" | ApprovalPlatformStatus; query?: string; limit: number }) {
    const status = this.legacyStatusPredicate("s.status", input.status);
    const search = approvalSearchPredicate(input.query, [
      "s.id",
      "s.package_id",
      "s.reason_code",
      "s.reason_note",
      "requester.display_name",
      "p.drawing_number",
      "p.revision"
    ]);
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
        ${search.sql}
      ORDER BY s.requested_at DESC, s.id DESC
      LIMIT :limit
    `,
      { companyId: input.companyId, limit: input.limit, ...status.params, ...search.params }
    );
    return rows.map((row): ApprovalPlatformInboxItem => ({
      rowKey: approvalPlatformInboxRowKey("legacy_drawing_package", encodeLegacyApprovalId("legacy_drawing_package", row.id)),
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
      legacy: { table: "drawing_revision_package_supplements", id: row.id },
      primaryTarget: {
        type: "drawing_revision_package",
        targetId: row.package_id,
        code: row.drawing_number,
        label: `${row.drawing_number} / rev ${row.revision}`
      }
    }));
  }

  private async listLegacyDrawingRevisionReviewInbox(input: {
    companyId: string;
    status?: "active" | "all" | ApprovalPlatformStatus;
    query?: string;
    limit: number;
  }) {
    const statusSql = drawingRevisionReviewStatusPredicate(input.status);
    const search = approvalSearchPredicate(input.query, [
      "a.id",
      "a.revision",
      "a.detected_part_number",
      "a.corrected_part_number",
      "a.reason_category",
      "a.note",
      "assessor.display_name",
      "dn.drawing_number",
      "pnd.reserved_part_number"
    ]);
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
      superseded_by_assessment_id: string | null;
      superseded_at: string | null;
      revision_package_id: string | null;
      source_submission_status: string | null;
    }>(
      `
      SELECT
        a.*,
        assessor.display_name AS assessed_by_name,
        dn.drawing_number,
        pnd.reserved_part_number AS replacement_reserved_part_number,
        source_submission.status AS source_submission_status,
        rce.action AS review_action,
        rce.result AS review_result,
        rce.occurred_at AS review_occurred_at,
        (
          SELECT newer_assessment.id
          FROM drawing_revision_fff_assessments newer_assessment
          WHERE newer_assessment.company_id = a.company_id
            AND newer_assessment.drawing_number_id = a.drawing_number_id
            AND newer_assessment.revision = a.revision
            AND (
              newer_assessment.assessed_at > a.assessed_at
              OR (newer_assessment.assessed_at = a.assessed_at AND newer_assessment.id > a.id)
            )
          ORDER BY newer_assessment.assessed_at DESC, newer_assessment.id DESC
          LIMIT 1
        ) AS superseded_by_assessment_id,
        (
          SELECT newer_assessment.assessed_at
          FROM drawing_revision_fff_assessments newer_assessment
          WHERE newer_assessment.company_id = a.company_id
            AND newer_assessment.drawing_number_id = a.drawing_number_id
            AND newer_assessment.revision = a.revision
            AND (
              newer_assessment.assessed_at > a.assessed_at
              OR (newer_assessment.assessed_at = a.assessed_at AND newer_assessment.id > a.id)
            )
          ORDER BY newer_assessment.assessed_at DESC, newer_assessment.id DESC
          LIMIT 1
        ) AS superseded_at,
        (
          SELECT package.id
          FROM drawing_revision_packages package
          WHERE package.company_id = a.company_id
            AND package.drawing_number_id = a.drawing_number_id
            AND package.revision = a.revision
            AND (a.submission_id IS NULL OR package.source_submission_id = a.submission_id)
          ORDER BY CASE WHEN package.source_submission_id = a.submission_id THEN 0 ELSE 1 END,
                   package.updated_at DESC,
                   package.id DESC
          LIMIT 1
        ) AS revision_package_id
      FROM drawing_revision_fff_assessments a
      LEFT JOIN users assessor ON assessor.id = a.assessed_by
      LEFT JOIN submissions source_submission ON source_submission.id = a.submission_id
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
        ${search.sql}
      ORDER BY COALESCE(rce.occurred_at, a.assessed_at) DESC, a.id DESC
      LIMIT :limit
    `,
      { companyId: input.companyId, limit: input.limit, ...search.params }
    );

    return rows.map((row): ApprovalPlatformInboxItem => {
      const outcome = drawingRevisionOutcome(row);
      const targetSummary = [
        `${row.drawing_number ?? row.drawing_number_id} / rev ${row.revision}`,
        row.replacement_reserved_part_number ? `新料號 ${row.replacement_reserved_part_number}` : null
      ]
        .filter(Boolean)
        .join(" / ");
      const supersededByRequestId = row.superseded_by_assessment_id
        ? encodeLegacyApprovalId("legacy_drawing_revision_review", row.superseded_by_assessment_id)
        : null;
      return {
        rowKey: approvalPlatformInboxRowKey("legacy_drawing_revision_review", encodeLegacyApprovalId("legacy_drawing_revision_review", row.id)),
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
        legacy: { table: "drawing_revision_fff_assessments", id: row.id },
        historyOnly: Boolean(supersededByRequestId),
        supersededByRequestId,
        supersededAt: row.superseded_at,
        primaryTarget: {
          type: row.revision_package_id ? "drawing_revision_package" : "drawing_number",
          targetId: row.revision_package_id ?? row.drawing_number_id,
          code: row.drawing_number,
          label: `${row.drawing_number ?? row.drawing_number_id} / rev ${row.revision}`
        }
      };
    });
  }

  private async getLegacyDetail(
    source: LegacyApprovalPlatformSource,
    legacyId: string,
    companyId: string,
    canonicalSource?: "bom_workbench"
  ) {
    const lists = {
      legacy_numbering: () => this.listLegacyNumberingInbox({ companyId, status: "all", query: legacyId, limit: 10 }),
      legacy_submission: () => this.listLegacySubmissionInbox({ companyId, status: "all", query: legacyId, limit: 10 }),
      legacy_bom: () => this.listLegacyBomInbox({ companyId, status: "all", query: legacyId, limit: 10 }),
      legacy_drawing_package: () => this.listLegacyDrawingPackageInbox({ companyId, status: "all", query: legacyId, limit: 10 }),
      legacy_drawing_revision_review: () =>
        this.listLegacyDrawingRevisionReviewInbox({ companyId, status: "all", query: legacyId, limit: 10 })
    };
    const encoded = canonicalSource === "bom_workbench"
      ? encodeBomWorkbenchApprovalId(legacyId)
      : encodeLegacyApprovalId(source, legacyId);
    const base = (await lists[source]()).find((item) => item.id === encoded);
    if (!base) return null;
    const legacyNumberingPayload = source === "legacy_numbering"
      ? parseJsonObject((await this.client.queryOne<{ payload_json: string }>(
          `SELECT payload_json FROM approval_requests WHERE id = :legacyId AND company_id = :companyId LIMIT 1`,
          { legacyId, companyId }
        ))?.payload_json)
      : {};
    const isDrawingRevisionReview = source === "legacy_drawing_revision_review";
    const drawingRevisionEvidence = isDrawingRevisionReview
      ? await this.getLegacyDrawingRevisionEvidenceSnapshot(legacyId, companyId)
      : null;
    const payload = isDrawingRevisionReview
      ? {
          outcome: base.impactSummary,
          allowedDecisions: drawingRevisionAllowedDecisions(),
          recommendedAction: drawingRevisionRecommendedAction(base.impactSummary)
        }
      : legacyNumberingPayload;
    const impactSnapshot = isDrawingRevisionReview
      ? {
          targetSummary: base.targetSummary,
          outcome: base.impactSummary,
          allowedDecisions: drawingRevisionAllowedDecisions(),
          recommendedAction: drawingRevisionRecommendedAction(base.impactSummary),
          ...(drawingRevisionEvidence ?? {}),
          legacy: base.legacy
        }
      : { ...legacyNumberingPayload, targetSummary: base.targetSummary, impactSummary: base.impactSummary, legacy: base.legacy };
    const primaryTarget = base.primaryTarget;
    const childTargets = source === "legacy_numbering" && Array.isArray(legacyNumberingPayload.childTargets)
      ? legacyNumberingPayload.childTargets.flatMap((value, index): ApprovalPlatformTarget[] => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return [];
          const child = value as Record<string, unknown>;
          const type = typeof child.entityType === "string" ? child.entityType.trim() : "";
          const targetId = typeof child.entityId === "string" ? child.entityId.trim() : "";
          const code = typeof child.entityCode === "string" ? child.entityCode.trim() : "";
          const status = typeof child.recordStatus === "string" ? child.recordStatus.trim() : "";
          if (!type || !targetId) return [];
          return [{
            id: `${encoded}:impact:${index}`,
            role: "impact",
            type,
            targetId,
            code: code || null,
            label: code || targetId,
            status: status || null,
            snapshot: { ...child }
          }];
        })
      : [];
    const targets: ApprovalPlatformTarget[] = [
      {
        id: `${encoded}:target`,
        role: "primary",
        type: primaryTarget?.type ?? base.legacy?.table ?? source,
        targetId: primaryTarget?.targetId ?? legacyId,
        code: primaryTarget?.code ?? base.targetSummary,
        label: primaryTarget?.label ?? base.targetSummary,
        status: base.status,
        snapshot: { legacy: base.legacy }
      },
      ...childTargets
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

  private async getLegacyDrawingRevisionEvidenceSnapshot(legacyId: string, companyId: string) {
    const rows = await this.client.query<{
      drawing_number_id: string;
      drawing_number: string | null;
      revision: string;
      submission_id: string | null;
      package_id: string | null;
      file_id: string | null;
      source_file_asset_id: string | null;
      source_submission_file_id: string | null;
      role: string | null;
      display_name: string | null;
      description: string | null;
      is_primary: number | string | null;
      original_filename: string | null;
      sha256: string | null;
      file_size: number | string | null;
      hash_algorithm: string | null;
      detected_part_number: string | null;
      corrected_part_number: string | null;
      form_state: string;
      fit_state: string;
      function_state: string;
      reason_category: string;
      note: string | null;
    }>(
      `
        SELECT
          assessment.drawing_number_id,
          drawing.drawing_number,
          assessment.revision,
          assessment.submission_id,
          revision_package.id AS package_id,
          package_file.id AS file_id,
          package_file.source_file_asset_id,
          package_file.source_submission_file_id,
          package_file.role,
          package_file.display_name,
          package_file.description,
          package_file.is_primary,
          submission_file.original_filename,
          COALESCE(submission_file.sha256, source_asset.content_hash) AS sha256,
          COALESCE(submission_file.file_size, source_asset.file_size) AS file_size,
          COALESCE(source_asset.hash_algorithm, 'SHA-256') AS hash_algorithm,
          assessment.detected_part_number,
          assessment.corrected_part_number,
          assessment.form_state,
          assessment.fit_state,
          assessment.function_state,
          assessment.reason_category,
          assessment.note
        FROM drawing_revision_fff_assessments assessment
        LEFT JOIN drawing_numbers drawing ON drawing.id = assessment.drawing_number_id
        LEFT JOIN drawing_revision_packages revision_package ON revision_package.id = (
          SELECT candidate.id
          FROM drawing_revision_packages candidate
          WHERE candidate.company_id = assessment.company_id
            AND candidate.drawing_number_id = assessment.drawing_number_id
            AND candidate.revision = assessment.revision
            AND (assessment.submission_id IS NULL OR candidate.source_submission_id = assessment.submission_id)
          ORDER BY CASE WHEN candidate.source_submission_id = assessment.submission_id THEN 0 ELSE 1 END,
                   candidate.updated_at DESC,
                   candidate.id DESC
          LIMIT 1
        )
        LEFT JOIN drawing_revision_package_files package_file ON package_file.package_id = revision_package.id
        LEFT JOIN submission_files submission_file ON submission_file.id = package_file.source_submission_file_id
        LEFT JOIN file_assets source_asset ON source_asset.id = package_file.source_file_asset_id
        WHERE assessment.id = :legacyId
          AND assessment.company_id = :companyId
        ORDER BY package_file.sort_order ASC, package_file.created_at ASC, package_file.id ASC
      `,
      { legacyId, companyId }
    );
    const header = rows[0];
    if (!header) return null;

    let files = rows
      .filter((row) => Boolean(row.file_id && row.source_file_asset_id))
      .map((row) => ({
        id: row.file_id,
        sourceFileAssetId: row.source_file_asset_id,
        submissionFileId: row.source_submission_file_id,
        role: row.role ?? "other",
        displayName: row.display_name || row.original_filename || "審核附件",
        description: row.description ?? "",
        isPrimary: Number(row.is_primary) === 1,
        contentHash: row.sha256,
        hashAlgorithm: row.hash_algorithm ?? "SHA-256",
        fileSize: row.file_size === null ? null : Number(row.file_size)
      }));

    if (files.length === 0 && header.submission_id) {
      const fallbackRows = await this.client.query<{
        id: string;
        source_file_asset_id: string | null;
        source_master_attachment_id: string | null;
        file_role: string;
        original_filename: string;
        sha256: string;
        file_size: number | string;
        document_category: string | null;
        display_name: string | null;
        description: string | null;
      }>(
        `
          SELECT
            submission_file.id,
            submission_file.source_file_asset_id,
            submission_file.source_master_attachment_id,
            submission_file.file_role,
            submission_file.original_filename,
            submission_file.sha256,
            submission_file.file_size,
            source_asset.document_category,
            source_asset.display_name,
            source_asset.description
          FROM submission_files submission_file
          LEFT JOIN file_assets source_asset
            ON source_asset.id = COALESCE(submission_file.source_file_asset_id, submission_file.source_master_attachment_id)
          WHERE submission_file.submission_id = :submissionId
          ORDER BY submission_file.created_at ASC, submission_file.id ASC
        `,
        { submissionId: header.submission_id }
      );
      files = fallbackRows.map((row) => ({
        id: row.id,
        sourceFileAssetId: row.source_file_asset_id ?? row.source_master_attachment_id,
        submissionFileId: row.id,
        role: legacyDrawingRevisionFileRole(row.document_category, row.file_role),
        displayName: row.display_name || row.original_filename,
        description: row.description ?? "",
        isPrimary: ["cad_3d", "drawing_2d"].includes(legacyDrawingRevisionFileRole(row.document_category, row.file_role)),
        contentHash: row.sha256,
        hashAlgorithm: "SHA-256",
        fileSize: Number(row.file_size)
      }));
    }

    const scopedParts = header.submission_id
      ? await this.client.query<{
          id: string;
          part_number_id: string;
          part_number: string;
          part_name: string;
          link_type: string;
          form_state: string;
          fit_state: string;
          function_state: string;
          fff_outcome: string;
        }>(
          `
            SELECT
              id,
              part_number_id,
              part_number,
              part_name,
              link_type,
              form_state,
              fit_state,
              function_state,
              fff_outcome
            FROM submission_part_scopes
            WHERE submission_id = :submissionId
              AND company_id = :companyId
            ORDER BY part_number ASC, part_number_id ASC
          `,
          { submissionId: header.submission_id, companyId }
        )
      : [];
    const fallbackPartNumber = header.corrected_part_number || header.detected_part_number;
    const outcome = drawingRevisionOutcome(header);
    const parts = scopedParts.length > 0
      ? scopedParts.map((part) => ({
          id: part.part_number_id || part.id,
          number: part.part_number,
          name: part.part_name,
          linkType: part.link_type,
          fff: {
            formState: part.form_state,
            fitState: part.fit_state,
            functionState: part.function_state,
            outcome: part.fff_outcome
          }
        }))
      : fallbackPartNumber
        ? [{
            id: fallbackPartNumber,
            number: fallbackPartNumber,
            name: "",
            linkType: "primary_manufacturing",
            fff: {
              formState: header.form_state,
              fitState: header.fit_state,
              functionState: header.function_state,
              outcome
            }
          }]
        : [];

    return {
      drawing: {
        id: header.drawing_number_id,
        number: header.drawing_number,
        revision: header.revision,
        packageId: header.package_id,
        submissionId: header.submission_id
      },
      parts,
      fff: {
        detectedPartNumber: header.detected_part_number,
        correctedPartNumber: header.corrected_part_number,
        formState: header.form_state,
        fitState: header.fit_state,
        functionState: header.function_state,
        outcome,
        reasonCategory: header.reason_category,
        note: header.note
      },
      files
    };
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
    obsolete_part_root: "圖料根號作廢審核"
  };
  return titles[actionCode] ?? actionCode;
}

function legacyDrawingRevisionFileRole(documentCategory: string | null, fileRole: string) {
  const normalizedCategory = documentCategory?.trim().toLowerCase();
  if (normalizedCategory === "cad_3d" || normalizedCategory === "drawing_2d" || normalizedCategory === "pdf") {
    return normalizedCategory;
  }
  if (normalizedCategory === "dwg" || normalizedCategory === "dxf" || normalizedCategory === "dwg_dxf") {
    return "dwg_dxf";
  }
  const normalizedRole = fileRole.trim().toLowerCase();
  if (["sldprt", "sldasm", "step", "stp", "iges", "igs", "x_t", "x_b"].includes(normalizedRole)) return "cad_3d";
  if (["slddrw", "drawing_2d"].includes(normalizedRole)) return "drawing_2d";
  if (normalizedRole === "pdf") return "pdf";
  if (["dwg", "dxf", "dwg_dxf"].includes(normalizedRole)) return "dwg_dxf";
  return "other";
}
