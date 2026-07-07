import { NextResponse } from "next/server";
import {
  getMasterAttachmentAsync,
  getMasterAttachmentBytesAsync,
  getMasterAttachmentPreviewDerivativeBytesAsync,
  softDeleteMasterAttachmentAsync,
  syncMasterAttachmentToDriveAsync
} from "@/lib/master-attachments-async";
import { buildMasterAttachmentFileResponse, masterAttachmentStatusFromError } from "@/lib/master-attachment-response";
import { contentDispositionFilename } from "@/lib/file-response";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ drawingNumber: string; attachmentId: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.drawings.view");
  if (auth.response) return auth.response;

  const { drawingNumber, attachmentId } = await params;
  try {
    const searchParams = new URL(request.url).searchParams;
    const derivativeId = searchParams.get("previewDerivative");
    if (derivativeId) {
      const derivative = await getMasterAttachmentPreviewDerivativeBytesAsync({
        entityType: "drawing_number",
        entityCode: decodeURIComponent(drawingNumber),
        attachmentId,
        derivativeId
      });
      if (!derivative) return NextResponse.json({ error: "PREVIEW_DERIVATIVE_NOT_FOUND" }, { status: 404 });
      return new Response(new Uint8Array(derivative.bytes), {
        headers: {
          "content-type": derivative.mimeType,
          "content-length": String(derivative.bytes.byteLength),
          "content-disposition": `inline; filename="${contentDispositionFilename(derivative.fileName)}"`,
          "x-content-type-options": "nosniff",
          "cache-control": "private, no-store"
        }
      });
    }
    const result = await getMasterAttachmentBytesAsync({
      entityType: "drawing_number",
      entityCode: decodeURIComponent(drawingNumber),
      attachmentId
    });
    if (!result) return NextResponse.json({ error: "MASTER_ATTACHMENT_NOT_FOUND" }, { status: 404 });
    const disposition = searchParams.get("preview") === "1" ? "inline" : "attachment";
    return buildMasterAttachmentFileResponse({ ...result, disposition });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MASTER_ATTACHMENT_DOWNLOAD_FAILED";
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ drawingNumber: string; attachmentId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.attachments.manage");
  if (auth.response) return auth.response;

  const { drawingNumber, attachmentId } = await params;
  try {
    const current = await getMasterAttachmentAsync({
      entityType: "drawing_number",
      entityCode: decodeURIComponent(drawingNumber),
      attachmentId
    });
    if (!current) return NextResponse.json({ error: "MASTER_ATTACHMENT_NOT_FOUND" }, { status: 404 });
    const attachment = await syncMasterAttachmentToDriveAsync({ attachmentId, actorId: auth.user.id });
    return NextResponse.json({ attachment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MASTER_ATTACHMENT_SYNC_FAILED";
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ drawingNumber: string; attachmentId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.attachments.manage");
  if (auth.response) return auth.response;

  const { drawingNumber, attachmentId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    await softDeleteMasterAttachmentAsync({
      entityType: "drawing_number",
      entityCode: decodeURIComponent(drawingNumber),
      attachmentId,
      deletedBy: auth.user.id,
      reason: String(body.reason ?? "")
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MASTER_ATTACHMENT_DELETE_FAILED";
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}
