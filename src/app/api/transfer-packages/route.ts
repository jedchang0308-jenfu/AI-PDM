import { numberStateFlowJson, validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import { requireTransferPackageAccessAsync, transferPackageErrorResponse } from "@/lib/transfer-package-api";
import { createTransferPackageDraft } from "@/lib/transfer-packages";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return numberStateFlowJson({ error: "invalid_json", message: "請提供有效的 JSON。" }, { status: 400 });
  const invalid = validateNumberStateMutationRequest({ request, idempotencyKey: request.headers.get("Idempotency-Key"), requireIdempotency: true });
  if (invalid) return invalid;
  const access = await requireTransferPackageAccessAsync(request, body, "transfer.package.create");
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
    return numberStateFlowJson({ workbench, pdmCompany: access.company }, { status: 201 });
  } catch (error) {
    return transferPackageErrorResponse(error, "技轉包建立失敗。");
  }
}
