import { NextResponse } from "next/server";
import { getMasterAttachmentLifecyclePolicyAsync, restoreMasterAttachmentAsync } from "@/lib/master-attachments-async";
import { masterAttachmentStatusFromError } from "@/lib/master-attachment-response";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ drawingNumber: string; attachmentId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.attachments.manage");
  if (auth.response) return auth.response;

  const { drawingNumber, attachmentId } = await params;
  const body = await request.json().catch(() => ({}));
  const entityCode = decodeURIComponent(drawingNumber);

  try {
    const attachment = await restoreMasterAttachmentAsync({
      entityType: "drawing_number",
      entityCode,
      attachmentId,
      restoredBy: auth.user.id,
      reason: String(body.reason ?? "")
    });
    if (!attachment) return NextResponse.json({ error: "LIFE_ATTACHMENT_NOT_FOUND" }, { status: 404 });
    const policy = await getMasterAttachmentLifecyclePolicyAsync({
      entityType: "drawing_number",
      entityCode,
      attachmentId
    });
    return NextResponse.json({ attachment, policy });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LIFE_ATTACHMENT_RESTORE_FAILED";
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}
