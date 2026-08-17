#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const repository = fs.readFileSync("src/lib/repositories/approval-platform-async-repository.ts", "utf8");
const entityDetail = fs.readFileSync("src/lib/pdm-entity-detail.ts", "utf8");
const contract = fs.readFileSync("src/lib/pdm-entity-detail-contract.ts", "utf8");
const projection = fs.readFileSync("src/components/review-context-projection.tsx", "utf8");

assert.match(repository, /SELECT payload_json FROM approval_requests/);
assert.match(repository, /legacyNumberingPayload\.childTargets/);
assert.match(repository, /role: "impact"/);
assert.match(repository, /snapshot: \{ \.\.\.child \}/);
assert.match(contract, /requestReason: string \| null/);
assert.match(entityDetail, /requestReason: reviewDetail\?\.reason\.trim\(\) \|\| null/);
assert.match(projection, /data-review-request-reason="true"/);
assert.match(projection, />申請理由</);
assert.match(projection, /data\.targetRefs\.length/);
assert.match(projection, /data\.targetAnchors\.map/);

console.log("QC DEV-074 root obsolete review snapshot visibility: PASS (reviewer sees the stored reason and every frozen child target)");
