#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const repositoryPath = path.join(root, "src", "lib", "repositories", "bom-workbench-async-repository.ts");
const source = fs.readFileSync(repositoryPath, "utf8");
const releaseGateBlock = source.match(/private async evaluateReleaseGate\([\s\S]*?(?=\n  private normalizeWorkbenchTreeLines)/)?.[0] ?? "";
assert.match(releaseGateBlock, /this\.client\.query</);
assert.match(releaseGateBlock, /FROM items/);
assert.match(releaseGateBlock, /FROM submissions/);
assert.doesNotMatch(releaseGateBlock, /queryOne/);

const { AsyncBomWorkbenchRepository } = await import(pathToFileURL(repositoryPath).href);

const items = [
  { id: "item-a", part_number: "PN-A" },
  { id: "item-b", part_number: "PN-B" }
];
const submissions = [
  { item_id: "item-a", id: "sub-a-b", revision: "B", status: "Released", released_at: "2026-08-07T00:00:00.000Z", updated_at: null, created_at: null },
  { item_id: "item-a", id: "sub-a-a", revision: "A", status: "Released", released_at: "2026-08-06T00:00:00.000Z", updated_at: null, created_at: null },
  { item_id: "item-a", id: "sub-a-draft", revision: "C", status: "Draft", released_at: null, updated_at: "2026-08-08T00:00:00.000Z", created_at: null },
  { item_id: "item-b", id: "sub-b-a", revision: "A", status: "PendingReview", released_at: null, updated_at: "2026-08-07T00:00:00.000Z", created_at: null }
];
const lines = [
  { id: "line-missing", node_type: "item", part_number: "PN-MISSING", revision: "A" },
  { id: "line-a-old", node_type: "item", part_number: "PN-A", revision: "A" },
  { id: "line-a-any", node_type: "item", part_number: "PN-A", revision: null },
  { id: "line-b-pending", node_type: "item", part_number: "PN-B", revision: "A" },
  { id: "line-group", node_type: "group", part_number: null, revision: null }
];

function timestamp(row) {
  return row.released_at ?? row.updated_at ?? row.created_at ?? "";
}

function sortSubmissions(rows) {
  return [...rows].sort((left, right) => {
    const statusOrder = Number(left.status !== "Released") - Number(right.status !== "Released");
    if (statusOrder !== 0) return statusOrder;
    const timeOrder = timestamp(right).localeCompare(timestamp(left));
    return timeOrder !== 0 ? timeOrder : right.id.localeCompare(left.id);
  });
}

class CountingClient {
  constructor() {
    this.kind = "sqlite";
    this.queryCount = 0;
  }

  async query(sql, params = {}) {
    this.queryCount += 1;
    if (sql.includes("FROM items")) {
      const selected = Object.values(params).map((value) => String(value).toUpperCase());
      return items.filter((item) => selected.includes(item.part_number.toUpperCase()));
    }
    if (sql.includes("FROM submissions")) {
      const selected = Object.values(params).map(String);
      return submissions.filter((row) => selected.includes(row.item_id));
    }
    throw new Error(`Unexpected batch query: ${sql}`);
  }

  async queryOne(sql, params = {}) {
    this.queryCount += 1;
    if (sql.includes("FROM items")) {
      return items.find((item) => item.part_number.toUpperCase() === String(params.partNumber).toUpperCase()) ?? null;
    }
    if (sql.includes("FROM submissions")) {
      const matching = submissions.filter((row) => row.item_id === params.itemId);
      if (sql.includes("status = 'Released'")) return sortSubmissions(matching.filter((row) => row.status === "Released"))[0] ?? null;
      return sortSubmissions(matching.filter((row) => params.revision === null || row.revision.toUpperCase() === String(params.revision).toUpperCase()))[0] ?? null;
    }
    throw new Error(`Unexpected row query: ${sql}`);
  }

  async execute() {}
  async transaction(fn) { return fn(this); }
  async close() {}
}

async function legacyEvaluateReleaseGate(inputLines, client) {
  const issues = [];
  for (const line of inputLines) {
    if (line.node_type !== "item" || !line.part_number) continue;
    const item = await client.queryOne("SELECT id FROM items WHERE upper(part_number) = upper(:partNumber)", { partNumber: line.part_number });
    if (!item) {
      issues.push({ code: "missing_child_item", line_id: line.id, part_number: line.part_number, revision: line.revision, message: "Child item does not exist" });
      continue;
    }
    const childSubmission = await client.queryOne("SELECT id, revision, status FROM submissions WHERE item_id = :itemId", { itemId: item.id, revision: line.revision });
    if (!childSubmission) {
      issues.push({ code: "missing_child_revision", line_id: line.id, part_number: line.part_number, revision: line.revision, message: "Child revision submission does not exist" });
      continue;
    }
    if (childSubmission.status !== "Released") {
      issues.push({ code: "child_not_released", line_id: line.id, part_number: line.part_number, revision: line.revision, child_status: childSubmission.status, message: "Child revision is not Released" });
      continue;
    }
    const latest = await client.queryOne("SELECT revision FROM submissions WHERE item_id = :itemId AND status = 'Released'", { itemId: item.id });
    if (line.revision && latest?.revision && latest.revision.toUpperCase() !== line.revision.toUpperCase()) {
      issues.push({ code: "child_outdated_revision", line_id: line.id, part_number: line.part_number, revision: line.revision, latest_released_revision: latest.revision, message: "Child revision is not the latest Released revision" });
    }
  }
  return issues;
}

const legacyClient = new CountingClient();
const legacyIssues = await legacyEvaluateReleaseGate(lines, legacyClient);
const batchedClient = new CountingClient();
const repository = new AsyncBomWorkbenchRepository(batchedClient);
const batchedIssues = await repository.evaluateReleaseGate(lines);

assert.deepEqual(batchedIssues, legacyIssues, "release gate output parity");
assert.equal(legacyClient.queryCount, 9, "legacy query count characterization");
assert.equal(batchedClient.queryCount, 2, "batched release gate query budget");
console.log(`QC BOM release gate query budget: PASS (legacy ${legacyClient.queryCount} queries -> batched ${batchedClient.queryCount}, deep-equal output)`);
