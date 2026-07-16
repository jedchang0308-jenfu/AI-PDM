import { NextResponse } from "next/server";
import {
  DrawingRevisionPackageError,
  requestDrawingRevisionPackageSupplementAsync
} from "@/lib/drawing-revision-packages-async";
import { normalizeSupplementReasonCode } from "@/lib/drawing-revision-package";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { normalizeRevisionPackageFileRole } from "@/lib/revision-package";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ packageId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.draft.update");
  if (auth.response) return auth.response;
  if (!["Engineer", "R&D Manager", "Admin"].includes(auth.user.role)) {
    return NextResponse.json(
      { error: "drawing_revision_package_supplement_forbidden", message: "你目前不能申請補附件，請由工程、主管或 Admin 處理。" },
      { status: 403 }
    );
  }

  const { packageId } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const reasonCode = normalizeSupplementReasonCode(body.reasonCode ?? body.reason_code);
  if (!reasonCode) {
    return NextResponse.json({ error: "supplement_reason_required", message: "請選擇補件原因。" }, { status: 400 });
  }

  const files = normalizeSupplementFiles(body);
  try {
    const result = await requestDrawingRevisionPackageSupplementAsync({
      packageId,
      companyId: companyResult.company.companyId,
      actorId: auth.user.id,
      reasonCode,
      reasonNote: nullableText(body.reasonNote ?? body.reason_note),
      files
    });
    return NextResponse.json({ ...result, packageId, pdmCompany: companyResult.company }, { status: 201 });
  } catch (error) {
    return supplementErrorResponse(error);
  }
}

function normalizeSupplementFiles(body: Record<string, unknown>) {
  const filesInput = Array.isArray(body.files) ? body.files : [];
  const files = filesInput
    .map((value) => {
      if (!value || typeof value !== "object") return null;
      const entry = value as Record<string, unknown>;
      const fileId = String(entry.fileId ?? entry.file_id ?? entry.attachmentId ?? entry.attachment_id ?? "").trim();
      if (!fileId) return null;
      return {
        fileId,
        role: normalizeRevisionPackageFileRole(entry.role),
        displayName: nullableText(entry.displayName ?? entry.display_name),
        description: nullableText(entry.description)
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (files.length > 0) return files;

  const rawFileIds = body.fileIds ?? body.file_ids;
  const fileIds = Array.isArray(rawFileIds) ? rawFileIds : [];
  return fileIds
    .map((value: unknown) => String(value ?? "").trim())
    .filter(Boolean)
    .map((fileId: string) => ({ fileId }));
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function supplementErrorResponse(error: unknown) {
  if (error instanceof DrawingRevisionPackageError) {
    return NextResponse.json({ error: error.code, code: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json(
    { error: "drawing_revision_package_supplement_failed", message: "補附件申請失敗，請稍後重試或通知 Admin。" },
    { status: 500 }
  );
}
