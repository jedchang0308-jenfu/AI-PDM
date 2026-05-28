import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAuth, requireRole } from "@/lib/auth";
import { createSubmissionRecord, getDashboardMetrics, listSubmissions, submissionRevisionExists, getSystemSetting, updateFileGDriveStatus } from "@/lib/db";
import { removeSubmissionUploadFolder, saveUploadedFiles } from "@/lib/file-store";
import { uploadFileToDrive } from "@/lib/gdrive";
import { scopedSubmittedBy } from "@/lib/permissions";
import { validateSubmissionInput, validateUploadedFiles } from "@/lib/validation";
import type { FileRole } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const limit = parsePageLimit(url.searchParams.get("limit"));
  const offset = parsePageOffset(url.searchParams.get("offset"));
  const submittedBy = scopedSubmittedBy(auth.user);
  const rows = listSubmissions(status, submittedBy, { limit: limit + 1, offset });
  const submissions = rows.slice(0, limit);
  return NextResponse.json({
    submissions,
    pagination: {
      limit,
      offset,
      count: submissions.length,
      hasMore: rows.length > limit,
      nextOffset: offset + submissions.length
    },
    metrics: getDashboardMetrics(submittedBy)
  });
}

function parsePageLimit(value: string | null) {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.trunc(parsed), 1), 200);
}

function parsePageOffset(value: string | null) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.trunc(parsed), 0);
}

export async function POST(request: Request) {
  const auth = requireRole(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const form = await request.formData();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  const input = {
    drawingNumber: String(form.get("drawing_number") ?? "").trim(),
    partNumber: String(form.get("part_number") ?? "").trim(),
    partName: String(form.get("part_name") ?? "").trim(),
    revision: String(form.get("revision") ?? "").trim(),
    productLine: String(form.get("product_line") ?? "").trim(),
    customer: String(form.get("customer") ?? "").trim(),
    projectCode: String(form.get("project_code") ?? "").trim(),
    processName: String(form.get("process_name") ?? "").trim(),
    machine: String(form.get("machine") ?? "").trim(),
    material: String(form.get("material") ?? "").trim(),
    surfaceFinish: String(form.get("surface_finish") ?? "").trim(),
    documentType: String(form.get("document_type") ?? "").trim(),
    changeDescription: String(form.get("change_description") ?? "").trim(),
    submittedBy: auth.user.id
  };
  const approvalRequired = parseApprovalRequired(form.get("approval_required"));
  const cadReferences = parseCadReferences(form.get("cad_references_json"));

  const errors = validateSubmissionInput(input);
  if (!approvalRequired) errors.push("簽審層級必須為 1 或 2");
  if (files.length === 0) errors.push("至少需要一個檔案");
  errors.push(...validateUploadedFiles(files, getMaxUploadFileBytes()));
  if (errors.length > 0) {
    return NextResponse.json({ error: "驗證失敗", details: errors }, { status: 400 });
  }

  if (submissionRevisionExists({ drawingNumber: input.drawingNumber, revision: input.revision })) {
    return NextResponse.json({ error: "圖號與版次已存在" }, { status: 409 });
  }

  const submissionFolderName = `SUB-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto
    .randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
  const savedFiles = await saveUploadedFiles(submissionFolderName, files);

  try {
    const submissionId = createSubmissionRecord({
      ...input,
      approvalRequired: approvalRequired ?? 1,
      files: savedFiles,
      references: cadReferences
    });

    // Fire and forget background upload if configured
    const pendingFolderId = getSystemSetting("gdrive_pending_folder_id") || (process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID ?? "");
    if (pendingFolderId) {
      triggerBackgroundUpload(submissionId, pendingFolderId).catch(console.error);
    }

    return NextResponse.json({ submissionId, status: "Pending" }, { status: 201 });
  } catch (error) {
    await removeSubmissionUploadFolder(submissionFolderName);
    const message = error instanceof Error ? error.message : "未知錯誤";
    if (message.includes("UNIQUE constraint failed: submissions.drawing_number, submissions.revision")) {
      return NextResponse.json({ error: "圖號與版次已存在" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseCadReferences(value: FormDataEntryValue | null) {
  if (value === null || String(value).trim() === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const value = entry as Record<string, unknown>;
      const referenceType = String(value.referenceType ?? value.reference_type ?? "unknown");
      const confidence = String(value.confidence ?? "low");
      const sourceFileRole = String(value.sourceFileRole ?? value.source_file_role ?? "other");
      return {
        sourceFilename: String(value.sourceFilename ?? value.source_filename ?? "").trim(),
        sourceFileRole: isFileRole(sourceFileRole) ? sourceFileRole : ("other" as FileRole),
        referencedFilename: String(value.referencedFilename ?? value.referenced_filename ?? "").trim(),
        referencedPartNumber: String(value.referencedPartNumber ?? value.referenced_part_number ?? "").trim() || undefined,
        referencedDrawingNumber: String(value.referencedDrawingNumber ?? value.referenced_drawing_number ?? "").trim() || undefined,
        referencedRevision: String(value.referencedRevision ?? value.referenced_revision ?? "").trim() || undefined,
        referenceType: isReferenceType(referenceType) ? referenceType : "unknown",
        quantity: Number.isFinite(Number(value.quantity)) && Number(value.quantity) > 0 ? Number(value.quantity) : 1,
        extractionMethod: String(value.extractionMethod ?? value.extraction_method ?? "upload_payload").trim() || "upload_payload",
        confidence: isConfidence(confidence) ? confidence : "low"
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry?.sourceFilename && entry.referencedFilename));
}

function isFileRole(value: string): value is FileRole {
  return ["sldprt", "sldasm", "slddrw", "pdf", "dwg", "other"].includes(value);
}

function isReferenceType(value: string): value is "assembly_component" | "drawing_model" | "derived" | "unknown" {
  return ["assembly_component", "drawing_model", "derived", "unknown"].includes(value);
}

function isConfidence(value: string): value is "high" | "medium" | "low" {
  return ["high", "medium", "low"].includes(value);
}

function parseApprovalRequired(value: FormDataEntryValue | null): 1 | 2 | null {
  if (value === null || String(value).trim() === "") return 1;
  const parsed = Number.parseInt(String(value), 10);
  return parsed === 1 || parsed === 2 ? parsed : null;
}

function getMaxUploadFileBytes() {
  const parsed = Number.parseInt(process.env.PDM_MAX_UPLOAD_FILE_BYTES ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50 * 1024 * 1024;
}

async function triggerBackgroundUpload(submissionId: string, folderId: string) {
  // We need to fetch the newly created files from DB
  const { getFilesNeedingUpload } = await import("@/lib/db");
  const files = getFilesNeedingUpload(submissionId);

  for (const file of files) {
    try {
      updateFileGDriveStatus(file.id, "uploading");
      const gdriveFileId = await uploadFileToDrive({
        localPath: file.local_path,
        filename: file.original_filename,
        targetFolderId: folderId
      });
      updateFileGDriveStatus(file.id, "uploaded", gdriveFileId);
    } catch (error) {
      console.error(`Failed to upload file ${file.id} to Drive:`, error);
      updateFileGDriveStatus(file.id, "failed");
    }
  }
}
