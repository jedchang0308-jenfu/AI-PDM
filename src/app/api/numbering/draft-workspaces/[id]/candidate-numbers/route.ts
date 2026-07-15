import { acquireNumberingDraftCandidates } from "@/lib/number-state-flow";
import {
  numberStateFlowErrorResponse,
  numberStateFlowJson,
  invalidNumberStateJsonResponse,
  requireNumberStateCommandAccessAsync,
  validateNumberStateMutationRequest
} from "@/lib/number-state-flow-api";

export const runtime = "nodejs";
const IDEMPOTENCY_HEADER = "Idempotency-Key";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return invalidNumberStateJsonResponse();
  const idempotencyKey = request.headers.get(IDEMPOTENCY_HEADER) ?? request.headers.get("x-idempotency-key");
  const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
  if (invalid) return invalid;
  const access = await requireNumberStateCommandAccessAsync(request, "numbering.candidate.acquire", body);
  if (access.response || !access.metadata) return access.response;
  try {
    const { id } = await params;
    const expectedRowVersion = body.expectedRowVersion ?? body.expected_row_version;
    const result = await acquireNumberingDraftCandidates({ metadata: access.metadata, workspaceId: id, expectedRowVersion });
    return numberStateFlowJson({ ...result, pdmCompany: access.company });
  } catch (error) {
    return numberStateFlowErrorResponse(error, "Candidate allocation failed.");
  }
}
