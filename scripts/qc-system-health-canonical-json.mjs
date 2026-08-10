#!/usr/bin/env node

import assert from "node:assert/strict";
import { canonicalJsonStringify, canonicalJsonValue } from "../src/lib/canonical-json.ts";
import {
  canonicalNumberLifecycleJson
} from "../src/lib/repositories/number-lifecycle-simplification-async-repository.ts";
import {
  canonicalNumberStateJson
} from "../src/lib/repositories/number-state-flow-async-repository.ts";

const fixture = {
  z: 1,
  a: { y: 2, b: [{ d: 4, c: 3 }] },
  list: [3, { y: 2, x: 1 }]
};
const before = JSON.stringify(fixture);
const expected = '{"a":{"b":[{"c":3,"d":4}],"y":2},"list":[3,{"x":1,"y":2}],"z":1}';

assert.equal(canonicalJsonStringify(fixture), expected, "nested object keys are sorted and array order is preserved");
assert.deepEqual(
  canonicalJsonValue(fixture),
  { a: { b: [{ c: 3, d: 4 }], y: 2 }, list: [3, { x: 1, y: 2 }], z: 1 },
  "canonical value preserves JSON facts"
);
assert.equal(JSON.stringify(fixture), before, "canonicalization does not mutate its input");
assert.equal(canonicalNumberLifecycleJson(fixture), expected, "number lifecycle wrapper preserves its contract");
assert.equal(canonicalNumberStateJson(fixture), expected, "number state wrapper preserves its contract");

console.log("QC System Health canonical JSON: PASS (shared pure helper, stable wrappers, no input mutation)");
