import { getNumberingDraftWorkspace, updateNumberingDraftWorkspace } from "@/lib/number-state-flow";
import {
  numberStateFlowErrorResponse,
  numberStateFlowJson,
  invalidNumberStateJsonResponse,
  requireNumberStateCommandAccessAsync,
  requireNumberStateReadAccessAsync,
  validateNumberStateMutationRequest
} from "@/lib/number-state-flow-api";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireNumberStateReadAccessAsync(request, "numbering.workspace.view");
  if (access.response) return access.response;
  try {
    const { id } = await params;
    const workspace = await getNumberingDraftWorkspace({ actor: access.actor, workspaceId: id });
    return numberStateFlowJson({ workspace, pdmCompany: access.company });
  } catch (error) {
    return numberStateFlowErrorResponse(error, "Draft workspace read failed.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const invalid = validateNumberStateMutationRequest({ request });
  if (invalid) return invalid;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return invalidNumberStateJsonResponse();
  const access = await requireNumberStateCommandAccessAsync(request, "numbering.workspace.update", body);
  if (access.response || !access.actor) return access.response;
  try {
    const { id } = await params;
    const expectedRowVersion = body.expectedRowVersion ?? body.expected_row_version;
    const workspace = await updateNumberingDraftWorkspace({ actor: access.actor, workspaceId: id, expectedRowVersion, body });
    return numberStateFlowJson({ workspace, pdmCompany: access.company });
  } catch (error) {
    return numberStateFlowErrorResponse(error, "Draft workspace update failed.");
  }
}
