import { NextResponse } from "next/server";
import { forbidden, requireAuth } from "@/lib/auth";
import { getBomBySubmissionId, getSubmission } from "@/lib/db";
import { canReadSubmission } from "@/lib/permissions";
import type { BomDetail } from "@/lib/types";

export const runtime = "nodejs";

type ExportFormat = "csv" | "xls";

const columns = [
  "submission_id",
  "parent_part_number",
  "parent_part_name",
  "parent_drawing_number",
  "parent_revision",
  "parent_material",
  "parent_surface_finish",
  "parent_status",
  "bom_status",
  "bom_source",
  "exported_at",
  "line_no",
  "child_drawing_number",
  "child_part_number",
  "child_part_name",
  "child_revision",
  "child_material",
  "child_surface_finish",
  "child_status",
  "quantity",
  "source_filename"
];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);
  if (!submission) {
    return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  }
  if (!canReadSubmission(auth.user, submission)) return forbidden();

  const bom = getBomBySubmissionId(id);
  if (!bom) {
    return NextResponse.json({ error: "找不到 BOM" }, { status: 404 });
  }

  const url = new URL(request.url);
  const format = parseFormat(url.searchParams.get("format"));
  if (!format) {
    return NextResponse.json({ error: "不支援的匯出格式" }, { status: 400 });
  }

  const rows = buildBomRows(id, bom, new Date().toISOString());
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const baseFilename = `ai-pdm-bom-${sanitizeFilename(bom.parent_part_number)}-rev-${sanitizeFilename(bom.parent_revision)}-${stamp}`;

  if (format === "xls") {
    return new Response(buildSpreadsheetXml(rows), {
      headers: {
        "content-type": "application/vnd.ms-excel; charset=utf-8",
        "content-disposition": `attachment; filename="${baseFilename}.xls"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store"
      }
    });
  }

  return new Response(`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${baseFilename}.csv"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store"
    }
  });
}

function parseFormat(value: string | null): ExportFormat | null {
  if (!value || value === "csv") return "csv";
  if (value === "xls") return "xls";
  return null;
}

function buildBomRows(submissionId: string, bom: BomDetail, exportedAt: string) {
  return [
    columns,
    ...bom.lines.map((line) => [
      submissionId,
      bom.parent_part_number,
      bom.parent_part_name,
      bom.parent_drawing_number,
      bom.parent_revision,
      bom.parent_material,
      bom.parent_surface_finish,
      bom.parent_status,
      bom.status,
      bom.source,
      exportedAt,
      String(line.line_no),
      line.child_drawing_number ?? "",
      line.child_part_number,
      line.child_part_name ?? "",
      line.child_revision ?? line.child_submission_revision ?? "",
      line.child_material ?? "",
      line.child_surface_finish ?? "",
      line.child_status ?? "Missing",
      String(line.quantity),
      line.source_filename ?? ""
    ])
  ];
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function buildSpreadsheetXml(rows: string[][]) {
  const table = rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => `<Cell><Data ss:Type="${isNumericCell(cell) ? "Number" : "String"}">${xmlCell(cell)}</Data></Cell>`)
          .join("")}</Row>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="BOM"><Table>${table}</Table></Worksheet></Workbook>`;
}

function isNumericCell(value: string) {
  return value !== "" && /^-?\d+(\.\d+)?$/.test(value);
}

function xmlCell(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "bom";
}
