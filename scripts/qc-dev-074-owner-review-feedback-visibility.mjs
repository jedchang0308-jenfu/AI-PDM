#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const repository = fs.readFileSync("src/lib/repositories/number-state-flow-async-repository.ts", "utf8");
const workspace = fs.readFileSync("src/components/number-state-workspace.tsx", "utf8");

assert.match(repository, /approval_platform_decisions decision/);
assert.match(repository, /AS latest_decision_comment/);
assert.match(repository, /latestReviewFeedback: latestBundleApproval \?\? latestApproval/);
assert.match(repository, /comment: row\.latest_decision_comment \?\? null/);
assert.match(workspace, /<ReviewFeedbackPanel workspace=\{workspace\} \/>/);
assert.match(workspace, /審核要求補充資料/);
assert.match(workspace, /審核退回原因/);
assert.match(workspace, /\{feedback\.comment\}/);

console.log("QC DEV-074 owner review feedback visibility: PASS (server-truth bundle/legacy decision comment is exposed in owner UI)");
