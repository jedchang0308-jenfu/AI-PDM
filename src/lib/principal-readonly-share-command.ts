import crypto from "node:crypto";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { createJenfuVerifiedAuthorizationActor } from "@/lib/jenfu-entitlement-contract";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest, type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { createPlatformActorContext, createPdmCommand } from "@/lib/platform-command";
import { executePdmCommandWithOutbox } from "@/lib/platform-command-service";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

function safeHeaderId(request: Request, name: string) {
  const value = request.headers.get(name)?.trim() ?? "";
  return /^[A-Za-z0-9._:/-]{1,200}$/u.test(value) ? value : "";
}

export async function executePrincipalReadonlyShareCommand<TResult>(input: {
  request: Request;
  routePath: string;
  method: "POST" | "PATCH";
  commandName: "pdm.submission_share.create" | "pdm.submission_share.revoke";
  submissionId: string;
  shareId?: string;
  payload: Record<string, unknown>;
  idempotencyPayload: unknown;
  execute: (client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) => Promise<TResult>;
  event: (result: TResult) => {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
  };
}): Promise<{ result: TResult; reusedFromCommandReceipt: boolean } | Response> {
  const token = principalSessionTokenFromRequest(input.request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  const policy = resolveJenfuRoutePolicy(input.routePath, input.method,
    { expectedPermissionCode: "submission.share" });
  if (policy?.path !== input.routePath || policy.authorizationMode !== "permission" ||
      policy.permissionCode !== "submission.share" || policy.scopeResolver !== "submission company" ||
      getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
      getJenfuEntitlementMode() !== "enforce") {
    return Response.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  let context: { actor: ReturnType<typeof createPlatformActorContext>; verified: VerifiedPrincipalRequest };
  try {
    context = await withVerifiedJenfuPrincipalRequest(principalRequestInput(token), async (_snapshot, verified) => {
      const authorizationActor = createJenfuVerifiedAuthorizationActor({
        identityIssuer: verified.session.identityIssuer,
        identitySubject: verified.session.identitySubject,
        principalId: verified.session.principalId,
        employeeId: verified.session.employeeId,
        localPrincipalId: verified.profile.pdmUserId,
        companyId: verified.profile.companyId,
        sessionSchemaVersion: 2
      });
      if (!authorizationActor) throw new JenfuPrincipalRequestError("auth_session_invalid");
      return { verified, actor: createPlatformActorContext({
        pdmUserId: verified.profile.pdmUserId,
        organizationId: verified.profile.companyId,
        authorizationActor,
        requestId: safeHeaderId(input.request, "x-request-id") || crypto.randomUUID(),
        correlationId: safeHeaderId(input.request, "x-correlation-id") || undefined
      }) };
    });
  } catch (error) {
    return principalRequestFailure(error);
  }
  const requestId = context.actor.requestId;
  const idempotencyKey = safeHeaderId(input.request, "idempotency-key") ||
    safeHeaderId(input.request, "x-idempotency-key") || `request:${requestId}`;
  try {
    const command = createPdmCommand({
      commandName: input.commandName,
      idempotencyKey,
      actor: context.actor,
      payload: input.payload
    });
    return await executePdmCommandWithOutbox({
      client: getAsyncDatabaseClient(), command,
      principalRequest: principalRequestInput(token),
      principalAuthorization: {
        request: input.request, routePath: input.routePath, method: input.method,
        permissionCode: "submission.share",
        resourceBinding: { kind: "submission_share", submissionId: input.submissionId,
          ...(input.shareId ? { shareId: input.shareId } : {}) }
      },
      execute: (client, _decision, verified) => {
        if (!verified) throw new Error("PLATFORM_PRINCIPAL_COMMAND_CONTEXT_REQUIRED");
        return input.execute(client, verified);
      },
      event: input.event,
      idempotencyPayload: input.idempotencyPayload,
      serializable: true
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "principal_dependency_unavailable";
    if (error instanceof JenfuPrincipalRequestError || error instanceof JenfuEntitlementRepositoryError) {
      return principalRequestFailure(error);
    }
    if (code === "PLATFORM_PRINCIPAL_COMMAND_RESOURCE_STATE_INVALID") {
      return Response.json({ error: "Release package is required before sharing" }, { status: 409 });
    }
    if (code === "PLATFORM_COMMAND_IN_PROGRESS") {
      return Response.json({ code: "command_in_progress" }, { status: 409 });
    }
    return Response.json({ code: "principal_dependency_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
}
