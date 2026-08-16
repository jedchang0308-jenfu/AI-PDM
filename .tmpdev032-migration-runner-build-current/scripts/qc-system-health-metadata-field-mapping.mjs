#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  flattenMetadataObject,
  normalizeMetadataKey,
  pickAliasedMetadataFields
} from "../src/lib/pdm-metadata-field-mapping.ts";

const aliases = {
  drawing_number: ["drawing_number", "dwg_no"],
  material: ["material"]
};
const values = {
  "Custom.Properties.DWG_No": " D-100 ",
  "Drawing Number": "D-200",
  "Properties.Material": " SUS304 ",
  ignored: "value",
  empty: "   "
};

assert.equal(normalizeMetadataKey(" Drawing_Number (ERP) "), "drawingnumbererp");
assert.deepEqual(
  flattenMetadataObject({ custom: { properties: { drawing_no: "D-100" } }, tags: ["a", "b"] }),
  { "custom.properties.drawing_no": "D-100", tags: ["a", "b"] },
  "nested records are flattened while arrays stay intact"
);
assert.deepEqual(
  pickAliasedMetadataFields(values, aliases),
  { drawing_number: "D-100", material: "SUS304" },
  "nested suffixes, key normalization, trimming and first-match precedence remain stable"
);
assert.deepEqual(values, {
  "Custom.Properties.DWG_No": " D-100 ",
  "Drawing Number": "D-200",
  "Properties.Material": " SUS304 ",
  ignored: "value",
  empty: "   "
}, "mapping does not mutate input facts");

console.log("QC System Health metadata field mapping: PASS (aliases, nested keys, precedence, no mutation)");
