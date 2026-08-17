#!/usr/bin/env node

import assert from "node:assert/strict";
import { shouldActivateLinkFromKeyboard } from "../src/lib/keyboard-link-activation.ts";
import {
  resolveNumberingSearchDetailTarget,
  shouldDeferNumberingSearchShortcut
} from "../src/lib/numbering-search-target.ts";

const root = resolveNumberingSearchDetailTarget({ entityType: "part_root", rootCode: " A0005 " });
assert.deepEqual(root, { entityType: "part_root", rootCode: "A0005" });

const drawing = resolveNumberingSearchDetailTarget({
  entityType: "drawing_number",
  rootCode: "A0005",
  drawingNumber: " A0005-M01 "
});
assert.deepEqual(drawing, { entityType: "drawing_number", rootCode: "A0005", drawingNumber: "A0005-M01" });

const part02 = resolveNumberingSearchDetailTarget({
  entityType: "part_number",
  rootCode: "A0005",
  partNumber: "A0005-P02"
});
const part03 = resolveNumberingSearchDetailTarget({
  entityType: "part_number",
  rootCode: "A0005",
  partNumber: "A0005-P03"
});
assert.deepEqual(part02, { entityType: "part_number", rootCode: "A0005", partNumber: "A0005-P02" });
assert.deepEqual(part03, { entityType: "part_number", rootCode: "A0005", partNumber: "A0005-P03" });
assert.notDeepEqual(part02, root, "part keyboard target must not collapse to its root");
assert.notDeepEqual(part03, root, "part keyboard target must not collapse to its root");

for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]) {
  assert.equal(shouldDeferNumberingSearchShortcut({ tagName }), true, `${tagName} owns its keyboard action`);
}
assert.equal(shouldDeferNumberingSearchShortcut({ tagName: "DIV", role: "button" }), true);
assert.equal(shouldDeferNumberingSearchShortcut({ tagName: "DIV", isContentEditable: true }), true);
assert.equal(shouldDeferNumberingSearchShortcut({ tagName: "DIV" }), false);

assert.equal(shouldActivateLinkFromKeyboard({ key: "Enter" }), true);
assert.equal(shouldActivateLinkFromKeyboard({ key: " " }), false, "Space keeps native anchor semantics");
for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) {
  assert.equal(shouldActivateLinkFromKeyboard({ key: "Enter", [modifier]: true }), false, `${modifier}+Enter is not intercepted`);
}

console.log("PASS numbering search exact keyboard targets");
