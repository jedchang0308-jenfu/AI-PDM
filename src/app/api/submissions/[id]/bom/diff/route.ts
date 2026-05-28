import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { canReadSubmission } from "@/lib/permissions";
import { findPreviousBomSubmissionId, getBomBySubmissionId, getBomDiffBetweenSubmissions, getSubmission } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const targetSubmission = getSubmission(id);
  if (!targetSubmission) {
    return NextResponse.json({ error: "找不到目標送審資料" }, { status: 404 });
  }
  if (!canReadSubmission(auth.user, targetSubmission)) return forbidden();
  if (!getBomBySubmissionId(id)) {
    return NextResponse.json({ error: "Target 找不到 BOM" }, { status: 409 });
  }

  const url = new URL(request.url);
  const requestedBaseSubmissionId = url.searchParams.get("baseSubmissionId")?.trim();
  const baseSubmissionId = requestedBaseSubmissionId || findPreviousBomSubmissionId(id);
  if (!baseSubmissionId) {
    return NextResponse.json({ error: "Previous 找不到 BOM" }, { status: 404 });
  }

  const baseSubmission = getSubmission(baseSubmissionId);
  if (!baseSubmission) {
    return NextResponse.json({ error: "找不到基準送審資料" }, { status: 404 });
  }
  if (!canReadSubmission(auth.user, baseSubmission)) return forbidden();
  if (!getBomBySubmissionId(baseSubmissionId)) {
    return NextResponse.json({ error: "Base 找不到 BOM" }, { status: 409 });
  }

  const diff = getBomDiffBetweenSubmissions({ baseSubmissionId, targetSubmissionId: id });
  if (!diff) {
    return NextResponse.json({ error: "無法取得 BOM 差異" }, { status: 409 });
  }

  const format = url.searchParams.get("format");
  if (format === "csv" || format === "xls") {
    const rows = buildBomDiffRows(diff, new Date().toISOString());
    const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const baseFilename = `ai-pdm-bom-diff-${sanitizeFilename(targetSubmission.drawing_number)}-${sanitizeFilename(diff.base_revision)}-${sanitizeFilename(diff.target_revision)}-${stamp}`;
    if (format === "csv") {
      return new Response(toCsv(rows), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${baseFilename}.csv"`
        }
      });
    }
    return new Response(toExcelXml(rows), {
      headers: {
        "content-type": "application/vnd.ms-excel; charset=utf-8",
        "content-disposition": `attachment; filename="${baseFilename}.xls"`
      }
    });
  }

  return NextResponse.json({
    targetSubmissionId: id,
    baseSubmissionId,
    comparison: requestedBaseSubmissionId ? "explicit" : "previous",
    diff
  });
}
function buildBomDiffRows(diff: NonNullable<ReturnType<typeof getBomDiffBetweenSubmissions>>, exportedAt: string) {
  const headers = [
    "exported_at",
    "base_submission_id",
    "target_submission_id",
    "base_revision",
    "target_revision",
    "change_type",
    "child_part_number",
    "from_revision",
    "to_revision",
    "revision_changed",
    "from_quantity",
    "to_quantity",
    "quantity_changed",
    "from_source_filename",
    "to_source_filename"
  ];
  return [
    headers,
    ...diff.lines.map((line) => [
      exportedAt,
      diff.base_submission_id,
      diff.target_submission_id,
      diff.base_revision,
      diff.target_revision,
      line.change_type,
      line.child_part_number,
      line.from_revision ?? "",
      line.to_revision ?? "",
      String((line.from_revision ?? "") !== (line.to_revision ?? "")),
      line.from_quantity ?? "",
      line.to_quantity ?? "",
      String((line.from_quantity ?? "") !== (line.to_quantity ?? "")),
      line.from_source_filename ?? "",
      line.to_source_filename ?? ""
    ])
  ];
}

function toCsv(rows: unknown[][]) {
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return `\uFEFF${body}\r\n`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function toExcelXml(rows: unknown[][]) {
  const table = rows
    .map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="${typeof cell === "number" ? "Number" : "String"}">${escapeXml(String(cell ?? ""))}</Data></Cell>`).join("")}</Row>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="BOM Diff"><Table>${table}</Table></Worksheet></Workbook>`;
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "bom-diff";
}
