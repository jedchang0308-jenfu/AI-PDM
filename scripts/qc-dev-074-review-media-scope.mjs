#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const scope = fs.readFileSync("src/lib/pdm-review-scope.ts", "utf8");
assert.match(scope, /targetRefs\?: PdmReviewScopeTargetRef\[\]/);
assert.match(scope, /target\.target_type = :scopePairType\$\{index\} AND target\.target_id = :scopePairId\$\{index\}/);
assert.match(scope, /targetRef\.type === target\.type && targetRef\.id === target\.id/);

const packageMedia = fs.readFileSync(
  "src/app/api/numbering/drawing-revision-packages/[packageId]/files/[fileId]/route.ts",
  "utf8"
);
const sourceLookup = packageMedia.indexOf("const source = await client.queryOne<PackagePreviewSourceRow>");
const scopeLookup = packageMedia.indexOf("const scope = await resolvePdmReviewScopeReceiptAsync");
assert.ok(sourceLookup >= 0 && scopeLookup > sourceLookup, "media source relation must be resolved before review authorization");
assert.match(packageMedia, /\{ type: "drawing_revision_package", id: decodedPackageId \}/);
assert.match(packageMedia, /\{ type: "drawing_number", id: source\.drawing_number_id \}/);
assert.match(packageMedia, /\{ type: "part_root", id: source\.part_root_id \}/);
assert.match(packageMedia, /type: "part_number", id: part\.part_number_id/);
assert.match(packageMedia, /type: "submission", id: source\.source_submission_id/);

const approvals = fs.readFileSync("src/lib/repositories/approval-platform-async-repository.ts", "utf8");
assert.match(
  approvals,
  /primaryTarget:\s*\{\s*type: "submission",\s*targetId: row\.submission_id/
);

console.log("QC DEV-074 review media scope: PASS (package evidence is authorized by exact canonical lifecycle relations)");
