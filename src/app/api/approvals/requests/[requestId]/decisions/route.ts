import { NextResponse } from "next/server";
import { requireAuthAsync, requireRoleAsync } from "@/lib/auth-async";
import {
  decideApprovalPlatformRequestAsync,
  getApprovalPlatformRequestDetailAsync,
  getApprovalPlatformRequestDetailForCompanyAsync
} from "@/lib/approval-platform";
import { approvalApiErrorResponse } from "@/lib/approval-api-error";
import { validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import {
  requestedNumberingCompanyCodeFromRequest,
  resolveNumberingCompanyContextAsync
} from "@/lib/numbering-company-context";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import { BomFloatingTopicsUnresolvedError, BomReleaseGateError } from "@/lib/bom-workbench-async";
import { decideTransferPackageReview } from "@/lib/transfer-package-phase1d";
import { transferPhase1dErrorResponse } from "@/lib/transfer-package-phase1d-api";
import {
  decideDrawingRevisionLifecycle,
  drawingRevisionLifecycleErrorPayload
} from "@/lib/drawing-revision-lifecycle";
import { isProductionNumberingLifecycleApprovalAction, isProductionNumberingLifecycleGateOpen, isProductionSliceEnforced, productionSliceDeniedPayload } from "@/lib/production-slice";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const decodedRequestId = safeDecode(requestId);
  const body = await request.json().catch(() => ({}));
  const decision = String(body.decision ?? "").trim();
  if (decision !== "approved" && decision !== "rejected" && decision !== "needs_info") {
    return NextResponse.json({ error: "decision must be approved, rejected, or needs_info" }, { status: 400 });
  }

  const authenticated = await requireAuthAsync(request);
  if (authenticated.response) return authenticated.response;
  const company = await resolveNumberingCompanyContextAsync(
    authenticated.user.id,
    requestedNumberingCompanyCodeFromRequest(request, body as Record<string, unknown>)
  );
  if (company.response || !company.company) return company.response;
  const detail = await getApprovalPlatformRequestDetailForCompanyAsync(decodedRequestId, company.company.companyId);
  if (!detail) return NextResponse.json({ error: "APPROVAL_REQUEST_NOT_FOUND" }, { status: 404 });
  if (isProductionSliceEnforced()) {
    if (!isProductionNumberingLifecycleGateOpen("formal-obsolete") || !isProductionNumberingLifecycleApprovalAction(detail.actionCode)) {
      return NextResponse.json(productionSliceDeniedPayload("approvals.request.decisions"), { status: 403 });
    }
    const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
    const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
    if (invalid) return invalid;
  }

  if (detail.actionCode === "transfer.package_review") {
    const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
    const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
    if (invalid) return invalid;
    const access = await requireNumberingPlatformCommandAsync(request, {
      action: "transfer.package.review.decide",
      body: body as Record<string, unknown>
    });
    if (access.response || !access.metadata || !access.actor) return access.response;
    if (detail.companyId !== access.actor.organizationId) {
      return NextResponse.json({ error: "APPROVAL_REQUEST_NOT_FOUND" }, { status: 404 });
    }
    try {
      await decideTransferPackageReview({
        metadata: access.metadata,
        requestId: decodedRequestId,
        decision,
        comment: nullableText(body.comment ?? body.decisionReason ?? body.decision_reason)
      });
      const updated = await getApprovalPlatformRequestDetailAsync(decodedRequestId);
      return NextResponse.json({ request: updated });
    } catch (error) {
      return transferPhase1dErrorResponse(error, "decision");
    }
  }

  if (detail.actionCode === "numbering.candidate_bundle_review") {
    return NextResponse.json({ error: "WORKBENCH_COMMAND_CONTRACT_RETIRED", message: "舊候選審核命令已退役。" }, { status: 410 });
  }

  if (detail.actionCode === "numbering.candidate_publication_review") {
    return NextResponse.json({ error: "WORKBENCH_COMMAND_CONTRACT_RETIRED", message: "舊候選發布審核命令已退役。" }, { status: 410 });
  }

  if (detail.actionCode === "numbering.drawing_revision_lifecycle_review") {
    const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
    if (auth.response) return auth.response;
    const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key") ?? "";
    try {
      const lifecycle = await decideDrawingRevisionLifecycle({
        requestId: decodedRequestId,
        actorId: auth.user.id,
        actorRole: auth.user.role,
        decision: decision === "approved" ? "approved" : decision === "needs_info" ? "needs_info" : "returned_for_correction",
        reason: nullableText(body.comment ?? body.decisionReason ?? body.decision_reason),
        idempotencyKey
      });
      if (!lifecycle) {
        return NextResponse.json(
          { error: "APPROVAL_REQUEST_GONE", code: "APPROVAL_REQUEST_GONE", canonicalHref: `/numbering/drawings?view=all` },
          { status: 410 }
        );
      }
      return NextResponse.json(
        {
          request: {
            ...detail,
            status: decision,
            decisions: [],
            events: [],
            impactSnapshots: [],
            applyStatus: "applied",
            applyAttempts: 1,
            applyError: null
          },
          lifecycle
        },
        { status: lifecycle.cleanupPending ? 202 : 200 }
      );
    } catch (error) {
      const failure = drawingRevisionLifecycleErrorPayload(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  }

  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  try {
    const result = await decideApprovalPlatformRequestAsync({
      requestId: decodedRequestId,
      decision,
      comment: nullableText(body.comment ?? body.decisionReason ?? body.decision_reason),
      actor: auth.user,
      companyId: company.company.companyId
    });
    return NextResponse.json({ request: result });
  } catch (error) {
    if (error instanceof BomReleaseGateError) {
      return NextResponse.json(
        {
          error: error.message,
          message: bomReleaseGateMessage(error.issues),
          issues: error.issues
        },
        { status: 409 }
      );
    }
    if (error instanceof BomFloatingTopicsUnresolvedError) {
      return NextResponse.json(
        {
          error: error.message,
          message: `BOM 尚有 ${error.floatingTopicCount} 個未歸位項目，請駁回後完成歸位再重送。`,
          floatingTopicCount: error.floatingTopicCount
        },
        { status: 409 }
      );
    }
    return approvalApiErrorResponse(error, "decision", request);
  }
}

function bomReleaseGateMessage(issues: BomReleaseGateError["issues"]) {
  const first = issues[0];
  const partNumber = first?.part_number?.trim();
  const subject = partNumber ? `子件 ${partNumber}` : "BOM 子件";
  const reason =
    first?.code === "child_not_released"
      ? "尚未發行"
      : first?.code === "child_outdated_revision"
        ? "不是最新已發行版次"
        : first?.code === "missing_child_revision" || first?.code === "missing_child_item"
          ? "找不到可供核准的正式版次"
          : "未符合發行條件";
  const remaining = issues.length > 1 ? `，另有 ${issues.length - 1} 項` : "";
  return `BOM 尚無法核准：${subject} ${reason}${remaining}。請駁回後修正 BOM 再重送。`;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}
