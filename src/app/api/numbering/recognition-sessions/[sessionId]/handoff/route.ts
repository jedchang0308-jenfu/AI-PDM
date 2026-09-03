import { NextResponse } from "next/server";
import { CanonicalWorkbenchError, canonicalErrorEnvelope } from "@/lib/pdm-canonical-workbench-contract";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { recognitionJsonBody } from "@/lib/drawing-recognition-api";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { verifyCanonicalWorkbenchCommandContract } from "@/lib/pdm-workbench-authority-control";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import { resolveDrawingRecognitionPartWorkAccess } from "@/lib/drawing-recognition-part-work-access";
import { handoffDrawingRecognitionToPartWorks } from "@/lib/drawing-recognition-part-work-handoff";

export const runtime = "nodejs";

function inputError(message: string) { return new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", message, 400); }

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const body = await recognitionJsonBody(request, 64 * 1024);
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.formalize", body });
    if (access.response || !access.company || !access.actor || !access.metadata) return access.response;
    await verifyCanonicalWorkbenchCommandContract(getAsyncDatabaseClient(), {
      companyId: access.company.companyId,
      actorId: access.actor.pdmUserId,
      token: request.headers.get("x-pdm-workbench-contract")?.trim() ?? ""
    });
    const expectedRowVersion = Number(body.expectedRowVersion ?? body.expected_row_version);
    if (!Number.isInteger(expectedRowVersion) || expectedRowVersion < 1) throw inputError("缺少目前辨識內容版本。");
    const sourceFingerprint = String(body.expectedSourceSetFingerprint ?? body.expected_source_set_fingerprint ?? "").trim();
    const relationFingerprint = String(body.expectedRelationScopeFingerprint ?? body.expected_relation_scope_fingerprint ?? "").trim();
    if (!sourceFingerprint || !relationFingerprint) throw inputError("缺少目前來源或關聯料號版本。");
    const { sessionId: rawSessionId } = await context.params;
    const sessionId = requireSafeRecognitionId(rawSessionId, "RECOGNITION_SESSION_ID_INVALID");
    const workAccess = await resolveDrawingRecognitionPartWorkAccess(access.auth.user);
    const result = await handoffDrawingRecognitionToPartWorks({
      sessionId,
      companyId: access.company.companyId,
      actorId: access.actor.pdmUserId,
      expectedRowVersion,
      expectedSourceSetFingerprint: sourceFingerprint,
      expectedRelationScopeFingerprint: relationFingerprint,
      draft: { commonValues: body.commonValues ?? body.common_values, overrides: body.overrides },
      metadata: access.metadata,
      access: workAccess
    });
    return NextResponse.json({ handoff: result }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof CanonicalWorkbenchError) {
      const envelope = canonicalErrorEnvelope(error);
      return NextResponse.json(envelope.body, { status: envelope.status, headers: { "cache-control": "private, no-store" } });
    }
    console.error("Recognition Part Work handoff failed.", error);
    return NextResponse.json({ error: { code: "RECOGNITION_HANDOFF_INTERNAL", message: "辨識資料暫時無法移交，請稍後重試。", retryable: true } }, { status: 500, headers: { "cache-control": "private, no-store" } });
  }
}
