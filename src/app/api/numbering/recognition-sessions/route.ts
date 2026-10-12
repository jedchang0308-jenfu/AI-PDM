import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createDrawingRecognitionSession } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionJsonBody } from "@/lib/drawing-recognition-api";
import { DrawingRecognitionError, requireSafeRecognitionId, type DrawingRecognitionSourceContextType } from "@/lib/drawing-recognition-contract";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import { withPrincipalDrawingRecognitionMutation } from "@/lib/drawing-recognition-principal-mutation";

export const runtime = "nodejs";

type DenialStage = "initial_guard" | "write_snapshot" | "business";
const denialReasons = new Set([
  "permission_not_granted", "permission_explicit_deny", "entitlement_assignment_not_found",
  "entitlement_role_inactive", "entitlement_scope_mismatch", "entitlement_authority_unknown",
  "RECOGNITION_PERMISSION_DENIED", "RECOGNITION_REQUEST_PROOF_INVALID",
  "RECOGNITION_VERIFIED_ACTOR_MISMATCH", "RECOGNITION_PRINCIPAL_REQUIRED",
  "platform_actor_company_mismatch"
]);

/** One coarse event at the route boundary; never include request, actor or exception data. */
async function recordDenial(response: Response, stage: DenialStage) {
  if (response.status !== 403) return response;
  const body = await response.clone().json().catch(() => null) as
    { code?: unknown; error?: unknown } | null;
  const error = body?.error;
  const candidate = body?.code ?? (typeof error === "string" ? error :
    error && typeof error === "object" ? (error as { code?: unknown }).code : null);
  const reason = typeof candidate === "string" && denialReasons.has(candidate)
    ? candidate : "unclassified_denial";
  const requestId = randomUUID();
  console.warn(JSON.stringify({ severity: "WARNING", event: "recognition_create_denied", stage, reason, requestId }));
  response.headers.set("x-recognition-request-id", requestId);
  return response;
}

export async function POST(request: Request) {
  let stage: DenialStage = "initial_guard";
  try {
    const body = await recognitionJsonBody(request);
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.run", body });
    if (access.response || !access.company || !access.actor) {
      return recordDenial(access.response, stage);
    }
    const sourceContextType = String(body.sourceContextType ?? body.source_context_type ?? "") as DrawingRecognitionSourceContextType;
    if (!["candidate_revision", "revision_package", "drawing_revision", "drawing_number"].includes(sourceContextType)) {
      throw new DrawingRecognitionError("RECOGNITION_CONTEXT_TYPE_INVALID", "辨識來源類型不正確。", 400);
    }
    const sourceAssetIds = Array.isArray(body.sourceAssetIds)
      ? body.sourceAssetIds.map((id) => requireSafeRecognitionId(id, "RECOGNITION_SOURCE_ID_INVALID"))
      : undefined;
    stage = "write_snapshot";
    const session = await withPrincipalDrawingRecognitionMutation({
      metadata: access.metadata, permissionCode: "numbering.recognition.run",
      actorId: access.actor.pdmUserId, companyId: access.company.companyId,
      execute: (snapshot, _decision, verified) => {
        stage = "business";
        return createDrawingRecognitionSession({
        companyId: access.company.companyId,
        actorId: access.actor.pdmUserId,
        initiatorPrincipalId: verified.session.principalId,
        sourceContextType,
        sourceContextId: requireSafeRecognitionId(body.sourceContextId ?? body.source_context_id, "RECOGNITION_CONTEXT_ID_INVALID"),
        sourceAssetIds, client: snapshot
        });
      }
    });
    return NextResponse.json({ session }, { status: 201, headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recordDenial(recognitionErrorResponse(error, "recognition-sessions.create"), stage);
  }
}
