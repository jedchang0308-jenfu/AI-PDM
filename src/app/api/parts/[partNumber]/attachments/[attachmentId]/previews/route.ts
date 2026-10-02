import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import { NextResponse } from "next/server";
import { executeMasterAttachmentCommandAsync, getMasterAttachmentInCompanyAsync } from "@/lib/master-attachments-async";
import { masterAttachmentCommandFailureResponse } from "@/lib/master-attachment-response";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ partNumber: string; attachmentId: string }> }) {
  const { partNumber, attachmentId } = await params;
  const response = await withPrincipalNumberingCompanyRead(request, "numbering.search", async (snapshot, company) => {
    const attachment = await getMasterAttachmentInCompanyAsync(snapshot, {
      entityType: "part_number", entityCode: decodeURIComponent(partNumber), attachmentId,
      companyId: company.companyId
    });
    if (!attachment) return NextResponse.json({ error: "MASTER_ATTACHMENT_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ derivatives: attachment.previewDerivatives, job: attachment.previewJob },
      { headers: { "cache-control": "private, no-store" } });
  });
  return response ?? NextResponse.json({ code: "auth_session_invalid" }, { status: 401 });
}

export async function POST(request: Request, { params }: { params: Promise<{ partNumber: string; attachmentId: string }> }) {
  const body = await request.json().catch(() => ({}));
  const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.attachments.manage", body });
  if (access.response) return access.response;
  const { partNumber, attachmentId } = await params;
  try {
    const result = await executeMasterAttachmentCommandAsync({
      kind: "preview",
      entityType: "part_number",
      entityCode: decodeURIComponent(partNumber),
      attachmentId,
      requestedKind: body.requestedKind === "drawing_pdf" ? "drawing_pdf" : "native_thumbnail_png",
      forceRegenerate: body.forceRegenerate === true
    }, access.metadata);
    return NextResponse.json(result);
  } catch (error) {
    return masterAttachmentCommandFailureResponse(error);
  }
}
