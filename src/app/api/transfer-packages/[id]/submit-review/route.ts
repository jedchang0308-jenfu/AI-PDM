import { numberStateFlowJson, validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";
import { submitTransferPackageReview } from "@/lib/transfer-package-phase1d";
import { requiredTransferVersion, transferPhase1dErrorResponse } from "@/lib/transfer-package-phase1d-api";

import { withTransferReviewCommand } from "@/lib/platform-command-context";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return numberStateFlowJson({ error: { code: "invalid_json", message: "請提供有效的 JSON。", retryable: false } }, { status: 400 });
  const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
  if (invalid) return invalid;
  const { id } = await params;
  try {
    return await withTransferReviewCommand(request, { action: "transfer.package.review.submit", body },
      async (_client, metadata) => numberStateFlowJson(await submitTransferPackageReview({
        metadata,
        packageId: id,
        expectedRowVersion: requiredTransferVersion(body.expectedRowVersion ?? body.expected_row_version),
        reason: String(body.reason ?? "技術移轉整包審核").trim().slice(0, 1000)
      })));
  } catch (error) {
    return transferPhase1dErrorResponse(error, "submit_review");
  }
}
