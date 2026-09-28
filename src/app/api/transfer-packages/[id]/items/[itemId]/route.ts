import { numberStateFlowJson, requireNumberStateCommandAccessAsync, validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import { transferPackageErrorResponse } from "@/lib/transfer-package-api";
import { removeTransferPackageScopeItem } from "@/lib/transfer-packages";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return numberStateFlowJson({ error: "invalid_json", message: "請提供有效的 JSON。" }, { status: 400 });
  const invalid = validateNumberStateMutationRequest({ request,
    idempotencyKey: request.headers.get("idempotency-key"), requireIdempotency: true });
  if (invalid) return invalid;
  const access = await requireNumberStateCommandAccessAsync(request, "transfer.package.update", body);
  if (access.response) return access.response;
  const { id, itemId } = await params;
  try {
    const workbench = await removeTransferPackageScopeItem({
      packageId: id,
      itemId,
      metadata: access.metadata,
      actor: { userId: access.actor.pdmUserId, companyId: access.company.companyId,
        role: "Principal", principalId: access.actor.principalId },
      expectedRowVersion: body.expectedRowVersion ?? body.expected_row_version
    });
    return numberStateFlowJson({ workbench, pdmCompany: access.company });
  } catch (error) {
    return transferPackageErrorResponse(error, "技轉包範圍移除失敗。");
  }
}
