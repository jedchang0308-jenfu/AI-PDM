import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { RelationFormalAuthorityRepository, type RelationMatrixChange } from "@/lib/repositories/relation-formal-authority-async-repository";
import { resolveRelationMatrixActor, dev087RouteError } from "@/lib/pdm-dev087-route";
import { issueCanonicalWorkbenchContract, verifyCanonicalWorkbenchCommandContract } from "@/lib/pdm-workbench-authority-control";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";
import { resolveJenfuRoutePolicyFromRequest } from "@/lib/jenfu-route-permission-map";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rootId: string }> }) {
  if (principalSessionTokenFromRequest(request)) {
    const policy = resolveJenfuRoutePolicyFromRequest(request, "numbering.search");
    if (policy?.path !== "src/app/api/pdm/relations/[rootId]/matrix/route.ts" ||
        policy.authorizationMode !== "permission" || policy.scopeResolver !== "workspace") {
      return NextResponse.json({ code: "principal_route_policy_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    const response = await withPrincipalNumberingCompanyRead(request, "numbering.search",
      async (snapshot, company, verified) => {
        const { rootId } = await params;
        const matrix = await new RelationFormalAuthorityRepository(snapshot)
          .getMatrix({ companyId: company.companyId, rootId });
        return NextResponse.json({ data: matrix,
          meta: { contractToken: await issueCanonicalWorkbenchContract(snapshot,
            { companyId: company.companyId, actorId: verified.profile.pdmUserId }) } },
        { headers: { "cache-control": "private, no-store" } });
      });
    return response ?? NextResponse.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  const access = await resolveRelationMatrixActor(request);
  if (access.response || !access.actor) return access.response;
  try {
    const { rootId } = await params;
    const client = getAsyncDatabaseClient();
    const matrix = await new RelationFormalAuthorityRepository(client).getMatrix({ companyId: access.actor.companyId, rootId });
    return NextResponse.json({ data: matrix, meta: { contractToken: await issueCanonicalWorkbenchContract(client, { companyId: access.actor.companyId, actorId: access.actor.id }) } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return dev087RouteError(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ rootId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (token) return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/relations/[rootId]/matrix/route.ts", method: "PATCH",
    permissionCode: "numbering.workspace.update", readOnly: false
  }, async (snapshot, verified) => {
    const { rootId } = await params;
    await verifyCanonicalWorkbenchCommandContract(snapshot, {
      companyId: verified.profile.companyId, actorId: verified.profile.pdmUserId,
      token: request.headers.get("x-pdm-workbench-contract")
    });
    let body: { changes?: RelationMatrixChange[] };
    try { body = await request.json() as { changes?: RelationMatrixChange[] }; } catch { body = {}; }
    const result = await new RelationFormalAuthorityRepository(snapshot).applyMatrixPrincipal({
      companyId: verified.profile.companyId, rootId, changes: body.changes ?? [],
      ifMatch: request.headers.get("if-match"),
      idempotencyKey: request.headers.get("idempotency-key") ?? ""
    }, verified);
    return NextResponse.json({ data: result,
      meta: { contractToken: await issueCanonicalWorkbenchContract(snapshot, {
        companyId: verified.profile.companyId, actorId: verified.profile.pdmUserId
      }) } }, { headers: { "cache-control": "private, no-store" } });
  });
  const access = await resolveRelationMatrixActor(request);
  if (access.response || !access.actor) return access.response;
  if (!access.actor.canEditMatrix) return NextResponse.json({ error: { code: "FORBIDDEN", message: "沒有編輯關聯矩陣的權限" } }, { status: 403 });
  try {
    const client = getAsyncDatabaseClient();
    const { rootId } = await params;
    await verifyCanonicalWorkbenchCommandContract(client, { companyId: access.actor.companyId, actorId: access.actor.id, token: request.headers.get("x-pdm-workbench-contract") });
    let body: { changes?: RelationMatrixChange[] };
    try { body = await request.json() as { changes?: RelationMatrixChange[] }; } catch { body = {}; }
    const result = await new RelationFormalAuthorityRepository(client).applyMatrix({
      companyId: access.actor.companyId,
      rootId,
      actorId: access.actor.id,
      changes: body.changes ?? [],
      ifMatch: request.headers.get("if-match"),
      idempotencyKey: request.headers.get("idempotency-key") ?? ""
    });
    return NextResponse.json({ data: result, meta: { contractToken: await issueCanonicalWorkbenchContract(client, { companyId: access.actor.companyId, actorId: access.actor.id }) } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return dev087RouteError(error); }
}
