#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { AsyncSubmissionStatusRepository } from "@/lib/repositories/submission-status-async-repository";

const submissionId = "SUB-QC-DEV074-MERGED-SANDBOX";
const sourceSubmissionId = "SUB-QC-DEV074-SOURCE";
const client = {
  kind: "sqlite",
  async query() {
    throw new Error("terminal sandbox actionability must return before downstream list queries");
  },
  async queryOne(sql) {
    if (sql.includes("FROM submissions s")) {
      return {
        id: submissionId,
        company_id: "company-qc",
        item_id: "item-qc",
        drawing_number: "A0007-M01",
        revision: "0.6-SBX-QC",
        corrects_submission_id: null,
        source_entity_type: null,
        source_entity_id: null,
        source_part_number_id: null,
        source_part_number: null,
      };
    }
    if (sql.includes("FROM sandbox_branches b") && sql.includes("b.status IN ('promoted', 'closed')")) {
      return {
        id: "branch-qc",
        source_submission_id: sourceSubmissionId,
        sandbox_submission_id: submissionId,
        branch_name: "QC074 合併歷史",
        status: "promoted",
        merged_at: "2026-08-16T00:00:00.000Z",
        source_drawing_number: "A0007-M01",
        source_revision: "0.6",
      };
    }
    throw new Error(`unexpected query: ${sql.slice(0, 120)}`);
  },
  async execute() {
    throw new Error("read-only actionability check must not execute mutations");
  },
  async transaction(callback) {
    return callback(this);
  },
  async close() {},
};

const actionability = await new AsyncSubmissionStatusRepository(client).getSubmissionReleaseActionability({ id: submissionId });
assert.equal(actionability.allowed, false);
assert.equal(actionability.code, "SUBMISSION_RELEASE_TERMINAL_SANDBOX");
assert.match(actionability.message, /已合併/);
assert.match(actionability.message, /只供追溯/);
assert.equal(actionability.recovery_href, `/submissions/${sourceSubmissionId}`);

const dashboard = fs.readFileSync("src/components/dashboard.tsx", "utf8");
const directPage = fs.readFileSync("src/app/submissions/[id]/page.tsx", "utf8");
const rejectRoute = fs.readFileSync("src/app/api/submissions/[id]/reject/route.ts", "utf8");
const cancelRoute = fs.readFileSync("src/app/api/submissions/[id]/cancel/route.ts", "utf8");
const checkoutRoute = fs.readFileSync("src/app/api/submissions/[id]/checkout/route.ts", "utf8");
const sandboxRoute = fs.readFileSync("src/app/api/submissions/[id]/sandbox/[branchId]/route.ts", "utf8");

for (const [name, source] of [
  ["dashboard", dashboard],
  ["direct submission page", directPage],
  ["reject route", rejectRoute],
  ["cancel route", cancelRoute],
  ["checkout route", checkoutRoute],
  ["sandbox route", sandboxRoute],
]) {
  assert.match(source, /startsWith\("SUBMISSION_RELEASE_TERMINAL_"\)/, `${name} must honor every terminal release state`);
}
assert.match(dashboard, /返回來源圖面/);
assert.match(directPage, /返回來源圖面/);

console.log("QC DEV-074 merged sandbox terminal read-only: PASS");
