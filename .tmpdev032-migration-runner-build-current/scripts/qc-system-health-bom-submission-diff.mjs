#!/usr/bin/env node

import assert from "node:assert/strict";
import { buildBomSubmissionDiff } from "../src/lib/bom-submission-diff.ts";

const baseLines = [
  { child_part_number: "p-removed", child_revision: "A", quantity: 2, source_filename: "base.sldasm" },
  { child_part_number: "p-changed", child_revision: "A", quantity: 4, source_filename: "base.sldasm" },
  { child_part_number: "p-same", child_revision: "A", quantity: 1, source_filename: "base.sldasm" }
];
const targetLines = [
  { child_part_number: "p-added", child_revision: "A", quantity: 5, source_filename: "target.sldasm" },
  { child_part_number: "p-changed", child_revision: "B", quantity: 6, source_filename: "target.sldasm" },
  { child_part_number: "p-same", child_revision: "A", quantity: 1, source_filename: "target.sldasm" }
];
const before = JSON.stringify({ baseLines, targetLines });
const result = buildBomSubmissionDiff(
  { id: "submission-a", revision: "A", created_at: "2026-01-01T00:00:00.000Z" },
  { id: "submission-b", revision: "B", created_at: "2026-02-01T00:00:00.000Z" },
  baseLines,
  targetLines
);

assert.deepEqual(
  result.lines.map((line) => [line.key, line.change_type]),
  [
    ["P-ADDED", "added"],
    ["P-CHANGED", "changed"],
    ["P-REMOVED", "removed"],
    ["P-SAME", "unchanged"]
  ]
);
assert.deepEqual(
  [result.added_count, result.removed_count, result.changed_count, result.unchanged_count],
  [1, 1, 1, 1]
);
assert.deepEqual(
  result.lines.find((line) => line.key === "P-CHANGED"),
  {
    key: "P-CHANGED",
    change_type: "changed",
    child_part_number: "p-changed",
    from_revision: "A",
    to_revision: "B",
    from_quantity: 4,
    to_quantity: 6,
    from_source_filename: "base.sldasm",
    to_source_filename: "target.sldasm"
  }
);
assert.equal(result.base_submission_id, "submission-a");
assert.equal(result.target_submission_id, "submission-b");
assert.equal(JSON.stringify({ baseLines, targetLines }), before, "diff does not mutate source lines");

console.log("QC System Health BOM submission diff: PASS (four change types, counts, order, deltas, no mutation)");
