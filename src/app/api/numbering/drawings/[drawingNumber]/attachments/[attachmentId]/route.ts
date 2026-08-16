import { NextResponse } from "next/server";
import {
  getMasterAttachmentAsync,
  getMasterAttachmentBytesAsync,
  getMasterAttachmentPreviewDerivativeBytesAsync,
  softDeleteMasterAttachmentAsync,
  syncMasterAttachmentToDriveAsync
} from "@/lib/master-attachments-async";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { buildMasterAttachmentFileResponse, masterAttachmentStatusFromError } from "@/lib/master-attachment-response";
import { contentDispositionHeader } from "@/lib/file-response";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { requireAuthAsync } from "@/lib/auth-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { PdmReviewScopeError, resolvePdmReviewScopeReceiptAsync } from "@/lib/pdm-review-scope";
import type { PdmEntityKey } from "@/lib/pdm-entity-detail-contract";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ drawingNumber: string; attachmentId: string }> }) {
  const reviewRequestId = new URL(request.url).searchParams.get("reviewRequestId");
  const auth = reviewRequestId ? await requireAuthAsync(request) : await requireNumberingPageAsync(request, "numbering.drawings.view");
  if (auth.response) return auth.response;

  const { drawingNumber, attachmentId } = await params;
  try {
    if (reviewRequestId) {
      const company = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
      if (company.response) return company.response;
      const decodedDrawingNumber = decodeURIComponent(drawingNumber);
      const drawing = await getAsyncDatabaseClient().queryOne<{ id: string }>(
        `SELECT id FROM drawing_numbers WHERE company_id = :companyId AND drawing_number = :drawingNumber`,
        { companyId: company.company.companyId, drawingNumber: decodedDrawingNumber }
      );
      const scope = drawing ? await resolvePdmReviewScopeReceiptAsync({
        client: getAsyncDatabaseClient(),
        requestId: reviewRequestId,
        companyId: company.company.companyId,
        actorId: auth.user.id,
        entityKey: `drawing:${drawing.id}` as PdmEntityKey,
        targetTypes: ["drawing_number", "numbering_draft_drawing", "drawing_revision_package", "drawing_revision"],
        targetIds: [drawing.id, decodedDrawingNumber],
        access: "review_evidence"
      }) : null;
      if (!scope) return NextResponse.json({ error: "PDM_REVIEW_SCOPE_NOT_FOUND" }, { status: 404 });
    }
    const searchParams = new URL(request.url).searchParams;
    const derivativeId = searchParams.get("previewDerivative");
    if (derivativeId) {
      const derivative = await getMasterAttachmentPreviewDerivativeBytesAsync({
        entityType: "drawing_number",
        entityCode: decodeURIComponent(drawingNumber),
        attachmentId,
        derivativeId
      });
      if (!derivative) return NextResponse.json({ error: "PREVIEW_DERIVATIVE_NOT_FOUND" }, { status: 404 });
      return new Response(new Uint8Array(derivative.bytes), {
        headers: {
          "content-type": derivative.mimeType,
          "content-length": String(derivative.bytes.byteLength),
          "content-disposition": contentDispositionHeader("inline", derivative.fileName),
          "x-content-type-options": "nosniff",
          "cache-control": "private, no-store"
        }
      });
    }
    const result = await getMasterAttachmentBytesAsync({
      entityType: "drawing_number",
      entityCode: decodeURIComponent(drawingNumber),
      attachmentId
    });
    if (!result) return NextResponse.json({ error: "MASTER_ATTACHMENT_NOT_FOUND" }, { status: 404 });
    const disposition = searchParams.get("preview") === "1" ? "inline" : "attachment";
    return buildMasterAttachmentFileResponse({ ...result, disposition });
  } catch (error) {
    if (error instanceof PdmReviewScopeError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.code === "PDM_REVIEW_NOT_ASSIGNED" ? 403 : 409 }
      );
    }
    const message = error instanceof Error ? error.message : "MASTER_ATTACHMENT_DOWNLOAD_FAILED";
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ drawingNumber: string; attachmentId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.attachments.manage");
  if (auth.response) return auth.response;

  const { drawingNumber, attachmentId } = await params;
  try {
    const current = await getMasterAttachmentAsync({
      entityType: "drawing_number",
      entityCode: decodeURIComponent(drawingNumber),
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

export async function DELETE(request: Request, { params }: { params: Promise<{ drawingNumber: string; attachmentId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.attachments.manage");
  if (auth.response) return auth.response;

  const { drawingNumber, attachmentId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    await softDeleteMasterAttachmentAsync({
      entityType: "drawing_number",
      entityCode: decodeURIComponent(drawingNumber),
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
