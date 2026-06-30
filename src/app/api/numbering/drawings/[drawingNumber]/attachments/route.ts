import { NextResponse } from "next/server";
import { createMasterAttachmentAsync, listDeletedMasterAttachmentsAsync, listMasterAttachmentsAsync } from "@/lib/master-attachments-async";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { masterAttachmentStatusFromError } from "@/lib/master-attachment-response";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ drawingNumber: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.drawings.view");
  if (auth.response) return auth.response;

  const { drawingNumber } = await params;
  const surface = new URL(request.url).searchParams.get("surface");
  if (surface === "deleted_data") {
    const result = await listDeletedMasterAttachmentsAsync({
      entityType: "drawing_number",
      entityCode: decodeURIComponent(drawingNumber)
    });
    if (!result) return NextResponse.json({ error: "DRAWING_NUMBER_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ entity: result.entity, attachments: result.attachments, surface: "deleted_data" });
  }

  const result = await listMasterAttachmentsAsync({
    entityType: "drawing_number",
    entityCode: decodeURIComponent(drawingNumber)
  });
  if (!result) return NextResponse.json({ error: "DRAWING_NUMBER_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ entity: result.entity, attachments: result.attachments });
}

export async function POST(request: Request, { params }: { params: Promise<{ drawingNumber: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.attachments.manage");
  if (auth.response) return auth.response;

  const { drawingNumber } = await params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "MASTER_ATTACHMENT_FILE_REQUIRED" }, { status: 400 });
  }

  try {
    const attachment = await createMasterAttachmentAsync({
      entityType: "drawing_number",
      entityCode: decodeURIComponent(drawingNumber),
      file,
      documentCategory: String(form.get("document_category") ?? "other"),
      displayName: String(form.get("display_name") ?? ""),
      description: String(form.get("description") ?? ""),
      revision: String(form.get("revision") ?? ""),
      uploadedBy: auth.user.id
    });
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MASTER_ATTACHMENT_CREATE_FAILED";
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}
