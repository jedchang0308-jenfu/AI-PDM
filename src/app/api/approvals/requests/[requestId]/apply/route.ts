import { NextResponse } from "next/server";
import { requireAuthAsync, requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import {
  applyApprovalPlatformRequestAsync,
  getApprovalPlatformRequestDetailForCompanyAsync
} from "@/lib/approval-platform";
import { approvalApiErrorResponse } from "@/lib/approval-api-error";
import { validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import {
  requestedNumberingCompanyCodeFromRequest,
  resolveNumberingCompanyContextAsync
} from "@/lib/numbering-company-context";
import { isProductionNumberingLifecycleApprovalAction, isProductionNumberingLifecycleGateOpen, isProductionSliceEnforced, productionSliceDeniedPayload } from "@/lib/production-slice";
import { projectApprovalDecisionFeedback } from "@/lib/approval-outcome-feedback";

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
    return NextResponse.json({ error: "WORKBENCH_COMMAND_CONTRACT_RETIRED", message: "舊候選正式化命令已退役。" }, { status: 410 });
  }

  if (detail.actionCode === "numbering.candidate_publication_review") {
    return NextResponse.json({ error: "WORKBENCH_COMMAND_CONTRACT_RETIRED", message: "舊候選發布正式化命令已退役。" }, { status: 410 });
  }

  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"], { permissionCode: "approval.request.apply" });
  if (auth.response) return auth.response;
  try {
    const result = await applyApprovalPlatformRequestAsync({
      requestId: decodedRequestId,
      actor: auth.user
    });
    return NextResponse.json({ request: result, outcome: projectApprovalDecisionFeedback(result) });
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
