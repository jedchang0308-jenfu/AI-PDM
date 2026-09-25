import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuPrincipalCandidateRepository } from "@/lib/jenfu-principal-candidate-repository";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import {
  JenfuPrincipalProvisionInputError, parseJenfuPrincipalProvisionRequest,
  principalProvisionSourceMatches, type JenfuPrincipalProvisionRequest
} from "@/lib/jenfu-principal-provision-contract";
import {
  withVerifiedJenfuPrincipalRequest,
  type PrincipalRequestInput, type VerifiedPrincipalRequest
} from "@/lib/jenfu-principal-request-guard";
import { hashJenfuPrincipalSessionId } from "@/lib/jenfu-principal-session-registry";

export type PrincipalProvisionReceipt = {
  operationId: string;
  principalId: string;
  pdmUserId: string;
  committedAt: string;
  replayed: boolean;
  current: { accountStatus: "active" | "suspended" | "expired" | "offboarded";
    lifecycleVersion: number; profileVersion: number };
};

export class JenfuPrincipalProvisionError extends Error {
  constructor(readonly code: "invalid_request" | "permission_not_granted" | "source_drift" |
    "operation_conflict" | "principal_already_linked" | "contact_email_conflict" |
    "principal_provision_unavailable", readonly httpStatus: number) {
    super(code);
  }
}

function failure(error: unknown): JenfuPrincipalProvisionError {
  if (error instanceof JenfuPrincipalProvisionError) return error;
  if (error instanceof JenfuPrincipalProvisionInputError) return new JenfuPrincipalProvisionError("invalid_request", 400);
  const message = error instanceof Error ? error.message : "";
  if (message.includes("AIPDM_PROVISION_PERMISSION_DENIED") ||
      message.includes("AIPDM_PROVISION_ACTOR_INVALID")) {
    return new JenfuPrincipalProvisionError("permission_not_granted", 403);
  }
  if (message.includes("AIPDM_PROVISION_OPERATION_CONFLICT")) {
    return new JenfuPrincipalProvisionError("operation_conflict", 409);
  }
  if (message.includes("AIPDM_PROVISION_PRINCIPAL_LINKED")) {
    return new JenfuPrincipalProvisionError("principal_already_linked", 409);
  }
  if (message.includes("AIPDM_PROVISION_CONTACT_CONFLICT")) {
    return new JenfuPrincipalProvisionError("contact_email_conflict", 409);
  }
  if (message.includes("AIPDM_PROVISION_SOURCE_DRIFT")) {
    return new JenfuPrincipalProvisionError("source_drift", 409);
  }
  if (message.includes("AIPDM_PROVISION_INVALID_REQUEST")) {
    return new JenfuPrincipalProvisionError("invalid_request", 400);
  }
  return new JenfuPrincipalProvisionError("principal_provision_unavailable", 503);
}

function receipt(value: unknown, expected: JenfuPrincipalProvisionRequest): PrincipalProvisionReceipt {
  if (!value || typeof value !== "object") throw new Error("PROVISION_RECEIPT_INVALID");
  const row = value as Partial<PrincipalProvisionReceipt>;
  const current = row.current;
  if (row.operationId !== expected.operationId ||
      row.principalId !== expected.principalRef.principalId ||
      typeof row.pdmUserId !== "string" || !row.pdmUserId ||
      typeof row.committedAt !== "string" || !Number.isFinite(Date.parse(row.committedAt)) ||
      typeof row.replayed !== "boolean" || !current ||
      !["active", "suspended", "expired", "offboarded"].includes(current.accountStatus) ||
      !Number.isSafeInteger(Number(current.lifecycleVersion)) || Number(current.lifecycleVersion) < 1 ||
      !Number.isSafeInteger(Number(current.profileVersion)) || Number(current.profileVersion) < 1) {
    throw new Error("PROVISION_RECEIPT_INVALID");
  }
  return row as PrincipalProvisionReceipt;
}

/** Transaction-bound command: permission, producer source and mutation share one snapshot. */
export async function provisionPrincipalAccountInSnapshot(
  snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest, body: unknown
): Promise<PrincipalProvisionReceipt> {
  try {
    if (snapshot.kind !== "postgres") throw new Error("PROVISION_DB_INVALID");
    const input = parseJenfuPrincipalProvisionRequest(body);
    const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
      [{ permissionKind: "action", permissionCode: "accounts.invitation.manage" }]);
    if (decisions.length !== 1 || !decisions[0].allowed) {
      throw new JenfuPrincipalProvisionError("permission_not_granted", 403);
    }
    const current = await new JenfuPrincipalCandidateRepository(snapshot)
      .listByPrincipal(input.principalRef.principalId);
    if (!principalProvisionSourceMatches(input.principalRef, current)) {
      throw new JenfuPrincipalProvisionError("source_drift", 409);
    }
    const row = await snapshot.queryOne<{ receipt: unknown }>(`
      SELECT ai_pdm_core.provision_principal_account_v1(
        :requestJson::jsonb,:actorPrincipalId,:actorIssuer,:actorSubject,:sessionHash
      ) AS receipt
    `, {
      requestJson: JSON.stringify({ ...input, companyId: verified.profile.companyId }),
      actorPrincipalId: verified.session.principalId,
      actorIssuer: verified.session.identityIssuer,
      actorSubject: verified.session.identitySubject,
      sessionHash: hashJenfuPrincipalSessionId(verified.session.sessionId)
    });
    return receipt(row?.receipt, input);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error &&
        error.code === "23505" && error instanceof Error &&
        !error.message.includes("AIPDM_PROVISION_")) throw error;
    throw failure(error);
  }
}

export async function provisionPrincipalAccount(input: PrincipalRequestInput & { body: unknown }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await withVerifiedJenfuPrincipalRequest(input,
        (snapshot, verified) => provisionPrincipalAccountInSnapshot(snapshot, verified, input.body),
        { readOnly: false, isolationLevel: "serializable" });
    } catch (error) {
      // A concurrent operation may commit after this SERIALIZABLE snapshot.
      // Only a raw unique collision is retried in a fresh verified transaction.
      if (typeof error === "object" && error !== null &&
          "code" in error && error.code === "23505") {
        if (attempt === 0) continue;
        throw failure(error);
      }
      throw error;
    }
  }
  throw new JenfuPrincipalProvisionError("principal_provision_unavailable", 503);
}
