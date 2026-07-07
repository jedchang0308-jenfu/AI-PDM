import { NextResponse } from "next/server";
import { createMasterAttachmentAsync, listDeletedMasterAttachmentsAsync, listMasterAttachmentsAsync } from "@/lib/master-attachments-async";
import { masterAttachmentStatusFromError } from "@/lib/master-attachment-response";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";
const noStoreHeaders = { "cache-control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;

  const { partNumber } = await params;
  const surface = new URL(request.url).searchParams.get("surface");
  if (surface === "deleted_data") {
    const result = await listDeletedMasterAttachmentsAsync({
      entityType: "part_number",
      entityCode: decodeURIComponent(partNumber)
    });
    if (!result) return NextResponse.json({ error: "PART_NUMBER_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ entity: result.entity, attachments: result.attachments, surface: "deleted_data" }, { headers: noStoreHeaders });
  }

  const result = await listMasterAttachmentsAsync({
    entityType: "part_number",
    entityCode: decodeURIComponent(partNumber)
  });
  if (!result) return NextResponse.json({ error: "PART_NUMBER_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ entity: result.entity, attachments: result.attachments }, { headers: noStoreHeaders });
}

export async function POST(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.attachments.manage");
  if (auth.response) return auth.response;

  const { partNumber } = await params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "MASTER_ATTACHMENT_FILE_REQUIRED" }, { status: 400 });
  }

  try {
    const attachment = await createMasterAttachmentAsync({
      entityType: "part_number",
      entityCode: decodeURIComponent(partNumber),
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
