import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { hashJenfuPrincipalSessionId } from "@/lib/jenfu-principal-session-registry";
import {
  withVerifiedJenfuPrincipalRequest, type PrincipalRequestInput,
  type VerifiedPrincipalRequest
} from "@/lib/jenfu-principal-request-guard";

export type PrincipalLifecycleAction = "suspend" | "reactivate" | "offboard" | "return_to_work";
export type PrincipalLifecycleReceipt = {
  operationId: string; principalId: string; pdmUserId: string;
  accountStatus: "active" | "suspended" | "expired" | "offboarded";
  lifecycleVersion: number; reason: string; committedAt: string; replayed: boolean;
  current: { accountStatus: PrincipalLifecycleReceipt["accountStatus"]; lifecycleVersion: number };
};

export class PrincipalLifecycleError extends Error {
  constructor(readonly code: "invalid_request" | "permission_not_granted" |
    "account_not_found" | "operation_conflict" | "invalid_transition" |
    "source_inactive" | "principal_lifecycle_unavailable", readonly httpStatus: number) {
    super(code);
  }
}

function exactRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parse(body: unknown) {
  if (!exactRecord(body) || Object.keys(body).some((key) => !["operationId", "action", "reason"].includes(key)) ||
      typeof body.operationId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u.test(body.operationId) ||
      !["suspend", "reactivate", "offboard", "return_to_work"].includes(String(body.action)) ||
      typeof body.reason !== "string" || body.reason.length < 1 || body.reason.length > 500 ||
      body.reason.trim() !== body.reason || !body.reason.trim() ||
      /[\u0000-\u001f\u007f]/u.test(body.reason)) {
    throw new PrincipalLifecycleError("invalid_request", 400);
  }
  return { operationId: body.operationId, action: body.action as PrincipalLifecycleAction,
    reason: body.reason };
}

function failure(error: unknown): PrincipalLifecycleError {
  if (error instanceof PrincipalLifecycleError) return error;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("AIPDM_PROVISION_PERMISSION_DENIED") ||
      message.includes("AIPDM_PROVISION_ACTOR_INVALID") ||
      message.includes("AIPDM_LIFECYCLE_SELF_CHANGE_DENIED")) {
    return new PrincipalLifecycleError("permission_not_granted", 403);
  }
  if (message.includes("AIPDM_LIFECYCLE_TARGET_NOT_FOUND")) {
    return new PrincipalLifecycleError("account_not_found", 404);
  }
  if (message.includes("AIPDM_LIFECYCLE_OPERATION_CONFLICT")) {
    return new PrincipalLifecycleError("operation_conflict", 409);
  }
  if (message.includes("AIPDM_LIFECYCLE_TRANSITION_INVALID")) {
    return new PrincipalLifecycleError("invalid_transition", 409);
  }
  if (message.includes("AIPDM_LIFECYCLE_SOURCE_INACTIVE")) {
    return new PrincipalLifecycleError("source_inactive", 409);
  }
  if (message.includes("AIPDM_LIFECYCLE_INVALID_REQUEST")) {
    return new PrincipalLifecycleError("invalid_request", 400);
  }
  return new PrincipalLifecycleError("principal_lifecycle_unavailable", 503);
}

function validateReceipt(value: unknown, expected: { operationId: string; pdmUserId: string; reason: string }) {
  if (!exactRecord(value) || value.operationId !== expected.operationId ||
      value.pdmUserId !== expected.pdmUserId ||
      value.reason !== expected.reason ||
      typeof value.principalId !== "string" || !value.principalId ||
      typeof value.replayed !== "boolean" ||
      typeof value.committedAt !== "string" ||
      !Number.isFinite(Date.parse(value.committedAt)) ||
      !["active", "suspended", "expired", "offboarded"].includes(String(value.accountStatus)) ||
      !Number.isSafeInteger(Number(value.lifecycleVersion)) || Number(value.lifecycleVersion) < 1 ||
      !exactRecord(value.current) ||
      !["active", "suspended", "expired", "offboarded"].includes(String(value.current.accountStatus)) ||
      !Number.isSafeInteger(Number(value.current.lifecycleVersion)) ||
      Number(value.current.lifecycleVersion) < 1) {
    throw new Error("PRINCIPAL_LIFECYCLE_RECEIPT_INVALID");
  }
  return value as PrincipalLifecycleReceipt;
}

export async function updatePrincipalAccountLifecycleInSnapshot(
  snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest,
  targetPdmUserId: string, body: unknown
): Promise<PrincipalLifecycleReceipt> {
  try {
    if (snapshot.kind !== "postgres" || !targetPdmUserId || targetPdmUserId.length > 255) {
      throw new PrincipalLifecycleError("invalid_request", 400);
    }
    const input = parse(body);
    const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
      [{ permissionKind: "action", permissionCode: "accounts.lifecycle.manage" }]);
    if (decisions.length !== 1 || !decisions[0].allowed) {
      throw new PrincipalLifecycleError("permission_not_granted", 403);
    }
    const row = await snapshot.queryOne<{ receipt: unknown }>(`
      SELECT ai_pdm_core.update_principal_account_lifecycle_v1(
        :operationId,:pdmUserId,:action,:reason,:companyId,
        :actorPrincipalId,:actorIssuer,:actorSubject,:sessionHash
      ) AS receipt
    `, { ...input, pdmUserId: targetPdmUserId, companyId: verified.profile.companyId,
      actorPrincipalId: verified.session.principalId,
      actorIssuer: verified.session.identityIssuer,
      actorSubject: verified.session.identitySubject,
      sessionHash: hashJenfuPrincipalSessionId(verified.session.sessionId) });
    return validateReceipt(row?.receipt,
      { operationId: input.operationId, pdmUserId: targetPdmUserId, reason: input.reason });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error &&
        error.code === "23505" && error instanceof Error &&
        !error.message.includes("AIPDM_LIFECYCLE_")) throw error;
    throw failure(error);
  }
}

export async function updatePrincipalAccountLifecycle(
  input: PrincipalRequestInput & { pdmUserId: string; body: unknown }
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await withVerifiedJenfuPrincipalRequest(input,
        (snapshot, verified) => updatePrincipalAccountLifecycleInSnapshot(
          snapshot, verified, input.pdmUserId, input.body),
        { readOnly: false, isolationLevel: "serializable" });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error &&
          error.code === "23505") {
        if (attempt === 0) continue;
        throw failure(error);
      }
      throw error;
    }
  }
  throw new PrincipalLifecycleError("principal_lifecycle_unavailable", 503);
}
