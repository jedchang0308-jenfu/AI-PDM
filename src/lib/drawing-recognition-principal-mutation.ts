import "server-only";

import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { DrawingRecognitionError } from "@/lib/drawing-recognition-contract";
import { evaluatePrincipalWorkspacePermissionsInSnapshot, type PrincipalWorkspaceDecision } from "@/lib/jenfu-principal-permission-service";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest, type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { principalCommandRouteMatches } from "@/lib/principal-command-route-proof";
import type { PdmCommandMetadata } from "@/lib/platform-command";

function denied() {
  return new DrawingRecognitionError("RECOGNITION_PERMISSION_DENIED", "目前帳號沒有此辨識操作權限。", 403);
}

/** For recognition writes without an outbox command, keep revocation, grant and resource checks in one write snapshot. */
export async function withPrincipalDrawingRecognitionMutation<T>(input: {
  metadata: PdmCommandMetadata;
  permissionCode: string;
  actorId: string;
  companyId: string;
  execute: (snapshot: AsyncDatabaseClient, decision: PrincipalWorkspaceDecision,
    verified: VerifiedPrincipalRequest) => Promise<T>;
  client?: AsyncDatabaseClient;
}): Promise<T> {
  const route = input.metadata.principalAuthorization;
  const principalRequest = input.metadata.principalRequest;
  if (!route || !principalRequest || route.permissionCode !== input.permissionCode ||
      !["POST", "PATCH"].includes(route.method) ||
      !principalCommandRouteMatches(route.request, route.routePath, route.method) ||
      principalSessionTokenFromRequest(route.request) !== principalRequest.token ||
      input.metadata.actor.authorizationActor?.sessionSchemaVersion !== 2) {
    throw denied();
  }
  const policy = resolveJenfuRoutePolicy(route.routePath, route.method,
    { expectedPermissionCode: input.permissionCode });
  if (!policy || policy.authorizationMode !== "permission" || policy.scopeResolver !== "workspace") {
    throw new DrawingRecognitionError("RECOGNITION_ROUTE_POLICY_UNAVAILABLE", "辨識授權契約暫時無法使用。", 503, true);
  }
  try {
    return await withVerifiedJenfuPrincipalRequest(
      { ...principalRequest, database: input.client ?? getAsyncDatabaseClient() },
      async (snapshot, verified) => {
        const actor = input.metadata.actor;
        if (verified.session.principalId !== actor.principalId ||
            verified.profile.pdmUserId !== actor.pdmUserId ||
            verified.profile.pdmUserId !== input.actorId ||
            verified.profile.companyId !== actor.organizationId ||
            verified.profile.companyId !== input.companyId) throw denied();
        const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
          [{ permissionKind: "action", permissionCode: input.permissionCode }]);
        const decision = decisions[0];
        if (decisions.length !== 1 || !decision?.allowed ||
            decision.permissionCode !== input.permissionCode ||
            decision.principalId !== verified.session.principalId) throw denied();
        return input.execute(snapshot, decision, verified);
      }, { readOnly: false, isolationLevel: "repeatable_read" });
  } catch (error) {
    if (error instanceof JenfuPrincipalRequestError) {
      throw error.code === "principal_dependency_unavailable"
        ? new DrawingRecognitionError("RECOGNITION_PRINCIPAL_DEPENDENCY_UNAVAILABLE", "辨識授權服務暫時無法使用。", 503, true)
        : new DrawingRecognitionError("RECOGNITION_AUTH_SESSION_INVALID", "登入已失效，請重新登入。", 401);
    }
    throw error;
  }
}
