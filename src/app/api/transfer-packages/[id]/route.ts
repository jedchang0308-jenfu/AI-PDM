import { numberStateFlowJson, validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import { requireTransferPackageAccessAsync, transferPackageErrorResponse } from "@/lib/transfer-package-api";
import { getTransferPackageWorkbench, updateTransferPackageHeader } from "@/lib/transfer-packages";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireTransferPackageAccessAsync(request);
  if (access.response) return access.response;
  const { id } = await params;
  try {
    const workbench = await getTransferPackageWorkbench(id, access.company.companyId);
    return numberStateFlowJson({ workbench, pdmCompany: access.company });
  } catch (error) {
    return transferPackageErrorResponse(error, "技轉包讀取失敗。");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return numberStateFlowJson({ error: "invalid_json", message: "請提供有效的 JSON。" }, { status: 400 });
  const invalid = validateNumberStateMutationRequest({ request });
  if (invalid) return invalid;
  const access = await requireTransferPackageAccessAsync(request, body, "transfer.package.update");
  if (access.response) return access.response;
  const { id } = await params;
  try {
    const workbench = await updateTransferPackageHeader({
      packageId: id,
      actor: access.actor,
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
