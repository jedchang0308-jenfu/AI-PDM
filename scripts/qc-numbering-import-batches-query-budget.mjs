#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { pathToFileURL } from "node:url";

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

function findFunction(sourceFileToSearch, name) {
  let match = null;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) match = node;
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

const listMethod = findMethod(sourceFile, "listNumberingImportBatches");
const preloadMethod = findMethod(sourceFile, "preloadImportBatchRows");
const stagingSqlFunction = findFunction(sourceFile, "selectAsyncImportStagingRowsByBatchesSql");
assert.ok(listMethod, "listNumberingImportBatches method exists via AST");
assert.ok(preloadMethod, "preloadImportBatchRows method exists via AST");
assert.ok(stagingSqlFunction, "selectAsyncImportStagingRowsByBatchesSql function exists via AST");
assert.equal(hasCall(listMethod, "preloadImportBatchRows"), true, "list method preloads staging rows via AST");
assert.equal(hasSqlText(stagingSqlFunction, "WHERE import_batch_id IN ("), true, "staging SQL function uses import batch IN contract via AST");

const { AsyncNumberingRepository } = await import(pathToFileURL(repositoryPath).href);

const batches = [
  { id: "import-1", company_id: "company-jenfu", source_filename: "one.csv", source_hash: "hash-1", status: "staged", summary_json: '{"total":1}', imported_by: "user-1", confirmed_by: null, confirmed_at: null },
  { id: "import-2", company_id: "company-jenfu", source_filename: "two.csv", source_hash: "hash-2", status: "confirmed", summary_json: '{"total":2}', imported_by: "user-2", confirmed_by: "user-3", confirmed_at: "2026-08-08T09:00:00.000Z" },
  { id: "import-3", company_id: "company-jenfu", source_filename: "three.csv", source_hash: null, status: "rejected", summary_json: '{"total":0}', imported_by: "user-4", confirmed_by: null, confirmed_at: null }
];
const stagingRows = [
  { id: "stage-1", import_batch_id: "import-1", row_no: 1, raw_json: '{"rootCode":"ROOT-1"}', check_status: "valid", issue_json: "[]" },
  { id: "stage-2", import_batch_id: "import-2", row_no: 1, raw_json: '{"rootCode":"ROOT-2"}', check_status: "conflict", issue_json: '[{"code":"ROOT_EXISTS","message":"Root exists."}]' },
  { id: "stage-3", import_batch_id: "import-2", row_no: 2, raw_json: '{"partNumber":"PN-2"}', check_status: "need_info", issue_json: '[{"code":"NAME_REQUIRED","message":"Name required."}]' }
];

function selectedParams(params) {
  return new Set(Object.values(params).map(String));
}

class CountingClient {
  constructor() {
    this.kind = "sqlite";
    this.queryCount = 0;
  }

  async query(sql, params = {}) {
    this.queryCount += 1;
    if (sql.includes("FROM import_batches")) return batches;
    if (sql.includes("FROM import_staging_rows")) {
      const selected = selectedParams(params);
      return stagingRows.filter((row) => selected.has(row.import_batch_id));
    }
    throw new Error(`Unexpected query: ${sql}`);
  }

  async queryOne() {
    throw new Error("queryOne is not expected in import batch list query budget");
  }

  async execute() {}
  async transaction(fn) { return fn(this); }
  async close() {}
}

const legacyClient = new CountingClient();
const legacyRepository = new AsyncNumberingRepository(legacyClient);
const legacyRows = [];
const listedRows = await legacyClient.query("SELECT * FROM import_batches", { companyId: "company-jenfu", status: "all", limit: 20 });
for (const row of listedRows) legacyRows.push(await legacyRepository.mapImportBatchInClient(legacyClient, row));

const batchedClient = new CountingClient();
const batchedRepository = new AsyncNumberingRepository(batchedClient);
const batchedRows = await batchedRepository.listNumberingImportBatches({ companyId: "company-jenfu", status: "all", limit: 20 });

assert.deepEqual(batchedRows, legacyRows, "numbering import batch list output parity");
assert.equal(legacyClient.queryCount, 4, "legacy per-batch staging query count characterization");
assert.equal(batchedClient.queryCount, 2, "batched import batch list query budget");
console.log(`QC numbering import batches query budget: PASS (legacy ${legacyClient.queryCount} queries -> batched ${batchedClient.queryCount}, deep-equal output)`);
