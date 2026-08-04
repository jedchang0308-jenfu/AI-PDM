import { createNumberingCandidateRevision } from "@/lib/number-lifecycle-simplification";
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
  const access = await requireNumberStateCommandAccessAsync(request, "numbering.draft.update", body);
  if (access.response || !access.metadata) return access.response;
  try {
    const { id } = await params;
    const result = await createNumberingCandidateRevision({
      metadata: access.metadata,
      workspaceId: id,
      drawingDraftId: body.drawingDraftId ?? body.drawing_draft_id,
      expectedWorkspaceRowVersion: body.expectedWorkspaceRowVersion ?? body.expected_workspace_row_version
    });
    return numberStateFlowJson({ ...result, pdmCompany: access.company }, { status: 201 });
  } catch (error) {
    return numberStateFlowErrorResponse(error, "Candidate revision creation failed.");
  }
}
