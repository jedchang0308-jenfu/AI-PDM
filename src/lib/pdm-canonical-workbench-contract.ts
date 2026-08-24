import crypto from "node:crypto";
import type { DrawingPreviewSlotModel } from "@/lib/pdm-entity-detail-contract";
import type { CanonicalPreviewProjection } from "@/lib/pdm-canonical-preview";
import { PDM_WORKBENCH_FILTER_NONE_TOKEN } from "@/lib/pdm-workbench-filter-selection";

export const DEV087_CONTRACT_VERSION = "dev087-canonical-workbench-v2" as const;
export const DEV087_SCHEMA_HASH = "dev087-v1" as const;
/**
 * DEV-090 is the first canonical-workbench runtime after the Relation current
 * projection was retired.  The authority row is intentionally advanced to a
 * new hash so an old build cannot mint command tokens against the new schema.
 */
export const DEV090_SCHEMA_HASH = "dev090-v1" as const;

export type WorkbenchEntityType = "drawing" | "part";
/** Historical review/audit rows may still name Relation; they are not a
 * current workbench domain and must never appear in a current projection. */
export type HistoricalWorkbenchEntityType = WorkbenchEntityType | "relation";
export type CanonicalDataLayer =
  | "drawing_production"
  | "drawing_rd"
  | "part_formal"
  | "part_work";
export type HistoricalCanonicalDataLayer = CanonicalDataLayer | "relation_formal" | "relation_work";
export type CanonicalLayer = "production" | "rd" | "formal" | "work";
export type CanonicalHandling = "none" | "owner" | "review_owner" | "system" | "system_admin" | "blocked";
export type CanonicalDataState = "editing" | "reviewing" | "publishing" | "available";
export type CanonicalActionKey = "advance" | "edit" | "review" | "create_change" | "void_rd" | "edit_relation_matrix";
export type CanonicalWorkbenchAction = { key: CanonicalActionKey; label: string; href?: string };

export type CanonicalWorkbenchRowDto = {
  rowKey: string;
  entityType: WorkbenchEntityType;
  entityId: string;
  code: string;
  name: string;
  layer: CanonicalLayer;
  layerLabel: string;
  revision: string | null;
  dataState: CanonicalDataState;
  dataStateLabel: "編輯中" | "審核中" | "發布中" | "可使用";
  handling: CanonicalHandling;
  handlingLabel: "無須處理" | "負責人處理" | "審核負責人處理" | "系統處理" | "系統管理員處理" | "受阻";
  blockerReason: string | null;
  detailHref: string;
  rowVersion: number;
  actions: CanonicalWorkbenchAction[];
};

export type CanonicalWorkbenchGroupDto = { groupKey: string; rows: CanonicalWorkbenchRowDto[] };
export type CanonicalWorkbenchListDto = {
  data: {
    groups: CanonicalWorkbenchGroupDto[];
    nextCursor: string | null;
    totalGroups: number;
    totalRows: number;
    /** Enabled Drawing/Part preview projection. Keys are exactly the visible cw rows. */
    previewByRowKey?: Record<string, CanonicalPreviewProjection>;
  };
  meta: { contractToken: string; correlationId: string };
};
export type CanonicalDetailSurface = "drawer_minimal" | "editor_full" | "review_readonly";
export type CanonicalDetailField = { key: string; label: string; value: string };
export type CanonicalDetailFile = {
  id: string;
  name: string;
  role: string | null;
  downloadHref: string;
};
export type CanonicalDirectRelation = {
  id: string;
  primary: string;
  secondary: string | null;
};
export type CanonicalDrawingHistory = {
  id: string;
  revision: string;
  layerLabel: "量產版" | "研發版";
};
export type CanonicalRelationMatrixIdentity = {
  id: string;
  number: string;
};
export type CanonicalRelationMatrixCell = {
  drawingNumberId: string;
  partNumberId: string;
  drawingNumber: string;
  partNumber: string;
  relationType: "manufacturing_basis" | "reference";
};
export type CanonicalRelationMatrixProjection = {
  rootId: string;
  rootCode: string;
  matrixEtag: string;
  drawings: CanonicalRelationMatrixIdentity[];
  parts: CanonicalRelationMatrixIdentity[];
  cells: CanonicalRelationMatrixCell[];
  issue?: {
    code: "WORKBENCH_RELATION_SCOPE_INVALID";
    message: string;
  };
};

type CanonicalDetailBase = {
  surface: CanonicalDetailSurface;
  fields: CanonicalDetailField[];
  files: CanonicalDetailFile[];
};

type CanonicalLinkedDetailBase = CanonicalDetailBase & {
  relationMatrix: CanonicalRelationMatrixProjection;
};

export type CanonicalDrawingDetailPresentation = CanonicalLinkedDetailBase & {
  kind: "drawing";
  preview: CanonicalPreviewProjection;
  previews: [DrawingPreviewSlotModel, DrawingPreviewSlotModel];
  history: CanonicalDrawingHistory[];
};
export type CanonicalPartDetailPresentation = CanonicalLinkedDetailBase & {
  kind: "part";
  preview?: CanonicalPreviewProjection;
  previewSourceControl?: {
    settingRowVersion: number;
    canManage: boolean;
    disabledReason: string | null;
  };
};
export type CanonicalWorkbenchDetailPresentation =
  | CanonicalDrawingDetailPresentation
  | CanonicalPartDetailPresentation;

export type CanonicalWorkbenchDetailDto = {
  data: {
    row: CanonicalWorkbenchRowDto;
    presentation: CanonicalWorkbenchDetailPresentation;
  };
  meta: { contractToken: string; correlationId: string };
};

export const CANONICAL_HANDLING_LABELS: Record<CanonicalHandling, CanonicalWorkbenchRowDto["handlingLabel"]> = {
  none: "無須處理",
  owner: "負責人處理",
  review_owner: "審核負責人處理",
  system: "系統處理",
  system_admin: "系統管理員處理",
  blocked: "受阻"
};

export const CANONICAL_DATA_STATE_LABELS: Record<CanonicalDataState, CanonicalWorkbenchRowDto["dataStateLabel"]> = {
  editing: "編輯中",
  reviewing: "審核中",
  publishing: "發布中",
  available: "可使用"
};

export const RETIRED_WORKBENCH_QUERY_KEYS = new Set([
  "view",
  "history",
  "workStatus",
  "recordStatus",
  "dataStatus",
  "humanStatus",
  "responsibilityStatus",
  "viewerStatus",
  "availabilityScope",
  "lane",
  "versionLane"
]);

export const BANNED_CANONICAL_DTO_FIELDS = new Set([
  "humanStatus",
  "responsibilityStatus",
  "viewerStatus",
  "viewerActionability",
  "availabilityScope",
  "laneLabel",
  "lifecycleStatus",
  "recordStatus",
  "branchId",
  "predecessorRevisionId",
  "sourceRevisionId",
  "ownerName",
  "reviewerName"
]);

export type CanonicalWorkbenchQuery = {
  query: string;
  layers: CanonicalLayer[];
  dataStates: CanonicalDataState[];
  handling: CanonicalHandling[];
  sort: "asc" | "desc";
  cursor: string | null;
  limit: number;
};

export type CanonicalWorkbenchErrorCode =
  | "WORKBENCH_FILTER_CONTRACT_RETIRED"
  | "WORKBENCH_COMMAND_CONTRACT_RETIRED"
  | "WORKBENCH_ROW_VERSION_CONFLICT"
  | "WORKBENCH_CONTRACT_EXPIRED"
  | "WORKBENCH_ACTIVE_WORK_EXISTS"
  | "WORKBENCH_REVIEW_REQUEST_STALE"
  | "WORKBENCH_SNAPSHOT_DRIFT"
  | "WORKBENCH_RELATION_SCOPE_INVALID"
  | "DRAWING_WORK_FILE_SNAPSHOT_INVALID"
  | "WORKBENCH_AUTHORITY_MISMATCH"
  | "DRAWING_RD_BRANCH_LIMIT_REACHED"
  | "DRAWING_TARGET_REVISION_CLAIMED"
  | "DRAWING_PRODUCTION_BASE_STALE"
  | "DRAWING_RD_VOID_NOT_ALLOWED"
  | "DRAWING_RD_VOID_ALREADY_PENDING"
  | "DEV087_DECISION_NOT_ALLOWED"
  | "PART_PREVIEW_ACTIVE_ASSET"
  | "IDEMPOTENCY_KEY_REUSED"
  | "WORKBENCH_BAD_REQUEST";

export class CanonicalWorkbenchError extends Error {
  constructor(
    readonly code: CanonicalWorkbenchErrorCode,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 410 | 413 | 422 | 503,
    readonly correlationId: string = crypto.randomUUID()
  ) {
    super(message);
    this.name = "CanonicalWorkbenchError";
  }
}

const domainLayers: Record<WorkbenchEntityType, readonly CanonicalLayer[]> = {
  drawing: ["production", "rd"],
  part: ["formal", "work"]
};
const dataStateValues = new Set<CanonicalDataState>(["editing", "reviewing", "publishing", "available"]);
const handlingValues = new Set<CanonicalHandling>(["none", "owner", "review_owner", "system", "system_admin", "blocked"]);

export function normalizeCanonicalWorkbenchQuery(url: URL, domain: WorkbenchEntityType): CanonicalWorkbenchQuery {
  for (const key of RETIRED_WORKBENCH_QUERY_KEYS) {
    if (url.searchParams.has(key)) {
      throw new CanonicalWorkbenchError("WORKBENCH_FILTER_CONTRACT_RETIRED", "此篩選網址已失效", 410);
    }
  }
  const allowedLayers = new Set(domainLayers[domain]);
  const layerInputs = url.searchParams.getAll("layer").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  const dataStateInputs = url.searchParams.getAll("stage").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  const handlingInputs = url.searchParams.getAll("handling").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  const hasNoLayers = layerInputs.length === 1 && layerInputs[0] === PDM_WORKBENCH_FILTER_NONE_TOKEN;
  const hasNoDataStates = dataStateInputs.length === 1 && dataStateInputs[0] === PDM_WORKBENCH_FILTER_NONE_TOKEN;
  const hasNoHandling = handlingInputs.length === 1 && handlingInputs[0] === PDM_WORKBENCH_FILTER_NONE_TOKEN;
  const hasInvalidLayerNone = layerInputs.includes(PDM_WORKBENCH_FILTER_NONE_TOKEN) && !hasNoLayers;
  const hasInvalidDataStateNone = dataStateInputs.includes(PDM_WORKBENCH_FILTER_NONE_TOKEN) && !hasNoDataStates;
  const hasInvalidHandlingNone = handlingInputs.includes(PDM_WORKBENCH_FILTER_NONE_TOKEN) && !hasNoHandling;
  if (hasInvalidLayerNone || (!hasNoLayers && layerInputs.some((value) => !allowedLayers.has(value as CanonicalLayer)))) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "資料層篩選條件無效", 400);
  }
  if (hasInvalidDataStateNone || (!hasNoDataStates && dataStateInputs.some((value) => !dataStateValues.has(value as CanonicalDataState)))) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "資料狀態篩選條件無效", 400);
  }
  if (hasInvalidHandlingNone || (!hasNoHandling && handlingInputs.some((value) => !handlingValues.has(value as CanonicalHandling)))) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "處理狀態篩選條件無效", 400);
  }
  const sort = url.searchParams.get("sort") === "desc" ? "desc" : "asc";
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "每頁筆數必須介於 1 到 100", 400);
  }
  return {
    query: url.searchParams.get("query")?.trim() ?? "",
    layers: hasNoLayers ? [] : layerInputs.length ? [...new Set(layerInputs as CanonicalLayer[])] : [...domainLayers[domain]],
    dataStates: hasNoDataStates ? [] : dataStateInputs.length ? [...new Set(dataStateInputs as CanonicalDataState[])] : [...dataStateValues],
    handling: hasNoHandling ? [] : handlingInputs.length ? [...new Set(handlingInputs as CanonicalHandling[])] : [...handlingValues],
    sort,
    cursor: url.searchParams.get("cursor")?.trim() || null,
    limit: parsedLimit
  };
}

export function canonicalDataLayerToLayer(dataLayer: HistoricalCanonicalDataLayer): CanonicalLayer {
  if (dataLayer === "drawing_production") return "production";
  if (dataLayer === "drawing_rd") return "rd";
  if (dataLayer.endsWith("_formal")) return "formal";
  return "work";
}

export function canonicalLayerLabel(input: { dataLayer: HistoricalCanonicalDataLayer; revision: string | null }): string {
  if (input.dataLayer === "drawing_production") return `量產版 ${input.revision ?? ""}`.trim();
  if (input.dataLayer === "drawing_rd") return `研發版 ${input.revision ?? ""}`.trim();
  if (input.dataLayer === "part_formal") return "正式資料";
  if (input.dataLayer === "part_work") return "修改中";
  return "";
}

export function canonicalRowKey(id: string) {
  return `cw_${id}`;
}
export function canonicalGroupKey(id: string) {
  return `cg_${id}`;
}
export function parseCanonicalRowKey(value: string) {
  if (!/^cw_[0-9a-f-]{36}$/iu.test(value)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "工作列識別已失效", 404);
  return value.slice(3);
}

function secret() {
  const configured = process.env.PDM_WORKBENCH_CONTRACT_SECRET?.trim() || process.env.PDM_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("PDM_WORKBENCH_CONTRACT_SECRET_REQUIRED");
  return "local-only-dev087-contract-secret";
}

export type CanonicalContractTokenPayload = {
  version: typeof DEV087_CONTRACT_VERSION;
  companyId: string;
  actorId: string;
  schemaHash: string;
  expectedCommit: string;
  mode: "canonical_only";
  issuedAt: number;
};

export function createCanonicalContractToken(input: Omit<CanonicalContractTokenPayload, "version" | "issuedAt" | "mode">) {
  const payload: CanonicalContractTokenPayload = { version: DEV087_CONTRACT_VERSION, ...input, mode: "canonical_only", issuedAt: Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyCanonicalContractToken(value: string | null | undefined, expected: {
  companyId: string;
  actorId: string;
  schemaHash: string;
  expectedCommit: string;
  maxAgeMs?: number;
}) {
  const [encoded, supplied, extra] = value?.split(".") ?? [];
  if (!encoded || !supplied || extra) throw new CanonicalWorkbenchError("WORKBENCH_CONTRACT_EXPIRED", "重新整理以使用新版本", 409);
  const signature = crypto.createHmac("sha256", secret()).update(encoded).digest("base64url");
  if (signature.length !== supplied.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(supplied))) {
    throw new CanonicalWorkbenchError("WORKBENCH_CONTRACT_EXPIRED", "重新整理以使用新版本", 409);
  }
  let payload: CanonicalContractTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CanonicalContractTokenPayload;
  } catch {
    throw new CanonicalWorkbenchError("WORKBENCH_CONTRACT_EXPIRED", "重新整理以使用新版本", 409);
  }
  const maxAgeMs = expected.maxAgeMs ?? 15 * 60_000;
  if (
    payload.version !== DEV087_CONTRACT_VERSION || payload.mode !== "canonical_only" ||
    payload.companyId !== expected.companyId || payload.actorId !== expected.actorId ||
    payload.schemaHash !== expected.schemaHash || payload.expectedCommit !== expected.expectedCommit ||
    !Number.isFinite(payload.issuedAt) || payload.issuedAt > Date.now() + 60_000 || Date.now() - payload.issuedAt > maxAgeMs
  ) {
    throw new CanonicalWorkbenchError("WORKBENCH_CONTRACT_EXPIRED", "重新整理以使用新版本", 409);
  }
  return payload;
}

export function canonicalErrorEnvelope(error: unknown) {
  const resolved = error instanceof CanonicalWorkbenchError
    ? error
    : new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "操作失敗，請稍後再試", 400);
  return {
    status: resolved.status,
    body: { error: { code: resolved.code, message: resolved.message, correlationId: resolved.correlationId } }
  };
}

export function assertCanonicalDtoHasNoRetiredFields(value: unknown, path = "data"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertCanonicalDtoHasNoRetiredFields(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (BANNED_CANONICAL_DTO_FIELDS.has(key)) throw new Error(`DEV087_RETIRED_DTO_FIELD:${path}.${key}`);
    assertCanonicalDtoHasNoRetiredFields(entry, `${path}.${key}`);
  }
}
