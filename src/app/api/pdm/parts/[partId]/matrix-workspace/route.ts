import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { dev087RouteError } from "@/lib/pdm-dev087-route";
import { readPartNumberMatrixWorkspace } from "@/lib/part-number-matrix-workspace";
import { principalRequestFailure, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicyFromRequest } from "@/lib/jenfu-route-permission-map";
import type { PartChangeActor } from "@/lib/part-change-work";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ partId: string }> }) {
  const principalToken = principalSessionTokenFromRequest(request);
  if (!principalToken) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  const policy = resolveJenfuRoutePolicyFromRequest(request, "numbering.search");
  if (policy?.path !== "src/app/api/pdm/parts/[partId]/matrix-workspace/route.ts" ||
      policy.authorizationMode !== "permission" || policy.scopeResolver !== "workspace") {
    return Response.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  const principalResponse = await withPrincipalNumberingCompanyRead(request, "numbering.search", async (tx, company, verified) => {
    const permissions = ["numbering.workspace.create", "numbering.workspace.update",
      "numbering.candidate.review.submit"] as const;
    const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(tx, verified,
      permissions.map((permissionCode) => ({ permissionKind: "action" as const, permissionCode })));
    if (decisions.length !== permissions.length || decisions.some((decision, index) =>
      !decision || decision.principalId !== verified.session.principalId ||
      decision.permissionCode !== permissions[index])) {
      throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
    }
    const actor: PartChangeActor = {
      id: verified.profile.pdmUserId, companyId: company.companyId,
      canEditNonOwned: false,
      permissions: { create: decisions[0].allowed, update: decisions[1].allowed,
        submit: decisions[2].allowed, cancel: false, decide: false }
    };
    const { partId } = await params;
    const workId = new URL(request.url).searchParams.get("workId")?.trim() ?? "";
    if (!workId) return Response.json({ error: { code: "WORKBENCH_BAD_REQUEST", message: "缺少來源工作資料" } },
      { status: 400, headers: { "cache-control": "private, no-store" } });
    try {
      return Response.json(await readPartNumberMatrixWorkspace({ client: tx,
        sourcePartId: decodeURIComponent(partId), sourceWorkId: workId, actor }),
        { headers: { "cache-control": "private, no-store" } });
    } catch (error) {
      if (error instanceof CanonicalWorkbenchError) return dev087RouteError(error);
      throw error;
    }
  });
  return principalResponse ?? Response.json({ code: "principal_authorization_unavailable" },
    { status: 503, headers: { "cache-control": "no-store" } });
}
