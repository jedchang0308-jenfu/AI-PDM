import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { PartChangeWorkService } from "@/lib/part-change-work";
import { dev087CommandContext, dev087Json, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { validateDev087ReviewDecision } from "@/lib/pdm-work-review";
import { RelationChangeWorkService } from "@/lib/relation-change-work";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const access = await resolveDev087RouteActor(request, "numbering.approvals"); if (access.response || !access.actor) return access.response;
  try {
    const { requestId } = await params; const body = await dev087Json(request); const decision = validateDev087ReviewDecision(body.decision); const client = getAsyncDatabaseClient(); const item = await new PdmWorkReviewAsyncRepository(client).get(client, { companyId: access.actor.companyId, requestId });
    if (!item) return Response.json({ error: { code: "NOT_FOUND", message: "審核項目不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    const context = dev087CommandContext(request); let result;
    if (item.requestKind === "part_change") result = await new PartChangeWorkService(client).decide(requestId, decision, access.actor, context);
    else if (item.requestKind === "relation_change") result = await new RelationChangeWorkService(client).decide(requestId, decision, access.actor, context);
    else result = await new DrawingRevisionWorkService(client).decide(requestId, decision, access.actor, context);
    return dev087Success(result);
  } catch (error) { return dev087RouteError(error); }
}
