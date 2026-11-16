import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest,
  type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { principalRequestFailure, principalRequestInput } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot, type PrincipalWorkspaceDecision } from "@/lib/jenfu-principal-permission-service";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { dev087RouteError } from "@/lib/pdm-dev087-route";

type PrincipalRouteInput = {
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  permissionCode: string;
  resourceGroup?: "drawing" | "part" | "model" | "transfer";
  readOnly: boolean;
};

/** Reuse the route decision only for the same actor, transaction and exact capability. */
export type ReadPrincipalRouteCapability = (client: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest, permissionCode: string,
  resourceGroup: PrincipalRouteInput["resourceGroup"]) => PrincipalWorkspaceDecision;

class PrincipalRouteWriteRejected extends Error {
  constructor(readonly response: Response) { super("principal_route_write_rejected"); }
}

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
  execute: (client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest, capability: ReadPrincipalRouteCapability) => Promise<Response>) {
  try {
    if (!principalDev087RoutePolicyAvailable(request, input)) {
      return Response.json({ code: "principal_route_policy_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    return await withVerifiedJenfuPrincipalRequest(await principalRequestInput(token, request),
      async (tx, verified) => {
        const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(tx,
          verified, [{ permissionKind: "action", permissionCode: input.permissionCode,
            ...(input.resourceGroup ? { resourceGroup: input.resourceGroup } : {}) }]);
        const [decision] = decisions;
        if (decisions.length !== 1 || !decision ||
            decision.principalId !== verified.session.principalId ||
            decision.permissionCode !== input.permissionCode ||
            decision.allowed !== (decision.decisionCode === "allowed")) {
          throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
        }
        if (!decision.allowed) {
          return jenfuEntitlementFailureResponse(decision.decisionCode);
        }
        const capability: ReadPrincipalRouteCapability = (client, actor, code, group) => {
          if (client !== tx || actor !== verified || code !== input.permissionCode || group !== input.resourceGroup) {
            throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
          }
          return decision;
        };
        const response = await execute(tx, verified, capability);
        if (!input.readOnly && !response.ok) throw new PrincipalRouteWriteRejected(response);
        return response;
      }, { readOnly: input.readOnly,
        isolationLevel: input.readOnly ? "repeatable_read" : "serializable" });
  } catch (error) {
    if (error instanceof PrincipalRouteWriteRejected) return error.response;
    return error instanceof JenfuPrincipalRequestError
      ? principalRequestFailure(error) : dev087RouteError(error);
  }
}
