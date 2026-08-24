import type { BomReleaseSnapshotDetail } from "@/lib/types";

export const BOM_RELEASE_EXPORT_COLUMNS = [
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

export function buildSharedReleaseExportRows(snapshot: BomReleaseSnapshotDetail, parentPartNumberId: string) {
  const parent = snapshot.applicable_parents?.find((candidate) => candidate.part_number_id === parentPartNumberId);
  const lines = snapshot.resolved_lines?.filter((line) => line.parent_part_number_id === parentPartNumberId) ?? [];
  if (!parent || !lines.length) throw new Error("BOM_RELEASE_PROJECTION_AMBIGUOUS");
  const byLogicalId = new Map(lines.map((line) => [line.logical_line_id, line]));
  return [BOM_RELEASE_EXPORT_COLUMNS, ...lines.map((line, index) => {
    const parentLine = line.parent_logical_line_id ? byLogicalId.get(line.parent_logical_line_id) : null;
    return [
      String(line.level + 1),
      String(index + 1),
      parentLine?.node_type === "item" ? parentLine.child_part_number ?? parent.part_number : parent.part_number,
      line.node_type === "item" ? line.child_part_number ?? "" : "",
      line.node_type === "group" ? line.group_name ?? "" : line.child_part_name ?? "",
      "",
      line.node_type === "item" && line.quantity !== null ? String(line.quantity) : "",
      line.source,
      snapshot.released_at,
      snapshot.released_by_name || snapshot.released_by
    ];
  })];
}

export function buildSharedReleaseExportFilename(
  snapshot: BomReleaseSnapshotDetail,
  parentPartNumberId: string,
  format: "csv" | "xlsx"
) {
  const parent = snapshot.applicable_parents?.find((candidate) => candidate.part_number_id === parentPartNumberId);
  return `${sanitizeFilename(parent?.part_number ?? "bom")}-BOM-${sanitizeFilename(snapshot.bom_revision ?? "")}.${format}`;
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "bom";
}
