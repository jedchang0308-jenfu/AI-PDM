import { NextResponse } from "next/server";
import {
  getMasterAttachmentAsync,
  getMasterAttachmentBytesAsync,
  softDeleteMasterAttachmentAsync,
  syncMasterAttachmentToDriveAsync
} from "@/lib/master-attachments-async";
import { buildMasterAttachmentFileResponse, masterAttachmentStatusFromError } from "@/lib/master-attachment-response";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ partNumber: string; attachmentId: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;

  const { partNumber, attachmentId } = await params;
  try {
    const result = await getMasterAttachmentBytesAsync({
      entityType: "part_number",
      entityCode: decodeURIComponent(partNumber),
      attachmentId
    });
    if (!result) return NextResponse.json({ error: "MASTER_ATTACHMENT_NOT_FOUND" }, { status: 404 });
    const disposition = new URL(request.url).searchParams.get("preview") === "1" ? "inline" : "attachment";
    return buildMasterAttachmentFileResponse({ ...result, disposition });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MASTER_ATTACHMENT_DOWNLOAD_FAILED";
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}

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
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}
