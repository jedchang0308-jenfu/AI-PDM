/** Immutable, JSON-only contract persisted in pdm_work_review_requests. */
import { DRAWING_RECOGNITION_REVIEW_PROJECTION_SCHEMA, type DrawingRecognitionReviewProjection } from "@/lib/drawing-recognition-review-projection";

export const PDM_REVIEW_PACKAGE_SCHEMA = "pdm-review-package-v2" as const;
export const PDM_REVIEW_PACKAGE_MAX_TARGETS = 200;
export const PDM_REVIEW_PACKAGE_MAX_CELLS = 2_500;
export const PDM_REVIEW_PACKAGE_MAX_BYTES = 8_000_000;

export type ReviewPackageEntityType = "drawing" | "part";
export type ReviewPackageRequestKind = "drawing_revision" | "drawing_rd_void" | "part_change";
export type ReviewPackageTargetKey = `${ReviewPackageEntityType}:${string}`;
export type ReviewPackageScope = "submitted" | "context_only";
export type ReviewPackageJson = null | boolean | number | string | ReviewPackageJson[] | { [key: string]: ReviewPackageJson };
export type ReviewPackageJsonObject = { [key: string]: ReviewPackageJson };

export type ReviewPackageFile = {
  id: string;
  bindingId: string;
  sourceFileAssetId: string | null;
  fileName: string | null;
  displayName: string | null;
  role: string | null;
  mimeType: string | null;
  fileSize: number | null;
  contentHash: string | null;
  isPrimary: boolean;
  currentRevisionUpload: boolean;
  ordinal: number;
};

export type ReviewPackageMarkerFacts = {
  submitted: boolean;
  change: null | { kind: "field" | "file" | "lifecycle"; paths: string[] };
  risk: null | { level: "attention" | "high"; codes: string[] };
};

export type ReviewPackageWorkspaceSnapshot = {
  kind: ReviewPackageEntityType;
  entityId: string;
  revisionId: string | null;
  identity: {
    code: string;
    name: string | null;
    revision: string | null;
    purposeCode: string | null;
    purposeDescription: string | null;
  };
  payload: ReviewPackageJsonObject;
  baselinePayload: ReviewPackageJsonObject | null;
  changeImpactRequired?: boolean;
  relatedParts?: Array<{ id: string; code: string; name: string | null }>;
  affectedParts?: Array<{ id: string; code: string; name: string | null }>;
  files: ReviewPackageFile[];
  attachments: ReviewPackageFile[];
  recognition: ReviewPackageJsonObject | null;
};

export type ReviewPackageTarget = {
  targetKey: ReviewPackageTargetKey;
  axisId: string;
  scope: ReviewPackageScope;
  markers: ReviewPackageMarkerFacts;
  evidenceHash: string;
  workspace: ReviewPackageWorkspaceSnapshot;
};

export type ReviewPackageMatrix = {
  rootId: string;
  rootCode: string;
  evidenceHash: string;
  drawings: Array<{ axisId: string; targetKey: `drawing:${string}`; code: string; revision: string | null }>;
  parts: Array<{ axisId: string; targetKey: `part:${string}`; code: string; revision: null }>;
  cells: Array<{
    drawingNumberId: string;
    partNumberId: string;
    drawingNumber: string;
    partNumber: string;
    relationType: "manufacturing_basis" | "reference" | null;
  }>;
};

export type ReviewPackageDecisionBasis = {
  version: 1;
  kind: "drawing_revision_work" | "drawing_rd_void" | "part_change_work";
  hash: string;
  payload: ReviewPackageJsonObject;
  revisionId: string | null;
  claimId: string | null;
};

export type ReviewPackageEnvelope = {
  schemaVersion: typeof PDM_REVIEW_PACKAGE_SCHEMA;
  submittedAt: string;
  requestKind: ReviewPackageRequestKind;
  primaryTargetKey: ReviewPackageTargetKey;
  decisionBasis: ReviewPackageDecisionBasis;
  root: { id: string; code: string };
  matrix: ReviewPackageMatrix;
  targets: ReviewPackageTarget[];
  /** Hash of every other envelope field. snapshot_hash must equal this value. */
  packageHash: string;
};

export type ReviewPackageParseResult =
  | { kind: "v2"; value: ReviewPackageEnvelope }
  | { kind: "legacy"; value: unknown }
  | { kind: "invalid"; code: "WORKBENCH_REVIEW_PACKAGE_INVALID"; reason: string };

const SHA256 = /^[a-f0-9]{64}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function nullableString(value: unknown) { return value === null || typeof value === "string"; }
function jsonValue(value: unknown): value is ReviewPackageJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  return object(value) && Object.values(value).every(jsonValue);
}
function jsonObject(value: unknown): value is ReviewPackageJsonObject { return object(value) && Object.values(value).every(jsonValue); }

export function isReviewPackageRecognitionProjection(value: unknown): value is DrawingRecognitionReviewProjection {
  return object(value)
    && exactKeys(value, ["candidateDecisions", "fields", "projectionHash", "schemaVersion", "session", "sources"])
    && value.schemaVersion === DRAWING_RECOGNITION_REVIEW_PROJECTION_SCHEMA
    && typeof value.projectionHash === "string" && SHA256.test(value.projectionHash)
    && object(value.session) && jsonObject(value.session)
    && Array.isArray(value.sources) && value.sources.every(jsonValue)
    && Array.isArray(value.candidateDecisions) && value.candidateDecisions.every(jsonValue)
    && Array.isArray(value.fields) && value.fields.every(jsonValue);
}

function validRecognition(value: unknown) {
  if (value === null) return true;
  if (!jsonObject(value)) return false;
  return !("schemaVersion" in value) || isReviewPackageRecognitionProjection(value);
}

function validFile(value: unknown): value is ReviewPackageFile {
  if (!object(value) || !exactKeys(value, ["bindingId", "contentHash", "currentRevisionUpload", "displayName", "fileName", "fileSize", "id", "isPrimary", "mimeType", "ordinal", "role", "sourceFileAssetId"])) return false;
  return typeof value.id === "string" && Boolean(value.id)
    && typeof value.bindingId === "string" && Boolean(value.bindingId)
    && nullableString(value.sourceFileAssetId) && nullableString(value.fileName) && nullableString(value.displayName)
    && nullableString(value.role) && nullableString(value.mimeType) && nullableString(value.contentHash)
    && (value.fileSize === null || typeof value.fileSize === "number" && Number.isFinite(value.fileSize) && value.fileSize >= 0)
    && typeof value.isPrimary === "boolean" && typeof value.currentRevisionUpload === "boolean"
    && Number.isInteger(value.ordinal) && Number(value.ordinal) >= 0;
}

function validMarkers(value: unknown): value is ReviewPackageMarkerFacts {
  if (!object(value) || !exactKeys(value, ["change", "risk", "submitted"]) || typeof value.submitted !== "boolean") return false;
  const change = value.change;
  const risk = value.risk;
  const validChange = change === null || object(change) && exactKeys(change, ["kind", "paths"])
    && new Set(["field", "file", "lifecycle"]).has(String(change.kind))
    && Array.isArray(change.paths) && change.paths.every((item) => typeof item === "string");
  const validRisk = risk === null || object(risk) && exactKeys(risk, ["codes", "level"])
    && new Set(["attention", "high"]).has(String(risk.level))
    && Array.isArray(risk.codes) && risk.codes.every((item) => typeof item === "string");
  return validChange && validRisk;
}

function validWorkspace(value: unknown, expectedType: ReviewPackageEntityType): value is ReviewPackageWorkspaceSnapshot {
  if (!object(value)) return false;
  const legacyKeys = ["attachments", "baselinePayload", "entityId", "files", "identity", "kind", "payload", "recognition", "revisionId"];
  const impactKeys = [...legacyKeys, "affectedParts", "changeImpactRequired", "relatedParts"];
  const hasImpactProjection = exactKeys(value, impactKeys);
  if (!hasImpactProjection && !exactKeys(value, legacyKeys)) return false;
  if (value.kind !== expectedType || typeof value.entityId !== "string" || !nullableString(value.revisionId)) return false;
  if (!object(value.identity) || !exactKeys(value.identity, ["code", "name", "purposeCode", "purposeDescription", "revision"])) return false;
  if (typeof value.identity.code !== "string" || !nullableString(value.identity.name) || !nullableString(value.identity.revision) || !nullableString(value.identity.purposeCode) || !nullableString(value.identity.purposeDescription)) return false;
  const validPartProjection = (entry: unknown) => object(entry) && exactKeys(entry, ["code", "id", "name"])
    && typeof entry.id === "string" && typeof entry.code === "string" && nullableString(entry.name);
  return (!hasImpactProjection || typeof value.changeImpactRequired === "boolean"
      && Array.isArray(value.relatedParts) && value.relatedParts.every(validPartProjection)
      && Array.isArray(value.affectedParts) && value.affectedParts.every(validPartProjection))
    && jsonObject(value.payload)
    && (value.baselinePayload === null || jsonObject(value.baselinePayload))
    && Array.isArray(value.files) && value.files.every(validFile)
    && Array.isArray(value.attachments) && value.attachments.every(validFile)
    && validRecognition(value.recognition);
}

function validTarget(value: unknown): value is ReviewPackageTarget {
  if (!object(value) || !exactKeys(value, ["axisId", "evidenceHash", "markers", "scope", "targetKey", "workspace"])) return false;
  const match = typeof value.targetKey === "string" ? /^(drawing|part):(.+)$/u.exec(value.targetKey) : null;
  if (!match || typeof value.axisId !== "string" || !value.axisId || !new Set(["submitted", "context_only"]).has(String(value.scope)) || typeof value.evidenceHash !== "string" || !SHA256.test(value.evidenceHash)) return false;
  return validMarkers(value.markers) && validWorkspace(value.workspace, match[1] as ReviewPackageEntityType) && value.workspace.entityId === match[2];
}

function validMatrix(value: unknown): value is ReviewPackageMatrix {
  if (!object(value) || !exactKeys(value, ["cells", "drawings", "evidenceHash", "parts", "rootCode", "rootId"])) return false;
  if (typeof value.rootId !== "string" || typeof value.rootCode !== "string" || typeof value.evidenceHash !== "string" || !SHA256.test(value.evidenceHash)) return false;
  if (!Array.isArray(value.drawings) || !value.drawings.every((entry) => object(entry) && exactKeys(entry, ["axisId", "code", "revision", "targetKey"]) && typeof entry.axisId === "string" && typeof entry.code === "string" && nullableString(entry.revision) && typeof entry.targetKey === "string" && entry.targetKey.startsWith("drawing:"))) return false;
  if (!Array.isArray(value.parts) || !value.parts.every((entry) => object(entry) && exactKeys(entry, ["axisId", "code", "revision", "targetKey"]) && typeof entry.axisId === "string" && typeof entry.code === "string" && entry.revision === null && typeof entry.targetKey === "string" && entry.targetKey.startsWith("part:"))) return false;
  return Array.isArray(value.cells) && value.cells.every((entry) => object(entry)
    && exactKeys(entry, ["drawingNumber", "drawingNumberId", "partNumber", "partNumberId", "relationType"])
    && typeof entry.drawingNumberId === "string" && typeof entry.partNumberId === "string"
    && typeof entry.drawingNumber === "string" && typeof entry.partNumber === "string"
    && (entry.relationType === null || entry.relationType === "manufacturing_basis" || entry.relationType === "reference"));
}

function validDecisionBasis(value: unknown): value is ReviewPackageDecisionBasis {
  return object(value) && exactKeys(value, ["claimId", "hash", "kind", "payload", "revisionId", "version"])
    && value.version === 1
    && new Set(["drawing_revision_work", "drawing_rd_void", "part_change_work"]).has(String(value.kind))
    && typeof value.hash === "string" && SHA256.test(value.hash) && jsonObject(value.payload)
    && nullableString(value.revisionId) && nullableString(value.claimId);
}

export function parseReviewPackageSnapshot(value: unknown): ReviewPackageParseResult {
  if (!object(value) || !("schemaVersion" in value)) return { kind: "legacy", value };
  if (value.schemaVersion !== PDM_REVIEW_PACKAGE_SCHEMA) return { kind: "invalid", code: "WORKBENCH_REVIEW_PACKAGE_INVALID", reason: "unknown-schema" };
  if (!exactKeys(value, ["decisionBasis", "matrix", "packageHash", "primaryTargetKey", "requestKind", "root", "schemaVersion", "submittedAt", "targets"])) return { kind: "invalid", code: "WORKBENCH_REVIEW_PACKAGE_INVALID", reason: "envelope-shape" };
  if (!new Set(["drawing_revision", "drawing_rd_void", "part_change"]).has(String(value.requestKind))
    || typeof value.submittedAt !== "string" || !ISO_DATE.test(value.submittedAt)
    || typeof value.primaryTargetKey !== "string" || !/^(drawing|part):.+/u.test(value.primaryTargetKey)
    || typeof value.packageHash !== "string" || !SHA256.test(value.packageHash)
    || !object(value.root) || !exactKeys(value.root, ["code", "id"]) || typeof value.root.id !== "string" || typeof value.root.code !== "string") {
    return { kind: "invalid", code: "WORKBENCH_REVIEW_PACKAGE_INVALID", reason: "field-shape" };
  }
  if (!validDecisionBasis(value.decisionBasis)) return { kind: "invalid", code: "WORKBENCH_REVIEW_PACKAGE_INVALID", reason: "decision-basis-shape" };
  if (!validMatrix(value.matrix)) return { kind: "invalid", code: "WORKBENCH_REVIEW_PACKAGE_INVALID", reason: "matrix-shape" };
  if (!Array.isArray(value.targets) || !value.targets.every(validTarget)) return { kind: "invalid", code: "WORKBENCH_REVIEW_PACKAGE_INVALID", reason: "target-shape" };
  if (value.targets.length > PDM_REVIEW_PACKAGE_MAX_TARGETS || value.matrix.cells.length > PDM_REVIEW_PACKAGE_MAX_CELLS
    || new TextEncoder().encode(JSON.stringify(value)).byteLength > PDM_REVIEW_PACKAGE_MAX_BYTES) return { kind: "invalid", code: "WORKBENCH_REVIEW_PACKAGE_INVALID", reason: "limit" };
  const targetKeys = value.targets.map((target) => target.targetKey);
  const axisTargetKeys = [...value.matrix.drawings, ...value.matrix.parts].map((axis) => axis.targetKey);
  const drawingAxisIds = value.matrix.drawings.map((axis) => axis.axisId);
  const partAxisIds = value.matrix.parts.map((axis) => axis.axisId);
  const cellPairs = value.matrix.cells.map((cell) => `${cell.drawingNumberId}:${cell.partNumberId}`);
  if (new Set(targetKeys).size !== targetKeys.length || new Set(axisTargetKeys).size !== axisTargetKeys.length
    || new Set(drawingAxisIds).size !== drawingAxisIds.length || new Set(partAxisIds).size !== partAxisIds.length
    || new Set(cellPairs).size !== cellPairs.length || targetKeys.length !== axisTargetKeys.length
    || targetKeys.some((key) => !axisTargetKeys.includes(key)) || !targetKeys.includes(value.primaryTargetKey as ReviewPackageTargetKey)) {
    return { kind: "invalid", code: "WORKBENCH_REVIEW_PACKAGE_INVALID", reason: "membership" };
  }
  const axisByTarget = new Map([...value.matrix.drawings, ...value.matrix.parts].map((axis) => [axis.targetKey, axis]));
  const drawingAxes = new Map(value.matrix.drawings.map((axis) => [axis.axisId, axis]));
  const partAxes = new Map(value.matrix.parts.map((axis) => [axis.axisId, axis]));
  if (value.targets.some((target) => axisByTarget.get(target.targetKey)?.axisId !== target.axisId)
    || value.matrix.cells.some((cell) => {
      const drawing = drawingAxes.get(cell.drawingNumberId);
      const part = partAxes.get(cell.partNumberId);
      return !drawing || !part || drawing.code !== cell.drawingNumber || part.code !== cell.partNumber;
    })) {
    return { kind: "invalid", code: "WORKBENCH_REVIEW_PACKAGE_INVALID", reason: "axis-membership" };
  }
  const primary = value.targets.find((target) => target.targetKey === value.primaryTargetKey);
  if (!primary || primary.scope !== "submitted" || !primary.markers.submitted || value.targets.some((target) => (target.scope === "submitted") !== target.markers.submitted)) {
    return { kind: "invalid", code: "WORKBENCH_REVIEW_PACKAGE_INVALID", reason: "scope" };
  }
  return { kind: "v2", value: value as ReviewPackageEnvelope };
}

export function isReviewPackageEnvelope(value: unknown): value is ReviewPackageEnvelope {
  return parseReviewPackageSnapshot(value).kind === "v2";
}

export function reviewPackageTargetKey(entityType: ReviewPackageEntityType, targetId: string): ReviewPackageTargetKey {
  return `${entityType}:${targetId}`;
}

export function splitReviewPackageTargetKey(value: ReviewPackageTargetKey) {
  const separator = value.indexOf(":");
  return { entityType: value.slice(0, separator) as ReviewPackageEntityType, targetId: value.slice(separator + 1) };
}
