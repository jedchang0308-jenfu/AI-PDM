import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { getApprovalPlatformRequestDetailForCompanyAsync } from "@/lib/approval-platform";
import {
  drawingRevisionLifecycleErrorPayload,
  withdrawDrawingRevisionLifecycle
} from "@/lib/drawing-revision-lifecycle";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;
  const { requestId } = await params;
  const decodedRequestId = safeDecode(requestId);
  const detail = await getApprovalPlatformRequestDetailForCompanyAsync(decodedRequestId, auth.user.company_id);
  if (!detail) {
    return NextResponse.json({ error: "APPROVAL_REQUEST_GONE", code: "APPROVAL_REQUEST_GONE", canonicalHref: "/numbering/drawings" }, { status: 410 });
  }
  if (detail.actionCode !== "numbering.drawing_revision_lifecycle_review") {
    return NextResponse.json({ error: "DRAWING_LIFECYCLE_INVALID_COMMAND", code: "DRAWING_LIFECYCLE_INVALID_COMMAND" }, { status: 400 });
  }
  const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key") ?? "";
  try {
    const lifecycle = await withdrawDrawingRevisionLifecycle({
      requestId: decodedRequestId,
      actorId: auth.user.id,
      idempotencyKey
    });
    if (!lifecycle) {
      return NextResponse.json({ error: "APPROVAL_REQUEST_GONE", code: "APPROVAL_REQUEST_GONE", canonicalHref: "/numbering/drawings" }, { status: 410 });
    }
    return NextResponse.json({ lifecycle }, { status: lifecycle.cleanupPending ? 202 : 200 });
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
