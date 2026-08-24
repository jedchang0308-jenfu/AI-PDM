import { NextResponse } from "next/server";
import {
  getMasterAttachmentAsync,
  softDeleteMasterAttachmentAsync,
  syncMasterAttachmentToDriveAsync
} from "@/lib/master-attachments-async";
import { masterAttachmentStatusFromError } from "@/lib/master-attachment-response";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ partNumber: string; attachmentId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.attachments.manage");
  if (auth.response) return auth.response;

  const { partNumber, attachmentId } = await params;
  try {
    const current = await getMasterAttachmentAsync({
      entityType: "part_number",
      entityCode: decodeURIComponent(partNumber),
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

export async function DELETE(request: Request, { params }: { params: Promise<{ partNumber: string; attachmentId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.attachments.manage");
  if (auth.response) return auth.response;

  const { partNumber, attachmentId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    await softDeleteMasterAttachmentAsync({
      entityType: "part_number",
      entityCode: decodeURIComponent(partNumber),
      attachmentId,
      deletedBy: auth.user.id,
      reason: String(body.reason ?? "")
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MASTER_ATTACHMENT_DELETE_FAILED";
    if (message.includes("PART_PREVIEW_ACTIVE_ASSET")) {
      return NextResponse.json({
        error: {
          code: "PART_PREVIEW_ACTIVE_ASSET",
          message: "請先恢復使用主要製造圖或更換預覽圖"
        }
      }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}
