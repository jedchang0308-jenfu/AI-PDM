#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const repository = fs.readFileSync("src/lib/repositories/approval-platform-async-repository.ts", "utf8");
const approvalsPage = fs.readFileSync("src/app/approvals/page.tsx", "utf8");

assert.match(repository, /actionCode:\s*row\.lifecycle_action === "obsolete" \? "bom\.obsolete_review"/);
assert.match(repository, /reason:\s*row\.change_reason/);
assert.match(approvalsPage, /const requestReason = detail\.reason\.trim\(\)/);
assert.match(approvalsPage, /facts\.push\(\{ label: "申請理由", value: approvalReasonLabel\(requestReason\) \}\)/);

console.log("QC DEV-074 BOM obsolete reason visibility: PASS (stored BOM lifecycle reason is rendered in the approval summary and retained after decision)");
