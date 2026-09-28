import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmCompanyContext } from "@/lib/company-context";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { JenfuPrincipalRequestError, type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicyFromRequest } from "@/lib/jenfu-route-permission-map";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { PdmCanonicalWorkbenchService } from "@/lib/pdm-canonical-workbench";
import type { WorkbenchEntityType } from "@/lib/pdm-canonical-workbench-contract";
import type { CanonicalWorkbenchActor } from "@/lib/pdm-canonical-workbench-state";
import { dev087RouteError } from "@/lib/pdm-dev087-route";

const actionCodes = [
  "numbering.workspace.create", "numbering.workspace.update",
  "numbering.candidate.review.submit", "numbering.workspace.cancel",
  "approval.request.decide", "numbering.draft.update"
] as const;

async function actorInSnapshot(snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest,
  company: PdmCompanyContext, entityType: WorkbenchEntityType): Promise<CanonicalWorkbenchActor> {
  const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
    actionCodes.map((permissionCode) => ({ permissionKind: "action" as const, permissionCode })));
  if (decisions.length !== actionCodes.length || decisions.some((decision, index) =>
    !decision || decision.principalId !== verified.session.principalId ||
    decision.permissionCode !== actionCodes[index])) {
    throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
  }
  const can = (code: (typeof actionCodes)[number]) => decisions[actionCodes.indexOf(code)].allowed;
  const drawingDraft = entityType !== "drawing" || can("numbering.draft.update");
  return {
    // The profile ID identifies historical work ownership only. Every capability
    // above is decided for the verified principal in this same database snapshot.
    id: verified.profile.pdmUserId,
    companyId: company.companyId,
    canEditNonOwned: false,
    permissions: {
      createWork: can("numbering.workspace.create") && drawingDraft,
      updateWork: can("numbering.workspace.update") && drawingDraft,
      submitWork: can("numbering.candidate.review.submit"),
      cancelWork: can("numbering.workspace.cancel"),
      decideReview: can("approval.request.decide"),
      // The void and formal obsolete commands still reject Principal sessions;
      // do not advertise those links before their exact resource guards migrate.
      obsoleteDrawing: false,
      obsoleteFormalPart: false,
      obsoleteFormalDrawing: false,
      manageAttachments: false
    }
  };
}

export async function principalCanonicalWorkbenchResponse(
  request: Request, routePath: string, entityType: WorkbenchEntityType,
  read: (service: PdmCanonicalWorkbenchService, actor: CanonicalWorkbenchActor) => Promise<unknown>
): Promise<Response | null> {
  if (!principalSessionTokenFromRequest(request)) return null;
  const pagePermission = entityType === "drawing" ? "numbering.drawings.view" : "numbering.search";
  const policy = resolveJenfuRoutePolicyFromRequest(request, pagePermission);
  if (policy?.path !== routePath || policy.authorizationMode !== "permission" ||
      policy.scopeResolver !== "workspace") {
    return Response.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  return await withPrincipalNumberingCompanyRead(request, pagePermission,
    async (snapshot, company, verified) => {
      const actor = await actorInSnapshot(snapshot, verified, company, entityType);
      try {
        // Admission and disclosure share a read-only snapshot. Preview job
        // scheduling belongs to a separately authorized write/worker path.
        const data = await read(new PdmCanonicalWorkbenchService(snapshot,
          { queuePreviewJobs: false }), actor);
        return Response.json(data, { headers: { "cache-control": "private, no-store" } });
      } catch (error) {
        return dev087RouteError(error);
      }
    }) ?? Response.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
}
