import crypto from "node:crypto";
import { canonicalJsonStringify } from "./canonical-json.ts";

export const DRAWING_RECOGNITION_CATEGORIES = [
  "identity_relation",
  "part_attribute",
  "drawing_revision",
  "controlled_note",
  "engineering_evidence",
  "unclassified"
] as const;
export type DrawingRecognitionCategory = (typeof DRAWING_RECOGNITION_CATEGORIES)[number];

export const DRAWING_RECOGNITION_SESSION_STATUSES = [
  "queued",
  "extracting",
  "review_ready",
  "extraction_partial",
  "extraction_failed",
  "ready_to_formalize",
  "formalized",
  "cancelled"
] as const;
export type DrawingRecognitionSessionStatus = (typeof DRAWING_RECOGNITION_SESSION_STATUSES)[number];

export type DrawingRecognitionConfidence = "high" | "medium" | "low" | "unknown";
export type DrawingRecognitionVariantStatus = "same" | "changed" | "added" | "explicit_not_applicable" | "unrecognized";
export type DrawingRecognitionReviewState = "proposed" | "accepted" | "corrected" | "mapped" | "ignored" | "deferred" | "conflict" | "blocked";
export type DrawingRecognitionDecisionAction = "accept" | "correct" | "map" | "create_field" | "reassign" | "set_baseline" | "not_applicable" | "ignore" | "defer" | "restore";
export type DrawingRecognitionSourceContextType = "candidate_revision" | "revision_package" | "drawing_revision" | "drawing_number";

export function isDrawingRecognitionDraftPopulationContext(sourceContextType: DrawingRecognitionSourceContextType) {
  return sourceContextType === "candidate_revision" || sourceContextType === "drawing_revision";
}

export function initialDrawingRecognitionReviewState(input: {
  sourceContextType: DrawingRecognitionSourceContextType;
  explicitlyMissingValue: boolean;
  proposedOwnerResolution?: "resolved" | "ambiguous" | "missing";
  hasUsableFormalValue: boolean;
  formalValueDiffers: boolean;
}): Extract<DrawingRecognitionReviewState, "proposed" | "conflict" | "blocked"> {
  if (input.explicitlyMissingValue || input.proposedOwnerResolution === "ambiguous" || input.proposedOwnerResolution === "missing") {
    return "blocked";
  }
  if (isDrawingRecognitionDraftPopulationContext(input.sourceContextType)) return "proposed";
  return input.hasUsableFormalValue && input.formalValueDiffers ? "conflict" : "proposed";
}

export type DrawingRecognitionObservationInput = {
  rawText: string;
  rawValue?: string | null;
  normalizedValue?: string | null;
  locationKind?: string;
  pageNumber?: number | null;
  sheetName?: string | null;
  configurationName?: string | null;
  geometry?: Record<string, unknown> | null;
  confidenceBand?: DrawingRecognitionConfidence;
  rawPayloadHash?: string | null;
  category?: DrawingRecognitionCategory;
  fieldKey?: string | null;
  fieldLabel?: string | null;
  proposedOwnerType?: string | null;
  proposedOwnerId?: string | null;
  proposedOwnerResolution?: "resolved" | "ambiguous" | "missing";
  applicabilityScope?: string;
};

export type DrawingRecognitionAdapterCompletion = {
  sourceId: string;
  adapterCode: string;
  adapterVersion: string;
  status: "succeeded" | "partial" | "unsupported" | "failed" | "timeout";
  diagnostics?: string[];
  observations?: DrawingRecognitionObservationInput[];
};

export type DrawingRecognitionClientAdapterCompletion = DrawingRecognitionAdapterCompletion & {
  expectedRowVersion: number;
  contentHash: string;
};

export type DrawingRecognitionPendingClientAdapter = {
  sourceId: string;
  fileName: string;
  contentHash: string;
  adapterCode: "browser-pdf-ocr.v1";
};

export type DrawingRecognitionDecisionInput = {
  candidateId: string;
  action: DrawingRecognitionDecisionAction;
  fieldKey?: string | null;
  fieldLabel?: string | null;
  value?: string | null;
  category?: DrawingRecognitionCategory;
  ownerType?: string | null;
  ownerId?: string | null;
  applicabilityScope?: string | null;
  reason?: string | null;
};

export type DrawingRecognitionImpactChange = {
  candidateId: string;
  category: DrawingRecognitionCategory;
  targetType: string;
  targetId: string;
  fieldKey: string;
  fieldLabel: string;
  beforeValue: string | null;
  afterValue: string | null;
  changeKind: "create" | "update" | "not_applicable" | "evidence";
  targetFingerprint: string;
};

export class DrawingRecognitionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false
  ) {
    super(message);
    this.name = "DrawingRecognitionError";
  }
}

export function drawingRecognitionErrorStatus(error: unknown) {
  return error instanceof DrawingRecognitionError ? error.status : 500;
}

export function sha256Canonical(value: unknown) {
  return crypto.createHash("sha256").update(canonicalJsonStringify(value)).digest("hex");
}

export function normalizeRecognitionKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 120);
}

export function normalizeRecognitionValue(value: unknown) {
  return String(value ?? "").trim().normalize("NFKC").replace(/\s+/gu, " ").slice(0, 4_000);
}

const RECOGNITION_FIELD_LABELS: Record<string, string> = {
  drawing_number: "圖號",
  drawn_by_name: "製圖者",
  paper_size: "圖紙尺寸",
  revision: "版次",
  surface_finish: "表面處理"
};

const ISO_A_SERIES_PAPER_SIZES = [
  { label: "A0", width: 841, height: 1189 },
  { label: "A1", width: 594, height: 841 },
  { label: "A2", width: 420, height: 594 },
  { label: "A3", width: 297, height: 420 },
  { label: "A4", width: 210, height: 297 },
  { label: "A5", width: 148, height: 210 }
] as const;

export function canonicalRecognitionFieldLabel(fieldKey: string | null | undefined, fallback: unknown) {
  return fieldKey && RECOGNITION_FIELD_LABELS[fieldKey]
    ? RECOGNITION_FIELD_LABELS[fieldKey]
    : normalizeRecognitionValue(fallback) || "辨識候選";
}

/** Keep raw observations intact while projecting common engineering values consistently. */
export function canonicalizeRecognitionValue(fieldKey: string | null | undefined, value: unknown) {
  if (value === null || value === undefined) return null;
  const normalized = normalizeRecognitionValue(value);
  if (fieldKey !== "paper_size" || !normalized) return normalized;
  const namedSize = normalized.toUpperCase().replace(/\s+/gu, "");
  if (ISO_A_SERIES_PAPER_SIZES.some((size) => size.label === namedSize)) return namedSize;
  const dimensions = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:mm)?\s*[*x×]\s*(\d+(?:\.\d+)?)\s*(?:mm)?$/iu);
  if (!dimensions) return normalized;
  const [shortSide, longSide] = [Number(dimensions[1]), Number(dimensions[2])].sort((left, right) => left - right);
  const size = ISO_A_SERIES_PAPER_SIZES.find((item) => Math.abs(item.width - shortSide) <= 1 && Math.abs(item.height - longSide) <= 1);
  return size?.label ?? normalized;
}

/**
 * Canonical semantic identity for a recognition candidate.
 *
 * Legacy adapters used source-specific keys such as `source_revision` and
 * `surface_treatment`. They remain read/ingest compatibility aliases only;
 * grouping, decisions and projections use one canonical field identity so
 * CAD, PDF, formal values and configuration observations meet in one field.
 */
export function canonicalizeRecognitionSemantics(input: {
  category?: unknown;
  fieldKey?: unknown;
  ownerType?: unknown;
  ownerId?: unknown;
}) {
  let category = parseRecognitionCategory(input.category);
  let fieldKey = normalizeRecognitionKey(input.fieldKey) || null;
  const ownerType = String(input.ownerType ?? "").trim() || null;
  const ownerId = String(input.ownerId ?? "").trim() || null;
  const canonicalFields = [
    { fieldKey: "drawing_number", category: "identity_relation" as const, aliases: ["drawing_number", "2d圖號_用途", "圖號"] },
    { fieldKey: "drawn_by_name", category: "drawing_revision" as const, aliases: ["drawn_by", "drawn_by_name", "製圖", "製圖者"] },
    { fieldKey: "revision", category: "identity_relation" as const, aliases: ["revision", "source_revision", "drawing_revision", "version", "版次", "版本"] },
    { fieldKey: "surface_finish", category: "part_attribute" as const, aliases: ["surface_finish", "surface_treatment", "表面處理", "表處"] },
    { fieldKey: "paper_size", category: null, aliases: ["paper_size", "sheet_size", "swformatsize"] }
  ];
  const normalizedFieldKey = fieldKey;
  const customDrawingNumber = normalizedFieldKey && /^sw_custom_(?:2d圖號_用途|圖號)_[\p{L}\p{N}]+$/u.test(normalizedFieldKey);
  const customPaperSize = normalizedFieldKey && /^sw_custom_swformatsize_[\p{L}\p{N}]+$/u.test(normalizedFieldKey);
  const canonicalField = customDrawingNumber
    ? canonicalFields[0]
    : customPaperSize
      ? canonicalFields[4]
      : normalizedFieldKey ? canonicalFields.find((field) => field.aliases.includes(normalizedFieldKey)) : null;
  if (canonicalField) {
    fieldKey = canonicalField.fieldKey;
    if (canonicalField.category) category = canonicalField.category;
  }
  return { category, fieldKey, ownerType, ownerId };
}

export function isExplicitNotApplicable(value: unknown) {
  const normalized = normalizeRecognitionValue(value).toLowerCase();
  return new Set(["無", "取消", "n/a", "na", "不適用", "not applicable", "none"]).has(normalized);
}

export function parseRecognitionCategory(value: unknown): DrawingRecognitionCategory {
  return DRAWING_RECOGNITION_CATEGORIES.includes(value as DrawingRecognitionCategory)
    ? value as DrawingRecognitionCategory
    : "unclassified";
}

export function parseRecognitionConfidence(value: unknown): DrawingRecognitionConfidence {
  return value === "high" || value === "medium" || value === "low" || value === "unknown" ? value : "unknown";
}

export function requireSafeRecognitionId(value: unknown, code: string) {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._:/-]{1,200}$/u.test(normalized)) throw new DrawingRecognitionError(code, "辨識識別碼格式不正確。", 400);
  return normalized;
}

export function boundedText(value: unknown, max: number, fallback = "") {
  const normalized = String(value ?? fallback).trim();
  return normalized.slice(0, max);
}

export function parseJsonValue<T>(value: string | T | null | undefined, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
