import crypto from "node:crypto";
import {
  getReadonlyShareByTokenHashAsync,
  listSupplierPortalResponsesAsync,
  recordReadonlyShareAccessAsync
} from "@/lib/release-records-async";
import { getSubmissionAsync } from "@/lib/submissions-async";
import type { SubmissionDetail } from "@/lib/types";

export async function getPublicShareAsync(token: string) {
  const normalized = normalizeShareToken(token);
  if (!isPlausibleShareToken(normalized)) return null;

  const share = await getReadonlyShareByTokenHashAsync(hashShareTokenAsync(normalized));
  if (!share || share.status !== "active") return null;

  const submission = await getSubmissionAsync(share.submission_id);
  if (!submission || submission.status !== "Released" || !submission.release_package) return null;

  return { share, submission, token: normalized };
}

export function generateShareTokenAsync() {
  return crypto.randomBytes(24).toString("base64url");
}

export function buildPublicShareUrlAsync(request: Request, token: string) {
  return new URL(`/share/${token}`, request.url).toString();
}

export async function recordPublicShareAccessAsync(shareId: string, submissionId: string) {
  await recordReadonlyShareAccessAsync({ shareId, submissionId });
}

export async function serializePublicShareAsync(submission: SubmissionDetail, token: string, shareId: string) {
  const supplierResponses = await listSupplierPortalResponsesAsync({ submissionId: submission.id, shareId });

  return {
    submission: {
      id: submission.id,
      drawing_number: submission.drawing_number,
      revision: submission.revision,
      part_number: submission.part_number,
      part_name: submission.part_name,
      material: submission.material,
      surface_finish: submission.surface_finish,
      document_type: submission.document_type,
      change_description: submission.change_description,
      status: submission.status,
      released_at: submission.released_at,
      submitted_by_name: submission.submitted_by_name
    },
    package: submission.release_package
      ? {
          filename: submission.release_package.package_filename,
          sha256: submission.release_package.sha256,
          file_size: submission.release_package.file_size,
          created_at: submission.release_package.created_at,
          download_url: `/api/public/shares/${token}/package`
        }
      : null,
    files: submission.files.map((file) => ({
      id: file.id,
      role: file.file_role,
      filename: file.original_filename,
      sha256: file.sha256,
      size: file.file_size
    })),
    bom: submission.bom
      ? {
          parent_revision: submission.bom.parent_revision,
          status: submission.bom.status,
          line_count: submission.bom.line_count,
          lines: submission.bom.lines.map((line) => ({
            line_no: line.line_no,
            child_part_number: line.child_part_number,
            child_revision: line.child_revision,
            quantity: line.quantity,
            source_filename: line.source_filename
          }))
        }
      : null,
    approvals: submission.approvals.map((approval) => ({
      reviewer_name: approval.reviewer_name,
      decision: approval.decision,
      decided_at: approval.decided_at
    })),
    supplier_responses: supplierResponses.map((response) => ({
      id: response.id,
      response_kind: response.response_kind,
      supplier_name: response.supplier_name,
      supplier_email: response.supplier_email,
      message: response.message,
      status: response.status,
      created_at: response.created_at,
      closed_at: response.closed_at
    }))
  };
}

export function normalizeShareToken(token: string) {
  return token.trim();
}

export function isPlausibleShareToken(token: string) {
  return /^[A-Za-z0-9_-]{24,128}$/.test(token);
}

export function hashShareTokenAsync(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
