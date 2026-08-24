#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const routes = [
  "src/app/api/approvals/requests/[requestId]/evidence/[fileId]/route.ts",
  "src/app/api/numbering/drawing-revision-packages/[packageId]/files/[fileId]/route.ts",
  "src/app/api/pdm/file-assets/[fileAssetId]/route.ts"
];

for (const route of routes) {
  const source = fs.readFileSync(route, "utf8");
  assert.match(source, /PREVIEW_NOT_READY/);
  assert.match(source, /status:\s*202/);
  assert.match(source, /"retry-after":\s*"2"/);
  assert.match(source, /"x-pdm-preview-state":\s*"pending"/);
}

const preview = fs.readFileSync("src/components/drawing-detail-preview.tsx", "utf8");
assert.match(preview, /response\.status === 202/);

console.log("QC DEV-074 preview pending console safety: PASS (all rendered preview routes use accepted/pending semantics)");
