import { NextResponse } from "next/server";
import { saveDrawingRecognitionDecisions } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionJsonBody, recognitionRoles } from "@/lib/drawing-recognition-api";
import { DRAWING_RECOGNITION_CATEGORIES, DrawingRecognitionError, requireSafeRecognitionId, type DrawingRecognitionDecisionAction, type DrawingRecognitionDecisionInput } from "@/lib/drawing-recognition-contract";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

export const runtime = "nodejs";
const actions = new Set<DrawingRecognitionDecisionAction>(["accept", "correct", "map", "create_field", "reassign", "set_baseline", "not_applicable", "ignore", "defer", "restore"]);

function parseDecisions(value: unknown): DrawingRecognitionDecisionInput[] {
  if (!Array.isArray(value)) throw new DrawingRecognitionError("RECOGNITION_DECISIONS_INVALID", "請提供審核決策。", 400);
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new DrawingRecognitionError("RECOGNITION_DECISION_INVALID", "審核決策格式不正確。", 400);
    const raw = item as Record<string, unknown>;
    const action = String(raw.action) as DrawingRecognitionDecisionAction;
    if (!actions.has(action)) throw new DrawingRecognitionError("RECOGNITION_DECISION_ACTION_INVALID", "審核動作不正確。", 400);
    const category = raw.category === undefined ? undefined : String(raw.category);
    if (category !== undefined && !DRAWING_RECOGNITION_CATEGORIES.includes(category as never)) {
      throw new DrawingRecognitionError("RECOGNITION_DECISION_CATEGORY_INVALID", "候選分類不正確。", 400);
    }
    return {
      candidateId: requireSafeRecognitionId(raw.candidateId ?? raw.candidate_id, "RECOGNITION_CANDIDATE_ID_INVALID"),
      action,
      fieldKey: raw.fieldKey == null ? undefined : String(raw.fieldKey), fieldLabel: raw.fieldLabel == null ? undefined : String(raw.fieldLabel),
      value: raw.value === null ? null : raw.value === undefined ? undefined : String(raw.value), category: category as DrawingRecognitionDecisionInput["category"],
      ownerType: raw.ownerType === null ? null : raw.ownerType === undefined ? undefined : String(raw.ownerType),
      ownerId: raw.ownerId === null ? null : raw.ownerId === undefined ? undefined : String(raw.ownerId),
      applicabilityScope: raw.applicabilityScope == null ? undefined : String(raw.applicabilityScope), reason: raw.reason == null ? undefined : String(raw.reason)
    };
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const body = await recognitionJsonBody(request);
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.review", body });
    if (access.response || !access.company || !access.actor) return access.response;
    const { sessionId } = await context.params;
    const expectedRowVersion = Number(body.expectedRowVersion ?? body.expected_row_version);
    if (!Number.isInteger(expectedRowVersion) || expectedRowVersion < 1) throw new DrawingRecognitionError("RECOGNITION_ROW_VERSION_REQUIRED", "缺少目前內容版本。", 400);
    const session = await saveDrawingRecognitionDecisions({
      sessionId: requireSafeRecognitionId(sessionId, "RECOGNITION_SESSION_ID_INVALID"), companyId: access.company.companyId,
      actorId: access.actor.pdmUserId, roles: recognitionRoles(access), expectedRowVersion, decisions: parseDecisions(body.decisions)
    });
    return NextResponse.json({ session }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-sessions.decisions");
  }
}
