import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { createMasterAttachmentAsync, getMasterAttachmentAsync, listMasterAttachmentsAsync } from "@/lib/master-attachments-async";
import { drawingUploadRoleForExtension, reconcileDrawingCadAssetPointer, registerDrawingCadAssetForReuse } from "@/lib/pdm-file-ownership";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { masterAttachmentStatusFromError } from "@/lib/master-attachment-response";
import { findExactRevisionFileReuse } from "@/lib/revision-file-idempotency";

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
  const entityCode = decodeURIComponent(drawingNumber);
  const revision = String(form.get("revision") ?? "").trim();
  const fileBytes = Buffer.from(await file.arrayBuffer());
  const contentHash = createHash("sha256").update(fileBytes).digest("hex");

  try {
    const attachment = await createMasterAttachmentAsync({
      entityType: "drawing_number",
      entityCode,
      file,
      documentCategory: role,
      displayName: String(form.get("display_name") ?? file.name),
      description: String(form.get("description") ?? "圖面進版受控原始檔"),
      revision,
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
          entityCode,
          attachmentId: attachment.id
        })
      : attachment;
    return NextResponse.json({ attachment: responseAttachment, role, reuse: role === "cad_3d" && reuse ? { ...reuse, reconciled } : null }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DRAWING_REVISION_FILE_CREATE_FAILED";
    if (message === "MASTER_ATTACHMENT_DUPLICATE_ACTIVE_FILE") {
      const existing = findExactRevisionFileReuse(
        (await listMasterAttachmentsAsync({ entityType: "drawing_number", entityCode }))?.attachments ?? [],
        {
          documentCategory: role,
          revision,
          fileName: file.name,
          fileSize: fileBytes.byteLength,
          contentHash
        }
      );
      if (existing) {
        return NextResponse.json({
          attachment: existing,
          role,
          reuse: {
            reused: true,
            sameRevision: true,
            canonicalAssetId: existing.id,
            matchBasis: "sha256_size_revision_role_filename"
          }
        });
      }
    }
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}
