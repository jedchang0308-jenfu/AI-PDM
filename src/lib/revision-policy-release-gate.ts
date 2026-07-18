import { createAuditLogAsync } from "@/lib/audit-async";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  evaluateRevisionPolicyTransition,
  extractRevisionPolicySnapshot,
  normalizeRevisionWorkflowIntent,
  type RevisionPolicySnapshot,
  type RevisionPolicyTransitionDecision
} from "@/lib/revision-policy-engine";
import { getSubmissionAsync } from "@/lib/submissions-async";

export type SubmissionReleasePolicyGateResult =
  | {
      ok: true;
      decision: Extract<RevisionPolicyTransitionDecision, { allowed: true }>;
      snapshot: RevisionPolicySnapshot | null;
    }
  | {
      ok: false;
      status: 409;
      code: Extract<RevisionPolicyTransitionDecision, { allowed: false }>["reasonCode"];
      message: string;
      responseBody: Record<string, unknown>;
      decision: Extract<RevisionPolicyTransitionDecision, { allowed: false }>;
      snapshot: RevisionPolicySnapshot | null;
    };

export async function assertSubmissionReleasePolicyAsync(input: {
  submissionId: string;
  actorId: string;
  workflowIntent?: string | null;
}): Promise<SubmissionReleasePolicyGateResult> {
  const submission = await getSubmissionAsync(input.submissionId);
  if (!submission) throw new Error("找不到送審資料。");

  const snapshot = await getSubmissionRevisionPolicySnapshot(input.submissionId);
  const workflowIntent = normalizeRevisionWorkflowIntent(
    input.workflowIntent ?? snapshot?.workflow_intent ?? null,
    snapshot?.workflow_intent ?? "release_area"
  );
  const decision = evaluateRevisionPolicyTransition({
    targetRevision: submission.revision,
    targetLifecycleStatus: "Released",
    workflowIntent,
    basisHash: snapshot?.suggestion_basis_hash ?? null
  });

  if (decision.allowed) return { ok: true, decision, snapshot };

  const detail = {
    companyId: submission.company_id ?? null,
    drawingNumber: submission.drawing_number,
    revision: submission.revision,
    workflowIntent: decision.workflowIntent,
    targetLifecycleStatus: decision.targetLifecycleStatus,
    revisionKind: decision.revisionKind,
    policyVersion: decision.policyVersion,
    reasonCode: decision.reasonCode,
    basisHash: decision.basisHash ?? snapshot?.suggestion_basis_hash ?? null,
    suggestedRevision: snapshot?.suggested_revision ?? null,
    selectedRevision: snapshot?.selected_revision ?? submission.revision
  };
  await createAuditLogAsync({
    submissionId: input.submissionId,
    actorId: input.actorId,
    action: "revision_policy.release_blocked",
    detail
  });

  return {
    ok: false,
    status: 409,
    code: decision.reasonCode,
    message: decision.userMessage,
    responseBody: {
      error: decision.reasonCode,
      code: decision.reasonCode,
      message: decision.userMessage,
      policy: detail,
      recoveryActions: ["create_next_major_revision", "return_for_revision_correction"]
    },
    decision,
    snapshot
  };
}

async function getSubmissionRevisionPolicySnapshot(submissionId: string) {
  const row = await getAsyncDatabaseClient().queryOne<{ snapshot_json: string | Record<string, unknown> | null }>(
    `
    SELECT snapshot_json
    FROM submission_snapshots
    WHERE submission_id = :submissionId
    ORDER BY created_at DESC
    LIMIT 1
    `,
    { submissionId }
  );
  return extractRevisionPolicySnapshot(parseSnapshotJson(row?.snapshot_json ?? null));
}

function parseSnapshotJson(value: string | Record<string, unknown> | null) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
