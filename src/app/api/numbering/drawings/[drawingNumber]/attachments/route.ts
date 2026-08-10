import { NextResponse } from "next/server";
import { listDeletedMasterAttachmentsAsync, listMasterAttachmentsAsync } from "@/lib/master-attachments-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";
const noStoreHeaders = { "cache-control": "private, no-store" };

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
    return NextResponse.json({ entity: result.entity, attachments: result.attachments, surface: "deleted_data" }, { headers: noStoreHeaders });
  }

  const result = await listMasterAttachmentsAsync({
    entityType: "drawing_number",
    entityCode: decodeURIComponent(drawingNumber),
    actorUserId: auth.user.id
  });
  if (!result) return NextResponse.json({ error: "DRAWING_NUMBER_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ entity: result.entity, attachments: result.attachments }, { headers: noStoreHeaders });
}

export async function POST(request: Request, { params }: { params: Promise<{ drawingNumber: string }> }) {
  const { drawingNumber } = await params;
  return NextResponse.json(
    {
      error: {
        code: "DRAWING_REFERENCE_UPLOAD_RETIRED",
        message: "圖號一般附件上傳已退役；請從圖面進版工作台上傳 2D 原始檔與 3D CAD。"
      },
      canonicalHref: `/numbering/revisions?drawingNumber=${encodeURIComponent(decodeURIComponent(drawingNumber))}`
    },
    { status: 410 }
  );
}
