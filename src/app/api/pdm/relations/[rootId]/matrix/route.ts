import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { RelationFormalAuthorityRepository, type RelationMatrixChange } from "@/lib/repositories/relation-formal-authority-async-repository";
import { resolveRelationMatrixActor, dev087RouteError } from "@/lib/pdm-dev087-route";
import { issueCanonicalWorkbenchContract, verifyCanonicalWorkbenchCommandContract } from "@/lib/pdm-workbench-authority-control";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rootId: string }> }) {
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
