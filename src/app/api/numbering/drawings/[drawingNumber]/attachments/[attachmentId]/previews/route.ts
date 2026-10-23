import { NextResponse } from "next/server";
import { executeMasterAttachmentCommandAsync, getMasterAttachmentAsync } from "@/lib/master-attachments-async";
import { masterAttachmentCommandFailureResponse } from "@/lib/master-attachment-response";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

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
  const body = await request.json().catch(() => ({}));
  const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.attachments.manage", body });
  if (access.response) return access.response;
  const { drawingNumber, attachmentId } = await params;
  try {
    const result = await executeMasterAttachmentCommandAsync({
      kind: "preview",
      entityType: "drawing_number",
      entityCode: decodeURIComponent(drawingNumber),
      attachmentId,
      requestedKind: body.requestedKind === "drawing_pdf" ? "drawing_pdf" : "native_thumbnail_png",
      forceRegenerate: body.forceRegenerate === true
    }, access.metadata);
    return NextResponse.json(result);
  } catch (error) {
    return masterAttachmentCommandFailureResponse(error);
  }
}
