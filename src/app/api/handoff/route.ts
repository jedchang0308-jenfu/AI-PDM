import { NextResponse } from "next/server";
import { requireNumberStateReadAccessAsync } from "@/lib/number-state-flow-api";
import { listManufacturingHandoffEntriesAsync } from "@/lib/handoff-async";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { readPdmPersonDisplayNames } from "@/lib/principal-employee-display-name-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireNumberStateReadAccessAsync(request, "handoff.published.view");
  if (access.response) return access.response;

  const companyId = access.company.companyId;
  const submissions = await listManufacturingHandoffEntriesAsync({ companyId });
  const names = submissions.length ? await readPdmPersonDisplayNames(getAsyncDatabaseClient(), companyId,
    submissions.flatMap(submission => [submission.submitted_by, ...submission.approvals.map(approval => approval.reviewer_id)]))
    : new Map<string, string>();
  const entries = submissions.map((submission) => ({
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
    submitted_by_name: names.get(submission.submitted_by) ?? "未知提交者",
    package: submission.release_package
      ? {
          filename: submission.release_package.package_filename,
          sha256: submission.release_package.sha256,
          file_size: submission.release_package.file_size,
          created_at: submission.release_package.created_at,
          download_url: `/api/handoff/${submission.id}/release-package`
        }
      : null,
    files: submission.files.map((file) => ({
      role: file.file_role,
      filename: file.original_filename,
      sha256: file.sha256,
      size: file.file_size
    })),
    approvals: submission.approvals.map((approval) => ({
      reviewer_name: names.get(approval.reviewer_id) ?? "未知審核者",
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
