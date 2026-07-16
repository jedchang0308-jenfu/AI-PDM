import { numberStateFlowJson, requireNumberStateCommandAccessAsync, validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import { addTransferDraftWorkspace } from "@/lib/transfer-package-phase1d";
import { requiredTransferVersion, transferPhase1dErrorResponse } from "@/lib/transfer-package-phase1d-api";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return numberStateFlowJson({ error: { code: "invalid_json", message: "請提供有效的 JSON。", retryable: false } }, { status: 400 });
  const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
  if (invalid) return invalid;
  const access = await requireNumberStateCommandAccessAsync(request, "transfer.package.update", body);
  if (access.response || !access.actor || !access.metadata) return access.response;
  const { id } = await params;
  try {
    const result = await addTransferDraftWorkspace({
      metadata: access.metadata,
      actor: {
        userId: access.actor.pdmUserId,
        companyId: access.actor.organizationId,
        role: access.auth.user.role
      },
      packageId: id,
      expectedRowVersion: requiredTransferVersion(body.expectedRowVersion ?? body.expected_row_version),
      workspaceId: String(body.workspaceId ?? body.workspace_id ?? "").trim(),
      requiredness: body.requiredness === "optional" ? "optional" : "required",
      inclusionReason: String(body.inclusionReason ?? body.inclusion_reason ?? "技轉範圍").trim().slice(0, 500)
    });
    return numberStateFlowJson({ ...result, pdmCompany: access.company });
  } catch (error) {
    return transferPhase1dErrorResponse(error, "add_draft_workspace");
  }
}
