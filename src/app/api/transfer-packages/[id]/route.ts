import { NextResponse } from "next/server";
import { requireTransferPackageAccessAsync, transferPackageErrorResponse } from "@/lib/transfer-package-api";
import { getTransferPackageWorkbench, updateTransferPackageHeader } from "@/lib/transfer-packages";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireTransferPackageAccessAsync(request);
  if (access.response) return access.response;
  const { id } = await params;
  try {
    const workbench = await getTransferPackageWorkbench(id, access.company.companyId);
    return NextResponse.json({ workbench, pdmCompany: access.company });
  } catch (error) {
    return transferPackageErrorResponse(error, "技轉包讀取失敗。");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const access = await requireTransferPackageAccessAsync(request, body);
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
    return NextResponse.json({ workbench, pdmCompany: access.company });
  } catch (error) {
    return transferPackageErrorResponse(error, "技轉包儲存失敗。");
  }
}
