import { acquireNumberingDraftCandidates, createNumberingDraftWorkspace, listNumberingDraftWorkspaces } from "@/lib/number-state-flow";
import {
  numberStateFlowErrorResponse,
  numberStateFlowJson,
  invalidNumberStateJsonResponse,
  requireNumberStateCommandAccessAsync,
  requireNumberStateReadAccessAsync,
  validateNumberStateMutationRequest
} from "@/lib/number-state-flow-api";

export const runtime = "nodejs";
const IDEMPOTENCY_HEADER = "Idempotency-Key";

function derivedIdempotencyKey(base: string, suffix: string) {
  const normalized = base.trim();
  const appended = `${normalized}:${suffix}`;
  if (appended.length <= 200) return appended;
  return `${normalized.slice(0, Math.max(1, 199 - suffix.length))}:${suffix}`;
}

export async function GET(request: Request) {
  const access = await requireNumberStateReadAccessAsync(request, "numbering.workspace.view");
  if (access.response) return access.response;
  try {
    const url = new URL(request.url);
    const workspaces = await listNumberingDraftWorkspaces({
      actor: access.actor,
      owner: url.searchParams.get("owner") === "all" ? "all" : "mine",
      lifecycleStatus: url.searchParams.get("lifecycleStatus") ?? url.searchParams.get("lifecycle_status"),
      limit: url.searchParams.get("limit")
    });
    return numberStateFlowJson({ workspaces, pdmCompany: access.company });
  } catch (error) {
    return numberStateFlowErrorResponse(error, "Draft workspace list failed.");
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return invalidNumberStateJsonResponse();
  const idempotencyKey = request.headers.get(IDEMPOTENCY_HEADER) ?? request.headers.get("x-idempotency-key");
  const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
  if (invalid) return invalid;
  const access = await requireNumberStateCommandAccessAsync(request, "numbering.workspace.create", body);
  if (access.response || !access.metadata) return access.response;
  const autoAcquireCandidates = body.autoAcquireCandidates === true || body.auto_acquire_candidates === true;
  const acquireAccess = autoAcquireCandidates
    ? await requireNumberStateCommandAccessAsync(request, "numbering.candidate.acquire", body)
    : null;
  if (acquireAccess?.response || (autoAcquireCandidates && !acquireAccess?.metadata)) {
    return acquireAccess?.response ?? invalidNumberStateJsonResponse();
  }
  try {
    const result = await createNumberingDraftWorkspace({ metadata: access.metadata, body });
    if (autoAcquireCandidates && acquireAccess?.metadata) {
      const acquired = await acquireNumberingDraftCandidates({
        metadata: {
          ...acquireAccess.metadata,
          idempotencyKey: derivedIdempotencyKey(acquireAccess.metadata.idempotencyKey, "auto-acquire")
        },
        workspaceId: result.workspace.id,
        expectedRowVersion: result.workspace.rowVersion
      });
      return numberStateFlowJson(
        { ...acquired, autoAcquiredCandidates: true, pdmCompany: access.company },
        { status: result.idempotentReplay ? 200 : 201 }
      );
    }
    return numberStateFlowJson({ ...result, pdmCompany: access.company }, { status: result.idempotentReplay ? 200 : 201 });
  } catch (error) {
    return numberStateFlowErrorResponse(error, "Draft workspace creation failed.");
  }
}
