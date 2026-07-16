import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { listManufacturingHandoffEntriesAsync } from "@/lib/handoff-async";
import { scopedSubmittedBy } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const entries = (await listManufacturingHandoffEntriesAsync({ submittedBy: scopedSubmittedBy(auth.user) })).map((submission) => ({
    id: submission.id,
    drawing_number: submission.drawing_number,
    revision: submission.revision,
    part_number: submission.part_number,
    part_name: submission.part_name,
    material: submission.material,
    surface_finish: submission.surface_finish,
    document_type: submission.document_type,
    change_description: submission.change_description,
    released_at: submission.released_at,
    submitted_by_name: submission.submitted_by_name,
    package: submission.release_package
      ? {
          filename: submission.release_package.package_filename,
          sha256: submission.release_package.sha256,
          file_size: submission.release_package.file_size,
          created_at: submission.release_package.created_at,
          download_url: `/api/submissions/${submission.id}/release-package`
        }
      : null,
    files: submission.files.map((file) => ({
      role: file.file_role,
      filename: file.original_filename,
      sha256: file.sha256,
      size: file.file_size
    })),
    approvals: submission.approvals.map((approval) => ({
      reviewer_name: approval.reviewer_name,
      decision: approval.decision,
      decided_at: approval.decided_at
    }))
  }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    count: entries.length,
    entries
  });
}
