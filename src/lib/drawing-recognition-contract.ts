import crypto from "node:crypto";
import { canonicalJsonStringify } from "@/lib/canonical-json";

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
