import { NextResponse } from "next/server";
import { readDrawingRecognitionPdfSource } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionRoles } from "@/lib/drawing-recognition-api";
import { DrawingRecognitionError, requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

export const runtime = "nodejs";

function contentDisposition(fileName: string) {
  const normalized = fileName.replace(/[\r\n"\\]/gu, "_").slice(0, 180) || "drawing.pdf";
  const asciiFallback = normalized.normalize("NFKD").replace(/[^\x20-\x7e]/gu, "_");
  const encoded = encodeURIComponent(normalized).replace(/['()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: Request, context: { params: Promise<{ sessionId: string; sourceId: string }> }) {
  try {
    if (request.headers.has("range")) throw new DrawingRecognitionError("RECOGNITION_PDF_RANGE_UNSUPPORTED", "PDF 辨識只接受一次完整的受控內容讀取。", 416);
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.review" });
    if (access.response || !access.company || !access.actor) return access.response;
    const params = await context.params;
    const result = await readDrawingRecognitionPdfSource({
      sessionId: requireSafeRecognitionId(params.sessionId, "RECOGNITION_SESSION_ID_INVALID"),
      sourceId: requireSafeRecognitionId(params.sourceId, "RECOGNITION_SOURCE_ID_INVALID"),
      companyId: access.company.companyId,
      actorId: access.actor.pdmUserId,
      roles: recognitionRoles(access)
    });
    return new NextResponse(result.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "content-type": "application/pdf",
        "content-length": String(result.bytes.byteLength),
        "content-hash": result.contentHash,
        "content-disposition": contentDisposition(result.fileName),
        "accept-ranges": "none",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-sessions.pdf-content");
  }
}
