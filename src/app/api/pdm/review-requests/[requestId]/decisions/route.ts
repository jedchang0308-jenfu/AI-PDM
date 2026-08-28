import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { PartChangeWorkService } from "@/lib/part-change-work";
import { dev087CommandContext, dev087Json, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { validateDev087ReviewDecision } from "@/lib/pdm-work-review";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";
import { retiredWorkbenchCommandResponse } from "@/lib/pdm-retired-workbench-route";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const access = await resolveDev087RouteActor(request, "numbering.approvals"); if (access.response || !access.actor) return access.response;
  try {
    const { requestId } = await params; const body = await dev087Json(request); if (Object.keys(body).length !== 1 || !("decision" in body)) throw new CanonicalWorkbenchError("DEV087_DECISION_NOT_ALLOWED", "審核決策格式無效", 422); const decision = validateDev087ReviewDecision(body.decision); const client = getAsyncDatabaseClient(); const reviews = new PdmWorkReviewAsyncRepository(client); const item = await reviews.get(client, { companyId: access.actor.companyId, requestId });
    if (!item) {
      const terminalReceipt = await reviews.getTerminalReceipt(client, { companyId: access.actor.companyId, requestId });
      if (terminalReceipt) return Response.json({ error: { code: "WORKBENCH_REVIEW_REQUEST_STALE", message: "重新開啟目前審核項目", correlationId: crypto.randomUUID() } }, { status: 409 });
      return Response.json({ error: { code: "NOT_FOUND", message: "審核項目不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    }
    if (item.requestKind === "relation_change") return retiredWorkbenchCommandResponse();
    const context = dev087CommandContext(request); let result;
    if (item.requestKind === "part_change") result = await new PartChangeWorkService(client).decide(requestId, decision, access.actor, context);
    else result = await new DrawingRevisionWorkService(client).decide(requestId, decision, access.actor, context);
    return dev087Success(result);
  } catch (error) { return dev087RouteError(error); }
}
