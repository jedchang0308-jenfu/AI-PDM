import { numberStateFlowJson, requireNumberStateCommandAccessAsync, validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import { removeTransferDraftWorkspace } from "@/lib/transfer-package-phase1d";
import { requiredTransferVersion, transferPhase1dErrorResponse } from "@/lib/transfer-package-phase1d-api";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return numberStateFlowJson({ error: { code: "invalid_json", message: "請提供有效的 JSON。", retryable: false } }, { status: 400 });
  const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
  if (invalid) return invalid;
  const access = await requireNumberStateCommandAccessAsync(request, "transfer.package.update", body);
  if (access.response || !access.actor || !access.metadata) return access.response;
  const { id, itemId } = await params;
  try {
    const result = await removeTransferDraftWorkspace({
      metadata: access.metadata,
      actor: { userId: access.actor.pdmUserId, companyId: access.actor.organizationId, role: access.auth.user.role },
      packageId: id,
      itemId,
      expectedRowVersion: requiredTransferVersion(body.expectedRowVersion ?? body.expected_row_version),
      reason: String(body.reason ?? "").trim().slice(0, 500)
    });
    return numberStateFlowJson({ ...result, pdmCompany: access.company });
  } catch (error) {
    return transferPhase1dErrorResponse(error, "remove_draft_workspace");
  }
}
