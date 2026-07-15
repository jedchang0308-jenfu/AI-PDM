import { withdrawNumberingCandidateReview } from "@/lib/number-state-flow";
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
  const access = await requireNumberStateCommandAccessAsync(request, "numbering.candidate.review.withdraw", body);
  if (access.response || !access.metadata) return access.response;
  try {
    const { id } = await params;
    const result = await withdrawNumberingCandidateReview({
      metadata: access.metadata,
      workspaceId: id,
      expectedRowVersion: body.expectedRowVersion ?? body.expected_row_version
    });
    return numberStateFlowJson({ ...result, pdmCompany: access.company });
  } catch (error) {
    return numberStateFlowErrorResponse(error, "Candidate review withdrawal failed.");
  }
}
