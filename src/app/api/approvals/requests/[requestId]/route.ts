import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { getApprovalPlatformRequestDetailAsync, getApprovalPlatformRequestDetailForCompanyAsync } from "@/lib/approval-platform";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  drawingRevisionLifecycleLatestHref,
  getDrawingRevisionLifecycleCleanupStateByRequest,
  isDrawingRevisionLifecycleReviewer
} from "@/lib/drawing-revision-lifecycle";
import { isProductionNumberingLifecycleApprovalAction, isProductionNumberingLifecycleGateOpen, isProductionSliceEnforced, productionSliceDeniedPayload } from "@/lib/production-slice";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { requestId } = await params;
  const enforced = isProductionSliceEnforced();
  if (enforced && !isProductionNumberingLifecycleGateOpen("formal-obsolete")) {
    return NextResponse.json(productionSliceDeniedPayload("approvals.request.detail"), { status: 403 });
  }
  const detail = enforced
    ? await getApprovalPlatformRequestDetailForCompanyAsync(safeDecode(requestId), auth.user.company_id)
    : await getApprovalPlatformRequestDetailAsync(safeDecode(requestId));
  if (!detail) {
    const drawingNumber = new URL(request.url).searchParams.get("drawing")?.trim() ?? "";
    const drawing = drawingNumber
      ? await getAsyncDatabaseClient().queryOne<{ id: string; drawing_number: string }>(
          `SELECT id, drawing_number FROM drawing_numbers
           WHERE company_id = :companyId AND drawing_number = :drawingNumber LIMIT 1`,
          { companyId: auth.user.company_id, drawingNumber }
        )
      : null;
    const canonicalHref = drawing
      ? drawingRevisionLifecycleLatestHref({ drawingNumber: drawing.drawing_number, drawingNumberId: drawing.id })
      : "/numbering/drawings";
    return NextResponse.json(
      { error: "APPROVAL_REQUEST_GONE", code: "APPROVAL_REQUEST_GONE", message: "此審核已完成，不需再處理。", canonicalHref },
      { status: 410 }
    );
  }
  if (enforced && !isProductionNumberingLifecycleApprovalAction(detail.actionCode)) {
    return NextResponse.json(productionSliceDeniedPayload("approvals.request.detail"), { status: 403 });
  }
  if (detail.actionCode === "numbering.candidate_publication_review" && detail.companyId !== auth.user.company_id) {
    return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
  }
  if (detail.actionCode === "numbering.drawing_revision_lifecycle_review") {
    if (detail.companyId !== auth.user.company_id) {
      return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
    }
    if (!(await isDrawingRevisionLifecycleReviewer(detail.id, auth.user.id))) {
      return NextResponse.json(
        { error: "DRAWING_LIFECYCLE_REVIEWER_NOT_ASSIGNED", code: "DRAWING_LIFECYCLE_REVIEWER_NOT_ASSIGNED", message: "你不是此案目前指派的審核人。" },
        { status: 403 }
      );
    }
  }
  if (detail.actionCode === "numbering.drawing_revision_lifecycle_review") {
    const cleanup = await getDrawingRevisionLifecycleCleanupStateByRequest(detail.id);
    return NextResponse.json({ request: { ...detail, cleanupPending: cleanup.pending } });
  }
  return NextResponse.json({ request: detail });
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
