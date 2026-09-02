import crypto from "node:crypto";
import type { DrawingPreviewSlotModel } from "@/lib/pdm-entity-detail-contract";
import type { CanonicalPreviewProjection } from "@/lib/pdm-canonical-preview";
import type { StoredPartStructureType } from "@/lib/numbering-structure-type";
import type { BomPurpose } from "@/lib/types";
import { PDM_WORKBENCH_FILTER_NONE_TOKEN } from "@/lib/pdm-workbench-filter-selection";
import type { DrawingRevisionBasisState } from "@/lib/drawing-revision-lifecycle-policy";
import { ACTIVE_DRAWING_PURPOSE_CODES } from "@/lib/numbering-identity";

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
export type CanonicalActionKey = "advance" | "restart_from_current_production" | "edit" | "cancel_work" | "review" | "create_change" | "void_rd" | "request_obsolete" | "edit_relation_matrix";
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
  basisState: DrawingRevisionBasisState | null;
  actions: CanonicalWorkbenchAction[];
};

export type DrawingRevisionInteraction = {
  mode: "owner_edit" | "owner_stale_cleanup" | "review_decide" | "review_stale_cleanup";
  basisState: DrawingRevisionBasisState;
  canMutateContent: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  canApprove: boolean;
  canReturn: boolean;
  reasonCode: "DRAWING_PRODUCTION_BASE_STALE" | "DRAWING_FORMALIZATION_PENDING" | null;
};

export type CanonicalWorkbenchGroupDto = { groupKey: string; rows: CanonicalWorkbenchRowDto[] };
export type CanonicalWorkbenchListDto = {
  data: {
    groups: CanonicalWorkbenchGroupDto[];
    nextCursor: string | null;
    previousCursor: string | null;
    totalGroups: number;
    totalRows: number;
    /** Enabled Drawing/Part preview projection. Keys are exactly the visible cw rows. */
    previewByRowKey?: Record<string, CanonicalPreviewProjection>;
  };
  meta: { contractToken: string; correlationId: string };
};
export type CanonicalDetailSurface = "drawer_minimal" | "editor_full" | "review_readonly";
export type CanonicalDetailField = { key: string; label: string; value: string };
export type CanonicalDetailDisclosure = { label: string; value: string };
/**
 * Read-only formalized recognition data.  The primary row intentionally only
 * carries field/value; provenance and scope stay behind the UI disclosure.
 */
export type CanonicalDetailReadModelRow = {
  key: string;
  label: string;
  value: string;
  details: CanonicalDetailDisclosure[];
};
export type CanonicalDetailRecognitionProjection = {
  partAttributes: CanonicalDetailReadModelRow[];
  revisionMetadata: CanonicalDetailReadModelRow[];
  controlledNotes: CanonicalDetailReadModelRow[];
  engineeringEvidence: CanonicalDetailReadModelRow[];
};
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
  drawingId: string;
  revision: string;
  layerLabel: "量產版" | "研發版";
};
export type CanonicalRelationMatrixIdentity = {
  id: string;
  number: string;
  detailHref: string | null;
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
  recognition: CanonicalDetailRecognitionProjection;
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
  bomContext: CanonicalPartBomContext;
  preview?: CanonicalPreviewProjection;
  previewSourceControl?: {
    settingRowVersion: number;
    canManage: boolean;
    hasPrimaryManufacturingDrawing: boolean;
    disabledReason: string | null;
  };
};

export type CanonicalPartBomContext = {
  structureType: StoredPartStructureType;
  definitionPurpose: BomPurpose | null;
  allowedCreatePurposes: BomPurpose[];
  eligibility: "ineligible" | "eligible" | "blocked";
  action: "create_bom" | "open_bom" | "none";
  definitionId: string | null;
  draftId: string | null;
  releaseSnapshotId: string | null;
  bomRevision: string | null;
  status: "Draft" | "PendingReview" | "Rejected" | "Released" | "Archived" | "Obsolete" | null;
  applicableParentCount: number;
  blocker: { code: string; message: string } | null;
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

export type CanonicalWorkbenchSortField = "code" | "name";

export type CanonicalWorkbenchQuery = {
  query: string;
  layers: CanonicalLayer[];
  dataStates: CanonicalDataState[];
  handling: CanonicalHandling[];
  purposes: string[];
  series: string[];
  itemKinds: string[];
  materials: string[];
  colors: string[];
  sortBy: CanonicalWorkbenchSortField;
  sort: "asc" | "desc";
  cursor: string | null;
  cursorDirection: "after" | "before";
  limit: number;
};

export type CanonicalWorkbenchErrorCode =
  | "WORKBENCH_FILTER_CONTRACT_RETIRED"
  | "WORKBENCH_COMMAND_CONTRACT_RETIRED"
  | "WORKBENCH_ROW_VERSION_CONFLICT"
  | "WORKBENCH_CONTRACT_EXPIRED"
  | "WORKBENCH_ACTIVE_WORK_EXISTS"
  | "WORKBENCH_REVIEW_REQUEST_STALE"
  | "WORKBENCH_REVIEW_PACKAGE_INVALID"
  | "WORKBENCH_REVIEW_PACKAGE_INTEGRITY_FAILED"
  | "WORKBENCH_RECOGNITION_BASIS_INCOMPLETE"
  | "WORKBENCH_RECOGNITION_NOT_WRITTEN"
  | "WORKBENCH_RECOGNITION_OWNER_UNRESOLVED"
  | "RECOGNITION_HANDOFF_SOURCE_CONFLICT"
  | "RECOGNITION_HANDOFF_PART_INVALID"
  | "RECOGNITION_SESSION_NOT_FOUND"
  | "RECOGNITION_HANDOFF_SCOPE_LIMIT"
  | "RECOGNITION_SESSION_STALE"
  | "RECOGNITION_HANDOFF_NOT_READY"
  | "RECOGNITION_SOURCE_SET_STALE"
  | "RECOGNITION_RELATION_SCOPE_STALE"
  | "RECOGNITION_HANDOFF_OWNER_UNRESOLVED"
  | "RECOGNITION_HANDOFF_WORK_CONFLICT"
  | "RECOGNITION_HANDOFF_PERMISSION_DENIED"
  | "RECOGNITION_SUBMISSION_WRITE_PENDING"
  | "RECOGNITION_SUBMISSION_WRITE_BLOCKED"
  | "REVIEW_PACKAGE_LIMIT_EXCEEDED"
  | "WORKBENCH_SNAPSHOT_DRIFT"
  | "WORKBENCH_RELATION_SCOPE_INVALID"
  | "DRAWING_WORK_FILE_SNAPSHOT_INVALID"
  | "DRAWING_REVISION_FILE_REQUIRED"
  | "DRAWING_REVISION_FILE_ROLE_INVALID"
  | "DRAWING_REVISION_FILE_NOT_FOUND"
  | "DRAWING_REVISION_FILE_PRIMARY_LOCKED"
  | "DRAWING_REVISION_FILE_REFERENCE_LOCKED"
  | "DRAWING_REVISION_FILE_TOO_LARGE"
  | "DRAWING_2D_REQUIRED"
  | "DRAWING_3D_REQUIRED"
  | "DRAWING_2D_PRIMARY_REQUIRED"
  | "DRAWING_3D_PRIMARY_REQUIRED"
  | "DRAWING_ROLE_EXTENSION_MISMATCH"
  | "WORKBENCH_AUTHORITY_MISMATCH"
  | "DRAWING_RD_BRANCH_LIMIT_REACHED"
  | "DRAWING_TARGET_REVISION_CLAIMED"
  | "DRAWING_PRODUCTION_BASE_STALE"
  | "DRAWING_FORMALIZATION_PENDING"
  | "DRAWING_REVISION_BASIS_INVALID"
  | "DRAWING_MANUAL_MINOR_INVALID"
  | "DRAWING_MANUAL_MINOR_NOT_FORWARD"
  | "DRAWING_MANUAL_MINOR_CROSS_MAJOR"
  | "DRAWING_FFF_NOT_APPLICABLE"
  | "DRAWING_FFF_INCOMPLETE"
  | "DRAWING_CHANGE_IMPACT_SNAPSHOT_STALE"
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
  const repeated = (key: string) => [...new Set(url.searchParams.getAll(key).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean))].slice(0, 50);
  const purposeInputs = repeated("purpose");
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
  const hasNoPurposes = purposeInputs.length === 1 && purposeInputs[0] === PDM_WORKBENCH_FILTER_NONE_TOKEN;
  const allowedPurposes = new Set<string>(ACTIVE_DRAWING_PURPOSE_CODES);
  if ((domain !== "drawing" && purposeInputs.length > 0)
    || (purposeInputs.includes(PDM_WORKBENCH_FILTER_NONE_TOKEN) && !hasNoPurposes)
    || (!hasNoPurposes && purposeInputs.some((value) => !allowedPurposes.has(value)))) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面用途篩選條件無效", 400);
  }
  const sortByInput = url.searchParams.get("sortBy")?.trim() || "code";
  if (sortByInput !== "code" && sortByInput !== "name") throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "排序欄位無效", 400);
  const sortBy: CanonicalWorkbenchSortField = sortByInput;
  const sort = url.searchParams.get("sort") === "desc" ? "desc" : "asc";
  const cursorDirectionInput = url.searchParams.get("direction")?.trim() || "after";
  if (cursorDirectionInput !== "after" && cursorDirectionInput !== "before") throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "換頁方向無效", 400);
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "每頁筆數必須介於 1 到 100", 400);
  }
  return {
    query: url.searchParams.get("query")?.trim() ?? "",
    layers: hasNoLayers ? [] : layerInputs.length ? [...new Set(layerInputs as CanonicalLayer[])] : [...domainLayers[domain]],
    dataStates: hasNoDataStates ? [] : dataStateInputs.length ? [...new Set(dataStateInputs as CanonicalDataState[])] : [...dataStateValues],
    handling: hasNoHandling ? [] : handlingInputs.length ? [...new Set(handlingInputs as CanonicalHandling[])] : [...handlingValues],
    purposes: domain === "drawing" ? purposeInputs : [],
    series: repeated("series"),
    itemKinds: domain === "part" ? repeated("itemKind") : [],
    materials: domain === "part" ? repeated("material") : [],
    colors: domain === "part" ? repeated("color") : [],
    sortBy,
    sort,
    cursor: url.searchParams.get("cursor")?.trim() || null,
    cursorDirection: cursorDirectionInput,
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
