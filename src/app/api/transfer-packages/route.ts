import { NextResponse } from "next/server";
import { requireTransferPackageAccessAsync, transferPackageErrorResponse } from "@/lib/transfer-package-api";
import { createTransferPackageDraft } from "@/lib/transfer-packages";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const access = await requireTransferPackageAccessAsync(request, body);
  if (access.response) return access.response;
  try {
    const workbench = await createTransferPackageDraft({
      actor: access.actor,
      idempotencyKey: request.headers.get("Idempotency-Key"),
      title: body.title,
      caseType: body.caseType ?? body.case_type,
      caseReason: body.caseReason ?? body.case_reason,
      sourceReferenceStatus: body.sourceReferenceStatus ?? body.source_reference_status,
      sourceReference: body.sourceReference ?? body.source_reference,
      sourceReferenceReason: body.sourceReferenceReason ?? body.source_reference_reason,
      sourceType: body.sourceType ?? body.source_type,
      sourceId: body.sourceId ?? body.source_id
    });
    return NextResponse.json({ workbench, pdmCompany: access.company }, { status: 201 });
  } catch (error) {
    return transferPackageErrorResponse(error, "技轉包建立失敗。");
  }
}
