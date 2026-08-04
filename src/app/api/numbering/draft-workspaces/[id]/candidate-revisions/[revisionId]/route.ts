import { updateNumberingCandidateRevision } from "@/lib/number-lifecycle-simplification";
import {
  invalidNumberStateJsonResponse,
  numberStateFlowErrorResponse,
  numberStateFlowJson,
  requireNumberStateCommandAccessAsync,
  validateNumberStateMutationRequest
} from "@/lib/number-state-flow-api";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; revisionId: string }> }
) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return invalidNumberStateJsonResponse();
  const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
  if (invalid) return invalid;
  const access = await requireNumberStateCommandAccessAsync(request, "numbering.draft.update", body);
  if (access.response || !access.metadata) return access.response;
  try {
    const { id, revisionId } = await params;
    const result = await updateNumberingCandidateRevision({
      metadata: access.metadata,
      workspaceId: id,
      candidateRevisionId: revisionId,
      revision: body.revision,
      overrideReason: body.overrideReason ?? body.override_reason,
      expectedRowVersion: body.expectedRowVersion ?? body.expected_row_version
    });
    return numberStateFlowJson({ ...result, pdmCompany: access.company });
  } catch (error) {
    return numberStateFlowErrorResponse(error, "Candidate revision update failed.");
  }
}
