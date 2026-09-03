import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { getApprovalPlatformRequestDetailForCompanyAsync } from "@/lib/approval-platform";
import {
  drawingRevisionLifecycleErrorPayload,
  retryDrawingRevisionLifecycleCleanupForRequest
} from "@/lib/drawing-revision-lifecycle";
import { validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;
  const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
  if (invalid) return invalid;
  const { requestId } = await params;
  const decodedRequestId = safeDecode(requestId);
  const detail = await getApprovalPlatformRequestDetailForCompanyAsync(decodedRequestId, auth.user.company_id);
  if (!detail || detail.actionCode !== "numbering.drawing_revision_lifecycle_review") {
    try {
      const replay = await retryDrawingRevisionLifecycleCleanupForRequest({
        requestId: decodedRequestId,
        actorId: auth.user.id,
        actorRole: auth.user.role,
        companyId: auth.user.company_id,
        idempotencyKey: idempotencyKey ?? ""
      });
      if (replay.idempotentReplay) return NextResponse.json({ cleanup: replay, message: "流程整理已完成。" });
    } catch {
      // Deliberately keep unknown or cross-company request IDs fail-closed.
    }
    return NextResponse.json({ error: "APPROVAL_REQUEST_NOT_FOUND", message: "找不到此圖面進版流程。" }, { status: 404 });
  }
  try {
    const cleanup = await retryDrawingRevisionLifecycleCleanupForRequest({
      requestId: decodedRequestId,
      actorId: auth.user.id,
      actorRole: auth.user.role,
      companyId: auth.user.company_id,
      idempotencyKey: idempotencyKey ?? ""
    });
    return NextResponse.json({
      cleanup,
      message: cleanup.alreadyCleaned ? "流程整理已完成。" : "已完成流程整理。"
    });
  } catch (error) {
    const failure = drawingRevisionLifecycleErrorPayload(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
