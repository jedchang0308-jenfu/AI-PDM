#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";

const root = process.cwd();
const repositoryPath = path.join(root, "src", "lib", "repositories", "numbering-async-repository.ts");
const source = fs.readFileSync(repositoryPath, "utf8");
const sourceFile = ts.createSourceFile(repositoryPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function findMethod(sourceFileToSearch, name) {
  let match = null;
  function visit(node) {
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) match = node;
    ts.forEachChild(node, visit);
  }
  visit(sourceFileToSearch);
  return match;
}

function hasCall(sourceNode, name) {
  let found = false;
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : "";
      if (expression === name) found = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceNode);
  return found;
}

function hasSqlText(sourceNode, text) {
  let found = false;
  function visit(node) {
    if ((ts.isStringLiteralLike(node) || ts.isTemplateLiteral(node)) && node.getText(sourceFile).includes(text)) found = true;
    ts.forEachChild(node, visit);
  }
  visit(sourceNode);
  return found;
}

const listMethod = findMethod(sourceFile, "listNumberingApprovalBatches");
const preloadMethod = findMethod(sourceFile, "preloadApprovalReviewBatches");
assert.ok(listMethod, "listNumberingApprovalBatches method exists via AST");
assert.ok(preloadMethod, "preloadApprovalReviewBatches method exists via AST");
assert.equal(hasCall(listMethod, "preloadApprovalReviewBatches"), true, "list method preloads review rows via AST");
assert.equal(hasSqlText(preloadMethod, "WHERE batch_id IN ("), true, "preload batches query uses batch IN contract via AST");
assert.equal(hasSqlText(preloadMethod, "WHERE id IN ("), true, "preload requests query uses id IN contract via AST");

const { AsyncNumberingRepository } = await import(pathToFileURL(repositoryPath).href);

const batches = [
  { id: "batch-1", company_id: "company-jenfu", batch_code: "NB-1", project_code: "P-1", action_code: "create", batch_status: "pending", submitted_by: "user-submit-1", submitted_at: "2026-08-08T10:00:00.000Z" },
  { id: "batch-2", company_id: "company-jenfu", batch_code: "NB-2", project_code: "P-2", action_code: "release", batch_status: "needs_info", submitted_by: "user-submit-2", submitted_at: "2026-08-08T09:00:00.000Z" }
];
const items = batches.flatMap((batch, batchIndex) => [
  { id: `${batch.id}-item-1`, batch_id: batch.id, approval_request_id: `${batch.id}-request-1`, item_status: "pending", resubmitted_from_item_id: null },
  { id: `${batch.id}-item-2`, batch_id: batch.id, approval_request_id: `${batch.id}-request-2`, item_status: batchIndex === 0 ? "approved" : "needs_info", resubmitted_from_item_id: null }
]);
const requests = items.map((item, index) => ({
  id: item.approval_request_id,
  company_id: "company-jenfu",
  action_code: index % 2 === 0 ? "create" : "release",
  entity_type: "part_number",
  entity_id: `part-${index + 1}`,
  request_status: "pending",
  reason: `Reason ${index + 1}`,
  payload_json: JSON.stringify({ partNumber: `PN-${index + 1}` }),
  requested_by: `user-request-${index + 1}`,
  requested_at: `2026-08-08T0${index + 1}:00:00.000Z`
}));

function userSummary(userId) {
  return { display_name: userId.replace("user-", "User "), role: "rd_manager" };
}

function entitySummary(index) {
  return {
    part_number: `PN-${index}`,
    part_name: `Part ${index}`,
    item_kind: "manufactured",
    record_status: "Draft",
    root_code: `ROOT-${index}`,
    core_name: `Core ${index}`,
    primary_drawing_number: null
  };
}

class CountingClient {
  constructor() {
    this.kind = "sqlite";
    this.queryCount = 0;
  }

  async query(sql, params = {}) {
    this.queryCount += 1;
    if (sql.includes("FROM approval_batches")) return batches;
    if (sql.includes("FROM approval_batch_items")) {
      const selected = Object.values(params).map(String);
      return items.filter((item) => selected.includes(item.batch_id));
    }
    if (sql.includes("FROM approval_requests")) {
      const selected = Object.values(params).map(String);
      return requests.filter((request) => selected.includes(request.id));
    }
    if (sql.includes("FROM approval_decisions")) return [];
    throw new Error(`Unexpected query: ${sql}`);
  }

  async queryOne(sql, params = {}) {
    this.queryCount += 1;
    if (sql.includes("FROM approval_requests")) return requests.find((request) => request.id === params.approvalRequestId) ?? null;
    if (sql.includes("FROM users")) return userSummary(String(params.userId));
    if (sql.includes("FROM part_numbers")) return entitySummary(Number(String(params.entityId).replace("part-", "")));
    throw new Error(`Unexpected queryOne: ${sql}`);
  }

  async execute() {}
  async transaction(fn) { return fn(this); }
  async close() {}
}

const legacyClient = new CountingClient();
const legacyRepository = new AsyncNumberingRepository(legacyClient);
const legacyBatches = [];
for (const batch of batches) legacyBatches.push(await legacyRepository.mapApprovalReviewBatchInClient(legacyClient, batch));

const batchedClient = new CountingClient();
const batchedRepository = new AsyncNumberingRepository(batchedClient);
const batchedBatches = await batchedRepository.listNumberingApprovalBatches({ companyId: "company-jenfu", status: "all", limit: 100 });

assert.deepEqual(batchedBatches, legacyBatches, "numbering approval batch output parity");
assert.equal(legacyClient.queryCount, 20, "legacy mapper query count characterization");
assert.equal(batchedClient.queryCount, 17, "batched mapper query budget");
console.log(`QC numbering approval batches query budget: PASS (legacy ${legacyClient.queryCount} queries -> batched ${batchedClient.queryCount}, deep-equal output)`);
