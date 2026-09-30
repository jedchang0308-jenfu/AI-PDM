import { requireNumberStateReadAccessAsync } from "@/lib/number-state-flow-api";
import { listManufacturingHandoffEntriesAsync } from "@/lib/handoff-async";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireNumberStateReadAccessAsync(request, "handoff.published.view");
  if (access.response) return access.response;

  const entries = await listManufacturingHandoffEntriesAsync({ companyId: access.company.companyId });
  const rows = [
    [
      "submission_id",
      "drawing_number",
      "revision",
      "part_number",
      "part_name",
      "material",
      "surface_finish",
      "document_type",
      "released_at",
      "change_description",
      "package_filename",
      "package_sha256",
      "package_download_url",
      "file_count",
      "files",
      "approvals"
    ]
  ];

  for (const submission of entries) {
    const packageUrl = submission.release_package
      ? new URL(`/api/handoff/${submission.id}/release-package`, request.url).toString()
      : "";
    rows.push([
      submission.id,
      submission.drawing_number,
      submission.revision,
      submission.part_number,
      submission.part_name,
      submission.material,
      submission.surface_finish,
      submission.document_type,
      submission.released_at ?? "",
      submission.change_description,
      submission.release_package?.package_filename ?? "",
      submission.release_package?.sha256 ?? "",
      packageUrl,
      String(submission.files.length),
      submission.files.map((file) => `${file.file_role}:${file.original_filename}:${file.sha256}`).join(" | "),
      submission.approvals.map((approval) => `${approval.reviewer_name}:${approval.decision}:${approval.decided_at}`).join(" | ")
    ]);
  }

  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ai-pdm-manufacturing-handoff-${stamp}.csv"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store"
    }
  });
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
