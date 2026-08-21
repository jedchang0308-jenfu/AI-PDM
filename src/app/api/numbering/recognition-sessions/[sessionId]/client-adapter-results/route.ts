import { NextResponse } from "next/server";
import { appendDrawingRecognitionClientAdapterResult } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionJsonBody, recognitionRoles } from "@/lib/drawing-recognition-api";
import {
  DRAWING_RECOGNITION_CATEGORIES,
  DrawingRecognitionError,
  boundedText,
  parseRecognitionConfidence,
  requireSafeRecognitionId,
  type DrawingRecognitionObservationInput
} from "@/lib/drawing-recognition-contract";
import { BROWSER_PDF_OCR_ADAPTER_CODE } from "@/lib/drawing-recognition-adapters";
import { DRAWING_OCR_POLICY } from "@/lib/drawing-ocr-priority-policy";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

export const runtime = "nodejs";
const BODY_LIMIT = 512 * 1024;

function parseObservation(value: unknown): DrawingRecognitionObservationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DrawingRecognitionError("RECOGNITION_OBSERVATION_INVALID", "PDF 辨識欄位格式不正確。", 400);
  const raw = value as Record<string, unknown>;
  const rawText = boundedText(raw.rawText, 1_000);
  const rawValue = boundedText(raw.rawValue, DRAWING_OCR_POLICY.limits.maxValueCharacters);
  const normalizedValue = boundedText(raw.normalizedValue, DRAWING_OCR_POLICY.limits.maxValueCharacters);
  const category = String(raw.category ?? "");
  if (!rawText || !rawValue || !normalizedValue || !DRAWING_RECOGNITION_CATEGORIES.includes(category as never)) {
    throw new DrawingRecognitionError("RECOGNITION_OBSERVATION_INVALID", "PDF 辨識欄位缺少必要內容。", 400);
  }
  const geometry = raw.geometry && typeof raw.geometry === "object" && !Array.isArray(raw.geometry) ? raw.geometry as Record<string, unknown> : null;
  if (geometry && JSON.stringify(geometry).length > 2_000) throw new DrawingRecognitionError("RECOGNITION_OBSERVATION_GEOMETRY_LIMIT", "PDF 辨識定位資料超過限制。", 400);
  const pageNumber = Number(raw.pageNumber);
  return {
    rawText,
    rawValue,
    normalizedValue,
    locationKind: boundedText(raw.locationKind, 80, "pdf") || "pdf",
    pageNumber: Number.isInteger(pageNumber) && pageNumber > 0 && pageNumber <= 10_000 ? pageNumber : null,
    sheetName: raw.sheetName == null ? null : boundedText(raw.sheetName, 200),
    configurationName: raw.configurationName == null ? null : boundedText(raw.configurationName, 200),
    geometry,
    confidenceBand: parseRecognitionConfidence(raw.confidenceBand),
    category: category as DrawingRecognitionObservationInput["category"],
    fieldKey: boundedText(raw.fieldKey, 120) || null,
    fieldLabel: boundedText(raw.fieldLabel, 200) || null,
    proposedOwnerType: raw.proposedOwnerType == null ? null : boundedText(raw.proposedOwnerType, 80),
    proposedOwnerId: raw.proposedOwnerId == null ? null : boundedText(raw.proposedOwnerId, 200),
    proposedOwnerResolution: raw.proposedOwnerResolution === "resolved" || raw.proposedOwnerResolution === "ambiguous" || raw.proposedOwnerResolution === "missing" ? raw.proposedOwnerResolution : undefined,
    applicabilityScope: boundedText(raw.applicabilityScope, 120, "overall") || "overall"
  };
}

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const body = await recognitionJsonBody(request, BODY_LIMIT);
    for (const prohibited of ["bytes", "pdf", "base64", "canvas", "pageBitmap", "words", "wordArray"]) {
      if (Object.hasOwn(body, prohibited)) throw new DrawingRecognitionError("RECOGNITION_CLIENT_PAYLOAD_PROHIBITED", "辨識結果不可包含原始文件、影像或完整文字陣列。", 400);
    }
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.run", body });
    if (access.response || !access.company || !access.actor) return access.response;
    const { sessionId: rawSessionId } = await context.params;
    const expectedRowVersion = Number(body.expectedRowVersion);
    if (!Number.isInteger(expectedRowVersion) || expectedRowVersion < 1) throw new DrawingRecognitionError("RECOGNITION_ROW_VERSION_INVALID", "辨識版本不正確。", 400);
    const contentHash = String(body.contentHash ?? "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/u.test(contentHash)) throw new DrawingRecognitionError("RECOGNITION_SOURCE_HASH_INVALID", "PDF 內容指紋格式不正確。", 400);
    const adapterCode = String(body.adapterCode ?? "").trim();
    if (adapterCode !== BROWSER_PDF_OCR_ADAPTER_CODE) throw new DrawingRecognitionError("RECOGNITION_CLIENT_ADAPTER_INVALID", "瀏覽器辨識 adapter 不正確。", 400);
    const adapterVersion = String(body.adapterVersion ?? "").trim();
    if (!/^[A-Za-z0-9._:+-]{1,80}$/u.test(adapterVersion)) throw new DrawingRecognitionError("RECOGNITION_CLIENT_ADAPTER_VERSION_INVALID", "瀏覽器辨識版本不正確。", 400);
    const status = String(body.status ?? "");
    if (!["succeeded", "partial", "unsupported", "failed", "timeout"].includes(status)) throw new DrawingRecognitionError("RECOGNITION_CLIENT_ADAPTER_STATUS_INVALID", "瀏覽器辨識結果狀態不正確。", 400);
    const diagnostics = Array.isArray(body.diagnostics) ? body.diagnostics.map((value) => String(value).trim()) : [];
    if (diagnostics.length > 20 || diagnostics.some((value) => !/^[A-Za-z0-9_:+,=.-]{1,300}$/u.test(value))) {
      throw new DrawingRecognitionError("RECOGNITION_CLIENT_DIAGNOSTICS_INVALID", "瀏覽器辨識診斷格式不正確。", 400);
    }
    const rawObservations = Array.isArray(body.observations) ? body.observations : [];
    if (rawObservations.length > DRAWING_OCR_POLICY.limits.observationsPerSource) throw new DrawingRecognitionError("RECOGNITION_OBSERVATION_LIMIT", "單一 PDF 辨識結果超過限制。", 400);
    const session = await appendDrawingRecognitionClientAdapterResult({
      sessionId: requireSafeRecognitionId(rawSessionId, "RECOGNITION_SESSION_ID_INVALID"),
      companyId: access.company.companyId,
      actorId: access.actor.pdmUserId,
      roles: recognitionRoles(access),
      result: {
        expectedRowVersion,
        sourceId: requireSafeRecognitionId(body.sourceId, "RECOGNITION_SOURCE_ID_INVALID"),
        contentHash,
        adapterCode,
        adapterVersion,
        status: status as "succeeded" | "partial" | "unsupported" | "failed" | "timeout",
        diagnostics,
        observations: rawObservations.map(parseObservation)
      }
    });
    return NextResponse.json({ session }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-sessions.client-adapter-results");
  }
}
