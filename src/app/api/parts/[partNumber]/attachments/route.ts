import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { NextResponse } from "next/server";
import { executeMasterAttachmentUploadAsync, listMasterAttachmentsInCompanyAsync } from "@/lib/master-attachments-async";
import { masterAttachmentCommandFailureResponse } from "@/lib/master-attachment-response";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

export const runtime = "nodejs";
const noStoreHeaders = { "cache-control": "private, no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const { partNumber } = await params;
  const deleted = new URL(request.url).searchParams.get("surface") === "deleted_data";
  const permissions = deleted
    ? [{ permissionKind: "action" as const, permissionCode: "numbering.attachments.manage" }]
    : [{ permissionKind: "page" as const, permissionCode: "numbering.search" }];
  const response = await withPrincipalNumberingCompanyRead(request, permissions, async (snapshot, company) => {
    const result = await listMasterAttachmentsInCompanyAsync(snapshot, {
      entityType: "part_number", entityCode: decodeURIComponent(partNumber),
      companyId: company.companyId, deleted
    });
    if (!result) return NextResponse.json({ error: "PART_NUMBER_NOT_FOUND" }, { status: 404, headers: noStoreHeaders });
    return NextResponse.json({ ...result, ...(deleted ? { surface: "deleted_data" } : {}) }, { headers: noStoreHeaders });
  });
  return response ?? NextResponse.json({ code: "auth_session_invalid" }, { status: 401, headers: noStoreHeaders });
}

export async function POST(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const access = await requireNumberingPlatformCommandAsync(request,{action:"numbering.attachments.manage"});
  if (access.response) return access.response;
  const {partNumber} = await params;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({error:"MASTER_ATTACHMENT_FILE_REQUIRED"},{status:400,headers:noStoreHeaders});
    }
    const attachment = await executeMasterAttachmentUploadAsync({
      entityType:"part_number",entityCode:decodeURIComponent(partNumber),file,
      documentCategory:String(form.get("document_category") ?? "other"),
      displayName:String(form.get("display_name") ?? ""),description:String(form.get("description") ?? ""),
      revision:String(form.get("revision") ?? "")
    },access.metadata);
    return NextResponse.json({attachment},{status:201,headers:noStoreHeaders});
  } catch (error) {
    return masterAttachmentCommandFailureResponse(error);
  }
}
