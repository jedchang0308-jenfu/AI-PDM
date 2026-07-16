import { NextResponse } from "next/server";
import { requireAuthAsync, requireRoleAsync } from "@/lib/auth-async";
import {
  decideApprovalPlatformRequestAsync,
  getApprovalPlatformRequestDetailAsync,
  getApprovalPlatformRequestDetailForCompanyAsync
} from "@/lib/approval-platform";
import { approvalApiErrorResponse } from "@/lib/approval-api-error";
import { decideNumberingCandidateReview, NumberStateFlowError } from "@/lib/number-state-flow";
import { validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import {
  requestedNumberingCompanyCodeFromRequest,
  resolveNumberingCompanyContextAsync
} from "@/lib/numbering-company-context";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import { decideTransferPackageReview } from "@/lib/transfer-package-phase1d";
import { transferPhase1dErrorResponse } from "@/lib/transfer-package-phase1d-api";

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

  if (detail.actionCode === "numbering.candidate_publication_review") {
    const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
    const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
    if (invalid) return invalid;
    const access = await requireNumberingPlatformCommandAsync(request, {
      action: "numbering.candidate.review.decide",
      body: body as Record<string, unknown>
    });
    if (access.response || !access.metadata || !access.actor) return access.response;
    if (detail.companyId !== access.actor.organizationId) {
      return NextResponse.json({ error: "APPROVAL_REQUEST_NOT_FOUND" }, { status: 404 });
    }
    try {
      await decideNumberingCandidateReview({
        metadata: access.metadata,
        requestId: decodedRequestId,
        decision,
        comment: nullableText(body.comment ?? body.decisionReason ?? body.decision_reason)
      });
      const updated = await getApprovalPlatformRequestDetailAsync(decodedRequestId);
      if (!updated) return NextResponse.json({ error: "APPROVAL_REQUEST_NOT_FOUND" }, { status: 404 });
      return NextResponse.json({ request: updated });
    } catch (error) {
      if (error instanceof NumberStateFlowError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
      return approvalApiErrorResponse(error, "decision", request);
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
      companyId: String(body.companyId ?? body.company_id ?? "").trim() || undefined,
      basisQty: numberOrUndefined(body.basisQty ?? body.basis_qty)
    });
    return NextResponse.json({ request: result });
  } catch (error) {
    return approvalApiErrorResponse(error, "decision", request);
  }
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

function numberOrUndefined(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
