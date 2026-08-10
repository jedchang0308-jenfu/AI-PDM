import type { BomDetail, BomDiffResult } from "@/lib/types";

export type BomDiffSubmissionFacts = {
  id: string;
  revision: string;
  created_at: string;
};

function bomDiffKey(line: BomDetail["lines"][number]) {
  return line.child_part_number.trim().toUpperCase();
}

export function buildBomSubmissionDiff(
  baseSubmission: BomDiffSubmissionFacts,
  targetSubmission: BomDiffSubmissionFacts,
  baseLines: BomDetail["lines"],
  targetLines: BomDetail["lines"]
): BomDiffResult {
  const baseByKey = new Map(baseLines.map((line) => [bomDiffKey(line), line]));
  const targetByKey = new Map(targetLines.map((line) => [bomDiffKey(line), line]));
  const keys = Array.from(new Set([...baseByKey.keys(), ...targetByKey.keys()])).sort();
  const lines: BomDiffResult["lines"] = keys.map((key) => {
    const baseLine = baseByKey.get(key) ?? null;
    const targetLine = targetByKey.get(key) ?? null;
    const changeType = !baseLine
      ? "added"
      : !targetLine
        ? "removed"
        : baseLine.child_revision !== targetLine.child_revision || Number(baseLine.quantity) !== Number(targetLine.quantity)
          ? "changed"
          : "unchanged";

    return {
      key,
      change_type: changeType,
      child_part_number: targetLine?.child_part_number ?? baseLine?.child_part_number ?? key,
      from_revision: baseLine?.child_revision ?? null,
      to_revision: targetLine?.child_revision ?? null,
      from_quantity: baseLine ? Number(baseLine.quantity) : null,
      to_quantity: targetLine ? Number(targetLine.quantity) : null,
      from_source_filename: baseLine?.source_filename ?? null,
      to_source_filename: targetLine?.source_filename ?? null
    };
  });

  return {
    base_submission_id: baseSubmission.id,
    target_submission_id: targetSubmission.id,
    base_revision: baseSubmission.revision,
    target_revision: targetSubmission.revision,
    base_created_at: baseSubmission.created_at,
    target_created_at: targetSubmission.created_at,
    added_count: lines.filter((line) => line.change_type === "added").length,
    removed_count: lines.filter((line) => line.change_type === "removed").length,
    changed_count: lines.filter((line) => line.change_type === "changed").length,
    unchanged_count: lines.filter((line) => line.change_type === "unchanged").length,
    lines
  };
}
