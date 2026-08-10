import { NextResponse } from "next/server";
import { forbidden, requireAuthAsync } from "@/lib/auth-async";
import { canReadBomReleaseSnapshotRecordAsync } from "@/lib/bom-create-context";
import { getBomReleaseSnapshotByIdAsync } from "@/lib/bom-workbench-async";
import type { BomReleaseSnapshotDetail, BomWorkbenchLine } from "@/lib/types";

export const runtime = "nodejs";

type ExportFormat = "csv" | "xlsx";

const exportColumns = [
  "level",
  "line_no",
  "parent_part_number",
  "child_part_number",
  "child_part_name",
  "child_revision",
  "quantity",
  "source",
  "released_at",
  "approved_by"
];

export async function GET(request: Request, { params }: { params: Promise<{ releaseId: string }> }) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const { releaseId } = await params;
  const snapshot = await getBomReleaseSnapshotByIdAsync(releaseId);
  if (!snapshot) {
    return NextResponse.json({ error: "BOM release snapshot not found" }, { status: 404 });
  }

  if (!(await canReadBomReleaseSnapshotRecordAsync(auth.user, snapshot))) return forbidden();

  const url = new URL(request.url);
  const format = parseFormat(url.searchParams.get("format"));
  if (!format) {
    return NextResponse.json({ error: "BOM_EXPORT_FORMAT_UNSUPPORTED" }, { status: 400 });
  }

  const rows = buildReleaseRows(snapshot);
  const filename = buildExportFilename(snapshot, format);
  if (format === "xlsx") {
    return new Response(buildXlsxWorkbook(rows), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store"
      }
    });
  }

  return new Response(`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store"
    }
  });
}

function parseFormat(value: string | null): ExportFormat | null {
  if (!value || value === "csv") return "csv";
  if (value === "xlsx") return "xlsx";
  return null;
}

function buildReleaseRows(snapshot: BomReleaseSnapshotDetail) {
  const rows: string[][] = [exportColumns];
  const byId = new Map(snapshot.lines.map((line) => [line.id, line]));
  const childrenByParent = new Map<string, BomWorkbenchLine[]>();
  for (const line of snapshot.lines) {
    const key = line.parent_line_id ?? "__root__";
    const children = childrenByParent.get(key) ?? [];
    children.push(line);
    childrenByParent.set(key, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => left.sequence_no - right.sequence_no || left.id.localeCompare(right.id));
  }

  let lineNo = 1;
  const visited = new Set<string>();
  const walk = (parentId: string, level: number) => {
    for (const line of childrenByParent.get(parentId) ?? []) {
      if (visited.has(line.id)) continue;
      visited.add(line.id);
      rows.push(buildReleaseRow(snapshot, line, byId, level, lineNo));
      lineNo += 1;
      walk(line.id, level + 1);
    }
  };
  walk("__root__", 1);
  return rows;
}

function buildReleaseRow(
  snapshot: BomReleaseSnapshotDetail,
  line: BomWorkbenchLine,
  byId: Map<string, BomWorkbenchLine>,
  level: number,
  lineNo: number
) {
  const parentLine = line.parent_line_id ? byId.get(line.parent_line_id) : null;
  const parentPartNumber = parentLine?.node_type === "item" && parentLine.part_number ? parentLine.part_number : snapshot.parent_part_number;
  const approvedBy = snapshot.released_by_name || snapshot.released_by;

  return [
    String(level),
    String(lineNo),
    parentPartNumber,
    line.node_type === "item" ? line.part_number || "" : "",
    line.node_type === "group" ? line.group_name || "" : line.part_name || "",
    line.node_type === "item" ? line.revision || "" : "",
    line.node_type === "item" && line.quantity !== null ? String(line.quantity) : "",
    line.source,
    snapshot.released_at,
    approvedBy
  ];
}

function buildExportFilename(snapshot: BomReleaseSnapshotDetail, format: ExportFormat) {
  const stamp = normalizeDateStamp(snapshot.released_at);
  const bomRevision = snapshot.bom_revision || snapshot.parent_revision;
  return `BOM_${sanitizeFilename(snapshot.parent_part_number)}_Rev${sanitizeFilename(bomRevision)}_${stamp}.${format}`;
}

function normalizeDateStamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return parsed.toISOString().slice(0, 10).replaceAll("-", "");
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function buildXlsxWorkbook(rows: string[][]) {
  const worksheet = buildWorksheetXml(rows);
  return buildZip([
    {
      name: "[Content_Types].xml",
      data: xmlBuffer(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
      )
    },
    {
      name: "_rels/.rels",
      data: xmlBuffer(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
      )
    },
    {
      name: "xl/workbook.xml",
      data: xmlBuffer(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="BOM" sheetId="1" r:id="rId1"/></sheets></workbook>`
      )
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: xmlBuffer(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
      )
    },
    {
      name: "xl/styles.xml",
      data: xmlBuffer(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`
      )
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: xmlBuffer(worksheet)
    }
  ]);
}

function buildWorksheetXml(rows: string[][]) {
  const sheetData = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
          if (isNumericCell(value)) {
            return `<c r="${ref}"><v>${value}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlCell(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData></worksheet>`;
}

function columnName(index: number) {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function isNumericCell(value: string) {
  return value !== "" && /^-?\d+(\.\d+)?$/.test(value);
}

function xmlCell(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function xmlBuffer(value: string) {
  return Buffer.from(value, "utf8");
}

function buildZip(files: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(file.data.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, file.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(file.data.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + file.data.length;
  }

  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crc32Table = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crc32Table[index] = value >>> 0;
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "bom";
}
