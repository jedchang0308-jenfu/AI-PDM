import { NextResponse } from "next/server";
import { requireAuthAsync, requireRoleAsync } from "@/lib/auth-async";
import {
  applyApprovalPlatformRequestAsync,
  getApprovalPlatformRequestDetailAsync,
  getApprovalPlatformRequestDetailForCompanyAsync
} from "@/lib/approval-platform";
import { approvalApiErrorResponse } from "@/lib/approval-api-error";
import { NumberStateFlowError, retryNumberingCandidateReviewApply } from "@/lib/number-state-flow";
import { validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import {
  requestedNumberingCompanyCodeFromRequest,
  resolveNumberingCompanyContextAsync
} from "@/lib/numbering-company-context";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import { retryNumberingCandidateBundleApply } from "@/lib/number-lifecycle-simplification";
import { numberStateFlowErrorResponse } from "@/lib/number-state-flow-api";
import { isProductionNumberingLifecycleApprovalAction, isProductionNumberingLifecycleGateOpen, isProductionSliceEnforced, productionSliceDeniedPayload } from "@/lib/production-slice";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const decodedRequestId = safeDecode(requestId);
  const authenticated = await requireAuthAsync(request);
  if (authenticated.response) return authenticated.response;
  const company = await resolveNumberingCompanyContextAsync(
    authenticated.user.id,
    requestedNumberingCompanyCodeFromRequest(request, {})
  );
  if (company.response || !company.company) return company.response;
  const detail = await getApprovalPlatformRequestDetailForCompanyAsync(decodedRequestId, company.company.companyId);
  if (!detail) return NextResponse.json({ error: "APPROVAL_REQUEST_NOT_FOUND" }, { status: 404 });
  if (isProductionSliceEnforced()) {
    if (!isProductionNumberingLifecycleGateOpen("formal-obsolete") || !isProductionNumberingLifecycleApprovalAction(detail.actionCode)) {
      return NextResponse.json(productionSliceDeniedPayload("approvals.request.apply"), { status: 403 });
    }
    const invalid = validateNumberStateMutationRequest({
      request,
      idempotencyKey: request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key"),
      requireIdempotency: true
    });
    if (invalid) return invalid;
  }

  if (detail.actionCode === "numbering.candidate_bundle_review") {
    const invalid = validateNumberStateMutationRequest({
      request,
      idempotencyKey: request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key"),
      requireIdempotency: true
    });
    if (invalid) return invalid;
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.candidate.review.decide", body: {} });
    if (access.response || !access.metadata || !access.actor) return access.response;
    if (detail.companyId !== access.actor.organizationId) {
      return NextResponse.json({ error: "APPROVAL_REQUEST_NOT_FOUND" }, { status: 404 });
    }
    try {
      const result = await retryNumberingCandidateBundleApply({ metadata: access.metadata, requestId: decodedRequestId });
      const updated = await getApprovalPlatformRequestDetailAsync(decodedRequestId);
      return NextResponse.json({ request: updated, ...result });
    } catch (error) {
      return numberStateFlowErrorResponse(error, "Candidate bundle formalization retry failed.");
    }
  }

  if (detail.actionCode === "numbering.candidate_publication_review") {
    const invalid = validateNumberStateMutationRequest({
      request,
      idempotencyKey: request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key"),
      requireIdempotency: true
    });
    if (invalid) return invalid;
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.candidate.review.decide", body: {} });
    if (access.response || !access.metadata || !access.actor) return access.response;
    if (detail.companyId !== access.actor.organizationId) {
      return NextResponse.json({ error: "APPROVAL_REQUEST_NOT_FOUND" }, { status: 404 });
    }
    try {
      await retryNumberingCandidateReviewApply({ metadata: access.metadata, requestId: decodedRequestId });
      const updated = await getApprovalPlatformRequestDetailAsync(decodedRequestId);
      return NextResponse.json({ request: updated });
    } catch (error) {
      if (error instanceof NumberStateFlowError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
      return approvalApiErrorResponse(error, "apply", request);
    }
  }

  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;
  try {
    const result = await applyApprovalPlatformRequestAsync({
      requestId: decodedRequestId,
      actor: auth.user
    });
    return NextResponse.json({ request: result });
  } catch (error) {
    return approvalApiErrorResponse(error, "apply", request);
  }
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
