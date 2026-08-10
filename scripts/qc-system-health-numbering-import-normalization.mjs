#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  canonicalImportedRootName,
  importedDrawingSequence,
  importedPartSequence
} from "../src/lib/numbering-import-normalization.ts";

assert.equal(canonicalImportedRootName("", " Pump Housing "), "Pump Housing");
assert.equal(canonicalImportedRootName(" Pump ", ""), "Pump");
assert.equal(canonicalImportedRootName("Pump", "Pump"), "Pump");
assert.equal(canonicalImportedRootName("Pump", "Pump Housing"), "Pump Housing");
assert.equal(canonicalImportedRootName("Pump", "Motor"), "Pump");

assert.equal(importedPartSequence("A0001-P07"), 7);
assert.equal(importedPartSequence("00001-P08"), 8);
assert.equal(importedPartSequence("LEGACY-123"), 123);
assert.equal(importedPartSequence("invalid"), 0);

assert.equal(importedDrawingSequence("A0001-M07"), 7);
assert.equal(importedDrawingSequence("00001-R08"), 8);
assert.equal(importedDrawingSequence("LEGACY-MA3"), 3);
assert.equal(importedDrawingSequence("invalid"), 1);

console.log("QC System Health numbering import normalization: PASS (root names, V1/V2/V3 sequences, fallbacks)");
