import { canonicalizeRecognitionValue } from "@/lib/drawing-recognition-contract";
import { sha256Canonical } from "@/lib/drawing-recognition-hash";
import type { PartChangePayload } from "@/lib/repositories/part-change-work-async-repository";

export const DRAWING_RECOGNITION_HANDOFF_SCHEMA = "pdm-recognition-part-work-handoff-v2" as const;
export const DRAWING_RECOGNITION_HANDOFF_COMMAND = "drawing_recognition.part_work_handoff.v2" as const;
export const DRAWING_RECOGNITION_HANDOFF_MAX_PARTS = 100;

export type HandoffIntent = "value" | "clear" | "not_applicable";
export type HandoffFieldKey = "material" | "color" | "surface_finish" | "surface_treatment" | "variant_note";
export type TransferableField = {
  fieldKey: HandoffFieldKey;
  payloadKeys: readonly (keyof PartChangePayload)[];
  label: string;
};

export const TRANSFERABLE_FIELDS: readonly TransferableField[] = [
  { fieldKey: "material", payloadKeys: ["materialCode", "materialLabel"], label: "材質" },
  { fieldKey: "color", payloadKeys: ["colorCode", "colorLabel"], label: "顏色" },
  { fieldKey: "surface_finish", payloadKeys: ["surfaceTreatment"], label: "表面處理" },
  { fieldKey: "variant_note", payloadKeys: ["variantNote"], label: "版本備註" }
];

const fieldSet = new Set<string>(TRANSFERABLE_FIELDS.flatMap((field) => [field.fieldKey, ...(field.fieldKey === "surface_finish" ? ["surface_treatment"] : [])]));

export type HandoffDraftValue = {
  fieldKey: HandoffFieldKey;
  intent: HandoffIntent;
  value?: string | null;
};

export type HandoffOverride = HandoffDraftValue & {
  partId: string;
  conflictResolution?: "keep_work" | "use_recognition" | null;
};

export type HandoffDraft = {
  commonValues: HandoffDraftValue[];
  overrides: HandoffOverride[];
};

export type HandoffEligiblePart = {
  id: string;
  partNumber: string;
  partName: string;
  partRootId: string;
};

export type OwnerResolution =
  | { kind: "overall" }
  | { kind: "resolved"; partId: string; reason: "configuration" | "canonical_token" | "adapter" }
  | { kind: "unresolved"; reason: "short_token" | "ambiguous" | "non_eligible" | "mismatch" };

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

export function normalizeHandoffFieldKey(value: unknown): HandoffFieldKey | null {
  const key = text(value).toLowerCase();
  if (!fieldSet.has(key)) return null;
  return key === "surface_treatment" ? "surface_finish" : key as HandoffFieldKey;
}

export function parseHandoffIntent(value: unknown): HandoffIntent {
  const intent = text(value);
  if (intent !== "value" && intent !== "clear" && intent !== "not_applicable") throw new Error("RECOGNITION_HANDOFF_INTENT_INVALID");
  return intent;
}

export function normalizeHandoffValue(fieldKey: HandoffFieldKey, intent: HandoffIntent, value: unknown) {
  if (intent === "clear") return null;
  if (intent === "not_applicable") return "無";
  const normalized = canonicalizeRecognitionValue(fieldKey === "surface_finish" ? "surface_treatment" : fieldKey, text(value));
  if (!normalized) throw new Error("RECOGNITION_HANDOFF_VALUE_REQUIRED");
  return normalized;
}

export function parseHandoffDraft(value: unknown): HandoffDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RECOGNITION_HANDOFF_DRAFT_INVALID");
  const raw = value as Record<string, unknown>;
  const commonRaw = raw.commonValues ?? raw.common_values;
  const overridesRaw = raw.overrides;
  if (!Array.isArray(commonRaw) || !Array.isArray(overridesRaw) || commonRaw.length > 4 || overridesRaw.length > 400) throw new Error("RECOGNITION_HANDOFF_DRAFT_INVALID");
  const commonValues = commonRaw.map((entry) => parseValue(entry, false) as HandoffDraftValue);
  const overrides = overridesRaw.map((entry) => parseValue(entry, true) as HandoffOverride);
  const seenCommon = new Set<string>();
  for (const entry of commonValues) { if (seenCommon.has(entry.fieldKey)) throw new Error("RECOGNITION_HANDOFF_DUPLICATE_FIELD"); seenCommon.add(entry.fieldKey); }
  const seenOverrides = new Set<string>();
  for (const entry of overrides) { const key = `${entry.partId}:${entry.fieldKey}`; if (seenOverrides.has(key)) throw new Error("RECOGNITION_HANDOFF_DUPLICATE_OVERRIDE"); seenOverrides.add(key); }
  return { commonValues, overrides };
}

function parseValue(value: unknown, override: boolean): HandoffDraftValue | HandoffOverride {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RECOGNITION_HANDOFF_DRAFT_INVALID");
  const raw = value as Record<string, unknown>;
  const fieldKey = normalizeHandoffFieldKey(raw.fieldKey ?? raw.field_key);
  if (!fieldKey) throw new Error("RECOGNITION_HANDOFF_FIELD_INVALID");
  const intent = parseHandoffIntent(raw.intent);
  const normalized = normalizeHandoffValue(fieldKey, intent, raw.value);
  if (!override) return { fieldKey, intent, value: normalized };
  const partId = text(raw.partId ?? raw.part_id);
  if (!/^[A-Za-z0-9._:/-]{1,200}$/u.test(partId)) throw new Error("RECOGNITION_HANDOFF_PART_INVALID");
  const resolution = raw.conflictResolution ?? raw.conflict_resolution ?? null;
  if (resolution !== null && resolution !== "keep_work" && resolution !== "use_recognition") throw new Error("RECOGNITION_HANDOFF_CONFLICT_RESOLUTION_INVALID");
  return { partId, fieldKey, intent, value: normalized, conflictResolution: resolution as HandoffOverride["conflictResolution"] };
}

export function handoffDraftHash(draft: HandoffDraft) {
  return sha256Canonical({
    schemaVersion: DRAWING_RECOGNITION_HANDOFF_SCHEMA,
    commonValues: [...draft.commonValues].sort((a, b) => a.fieldKey.localeCompare(b.fieldKey)),
    overrides: [...draft.overrides].sort((a, b) => `${a.partId}:${a.fieldKey}`.localeCompare(`${b.partId}:${b.fieldKey}`))
  });
}

function canonicalTokenRegex(value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_-])${escaped}(?=$|[^\\p{L}\\p{N}_-])`, "iu");
}

/** Strictly resolves evidence against the already-authorized eligible set. */
export function resolveHandoffEvidenceOwner(input: {
  rawText?: string | null;
  configurationName?: string | null;
  applicabilityScope?: string | null;
  candidateOwnerId?: string | null;
  candidateOwnerVerified?: boolean;
  eligibleParts: HandoffEligiblePart[];
}): OwnerResolution {
  const eligibleById = new Map(input.eligibleParts.map((part) => [part.id, part]));
  if (input.candidateOwnerVerified && input.candidateOwnerId && eligibleById.has(input.candidateOwnerId)) {
    return { kind: "resolved", partId: input.candidateOwnerId, reason: "adapter" };
  }
  const configuration = text(input.configurationName);
  const byConfiguration = input.eligibleParts.filter((part) => part.partNumber === configuration);
  if (configuration && byConfiguration.length === 1) return { kind: "resolved", partId: byConfiguration[0].id, reason: "configuration" };
  const raw = text(input.rawText);
  const matches = input.eligibleParts.filter((part) => canonicalTokenRegex(part.partNumber).test(raw));
  if (matches.length === 1) return { kind: "resolved", partId: matches[0].id, reason: "canonical_token" };
  if (matches.length > 1 || byConfiguration.length > 1) return { kind: "unresolved", reason: "ambiguous" };
  if (raw && /(^|[^\\p{L}\\p{N}_-])P?\\d{1,4}(?=$|[^\\p{L}\\p{N}_-])/iu.test(raw)) return { kind: "unresolved", reason: "short_token" };
  if (input.candidateOwnerId && !eligibleById.has(input.candidateOwnerId)) return { kind: "unresolved", reason: "non_eligible" };
  if (text(input.applicabilityScope) === "overall") return { kind: "overall" };
  return { kind: "unresolved", reason: "mismatch" };
}

export function applyHandoffIntent(payload: PartChangePayload, field: HandoffFieldKey, intent: HandoffIntent, value: string | null | undefined): PartChangePayload {
  const next = { ...payload };
  const normalized = normalizeHandoffValue(field, intent, value);
  if (field === "material") { next.materialLabel = normalized; next.materialCode = payload.materialLabel === normalized ? payload.materialCode : null; }
  else if (field === "color") { next.colorLabel = normalized; next.colorCode = payload.colorLabel === normalized ? payload.colorCode : null; }
  else if (field === "surface_finish") next.surfaceTreatment = normalized;
  else next.variantNote = normalized;
  return next;
}

export function safeReturnTo(value: unknown) {
  const path = text(value);
  if (!path || !path.startsWith("/numbering/drawings/") || path.includes("\\") || path.includes("//") || path.length > 500) return null;
  return path;
}
