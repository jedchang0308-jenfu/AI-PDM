import { NextResponse } from "next/server";
import { enqueueMasterAttachmentPreviewJobAsync, getMasterAttachmentAsync } from "@/lib/master-attachments-async";
import { masterAttachmentStatusFromError } from "@/lib/master-attachment-response";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ drawingNumber: string; attachmentId: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.drawings.view");
  if (auth.response) return auth.response;

  const { drawingNumber, attachmentId } = await params;
  const attachment = await getMasterAttachmentAsync({
    entityType: "drawing_number",
    entityCode: decodeURIComponent(drawingNumber),
    attachmentId
  });
  if (!attachment) return NextResponse.json({ error: "MASTER_ATTACHMENT_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ derivatives: attachment.previewDerivatives, job: attachment.previewJob });
}

export async function POST(request: Request, { params }: { params: Promise<{ drawingNumber: string; attachmentId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.attachments.manage");
  if (auth.response) return auth.response;

  const { drawingNumber, attachmentId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const result = await enqueueMasterAttachmentPreviewJobAsync({
      entityType: "drawing_number",
      entityCode: decodeURIComponent(drawingNumber),
      attachmentId,
      actorUserId: auth.user.id,
      requestedKind: body.requestedKind === "drawing_pdf" ? "drawing_pdf" : "native_thumbnail_png",
      forceRegenerate: body.forceRegenerate === true
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MASTER_ATTACHMENT_PREVIEW_JOB_FAILED";
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}
