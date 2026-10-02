import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { NextResponse } from "next/server";
import { listMasterAttachmentsInCompanyAsync } from "@/lib/master-attachments-async";

export const runtime = "nodejs";
const noStoreHeaders = { "cache-control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ drawingNumber: string }> }) {
  const { drawingNumber } = await params;
  const deleted = new URL(request.url).searchParams.get("surface") === "deleted_data";
  const permissions = deleted
    ? [{ permissionKind: "action" as const, permissionCode: "numbering.attachments.manage" }]
    : [{ permissionKind: "page" as const, permissionCode: "numbering.drawings.view" }];
  const response = await withPrincipalNumberingCompanyRead(request, permissions, async (snapshot, company) => {
    const result = await listMasterAttachmentsInCompanyAsync(snapshot, {
      entityType: "drawing_number", entityCode: decodeURIComponent(drawingNumber),
      companyId: company.companyId, deleted
    });
    if (!result) return NextResponse.json({ error: "DRAWING_NUMBER_NOT_FOUND" }, { status: 404, headers: noStoreHeaders });
    return NextResponse.json({ ...result, ...(deleted ? { surface: "deleted_data" } : {}) }, { headers: noStoreHeaders });
  });
  return response ?? NextResponse.json({ code: "auth_session_invalid" }, { status: 401, headers: noStoreHeaders });
}

export async function POST(request: Request, { params }: { params: Promise<{ drawingNumber: string }> }) {
  const { drawingNumber } = await params;
  return NextResponse.json(
    {
      error: {
        code: "DRAWING_REFERENCE_UPLOAD_RETIRED",
        message: "圖號一般附件上傳已退役；請從圖號工作台開啟該圖號的進版工作，上傳 2D 原始檔與 3D CAD。"
      },
      canonicalHref: `/numbering/drawings?query=${encodeURIComponent(decodeURIComponent(drawingNumber))}`
    },
    { status: 410 }
  );
}
