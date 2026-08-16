#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const repositoryPath = path.join(root, "src", "lib", "repositories", "drawing-workbench-async-repository.ts");
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

const overlayMethod = findMethod(sourceFile, "overlayLifecycle");
assert.ok(overlayMethod, "overlayLifecycle method exists via AST");
assert.equal(hasSqlText(overlayMethod, "drawing_number_id IN"), true, "overlay query batches drawing ids via AST");
assert.equal(hasSqlText(overlayMethod, "workflow_id IN"), true, "overlay query batches workflow ids via AST");
assert.equal(hasSqlText(overlayMethod, "request_id IN"), true, "overlay query batches request ids via AST");
assert.equal(hasCall(overlayMethod, "queryOne"), false, "overlay query path avoids per-row queryOne via AST");

const { DrawingWorkbenchAsyncRepository } = await import(pathToFileURL(repositoryPath).href);

const drawings = [
  {
    id: "drawing-1",
    companyId: "company-jenfu",
    partRootId: "root-1",
    drawingNumber: "DRW-1",
    purposeCode: "manufacturing",
    purposeDescription: "Manufacturing",
    sequenceNo: 1,
    isPrimaryManufacturing: true,
    recordStatus: "Active",
    ruleVersionId: "rule-1",
    rootCode: "ROOT-1",
    coreName: "Core 1",
    itemKind: "manufactured",
    linkedPartCount: 0,
    linkedPartNumbers: [],
    sameRootParts: [],
    titleBlockVariantWarning: false,
    warningCount: 0,
    releaseStatusMismatch: null,
    updatedAt: "2026-08-08T09:00:00.000Z"
  },
  {
    id: "drawing-2",
    companyId: "company-jenfu",
    partRootId: "root-2",
    drawingNumber: "DRW-2",
    purposeCode: "reference",
    purposeDescription: "Reference",
    sequenceNo: 2,
    isPrimaryManufacturing: false,
    recordStatus: "PendingReview",
    ruleVersionId: "rule-2",
    rootCode: "ROOT-2",
    coreName: "Core 2",
    itemKind: "manufactured",
    linkedPartCount: 0,
    linkedPartNumbers: [],
    sameRootParts: [],
    titleBlockVariantWarning: false,
    warningCount: 0,
    releaseStatusMismatch: null,
    updatedAt: "2026-08-08T08:00:00.000Z"
  },
  {
    id: "drawing-3",
    companyId: "company-jenfu",
    partRootId: "root-3",
    drawingNumber: "DRW-3",
    purposeCode: "reference",
    purposeDescription: "Reference",
    sequenceNo: 3,
    isPrimaryManufacturing: false,
    recordStatus: "Draft",
    ruleVersionId: "rule-3",
    rootCode: "ROOT-3",
    coreName: "Core 3",
    itemKind: "manufactured",
    linkedPartCount: 0,
    linkedPartNumbers: [],
    sameRootParts: [],
    titleBlockVariantWarning: false,
    warningCount: 0,
    releaseStatusMismatch: null,
    updatedAt: "2026-08-08T07:00:00.000Z"
  }
];

const lifecycleRows = [
  {
    drawing_number_id: "drawing-1",
    revision: "A",
    lifecycle_state: "in_review",
    active_correction_reason: null,
    updated_at: "2026-08-08T10:00:00.000Z",
    request_id: "request-1",
    submitted_by: "user-1",
    workflow_id: "workflow-1",
    requested_at: "2026-08-08T09:30:00.000Z"
  },
  {
    drawing_number_id: "drawing-2",
    revision: "B",
    lifecycle_state: "correction_required",
    active_correction_reason: "Add tolerance note",
    updated_at: "2026-08-08T09:15:00.000Z",
    request_id: "request-2",
    submitted_by: "user-2",
    workflow_id: "workflow-2",
    requested_at: "2026-08-08T08:45:00.000Z"
  }
];
const reviewerRows = [
  { workflow_id: "workflow-1", reviewer_id: "reviewer-a" },
  { workflow_id: "workflow-1", reviewer_id: "reviewer-b" },
  { workflow_id: "workflow-2", reviewer_id: "reviewer-c" }
];
const decisionCounts = new Map([
  ["request-1", 2],
  ["request-2", 1]
]);

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
    if (sql.includes("FROM drawing_revision_packages package")) {
      const selected = selectedParams(params);
      return lifecycleRows.filter((row) => selected.has(row.drawing_number_id));
    }
    if (sql.includes("FROM drawing_revision_lifecycle_reviewers")) {
      const selected = selectedParams(params);
      return reviewerRows.filter((row) => selected.has(row.workflow_id));
    }
    if (sql.includes("FROM approval_platform_decisions")) {
      const selected = selectedParams(params);
      return [...decisionCounts.entries()]
        .filter(([requestId]) => selected.has(requestId))
        .map(([request_id, value]) => ({ request_id, value }));
    }
    throw new Error(`Unexpected query: ${sql}`);
  }

  async queryOne(sql, params = {}) {
    this.queryCount += 1;
    if (sql.includes("FROM drawing_revision_packages package")) {
      return lifecycleRows.find((row) => row.drawing_number_id === params.drawingNumberId) ?? null;
    }
    if (sql.includes("FROM approval_platform_decisions")) {
      return { value: decisionCounts.get(String(params.requestId)) ?? 0 };
    }
    throw new Error(`Unexpected queryOne: ${sql}`);
  }

  async execute() {}
  async transaction(fn) { return fn(this); }
  async close() {}
}

async function legacyOverlay(client, rows, companyId) {
  const result = [];
  for (const drawing of rows) {
    const row = await client.queryOne(
      "SELECT package.revision FROM drawing_revision_packages package WHERE package.company_id = :companyId AND package.drawing_number_id = :drawingNumberId",
      { companyId, drawingNumberId: drawing.id }
    );
    if (!row) {
      result.push(drawing);
      continue;
    }
    const reviewers = row.workflow_id
      ? await client.query("SELECT reviewer_id FROM drawing_revision_lifecycle_reviewers WHERE workflow_id = :workflowId", { workflowId: row.workflow_id })
      : [];
    const decisionCount = row.request_id
      ? Number((await client.queryOne("SELECT COUNT(*) AS value FROM approval_platform_decisions WHERE request_id = :requestId", { requestId: row.request_id }))?.value ?? 0)
      : 0;
    result.push({
      ...drawing,
      lifecycle: {
        state: row.lifecycle_state,
        revision: row.revision,
        requestId: row.request_id,
        submittedBy: row.submitted_by,
        decisionCount,
        reviewerIds: reviewers.map((reviewer) => reviewer.reviewer_id),
        correctionReason: row.active_correction_reason
      },
      pendingApproval: row.lifecycle_state === "in_review" && row.request_id
        ? {
            count: 1,
            revisions: [row.revision],
            latestRequestedAt: row.requested_at,
            latestRequestId: row.request_id,
            workbenchHref: `/approvals?requestId=${encodeURIComponent(row.request_id)}&drawing=${encodeURIComponent(drawing.drawingNumber)}`
          }
        : null,
      updatedAt: row.updated_at > drawing.updatedAt ? row.updated_at : drawing.updatedAt
    });
  }
  return result;
}

const legacyClient = new CountingClient();
const legacyRows = await legacyOverlay(legacyClient, drawings, "company-jenfu");
const batchedClient = new CountingClient();
const repository = new DrawingWorkbenchAsyncRepository(batchedClient);
const batchedRows = await repository.overlayLifecycle(batchedClient, drawings, "company-jenfu");

assert.deepEqual(batchedRows, legacyRows, "drawing workbench lifecycle output parity");
assert.equal(legacyClient.queryCount, 7, "legacy per-drawing query count characterization");
assert.equal(batchedClient.queryCount, 3, "batched lifecycle query budget");
console.log(`QC drawing workbench query budget: PASS (legacy ${legacyClient.queryCount} queries -> batched ${batchedClient.queryCount}, deep-equal output)`);
