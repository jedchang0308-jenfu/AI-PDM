import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest,
  type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { principalRequestFailure, principalRequestInput } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { dev087RouteError } from "@/lib/pdm-dev087-route";

type PrincipalRouteInput = {
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  permissionCode: string;
  readOnly: boolean;
};

export function principalDev087RoutePolicyAvailable(request: Request,
  input: PrincipalRouteInput): boolean {
  const actualPath = `src/app${new URL(request.url).pathname}/route.ts`;
  const policy = resolveJenfuRoutePolicy(actualPath, request.method,
    { expectedPermissionCode: input.permissionCode });
  return policy?.path === input.path && policy.method === input.method &&
    policy.authorizationMode === "permission" && policy.scopeResolver === "workspace" &&
    input.readOnly === (input.method === "GET");
}

/** Keep route policy, principal admission, permission and the resource decision in one snapshot. */
export async function withPrincipalDev087Route(request: Request, token: string,
  input: PrincipalRouteInput,
  execute: (client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) => Promise<Response>) {
  try {
    if (!principalDev087RoutePolicyAvailable(request, input)) {
      return Response.json({ code: "principal_route_policy_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token),
      async (tx, verified) => {
        const [decision] = await evaluatePrincipalWorkspacePermissionsInSnapshot(tx,
          verified, [{ permissionKind: "action", permissionCode: input.permissionCode }]);
        if (!decision?.allowed) {
          return jenfuEntitlementFailureResponse(decision?.decisionCode ?? "permission_not_granted");
        }
        return execute(tx, verified);
      }, { readOnly: input.readOnly,
        isolationLevel: input.readOnly ? "repeatable_read" : "serializable" });
  } catch (error) {
    return error instanceof JenfuPrincipalRequestError
      ? principalRequestFailure(error) : dev087RouteError(error);
  }
}
