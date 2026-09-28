import { numberStateFlowJson, requireNumberStateCommandAccessAsync, validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import { transferPackageErrorResponse } from "@/lib/transfer-package-api";
import { cancelTransferPackage } from "@/lib/transfer-packages";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return numberStateFlowJson({ error: "invalid_json", message: "請提供有效的 JSON。" }, { status: 400 });
  const invalid = validateNumberStateMutationRequest({ request,
    idempotencyKey: request.headers.get("idempotency-key"), requireIdempotency: true });
  if (invalid) return invalid;
  const access = await requireNumberStateCommandAccessAsync(request, "transfer.package.update", body);
  if (access.response) return access.response;
  const { id } = await params;
  try {
    const workbench = await cancelTransferPackage({
      packageId: id,
      metadata: access.metadata,
      actor: { userId: access.actor.pdmUserId, companyId: access.company.companyId,
        role: "Principal", principalId: access.actor.principalId },
      expectedRowVersion: body.expectedRowVersion ?? body.expected_row_version,
      reason: body.reason
    });
    return numberStateFlowJson({ workbench, pdmCompany: access.company });
  } catch (error) {
    return transferPackageErrorResponse(error, "技轉包取消失敗。");
  }
}
