#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const repositoryPath = path.join(root, "src", "lib", "repositories", "approval-platform-async-repository.ts");
const source = fs.readFileSync(repositoryPath, "utf8");
const inboxBlock = source.match(/private async listNativeInbox[\s\S]*?(?=\n  private statusWhereClause)/)?.[0] ?? "";
assert.match(inboxBlock, /FROM approval_platform_targets/);
assert.match(inboxBlock, /request_id IN/);
assert.doesNotMatch(inboxBlock, /await this\.listTargets\(/);
assert.match(inboxBlock, /hideSupersededNeedsInfo/);
assert.match(inboxBlock, /newer_request\.requested_at > r\.requested_at/);
assert.match(inboxBlock, /current_workspace\.target_type = 'numbering_draft_workspace'/);
assert.match(inboxBlock, /nativeApprovalSearchPredicate/);

const { AsyncApprovalPlatformRepository } = await import(pathToFileURL(repositoryPath).href);

const nativeRows = [
  {
    id: "native-1",
    company_id: "company-jenfu",
    package_id: null,
    action_code: "numbering.create",
    domain_code: "numbering",
    request_status: "pending",
    title: "Create number",
    reason: "QC request 1",
    requested_by: "user-1",
    requested_by_name: "User One",
    requested_at: "2026-08-08T10:00:00.000Z",
    resolved_by: null,
    resolved_at: null,
    apply_status: "not_ready",
    apply_attempts: 0,
    apply_error: null,
    payload_json: "{}",
    action_title: "建立編號",
    package_code: null,
    package_status: null,
    superseded_by_request_id: null,
    superseded_at: null
  },
  {
    id: "native-2",
    company_id: "company-jenfu",
    package_id: "package-2",
    action_code: "numbering.release",
    domain_code: "numbering",
    request_status: "needs_info",
    title: "Release number",
    reason: "QC request 2",
    requested_by: "user-2",
    requested_by_name: "User Two",
    requested_at: "2026-08-08T09:00:00.000Z",
    resolved_by: null,
    resolved_at: null,
    apply_status: "pending",
    apply_attempts: 1,
    apply_error: null,
    payload_json: "{}",
    action_title: "發行編號",
    package_code: "PKG-2",
    package_status: "pending",
    superseded_by_request_id: null,
    superseded_at: null
  }
];
const targetRows = [
  { request_id: "native-1", id: "target-1b", target_role: "child", target_type: "part", target_id: "part-1", target_code: "PN-1", target_label: "Part 1", target_status: "Draft", snapshot_json: "{}", sort_order: 2 },
  { request_id: "native-1", id: "target-1a", target_role: "primary", target_type: "root", target_id: "root-1", target_code: "ROOT-1", target_label: "Root 1", target_status: "Active", snapshot_json: "{}", sort_order: 1 },
  { request_id: "native-2", id: "target-2a", target_role: "primary", target_type: "drawing", target_id: "drawing-2", target_code: "DRW-2", target_label: "Drawing 2", target_status: "Pending", snapshot_json: "{}", sort_order: 1 }
];

function mapTarget(row) {
  return {
    id: row.id,
    role: row.target_role,
    type: row.target_type,
    targetId: row.target_id,
    code: row.target_code,
    label: row.target_label,
    status: row.target_status,
    snapshot: {}
  };
}

function toItem(row, targets) {
  const primary = targets.find((target) => target.role === "primary") ?? targets[0];
  return {
    rowKey: `approval:platform:${row.id}`,
    id: row.id,
    source: "platform",
    companyId: row.company_id,
    actionCode: row.action_code,
    actionTitle: row.action_title,
    domainCode: row.domain_code,
    title: row.title,
    status: row.request_status,
    reason: row.reason,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    requestedAt: row.requested_at,
    packageId: row.package_id,
    packageCode: row.package_code,
    packageStatus: row.package_status,
    targetSummary: primary?.code ?? primary?.label ?? primary?.target_id ?? "未指定目標",
    impactSummary: null,
    legacy: null,
    historyOnly: Boolean(row.superseded_by_request_id),
    supersededByRequestId: row.superseded_by_request_id,
    supersededAt: row.superseded_at,
    primaryTarget: primary ? { type: primary.type, targetId: primary.targetId, code: primary.code, label: primary.label } : undefined
  };
}

class CountingClient {
  constructor() {
    this.kind = "sqlite";
    this.queryCount = 0;
  }

  async query(sql, params = {}) {
    this.queryCount += 1;
    if (sql.includes("FROM approval_platform_requests")) return nativeRows;
    if (sql.includes("FROM approval_platform_targets")) {
      const requestedIds = new Set(Object.values(params).map(String));
      return targetRows.filter((row) => requestedIds.has(row.request_id));
    }
    if (sql.includes("FROM approval_platform_impact_snapshots")) return [];
    throw new Error(`Unexpected query: ${sql}`);
  }

  async queryOne() {
    throw new Error("queryOne is not expected in inbox query budget");
  }

  async execute() {}
  async transaction(fn) { return fn(this); }
  async close() {}
}

async function legacyListNativeInbox(client) {
  const rows = await client.query("SELECT * FROM approval_platform_requests");
  const items = [];
  for (const row of rows) {
    const rowsForRequest = await client.query("SELECT * FROM approval_platform_targets WHERE request_id = :requestId", { requestId: row.id });
    items.push(toItem(row, rowsForRequest.map(mapTarget)));
  }
  return items;
}

const legacyClient = new CountingClient();
const legacyItems = await legacyListNativeInbox(legacyClient);
const batchedClient = new CountingClient();
const repository = new AsyncApprovalPlatformRepository(batchedClient);
const batchedItems = await repository.listNativeInbox({ companyId: "company-jenfu", status: "all", limit: 100 });

assert.deepEqual(batchedItems, legacyItems, "native inbox output parity");
assert.equal(legacyClient.queryCount, 3, "legacy query count characterization");
assert.equal(batchedClient.queryCount, 3, "batched native inbox query budget");
console.log(`QC approval inbox query budget: PASS (legacy ${legacyClient.queryCount} queries -> batched ${batchedClient.queryCount}, deep-equal output)`);
