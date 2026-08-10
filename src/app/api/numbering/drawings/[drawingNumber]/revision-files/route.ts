import { NextResponse } from "next/server";

import { createMasterAttachmentAsync, getMasterAttachmentAsync } from "@/lib/master-attachments-async";
import { drawingUploadRoleForExtension, reconcileDrawingCadAssetPointer, registerDrawingCadAssetForReuse } from "@/lib/pdm-file-ownership";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { masterAttachmentStatusFromError } from "@/lib/master-attachment-response";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ drawingNumber: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.attachments.manage");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const { drawingNumber } = await params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: { code: "DRAWING_REVISION_FILE_REQUIRED", message: "請選擇圖面或工程附件。" } }, { status: 400 });
  }
  const role = drawingUploadRoleForExtension(file.name);
  if (!role) {
    return NextResponse.json(
      { error: { code: "DRAWING_REVISION_FILE_ROLE_INVALID", message: "圖面進版接受 .SLDDRW、.SLDPRT、.SLDASM、.PDF、.DWG/.DXF、.STEP/.STP、.IGES/.IGS/.IGF、.X_T/.X_B、.SAT、.STL 或 .JT。" } },
      { status: 400 }
    );
  }

  try {
    const attachment = await createMasterAttachmentAsync({
      entityType: "drawing_number",
      entityCode: decodeURIComponent(drawingNumber),
      file,
      documentCategory: role,
      displayName: String(form.get("display_name") ?? file.name),
      description: String(form.get("description") ?? "圖面進版受控原始檔"),
      revision: String(form.get("revision") ?? ""),
      uploadedBy: auth.user.id
    });
    const client = getAsyncDatabaseClient();
    const reuse = role === "cad_3d" ? await registerDrawingCadAssetForReuse(client, {
      companyId: companyResult.company.companyId,
      drawingNumberId: attachment.entityId,
      assetId: attachment.id,
      contentHash: attachment.contentHash,
      fileSize: attachment.fileSize,
      revision: attachment.revision ?? "",
      actorId: auth.user.id
    }) : null;
    const reconciled = role === "cad_3d" && reuse?.reused
      ? await reconcileDrawingCadAssetPointer(client, {
          assetId: attachment.id,
          canonicalAssetId: reuse.canonicalAssetId
        })
      : null;
    const responseAttachment = reconciled?.reconciled
      ? await getMasterAttachmentAsync({
          entityType: "drawing_number",
          entityCode: decodeURIComponent(drawingNumber),
          attachmentId: attachment.id
        })
      : attachment;
    return NextResponse.json({ attachment: responseAttachment, role, reuse: role === "cad_3d" && reuse ? { ...reuse, reconciled } : null }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DRAWING_REVISION_FILE_CREATE_FAILED";
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}
