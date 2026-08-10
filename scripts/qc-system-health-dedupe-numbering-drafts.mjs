#!/usr/bin/env node

import assert from "node:assert/strict";
import { dedupeNumberingDraftsByRoot } from "../src/lib/dedupe-numbering-drafts.ts";

const drafts = [
  { id: "a-empty", rootCode: "A" },
  { id: "b-primary", rootCode: "B", primaryDrawingNumber: "B-M01" },
  { id: "a-part", rootCode: "A", partNumber: "A-P01" },
  { id: "a-complete-first", rootCode: "A", partNumber: "A-P01", drawingNumber: "A-M01" },
  { id: "a-complete-tie", rootCode: "A", partNumber: "A-P02", drawingNumber: "A-M02" },
  { id: "b-empty-explicit", rootCode: "B", drawingNumber: "", primaryDrawingNumber: "B-M02" }
];
const before = JSON.stringify(drafts);
const result = dedupeNumberingDraftsByRoot(drafts);

assert.deepEqual(result.map((draft) => draft.id), ["a-complete-first", "b-primary"]);
assert.equal(JSON.stringify(drafts), before, "dedupe does not mutate input order or facts");
assert.equal(result[0], drafts[3], "same-score ties preserve the first best record identity");
assert.equal(result[1], drafts[1], "nullish drawing fallback semantics remain stable");

console.log("QC System Health numbering draft dedupe: PASS (score, tie, order, identity, no mutation)");
