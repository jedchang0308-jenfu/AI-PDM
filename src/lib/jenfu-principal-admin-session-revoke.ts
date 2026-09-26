import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { hashJenfuPrincipalSessionId } from "@/lib/jenfu-principal-session-registry";
import {
  withVerifiedJenfuPrincipalRequest, type PrincipalRequestInput,
  type VerifiedPrincipalRequest
} from "@/lib/jenfu-principal-request-guard";
import type { PrincipalLifecycleReceipt } from "@/lib/jenfu-principal-lifecycle-service";

export class PrincipalAdminSessionRevokeError extends Error {
  constructor(readonly code: "invalid_request" | "permission_not_granted" |
    "account_not_found" | "operation_conflict" | "principal_session_revoke_unavailable",
  readonly httpStatus: number) {
    super(code);
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parse(body: unknown) {
  if (!record(body) || Object.keys(body).some((key) => !["operationId", "reason"].includes(key)) ||
      typeof body.operationId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u.test(body.operationId) ||
      typeof body.reason !== "string" || body.reason.length < 1 || body.reason.length > 500 ||
      body.reason.trim() !== body.reason || !body.reason.trim() ||
      /[\u0000-\u001f\u007f]/u.test(body.reason)) {
    throw new PrincipalAdminSessionRevokeError("invalid_request", 400);
  }
  return { operationId: body.operationId, reason: body.reason };
}

function failure(error: unknown): PrincipalAdminSessionRevokeError {
  if (error instanceof PrincipalAdminSessionRevokeError) return error;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("AIPDM_PROVISION_PERMISSION_DENIED") ||
      message.includes("AIPDM_PROVISION_ACTOR_INVALID") ||
      message.includes("AIPDM_SESSION_REVOKE_SELF_CHANGE_DENIED")) {
    return new PrincipalAdminSessionRevokeError("permission_not_granted", 403);
  }
  if (message.includes("AIPDM_SESSION_REVOKE_TARGET_NOT_FOUND")) {
    return new PrincipalAdminSessionRevokeError("account_not_found", 404);
  }
  if (message.includes("AIPDM_SESSION_REVOKE_OPERATION_CONFLICT")) {
    return new PrincipalAdminSessionRevokeError("operation_conflict", 409);
  }
  if (message.includes("AIPDM_SESSION_REVOKE_INVALID_REQUEST")) {
    return new PrincipalAdminSessionRevokeError("invalid_request", 400);
  }
  return new PrincipalAdminSessionRevokeError("principal_session_revoke_unavailable", 503);
}

function validateReceipt(value: unknown, expected: {
  operationId: string; pdmUserId: string; reason: string
}): PrincipalLifecycleReceipt {
  if (!record(value) || value.operationId !== expected.operationId ||
      value.pdmUserId !== expected.pdmUserId || value.reason !== expected.reason ||
      typeof value.principalId !== "string" || !value.principalId ||
      typeof value.replayed !== "boolean" ||
      typeof value.committedAt !== "string" || !Number.isFinite(Date.parse(value.committedAt)) ||
      !["active", "suspended", "expired", "offboarded"].includes(String(value.accountStatus)) ||
      !Number.isSafeInteger(Number(value.lifecycleVersion)) || Number(value.lifecycleVersion) < 1 ||
      !record(value.current) ||
      !["active", "suspended", "expired", "offboarded"].includes(String(value.current.accountStatus)) ||
      !Number.isSafeInteger(Number(value.current.lifecycleVersion)) ||
      Number(value.current.lifecycleVersion) < 1) {
    throw new Error("PRINCIPAL_SESSION_REVOKE_RECEIPT_INVALID");
  }
  return value as PrincipalLifecycleReceipt;
}

export async function revokePrincipalAccountSessionsInSnapshot(
  snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest,
  targetPdmUserId: string, body: unknown
): Promise<PrincipalLifecycleReceipt> {
  try {
    if (snapshot.kind !== "postgres" || !targetPdmUserId || targetPdmUserId.length > 255) {
      throw new PrincipalAdminSessionRevokeError("invalid_request", 400);
    }
    const input = parse(body);
    const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
      [{ permissionKind: "action", permissionCode: "accounts.session.revoke" }]);
    if (decisions.length !== 1 || !decisions[0].allowed) {
      throw new PrincipalAdminSessionRevokeError("permission_not_granted", 403);
    }
    const row = await snapshot.queryOne<{ receipt: unknown }>(`
      SELECT ai_pdm_core.revoke_principal_account_sessions_v1(
        :operationId,:pdmUserId,:reason,:companyId,
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
        !error.message.includes("AIPDM_SESSION_REVOKE_")) throw error;
    throw failure(error);
  }
}

export async function revokePrincipalAccountSessions(
  input: PrincipalRequestInput & { pdmUserId: string; body: unknown }
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await withVerifiedJenfuPrincipalRequest(input,
        (snapshot, verified) => revokePrincipalAccountSessionsInSnapshot(
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
  throw new PrincipalAdminSessionRevokeError("principal_session_revoke_unavailable", 503);
}
