import type { BomWorkbenchLine } from "@/lib/types";

type BomWorkbenchComparableLine = {
  key: string;
  node_type: "item" | "group";
  label: string;
  part_number: string | null;
  revision: string | null;
  group_name: string | null;
  quantity: number | null;
  parent_path: string;
  level: number;
  sequence_no: number;
};

type BomWorkbenchLineDiffChange = {
  key: string;
  change_type: "added" | "removed" | "changed" | "unchanged";
  label: string;
  before: BomWorkbenchComparableLine | null;
  after: BomWorkbenchComparableLine | null;
  changed_fields: string[];
};

export function diffBomWorkbenchLines(baseLines: BomWorkbenchLine[], targetLines: BomWorkbenchLine[]): BomWorkbenchLineDiffChange[] {
  const before = comparableLineMap(baseLines);
  const after = comparableLineMap(targetLines);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const changes: BomWorkbenchLineDiffChange[] = [];

  for (const key of keys) {
    const previous = before.get(key) ?? null;
    const next = after.get(key) ?? null;
    if (!previous && next) {
      changes.push({ key, change_type: "added", label: next.label, before: null, after: next, changed_fields: ["line"] });
      continue;
    }
    if (previous && !next) {
      changes.push({ key, change_type: "removed", label: previous.label, before: previous, after: null, changed_fields: ["line"] });
      continue;
    }
    if (!previous || !next) continue;
    const changedFields = changedComparableFields(previous, next);
    changes.push({
      key,
      change_type: changedFields.length > 0 ? "changed" : "unchanged",
      label: next.label,
      before: previous,
      after: next,
      changed_fields: changedFields
    });
  }

  return changes.sort((a, b) => diffSortWeight(a.change_type) - diffSortWeight(b.change_type) || a.label.localeCompare(b.label));
}

function comparableLineMap(lines: BomWorkbenchLine[]) {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const occurrence = new Map<string, number>();
  const comparable = new Map<string, BomWorkbenchComparableLine>();
  const sorted = [...lines].sort((a, b) => a.sequence_no - b.sequence_no);

  for (const line of sorted) {
    const baseKey =
      line.node_type === "group"
        ? `group:${(line.group_name ?? "").trim().toUpperCase()}`
        : `item:${(line.part_number ?? "").trim().toUpperCase()}`;
    const count = (occurrence.get(baseKey) ?? 0) + 1;
    occurrence.set(baseKey, count);
    const key = `${baseKey}#${count}`;
    const parentPath = buildParentPath(line, byId);
    comparable.set(key, {
      key,
      node_type: line.node_type,
      label: line.node_type === "group" ? line.group_name || "Group" : `${line.part_number ?? "-"} Rev ${line.revision ?? "-"}`,
      part_number: line.part_number,
      revision: line.revision,
      group_name: line.group_name,
      quantity: line.quantity,
      parent_path: parentPath.path,
      level: parentPath.level,
      sequence_no: line.sequence_no
    });
  }

  return comparable;
}

function buildParentPath(line: BomWorkbenchLine, byId: Map<string, BomWorkbenchLine>) {
  const labels: string[] = [];
  const visited = new Set<string>();
  let currentParentId = line.parent_line_id;
  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parent = byId.get(currentParentId);
    if (!parent) break;
    labels.unshift(parent.node_type === "group" ? parent.group_name || "Group" : `${parent.part_number ?? "-"} Rev ${parent.revision ?? "-"}`);
    currentParentId = parent.parent_line_id;
  }
  return {
    path: labels.length > 0 ? labels.join(" / ") : "ROOT",
    level: labels.length
  };
}

function changedComparableFields(before: BomWorkbenchComparableLine, after: BomWorkbenchComparableLine) {
  const fields: string[] = [];
  if ((before.revision ?? "") !== (after.revision ?? "")) fields.push("revision");
  if ((before.quantity ?? null) !== (after.quantity ?? null)) fields.push("quantity");
  if (before.parent_path !== after.parent_path || before.level !== after.level) fields.push("hierarchy");
  if (before.sequence_no !== after.sequence_no) fields.push("sequence");
  return fields;
}

function diffSortWeight(changeType: BomWorkbenchLineDiffChange["change_type"]) {
  if (changeType === "added") return 1;
  if (changeType === "removed") return 2;
  if (changeType === "changed") return 3;
  return 4;
}
