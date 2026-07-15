import { numberStateFlowJson, requireNumberStateCommandAccessAsync, validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import { publishTransferPackage } from "@/lib/transfer-package-phase1d";
import { requiredTransferVersion, transferPhase1dErrorResponse } from "@/lib/transfer-package-phase1d-api";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return numberStateFlowJson({ error: { code: "invalid_json", message: "請提供有效的 JSON。", retryable: false } }, { status: 400 });
  const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
  if (invalid) return invalid;
  const access = await requireNumberStateCommandAccessAsync(request, "transfer.package.publish", body);
  if (access.response || !access.metadata) return access.response;
  const { id } = await params;
  try {
    const result = await publishTransferPackage({
      metadata: access.metadata,
      packageId: id,
      expectedRowVersion: requiredTransferVersion(body.expectedRowVersion ?? body.expected_row_version)
    });
    return numberStateFlowJson(result);
  } catch (error) {
    return transferPhase1dErrorResponse(error, "publish");
  }
}
