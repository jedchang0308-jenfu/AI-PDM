import { addNumberingCandidateRevisionFile } from "@/lib/number-lifecycle-simplification";
import {
  numberStateFlowErrorResponse,
  numberStateFlowJson,
  requireNumberStateCommandAccessAsync,
  validateNumberStateMultipartMutationRequest
} from "@/lib/number-state-flow-api";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; revisionId: string }> }
) {
  const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  const invalid = validateNumberStateMultipartMutationRequest({ request, idempotencyKey, requireIdempotency: true });
  if (invalid) return invalid;
  const form = await request.formData().catch(() => null);
  if (!form) return numberStateFlowJson({ error: { code: "candidate_file_required", message: "A valid multipart body is required.", retryable: false } }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) {
    return numberStateFlowJson({ error: { code: "candidate_file_required", message: "A candidate revision file is required.", retryable: false } }, { status: 400 });
  }
  const body: Record<string, unknown> = {
    role: String(form.get("role") ?? ""),
    isPrimary: String(form.get("isPrimary") ?? form.get("is_primary") ?? ""),
    expectedRowVersion: String(form.get("expectedRowVersion") ?? form.get("expected_row_version") ?? ""),
    displayName: String(form.get("displayName") ?? form.get("display_name") ?? ""),
    description: String(form.get("description") ?? "")
  };
  const access = await requireNumberStateCommandAccessAsync(request, "numbering.draft.update", body);
  if (access.response || !access.metadata) return access.response;
  try {
    const { id, revisionId } = await params;
    const result = await addNumberingCandidateRevisionFile({
      metadata: access.metadata,
      workspaceId: id,
      candidateRevisionId: revisionId,
      expectedRowVersion: body.expectedRowVersion,
      file,
      role: body.role,
      isPrimary: body.isPrimary,
      displayName: body.displayName,
      description: body.description
    });
    return numberStateFlowJson({ ...result, pdmCompany: access.company }, { status: 201 });
  } catch (error) {
    return numberStateFlowErrorResponse(error, "Candidate revision file upload failed.");
  }
}
