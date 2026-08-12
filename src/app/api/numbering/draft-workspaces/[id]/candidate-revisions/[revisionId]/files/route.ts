import {
  addNumberingCandidateRevisionFile,
  verifyExistingNumberingCandidateRevisionFile
} from "@/lib/number-lifecycle-simplification";
import {
  invalidNumberStateJsonResponse,
  numberStateFlowErrorResponse,
  numberStateFlowJson,
  requireNumberStateCommandAccessAsync,
  validateNumberStateMultipartMutationRequest,
  validateNumberStateMutationRequest
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
      displayName: body.displayName,
      description: body.description
    });
    return numberStateFlowJson({ ...result, pdmCompany: access.company }, { status: 201 });
  } catch (error) {
    return numberStateFlowErrorResponse(
      error,
      "首版主要檔案尚未加入，請保留原檔並重新上傳；若持續失敗，請聯絡系統管理員。"
    );
  }
}

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
    const result = await verifyExistingNumberingCandidateRevisionFile({
      metadata: access.metadata,
      workspaceId: id,
      candidateRevisionId: revisionId,
      fileId: typeof body.fileId === "string" ? body.fileId : typeof body.file_id === "string" ? body.file_id : "",
      expectedRowVersion: body.expectedRowVersion ?? body.expected_row_version
    });
    return numberStateFlowJson({ ...result, pdmCompany: access.company });
  } catch (error) {
    return numberStateFlowErrorResponse(
      error,
      "既有檔案尚未完成驗證；檔案會保留，請重新整理後再試，或重新上傳原檔。"
    );
  }
}
