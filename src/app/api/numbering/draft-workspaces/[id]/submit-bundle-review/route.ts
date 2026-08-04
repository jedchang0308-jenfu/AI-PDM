import { submitNumberingCandidateBundleReview } from "@/lib/number-lifecycle-simplification";
import {
  invalidNumberStateJsonResponse,
  numberStateFlowErrorResponse,
  numberStateFlowJson,
  requireNumberStateCommandAccessAsync,
  validateNumberStateMutationRequest
} from "@/lib/number-state-flow-api";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return invalidNumberStateJsonResponse();
  const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
  if (invalid) return invalid;
  const access = await requireNumberStateCommandAccessAsync(request, "numbering.candidate.review.submit", body);
  if (access.response || !access.metadata) return access.response;
  try {
    const { id } = await params;
    const result = await submitNumberingCandidateBundleReview({
      metadata: access.metadata,
      workspaceId: id,
      expectedWorkspaceRowVersion: body.expectedWorkspaceRowVersion ?? body.expected_workspace_row_version,
      reason: body.reason
    });
    return numberStateFlowJson({ ...result, pdmCompany: access.company });
  } catch (error) {
    return numberStateFlowErrorResponse(error, "Candidate bundle review submission failed.");
  }
}
