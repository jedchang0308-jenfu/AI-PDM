import { numberStateFlowJson, validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import { transferPackageErrorResponse } from "@/lib/transfer-package-api";
import { getTransferPackageWorkbench, updateTransferPackageHeader } from "@/lib/transfer-packages";
import { requestedPdmCompanyCodeFromRequest } from "@/lib/company-context";
import { withPrincipalCompanyRead } from "@/lib/principal-company-read";
import { requireNumberStateCommandAccessAsync } from "@/lib/number-state-flow-api";
import { resolveJenfuRoutePolicyFromRequest } from "@/lib/jenfu-route-permission-map";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const routePath = "src/app/api/transfer-packages/[id]/route.ts";
  const policy = resolveJenfuRoutePolicyFromRequest(request, "transfer.package.view");
  if (policy?.path !== routePath || policy.scopeResolver !== "workspace") {
    return numberStateFlowJson({ code: "principal_route_policy_unavailable" }, { status: 503 });
  }
  const { id } = await params;
  return await withPrincipalCompanyRead(request, requestedPdmCompanyCodeFromRequest(request),
    [{ permissionKind: "action", permissionCode: "transfer.package.view" }],
    async (snapshot, company) => {
      try {
        const workbench = await getTransferPackageWorkbench(id, company.companyId, snapshot);
        return numberStateFlowJson({ workbench, pdmCompany: company });
      } catch (error) {
        return transferPackageErrorResponse(error, "技轉包讀取失敗。");
      }
    }) ?? numberStateFlowJson({ code: "auth_session_invalid" }, { status: 401 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return numberStateFlowJson({ error: "invalid_json", message: "請提供有效的 JSON。" }, { status: 400 });
  const invalid = validateNumberStateMutationRequest({ request,
    idempotencyKey: request.headers.get("idempotency-key"), requireIdempotency: true });
  if (invalid) return invalid;
  const access = await requireNumberStateCommandAccessAsync(request, "transfer.package.update", body);
  if (access.response) return access.response;
  const { id } = await params;
  try {
    const workbench = await updateTransferPackageHeader({
      packageId: id,
      metadata: access.metadata,
      actor: { userId: access.actor.pdmUserId, companyId: access.company.companyId,
        role: "Principal", principalId: access.actor.principalId },
      expectedRowVersion: body.expectedRowVersion ?? body.expected_row_version,
      title: body.title,
      caseType: body.caseType ?? body.case_type,
      caseReason: body.caseReason ?? body.case_reason,
      sourceReferenceStatus: body.sourceReferenceStatus ?? body.source_reference_status,
      sourceReference: body.sourceReference ?? body.source_reference,
      sourceReferenceReason: body.sourceReferenceReason ?? body.source_reference_reason
    });
    return numberStateFlowJson({ workbench, pdmCompany: access.company });
  } catch (error) {
    return transferPackageErrorResponse(error, "技轉包儲存失敗。");
  }
}
