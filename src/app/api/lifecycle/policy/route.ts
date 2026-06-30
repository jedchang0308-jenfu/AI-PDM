import { NextResponse } from "next/server";
import { getMasterAttachmentLifecyclePolicyAsync } from "@/lib/master-attachments-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType");
  const parentType = url.searchParams.get("parentType");
  const parentCode = url.searchParams.get("parentCode");
  const attachmentId = url.searchParams.get("attachmentId");

  if (entityType !== "master_attachment") {
    return NextResponse.json({ error: "LIFE_UNSUPPORTED_ENTITY" }, { status: 400 });
  }
  if (parentType !== "part_number" && parentType !== "drawing_number") {
    return NextResponse.json({ error: "LIFE_ATTACHMENT_PARENT_INVALID" }, { status: 409 });
  }
  if (!parentCode || !attachmentId) {
    return NextResponse.json({ error: "LIFE_ATTACHMENT_NOT_FOUND" }, { status: 404 });
  }

  const pagePermission = parentType === "drawing_number" ? "numbering.drawings.view" : "numbering.search";
  const auth = await requireNumberingPageAsync(request, pagePermission);
  if (auth.response) return auth.response;

  const policy = await getMasterAttachmentLifecyclePolicyAsync({
    entityType: parentType,
    entityCode: parentCode,
    attachmentId
  });
  if (!policy) return NextResponse.json({ error: "LIFE_ATTACHMENT_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ policy });
}
