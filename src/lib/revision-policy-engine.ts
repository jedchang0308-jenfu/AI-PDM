import crypto from "node:crypto";
import {
  normalizeRevisionCode,
  parseRevisionCode,
  revisionValidationMessage,
  suggestRevisionCode,
  type RevisionHistorySource,
  type RevisionLifecycleStage,
  type RevisionKind
} from "@/lib/revision-policy";

export const REVISION_POLICY_VERSION = "revision-policy-002.1" as const;

export type RevisionWorkflowIntent = RevisionLifecycleStage;
export type RevisionPolicyVersion = typeof REVISION_POLICY_VERSION;
export type RevisionPolicyTransitionTarget = "Released";
export type RevisionPolicyBlockReasonCode =
  | "minor_revision_cannot_be_released"
  | "release_area_requires_major_revision"
  | "conditional_use_not_supported_in_phase_1"
  | "revision_format_invalid";

export type RevisionPolicySuggestionResponse = {
  suggestedRevision: string;
  workflowIntent: RevisionWorkflowIntent;
  policyVersion: RevisionPolicyVersion;
  basisHash: string;
  reasonCodes: string[];
  generatedAt: string;
};

export type RevisionPolicySnapshot = {
  workflow_intent: RevisionWorkflowIntent;
  suggested_revision: string;
  selected_revision: string;
  override_reason: string | null;
  policy_version: RevisionPolicyVersion;
  suggestion_basis_hash: string;
  suggestion_generated_at: string;
  accepted_or_overridden_at: string;
};

export type RevisionPolicyTransitionDecision =
  | {
      allowed: true;
      decision: "allow";
      revisionKind: RevisionKind;
      targetLifecycleStatus: RevisionPolicyTransitionTarget;
      workflowIntent: RevisionWorkflowIntent;
      reasonCodes: string[];
      policyVersion: RevisionPolicyVersion;
      basisHash?: string | null;
    }
  | {
      allowed: false;
      decision: "block";
      revisionKind: RevisionKind | "invalid";
      targetLifecycleStatus: RevisionPolicyTransitionTarget;
      workflowIntent: RevisionWorkflowIntent | "conditional_use";
      reasonCode: RevisionPolicyBlockReasonCode;
      userMessage: string;
      policyVersion: RevisionPolicyVersion;
      basisHash?: string | null;
    };

export class RevisionPolicyError extends Error {
  constructor(public readonly decision: Extract<RevisionPolicyTransitionDecision, { allowed: false }>) {
    super(decision.userMessage);
  }

  get code() {
    return this.decision.reasonCode;
  }
}

export const revisionWorkflowIntents = ["rd_workspace", "design_change_workspace", "release_area"] as const;

const revisionWorkflowIntentSet = new Set<string>(revisionWorkflowIntents);
const unsupportedPhase1Intents = new Set(["conditional_use", "ConditionalUse", "TrialApproved"]);

export const minorRevisionReleaseBlockMessage =
  "小數版是研發或設變中的版次，不能發行為正式 Released。請建立下一個整數正式版，或退回修改版次。";

export function normalizeRevisionWorkflowIntent(
  value: string | null | undefined,
  fallback: RevisionWorkflowIntent = "release_area"
): RevisionWorkflowIntent {
  const normalized = String(value ?? "").trim();
  return revisionWorkflowIntentSet.has(normalized) ? (normalized as RevisionWorkflowIntent) : fallback;
}

export function isUnsupportedPhase1RevisionWorkflowIntent(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return unsupportedPhase1Intents.has(normalized);
}

export function createRevisionSuggestion(input: {
  companyId: string;
  drawingNumber: string;
  workflowIntent: RevisionWorkflowIntent;
  revisions: RevisionHistorySource[];
  generatedAt?: string;
}): RevisionPolicySuggestionResponse {
  const suggestedRevision = suggestRevisionCode(input.revisions, input.workflowIntent);
  const releasedMajor = latestReleasedMajor(input.revisions);
  return {
    suggestedRevision,
    workflowIntent: input.workflowIntent,
    policyVersion: REVISION_POLICY_VERSION,
    basisHash: computeRevisionPolicyBasisHash(input),
    reasonCodes: suggestionReasonCodes(input.workflowIntent, releasedMajor),
    generatedAt: input.generatedAt ?? new Date().toISOString()
  };
}

export function computeRevisionPolicyBasisHash(input: {
  companyId: string;
  drawingNumber: string;
  workflowIntent: RevisionWorkflowIntent;
  revisions: RevisionHistorySource[];
}) {
  return crypto
    .createHash("sha256")
    .update(
      canonicalJsonStringify({
        policyVersion: REVISION_POLICY_VERSION,
        companyId: input.companyId,
        drawingNumber: normalizeRevisionSubject(input.drawingNumber),
        workflowIntent: input.workflowIntent,
        revisions: normalizeBasisRecords(input.revisions)
      })
    )
    .digest("hex");
}

export function evaluateRevisionPolicyTransition(input: {
  targetRevision: string | null | undefined;
  targetLifecycleStatus: RevisionPolicyTransitionTarget;
  workflowIntent?: string | null;
  basisHash?: string | null;
}): RevisionPolicyTransitionDecision {
  const requestedIntent = String(input.workflowIntent ?? "").trim();
  const workflowIntent = isUnsupportedPhase1RevisionWorkflowIntent(requestedIntent)
    ? "conditional_use"
    : normalizeRevisionWorkflowIntent(requestedIntent, "release_area");
  const parsed = parseRevisionCode(input.targetRevision);
  if (!parsed) {
    return {
      allowed: false,
      decision: "block",
      revisionKind: "invalid",
      targetLifecycleStatus: input.targetLifecycleStatus,
      workflowIntent,
      reasonCode: "revision_format_invalid",
      userMessage: revisionValidationMessage("REVISION_FORMAT_INVALID"),
      policyVersion: REVISION_POLICY_VERSION,
      basisHash: input.basisHash ?? null
    };
  }

  if (workflowIntent === "conditional_use") {
    return {
      allowed: false,
      decision: "block",
      revisionKind: parsed.kind,
      targetLifecycleStatus: input.targetLifecycleStatus,
      workflowIntent,
      reasonCode: "conditional_use_not_supported_in_phase_1",
      userMessage: "Phase 1 尚未開放緊急使用版次，請建立受控研發版次或正式整數版次。",
      policyVersion: REVISION_POLICY_VERSION,
      basisHash: input.basisHash ?? null
    };
  }

  if (input.targetLifecycleStatus === "Released" && parsed.kind !== "major") {
    return {
      allowed: false,
      decision: "block",
      revisionKind: parsed.kind,
      targetLifecycleStatus: input.targetLifecycleStatus,
      workflowIntent,
      reasonCode: "minor_revision_cannot_be_released",
      userMessage: minorRevisionReleaseBlockMessage,
      policyVersion: REVISION_POLICY_VERSION,
      basisHash: input.basisHash ?? null
    };
  }

  if (workflowIntent === "release_area" && parsed.kind !== "major") {
    return {
      allowed: false,
      decision: "block",
      revisionKind: parsed.kind,
      targetLifecycleStatus: input.targetLifecycleStatus,
      workflowIntent,
      reasonCode: "release_area_requires_major_revision",
      userMessage: "正式發行區只能使用整數版次，請建立下一個整數正式版。",
      policyVersion: REVISION_POLICY_VERSION,
      basisHash: input.basisHash ?? null
    };
  }

  return {
    allowed: true,
    decision: "allow",
    revisionKind: parsed.kind,
    targetLifecycleStatus: input.targetLifecycleStatus,
    workflowIntent,
    reasonCodes: ["revision_policy_transition_allowed"],
    policyVersion: REVISION_POLICY_VERSION,
    basisHash: input.basisHash ?? null
  };
}

export function assertRevisionPolicyCanTransition(input: Parameters<typeof evaluateRevisionPolicyTransition>[0]) {
  const decision = evaluateRevisionPolicyTransition(input);
  if (!decision.allowed) throw new RevisionPolicyError(decision);
  return decision;
}

export function normalizeRevisionPolicySuggestionInput(value: unknown): RevisionPolicySuggestionResponse | null {
  if (!isRecord(value)) return null;
  const suggestedRevision = normalizeUnknownRevision(value.suggestedRevision ?? value.suggested_revision ?? value.suggestedRevisionCode);
  const workflowIntent = normalizeRevisionWorkflowIntent(
    stringOrNull(value.workflowIntent ?? value.workflow_intent ?? value.lifecycleStage),
    "rd_workspace"
  );
  const policyVersion = stringOrNull(value.policyVersion ?? value.policy_version);
  const basisHash = stringOrNull(value.basisHash ?? value.basis_hash);
  const generatedAt = stringOrNull(value.generatedAt ?? value.generated_at);
  const rawReasonCodes = value.reasonCodes ?? value.reason_codes;
  if (!suggestedRevision || policyVersion !== REVISION_POLICY_VERSION || !basisHash || !generatedAt) return null;
  return {
    suggestedRevision,
    workflowIntent,
    policyVersion: REVISION_POLICY_VERSION,
    basisHash,
    reasonCodes: Array.isArray(rawReasonCodes) ? rawReasonCodes.map((item: unknown) => String(item)).filter(Boolean) : [],
    generatedAt
  };
}

export function buildRevisionPolicySnapshot(input: {
  suggestion: RevisionPolicySuggestionResponse;
  selectedRevision: string;
  overrideReason?: string | null;
  acceptedOrOverriddenAt?: string;
}): RevisionPolicySnapshot {
  return {
    workflow_intent: input.suggestion.workflowIntent,
    suggested_revision: input.suggestion.suggestedRevision,
    selected_revision: normalizeRevisionCode(input.selectedRevision),
    override_reason: normalizeOptionalText(input.overrideReason),
    policy_version: input.suggestion.policyVersion,
    suggestion_basis_hash: input.suggestion.basisHash,
    suggestion_generated_at: input.suggestion.generatedAt,
    accepted_or_overridden_at: input.acceptedOrOverriddenAt ?? new Date().toISOString()
  };
}

export function extractRevisionPolicySnapshot(snapshot: unknown): RevisionPolicySnapshot | null {
  if (!isRecord(snapshot)) return null;
  const raw = snapshot.revision_policy_snapshot ?? snapshot.revisionPolicySnapshot;
  if (!isRecord(raw)) return null;
  const workflowIntent = normalizeRevisionWorkflowIntent(stringOrNull(raw.workflow_intent ?? raw.workflowIntent), "release_area");
  const suggestedRevision = normalizeUnknownRevision(raw.suggested_revision ?? raw.suggestedRevision);
  const selectedRevision = normalizeUnknownRevision(raw.selected_revision ?? raw.selectedRevision);
  const policyVersion = stringOrNull(raw.policy_version ?? raw.policyVersion);
  const basisHash = stringOrNull(raw.suggestion_basis_hash ?? raw.suggestionBasisHash);
  const generatedAt = stringOrNull(raw.suggestion_generated_at ?? raw.suggestionGeneratedAt);
  const acceptedAt = stringOrNull(raw.accepted_or_overridden_at ?? raw.acceptedOrOverriddenAt);
  if (!suggestedRevision || !selectedRevision || policyVersion !== REVISION_POLICY_VERSION || !basisHash || !generatedAt || !acceptedAt) {
    return null;
  }
  return {
    workflow_intent: workflowIntent,
    suggested_revision: suggestedRevision,
    selected_revision: selectedRevision,
    override_reason: normalizeOptionalText(raw.override_reason ?? raw.overrideReason),
    policy_version: REVISION_POLICY_VERSION,
    suggestion_basis_hash: basisHash,
    suggestion_generated_at: generatedAt,
    accepted_or_overridden_at: acceptedAt
  };
}

export function revisionPolicySuggestionFromBody(body: Record<string, unknown>) {
  return (
    normalizeRevisionPolicySuggestionInput(body.revisionPolicySuggestion) ??
    normalizeRevisionPolicySuggestionInput(body.revision_policy_suggestion) ??
    normalizeRevisionPolicySuggestionInput(body)
  );
}

function suggestionReasonCodes(workflowIntent: RevisionWorkflowIntent, releasedMajor: number | null) {
  if (workflowIntent === "release_area") {
    return [releasedMajor === null ? "initial_major_release_suggested" : "next_major_release_suggested"];
  }
  return [releasedMajor === null ? "initial_minor_workspace_suggested" : "next_minor_workspace_suggested"];
}

function latestReleasedMajor(revisions: RevisionHistorySource[]) {
  const majors = revisions
    .map((revision) => {
      const parsed = parseRevisionCode(revision.revision, { allowLegacy: true });
      return parsed?.kind === "major" && revision.status === "Released" ? parsed.major : null;
    })
    .filter((value): value is number => value !== null);
  return majors.length ? Math.max(...majors) : null;
}

function normalizeBasisRecords(revisions: RevisionHistorySource[]) {
  return revisions
    .map((revision) => ({
      revision: normalizeRevisionCode(revision.revision),
      status: revision.status ?? null,
      releasedAt: revision.releasedAt ?? null,
      createdAt: revision.createdAt ?? null,
      updatedAt: revision.updatedAt ?? null
    }))
    .sort((left, right) =>
      `${left.revision}\u0000${left.status ?? ""}\u0000${left.createdAt ?? ""}\u0000${left.updatedAt ?? ""}\u0000${left.releasedAt ?? ""}`.localeCompare(
        `${right.revision}\u0000${right.status ?? ""}\u0000${right.createdAt ?? ""}\u0000${right.updatedAt ?? ""}\u0000${right.releasedAt ?? ""}`
      )
    );
}

function normalizeRevisionSubject(value: string) {
  return String(value ?? "").trim();
}

function normalizeOptionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeUnknownRevision(value: unknown) {
  return normalizeRevisionCode(typeof value === "string" ? value : value == null ? undefined : String(value));
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function canonicalJsonStringify(value: unknown) {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJsonValue(value[key])]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
