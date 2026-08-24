import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAuthAsync, requireRoleAsync } from "@/lib/auth-async";
import { requestedPdmCompanyCodeFromRequest, resolvePdmCompanyContextAsync } from "@/lib/company-context";
import { getDashboardMetricsAsync } from "@/lib/dashboard-metrics-async";
import { removeSubmissionUploadFolder, saveUploadedFiles } from "@/lib/file-store";
import { scopedSubmittedBy } from "@/lib/permissions";
import { triggerBackgroundUpload } from "@/lib/submission-background-upload";
import { createSubmissionRecordAsync, listSubmissionsAsync, submissionRevisionExistsAsync } from "@/lib/submissions-async";
import { getSystemSettingAsync } from "@/lib/system-settings-async";
import { getActionableStorageUploadDecisions, getAlternateLargeFileIntakePackage, getStorageUploadPolicy } from "@/lib/storage-upload-policy";
import type { StorageUploadDecision } from "@/lib/storage-upload-policy";
import { validateSubmissionInput, validateUploadedFiles } from "@/lib/validation";
import type { FileRole } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const includeHistory = status === "Obsolete";
  const limit = parsePageLimit(url.searchParams.get("limit"));
  const offset = parsePageOffset(url.searchParams.get("offset"));
  const companyResult = await resolvePdmCompanyContextAsync(auth.user, requestedPdmCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const submittedBy = scopedSubmittedBy(auth.user);
  const rows = await listSubmissionsAsync({
    status,
    submittedBy,
    companyId: companyResult.company.companyId,
    limit: limit + 1,
    offset,
    includeHistory
  });
  const submissions = rows.slice(0, limit);
  return NextResponse.json({
    pdmCompany: companyResult.company,
    submissions,
    pagination: {
      limit,
      offset,
      count: submissions.length,
      hasMore: rows.length > limit,
      nextOffset: offset + submissions.length
    },
    metrics: await getDashboardMetricsAsync({ submittedBy, companyId: companyResult.company.companyId })
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
  const auth = await requireRoleAsync(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  return NextResponse.json(
    {
      error: "GENERIC_SUBMISSION_RETIRED",
      message: "通用上傳送審已退役。請從圖號／料號工作台完成主資料與附件確認後送審，不可在送審階段補填主資料。"
    },
    { status: 410 }
  );
}

function parseBooleanFormValue(value: FormDataEntryValue | null) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function evaluateStorageUploadOverride(input: {
  enabled: boolean;
  reason: string;
  actorId: string;
  actorRole: string;
  decisions: StorageUploadDecision[];
  maxUploadFileBytes: number;
  largeFileThresholdBytes: number;
}) {
  if (input.decisions.length === 0) return { approved: false, errors: [] as string[], audit: undefined };
  if (!input.enabled) return { approved: false, errors: [] as string[], audit: undefined };

  const errors: string[] = [];
  if (input.actorRole !== "Admin") errors.push("storage_upload_override_denied:admin_role_required");
  if (input.reason.length < 10 || input.reason.length > 300) errors.push("storage_upload_override_denied:reason_required");
  if (input.decisions.some((decision) => decision.disposition === "alternate_large_file_path_required")) {
    errors.push("storage_upload_override_denied:alternate_large_file_path_required");
  }
  if (errors.length > 0) return { approved: false, errors, audit: undefined };

  return {
    approved: true,
    errors,
    audit: {
      approvedBy: input.actorId,
      reason: input.reason,
      maxUploadFileBytes: input.maxUploadFileBytes,
      largeFileThresholdBytes: input.largeFileThresholdBytes,
      decisions: input.decisions.map((decision) => ({
        filename: decision.filename,
        fileSize: decision.fileSize,
        disposition: decision.disposition,
        reason: decision.reason
      }))
    }
  };
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

function isReferenceType(value: string): value is "drawing_model" | "derived" | "unknown" {
  return ["drawing_model", "derived", "unknown"].includes(value);
}

function isConfidence(value: string): value is "high" | "medium" | "low" {
  return ["high", "medium", "low"].includes(value);
}

function parseApprovalRequired(value: FormDataEntryValue | null): 1 | 2 | null {
  if (value === null || String(value).trim() === "") return 1;
  const parsed = Number.parseInt(String(value), 10);
  return parsed === 1 || parsed === 2 ? parsed : null;
}
