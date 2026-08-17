#!/usr/bin/env node

import assert from "node:assert/strict";
import { lowestAvailableSequence } from "../src/lib/numbering-sequence-utils.ts";

const values = [3, 1, 1, 0, -1, 8, 2.5, Number.NaN];
const before = [...values];
assert.equal(lowestAvailableSequence(values, 5, "PART"), 2, "invalid, duplicate and out-of-range values are ignored");
assert.equal(lowestAvailableSequence([2, 3], 3, "PART"), 1, "the first gap is returned");
assert.equal(lowestAvailableSequence([1, 3], 3, "PART"), 2, "an internal gap is returned");
assert.throws(
  () => lowestAvailableSequence([1, 2, 3], 3, "DRAWING"),
  (error) => error instanceof Error && error.message === "DRAWING_SEQUENCE_EXHAUSTED"
);
assert.deepEqual(values, before, "sequence selection does not mutate input values");

console.log("QC System Health numbering sequence utility: PASS (filter, dedupe, gaps, exhaustion, no mutation)");
