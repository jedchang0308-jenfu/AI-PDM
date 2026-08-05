import crypto from "node:crypto";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { DrawingWorkbenchAsyncRepository } from "@/lib/repositories/drawing-workbench-async-repository";
import type { NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import type { DrawingModuleListRecord, DrawingPurposeCode, NumberingRecordStatus } from "@/lib/repositories/numbering-repository";

export const DRAWING_WORKBENCH_STAGES = [
  "building",
  "drawing_preparation",
  "bundle_ready",
  "in_review",
  "auto_finalizing",
  "recovery_required",
  "official_controlled",
  "revision_in_review",
  "released",
  "history_only"
] as const;

export type DrawingWorkbenchStage = typeof DRAWING_WORKBENCH_STAGES[number];
export type DrawingWorkbenchView = "mine" | "work" | "all";
export type DrawingWorkbenchPrimaryActionKind =
  | "continue_building"
  | "complete_first_drawing"
  | "submit_bundle_review"
  | "view_review"
  | "view_processing"
  | "retry_formalization"
  | "view_drawing"
  | "create_revision"
  | "view_history";

export type DrawingWorkbenchPrimaryAction = {
  kind: DrawingWorkbenchPrimaryActionKind;
  label: string;
  enabled: boolean;
  disabledReason: string | null;
  href: string | null;
};

export type DrawingWorkbenchRow = {
  rowKey: string;
  rowKind: "candidate_bundle" | "drawing_master";
  workspaceId: string | null;
  drawingNumberId: string | null;
  displayCode: string;
  additionalDrawingCount: number;
  displayName: string;
  relatedPartSummary: string | null;
  purposeCode: DrawingPurposeCode | null;
  recordStatus: NumberingRecordStatus | null;
  pendingApprovalCount: number;
  releaseStatusMismatch: boolean;
  warningCount: number;
  stage: DrawingWorkbenchStage;
  stageLabel: string;
  usage: "not_for_formal_use" | "rd_controlled" | "released" | "historical_only";
  primaryAction: DrawingWorkbenchPrimaryAction | null;
  warning: { code: string; message: string } | null;
  updatedAt: string;
};

export type DrawingWorkbenchPermissions = {
  workspaceView: boolean;
  workspaceUpdate: boolean;
  candidateSubmit: boolean;
  candidateReview: boolean;
  publish: boolean;
  createRevision: boolean;
};

export type DrawingWorkbenchActor = {
  id: string;
  companyId: string;
  permissions: DrawingWorkbenchPermissions;
};

export type DrawingWorkbenchListResponse = {
  rows: DrawingWorkbenchRow[];
  nextCursor: string | null;
  generatedAt: string;
  filters: {
    seriesCodeOptions: string[];
    purposeCodeOptions: DrawingPurposeCode[];
    recordStatusOptions: NumberingRecordStatus[];
  };
};

export type DrawingWorkbenchDetailResponse = {
  row: DrawingWorkbenchRow;
  candidate: NumberingDraftWorkspaceRecord | null;
  drawing: DrawingModuleListRecord | null;
  sourceWorkspace: NumberingDraftWorkspaceRecord | null;
  capabilities: {
    canReviewApprovals: boolean;
    canCreateRevision: boolean;
  };
};

export class DrawingWorkbenchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "DrawingWorkbenchError";
  }
}

type NormalizedQuery = {
  query: string;
  view: DrawingWorkbenchView;
  stage: DrawingWorkbenchStage | "";
  seriesCode: string;
  purposeCode: DrawingPurposeCode | "";
  recordStatus: NumberingRecordStatus | "";
  cursor: string;
  limit: number;
};

type CursorPayload = {
  version: 1;
  filterHash: string;
  updatedAt: string;
  rowKey: string;
};

const stageLabels: Record<DrawingWorkbenchStage, string> = {
  building: "建立中",
  drawing_preparation: "首版準備",
  bundle_ready: "可送審",
  in_review: "審核中",
  auto_finalizing: "系統正式化中",
  recovery_required: "需要處理",
  official_controlled: "研發受控",
  revision_in_review: "新版審核中",
  released: "已發布",
  history_only: "歷史紀錄"
};

const terminalDrawingStatuses = new Set<NumberingRecordStatus>(["Obsolete", "Merged", "Rejected"]);
const drawingPurposeCodes = ["M", "R", "MA", "OT"] as const satisfies readonly DrawingPurposeCode[];
const drawingRecordStatuses = [
  "Draft",
  "NeedInfo",
  "Active",
  "PendingReview",
  "Released",
  "Rejected",
  "Obsolete",
  "Merged",
  "PendingAdminConfirm",
  "MainDrawingInvalid"
] as const satisfies readonly NumberingRecordStatus[];

function normalizedText(value: string | null, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

export function normalizeDrawingWorkbenchQuery(url: URL): NormalizedQuery {
  const query = normalizedText(url.searchParams.get("query"), 200);
  const requestedView = normalizedText(url.searchParams.get("view"), 20);
  const view: DrawingWorkbenchView = requestedView === "work" || requestedView === "all" ? requestedView : "mine";
  const requestedStage = normalizedText(url.searchParams.get("stage"), 40);
  if (requestedStage && !(DRAWING_WORKBENCH_STAGES as readonly string[]).includes(requestedStage)) {
    throw new DrawingWorkbenchError("workbench_invalid_stage", "請重新選擇有效的階段篩選。", 400);
  }
  const rawLimit = normalizedText(url.searchParams.get("limit"), 10) || "50";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new DrawingWorkbenchError("workbench_invalid_limit", "每頁筆數必須介於 1 到 100。", 400);
  }
  const requestedPurposeCode = normalizedText(url.searchParams.get("purposeCode"), 10);
  if (requestedPurposeCode && !(drawingPurposeCodes as readonly string[]).includes(requestedPurposeCode)) {
    throw new DrawingWorkbenchError("workbench_invalid_purpose", "請重新選擇有效的圖面用途。", 400);
  }
  const requestedRecordStatus = normalizedText(url.searchParams.get("recordStatus"), 40);
  if (requestedRecordStatus && !(drawingRecordStatuses as readonly string[]).includes(requestedRecordStatus)) {
    throw new DrawingWorkbenchError("workbench_invalid_record_status", "請重新選擇有效的資料狀態。", 400);
  }
  return {
    query,
    view,
    stage: requestedStage as DrawingWorkbenchStage | "",
    seriesCode: normalizedText(url.searchParams.get("seriesCode"), 80),
    purposeCode: requestedPurposeCode as DrawingPurposeCode | "",
    recordStatus: requestedRecordStatus as NumberingRecordStatus | "",
    cursor: normalizedText(url.searchParams.get("cursor"), 2_000),
    limit
  };
}

function workbenchSecret() {
  const configured = process.env.PDM_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("DRAWING_WORKBENCH_CURSOR_SECRET_REQUIRED");
  return "ai-pdm-local-drawing-workbench-cursor-v1";
}

function filterHash(query: NormalizedQuery, actor: DrawingWorkbenchActor) {
  return crypto.createHash("sha256").update(JSON.stringify({
    query: query.query.toLocaleLowerCase("zh-Hant"),
    view: query.view,
    stage: query.stage,
    seriesCode: query.seriesCode,
    purposeCode: query.purposeCode,
    recordStatus: query.recordStatus,
    companyId: actor.companyId,
    actorId: actor.id
  })).digest("hex");
}

function signCursor(encoded: string) {
  return crypto.createHmac("sha256", workbenchSecret()).update(encoded).digest("base64url");
}

function encodeCursor(payload: CursorPayload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signCursor(encoded)}`;
}

function decodeCursor(value: string, expectedFilterHash: string): CursorPayload {
  const [encoded, providedSignature, extra] = value.split(".");
  if (!encoded || !providedSignature || extra) {
    throw new DrawingWorkbenchError("workbench_invalid_cursor", "這個清單位置已失效，請重新整理。", 400);
  }
  const expectedSignature = signCursor(encoded);
  const left = Buffer.from(providedSignature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new DrawingWorkbenchError("workbench_invalid_cursor", "這個清單位置已失效，請重新整理。", 400);
  }
  let payload: CursorPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CursorPayload;
  } catch {
    throw new DrawingWorkbenchError("workbench_invalid_cursor", "這個清單位置已失效，請重新整理。", 400);
  }
  if (
    payload.version !== 1 || payload.filterHash !== expectedFilterHash ||
    !payload.updatedAt || !payload.rowKey
  ) {
    throw new DrawingWorkbenchError("workbench_invalid_cursor", "篩選條件已改變，請從第一頁重新查詢。", 400);
  }
  return payload;
}

function candidateStage(workspace: NumberingDraftWorkspaceRecord): DrawingWorkbenchStage {
  if (workspace.lifecycleStatus === "cancelled") return "history_only";
  if (workspace.lifecycleV2?.stage === "drawing_addendum_required") return "drawing_preparation";
  if (workspace.reservations.filter((reservation) => reservation.state !== "recycled").length === 0) return "building";
  const stage = workspace.lifecycleV2?.stage;
  if (stage && (DRAWING_WORKBENCH_STAGES as readonly string[]).includes(stage)) return stage as DrawingWorkbenchStage;
  return "recovery_required";
}

function candidateAction(
  workspace: NumberingDraftWorkspaceRecord,
  stage: DrawingWorkbenchStage,
  actor: DrawingWorkbenchActor
): DrawingWorkbenchPrimaryAction | null {
  const href = `/numbering/drawings?view=work&detail=${encodeURIComponent(`candidate:${workspace.id}`)}`;
  const owner = workspace.ownerId === actor.id;
  const disabled = (kind: DrawingWorkbenchPrimaryActionKind, label: string, allowed: boolean, reason: string) => ({
    kind,
    label,
    enabled: allowed,
    disabledReason: allowed ? null : reason,
    href: allowed ? href : null
  });
  if (stage === "building") return disabled("continue_building", "繼續建立", owner && actor.permissions.workspaceUpdate, "只有負責人可繼續編輯。 ".trim());
  if (stage === "drawing_preparation") return disabled("complete_first_drawing", "完成首版", owner && actor.permissions.workspaceUpdate, "只有負責人可完成首版。 ".trim());
  if (stage === "bundle_ready") return disabled("submit_bundle_review", "送交審核", owner && actor.permissions.candidateSubmit, "只有負責人且具送審權限時可送出。 ".trim());
  if (stage === "in_review") return { kind: "view_review", label: "查看審核", enabled: true, disabledReason: null, href };
  if (stage === "auto_finalizing") return null;
  if (stage === "recovery_required") {
    return actor.permissions.publish
      ? { kind: "retry_formalization", label: "重試正式化", enabled: true, disabledReason: null, href }
      : { kind: "view_processing", label: "查看處理狀態", enabled: true, disabledReason: null, href };
  }
  return { kind: "view_history", label: "查看紀錄", enabled: true, disabledReason: null, href };
}

function candidateRow(workspace: NumberingDraftWorkspaceRecord, actor: DrawingWorkbenchActor): DrawingWorkbenchRow {
  const stage = candidateStage(workspace);
  const drawingCodes = workspace.drawings
    .map((drawing) => drawing.candidateCode)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right, "zh-Hant", { numeric: true }));
  const partCodes = workspace.parts
    .map((part) => part.candidateCode)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right, "zh-Hant", { numeric: true }));
  const displayCode = drawingCodes[0] ?? partCodes[0] ?? workspace.root?.candidateCode ?? "尚未產生圖號";
  const displayName = workspace.root?.coreName ?? workspace.parts[0]?.partName ?? (workspace.draftMode === "append_part" ? "新增同圖料號" : "新增同根圖號");
  return {
    rowKey: `candidate:${workspace.id}`,
    rowKind: "candidate_bundle",
    workspaceId: workspace.id,
    drawingNumberId: null,
    displayCode,
    additionalDrawingCount: Math.max(0, drawingCodes.length - 1),
    displayName,
    relatedPartSummary: partCodes.length > 0 ? partCodes.join("、") : null,
    purposeCode: null,
    recordStatus: null,
    pendingApprovalCount: 0,
    releaseStatusMismatch: false,
    warningCount: stage === "recovery_required" ? 1 : 0,
    stage,
    stageLabel: stageLabels[stage],
    usage: stage === "history_only" ? "historical_only" : "not_for_formal_use",
    primaryAction: candidateAction(workspace, stage, actor),
    warning: stage === "recovery_required"
      ? { code: "candidate_recovery_required", message: "這筆工作需要處理後才能繼續。" }
      : null,
    updatedAt: workspace.updatedAt
  };
}

function drawingStage(drawing: DrawingModuleListRecord): DrawingWorkbenchStage {
  if (drawing.pendingApproval && drawing.pendingApproval.count > 0) return "revision_in_review";
  if (drawing.recordStatus === "Released") return "released";
  if (terminalDrawingStatuses.has(drawing.recordStatus)) return "history_only";
  return "official_controlled";
}

function drawingRow(drawing: DrawingModuleListRecord, actor: DrawingWorkbenchActor): DrawingWorkbenchRow {
  const stage = drawingStage(drawing);
  const detailHref = `/numbering/drawings?view=all&detail=${encodeURIComponent(`drawing:${drawing.id}`)}`;
  let primaryAction: DrawingWorkbenchPrimaryAction;
  if (stage === "revision_in_review") {
    primaryAction = { kind: "view_review", label: "查看審核", enabled: true, disabledReason: null, href: drawing.pendingApproval?.workbenchHref ?? detailHref };
  } else if (stage === "released") {
    const href = `/numbering/revisions?drawingNumber=${encodeURIComponent(drawing.drawingNumber)}`;
    primaryAction = {
      kind: "create_revision",
      label: "建立新版",
      enabled: actor.permissions.createRevision,
      disabledReason: actor.permissions.createRevision ? null : "你目前沒有建立新版的權限。",
      href: actor.permissions.createRevision ? href : null
    };
  } else if (stage === "history_only") {
    primaryAction = { kind: "view_history", label: "查看紀錄", enabled: true, disabledReason: null, href: detailHref };
  } else {
    const href = `/numbering/revisions?drawingNumber=${encodeURIComponent(drawing.drawingNumber)}`;
    primaryAction = {
      kind: "create_revision",
      label: "圖面進版",
      enabled: actor.permissions.createRevision,
      disabledReason: actor.permissions.createRevision ? null : "你目前沒有建立新版的權限。",
      href: actor.permissions.createRevision ? href : null
    };
  }
  return {
    rowKey: `drawing:${drawing.id}`,
    rowKind: "drawing_master",
    workspaceId: null,
    drawingNumberId: drawing.id,
    displayCode: drawing.drawingNumber,
    additionalDrawingCount: 0,
    displayName: drawing.coreName,
    relatedPartSummary: drawing.linkedPartNumbers.length > 0 ? drawing.linkedPartNumbers.join("、") : null,
    purposeCode: drawing.purposeCode,
    recordStatus: drawing.recordStatus,
    pendingApprovalCount: drawing.pendingApproval?.count ?? 0,
    releaseStatusMismatch: Boolean(drawing.releaseStatusMismatch),
    warningCount: drawing.warningCount,
    stage,
    stageLabel: stageLabels[stage],
    usage: stage === "released" ? "released" : stage === "history_only" ? "historical_only" : "rd_controlled",
    primaryAction,
    warning: drawing.releaseStatusMismatch
      ? { code: "release_status_mismatch", message: "發布狀態需要確認，請先查看圖面。" }
      : null,
    updatedAt: drawing.updatedAt
  };
}

function rowInView(row: DrawingWorkbenchRow, source: NumberingDraftWorkspaceRecord | DrawingModuleListRecord, actor: DrawingWorkbenchActor, view: DrawingWorkbenchView) {
  if (view === "all") return true;
  if (view === "work") return !["released", "history_only"].includes(row.stage);
  if (row.rowKind === "candidate_bundle") {
    const workspace = source as NumberingDraftWorkspaceRecord;
    return workspace.ownerId === actor.id
      || (row.stage === "in_review" && actor.permissions.candidateReview)
      || (row.stage === "recovery_required" && actor.permissions.publish);
  }
  const drawing = source as DrawingModuleListRecord;
  return row.stage === "revision_in_review" && Boolean(drawing.pendingApproval) && actor.permissions.candidateReview;
}

export class DrawingWorkbenchService {
  private readonly repository: DrawingWorkbenchAsyncRepository;

  constructor(client: AsyncDatabaseClient = getAsyncDatabaseClient()) {
    this.repository = new DrawingWorkbenchAsyncRepository(client);
  }

  async list(query: NormalizedQuery, actor: DrawingWorkbenchActor): Promise<DrawingWorkbenchListResponse> {
    const currentFilterHash = filterHash(query, actor);
    const cursor = query.cursor ? decodeCursor(query.cursor, currentFilterHash) : null;
    const page = await this.repository.readListPage({
      companyId: actor.companyId,
      query: query.query,
      seriesCode: query.seriesCode,
      purposeCode: query.purposeCode,
      recordStatus: query.recordStatus,
      includeCandidates: actor.permissions.workspaceView && !query.purposeCode && !query.recordStatus,
      cursor: cursor ? { updatedAt: cursor.updatedAt, rowKey: cursor.rowKey } : null,
      limit: query.limit
    }, (candidateRecords, drawingRecords) => {
      const candidates = candidateRecords.map((workspace) => ({ row: candidateRow(workspace, actor), source: workspace }));
      const drawings = drawingRecords.map((drawing) => ({ row: drawingRow(drawing, actor), source: drawing }));
      return [...candidates, ...drawings]
        .filter(({ row, source }) => rowInView(row, source, actor, query.view))
        .map(({ row }) => row)
        .filter((row) => !query.stage || row.stage === query.stage);
    });
    const hasNext = page.rows.length > query.limit;
    const pageRows = page.rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    return {
      rows: pageRows,
      nextCursor: hasNext && last ? encodeCursor({
        version: 1,
        filterHash: currentFilterHash,
        updatedAt: last.updatedAt,
        rowKey: last.rowKey
      }) : null,
      generatedAt: new Date().toISOString(),
      filters: {
        seriesCodeOptions: page.seriesCodeOptions,
        purposeCodeOptions: [...drawingPurposeCodes],
        recordStatusOptions: [...drawingRecordStatuses]
      }
    };
  }

  async detail(rowKey: string, actor: DrawingWorkbenchActor): Promise<DrawingWorkbenchDetailResponse | null> {
    if (rowKey.startsWith("candidate:")) {
      if (!actor.permissions.workspaceView) return null;
      const workspaceId = rowKey.slice("candidate:".length);
      if (!workspaceId) return null;
      const candidate = await this.repository.readCandidateDetail({ workspaceId, companyId: actor.companyId });
      if (!candidate) return null;
      return {
        row: candidateRow(candidate, actor),
        candidate,
        drawing: null,
        sourceWorkspace: null,
        capabilities: {
          canReviewApprovals: actor.permissions.candidateReview,
          canCreateRevision: actor.permissions.createRevision
        }
      };
    }
    if (rowKey.startsWith("drawing:")) {
      const drawingNumberId = rowKey.slice("drawing:".length);
      if (!drawingNumberId) return null;
      const detail = await this.repository.readDrawingDetail({
        drawingNumberId,
        companyId: actor.companyId,
        includeSourceWorkspace: actor.permissions.workspaceView
      });
      if (!detail) return null;
      return {
        row: drawingRow(detail.drawing, actor),
        candidate: null,
        drawing: detail.drawing,
        sourceWorkspace: detail.sourceWorkspace,
        capabilities: {
          canReviewApprovals: actor.permissions.candidateReview,
          canCreateRevision: actor.permissions.createRevision
        }
      };
    }
    return null;
  }
}

export function drawingWorkbenchErrorResponse(error: unknown) {
  if (error instanceof DrawingWorkbenchError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  const code = error instanceof Error ? error.message.split(":", 1)[0] : String(error);
  console.error("Drawing workbench read failed", error);
  return Response.json({ error: "drawing_workbench_read_failed", message: "圖號工作台目前無法載入，請重新整理。" }, { status: 500 });
}
