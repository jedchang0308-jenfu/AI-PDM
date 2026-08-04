import { removeNumberingCandidateRevisionFile } from "@/lib/number-lifecycle-simplification";
import {
  invalidNumberStateJsonResponse,
  numberStateFlowErrorResponse,
  numberStateFlowJson,
  requireNumberStateCommandAccessAsync,
  validateNumberStateMutationRequest
} from "@/lib/number-state-flow-api";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; revisionId: string; fileId: string }> }
) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return invalidNumberStateJsonResponse();
  const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
  if (invalid) return invalid;
  const access = await requireNumberStateCommandAccessAsync(request, "numbering.draft.update", body);
  if (access.response || !access.metadata) return access.response;
  try {
    const { id, revisionId, fileId } = await params;
    const result = await removeNumberingCandidateRevisionFile({
      metadata: access.metadata,
      workspaceId: id,
      candidateRevisionId: revisionId,
      fileId,
      expectedRowVersion: body.expectedRowVersion ?? body.expected_row_version,
      reason: body.reason
    });
    return numberStateFlowJson({ ...result, pdmCompany: access.company });
  } catch (error) {
    return numberStateFlowErrorResponse(error, "Candidate revision file removal failed.");
  }
}
