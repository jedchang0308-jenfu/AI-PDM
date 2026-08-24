import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { listManufacturingHandoffEntriesAsync } from "@/lib/handoff-async";

export const runtime = "nodejs";

function parseLimit(value: string | null) {
  const limit = Number(value ?? 100);
  if (!Number.isFinite(limit)) return 100;
  return Math.min(Math.max(Math.floor(limit), 1), 200);
}

function parseSince(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export async function GET(request: Request) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const since = parseSince(url.searchParams.get("since"));
  const partNumber = url.searchParams.get("partNumber")?.trim().toLowerCase() ?? "";

  const entries = (await listManufacturingHandoffEntriesAsync({ limit: 200 }))
    .filter((submission) => {
      if (partNumber && submission.part_number.toLowerCase() !== partNumber) return false;
      if (since && Date.parse(submission.released_at ?? submission.updated_at ?? submission.created_at) <= since) return false;
      return true;
    })
    .slice(0, limit)
    .map((submission) => ({
      submission_id: submission.id,
      item_id: submission.item_id,
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
    generated_at: new Date().toISOString(),
    integration: "procurement",
    schema_version: 1,
    count: entries.length,
    entries
  });
}
