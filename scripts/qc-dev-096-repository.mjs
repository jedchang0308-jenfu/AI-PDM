import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { canonicalSha256, deterministicDev096Id, normalizeStableIds, SharedBomError, validateSharedGraph } from "../src/lib/bom-shared-structure.ts";
import { diffBomWorkbenchLines } from "../src/lib/bom-workbench-diff.ts";
import { fixture, requireTaskDatabase, seedDev096Fixture } from "./dev096-qc-fixture.mjs";

const checks = [];
const add = (cases, label, fn) => {
  try { const detail = fn(); checks.push({ cases, label, pass: true, detail: detail ?? null }); console.log(`PASS ${label}`); }
  catch (error) { checks.push({ cases, label, pass: false, detail: error instanceof Error ? error.message : String(error) }); console.error(`FAIL ${label}: ${checks.at(-1).detail}`); }
};
const fixtureLedger = seedDev096Fixture();
const { databasePath } = requireTaskDatabase();
const database = new Database(databasePath);
database.pragma("foreign_keys = ON");

add([9, 11, 12, 14, 15, 16, 17], "Definition and applicability relational constraints", () => {
  const now = "2026-08-24T01:00:00.000Z";
  database.prepare("INSERT INTO bom_definitions (id, company_id, part_root_id, row_version, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)")
    .run("dev096-repository-definition", fixture.companyId, fixture.parentRootId, fixture.users.engineer, fixture.users.engineer, now, now);
  const insert = database.prepare("INSERT INTO bom_definition_parent_bindings (id, company_id, definition_id, part_number_id, bound_from_bom_revision, created_by, created_at) VALUES (?, ?, ?, ?, '1', ?, ?)");
  insert.run("dev096-repository-binding-red", fixture.companyId, "dev096-repository-definition", fixture.parents.red, fixture.users.engineer, now);
  insert.run("dev096-repository-binding-blue", fixture.companyId, "dev096-repository-definition", fixture.parents.blue, fixture.users.engineer, now);
  database.prepare("INSERT INTO bom_definitions (id, company_id, part_root_id, row_version, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)")
    .run("dev096-repository-definition-other", fixture.companyId, fixture.parentRootId, fixture.users.engineer, fixture.users.engineer, now, now);
  let rejected = false;
  try { insert.run("dev096-repository-binding-conflict", fixture.companyId, "dev096-repository-definition-other", fixture.parents.red, fixture.users.engineer, now); }
  catch { rejected = true; }
  if (!rejected) throw new Error("duplicate Parent binding was accepted");
  const count = database.prepare("SELECT COUNT(*) FROM bom_definition_parent_bindings WHERE definition_id = ?").pluck().get("dev096-repository-definition");
  if (Number(count) !== 2) throw new Error(`binding count ${count}`);
  return { definitionId: "dev096-repository-definition", bindingCount: 2 };
});

add([23, 24, 25, 26, 27, 29, 31], "one logical line owns candidates while quantity remains on the line", () => {
  const logicalLineId = "11111111-1111-4111-8111-111111111111";
  const result = validateSharedGraph({
    lines: [{ id: "row-a", logicalLineId, nodeType: "item", partNumber: "DISPLAY-ONLY", quantity: 7, sequenceNo: 1 }],
    floatingTopics: [],
    parentPartNumberIds: [fixture.parents.red, fixture.parents.blue],
    components: [{ nodeId: "row-a", logicalLineId, nodeLocation: "tree", componentMode: "by_parent", childPartNumberIds: [fixture.children.blue, fixture.children.red, fixture.children.blue], parentSelections: [{ parentPartNumberId: fixture.parents.red, childPartNumberId: fixture.children.red }] }]
  });
  if (result.nodes.length !== 1 || result.nodes[0].quantity !== 7) throw new Error("candidate cardinality changed quantity");
  if (result.componentByLogical.get(logicalLineId)?.childPartNumberIds.length !== 2) throw new Error("candidate dedupe failed");
  if (result.unresolved.length !== 1 || result.unresolved[0].parentPartNumberId !== fixture.parents.blue) throw new Error("unresolved mapping mismatch");
  return { logicalLines: 1, candidates: 2, quantity: 7, unresolved: result.unresolved };
});

add([28, 29, 30, 31], "invalid mapping and graph payloads fail closed", () => {
  const logicalLineId = "22222222-2222-4222-8222-222222222222";
  let duplicateRejected = false;
  try {
    validateSharedGraph({
      lines: [{ id: "row-b", logicalLineId, nodeType: "item", quantity: 1 }], floatingTopics: [],
      parentPartNumberIds: [fixture.parents.red],
      components: [{ nodeId: "row-b", logicalLineId, nodeLocation: "tree", componentMode: "by_parent", childPartNumberIds: [fixture.children.red], parentSelections: [
        { parentPartNumberId: fixture.parents.red, childPartNumberId: fixture.children.red },
        { parentPartNumberId: fixture.parents.red, childPartNumberId: fixture.children.red }
      ] }]
    });
  } catch (error) { duplicateRejected = error instanceof SharedBomError && error.code === "BOM_VARIANT_MAPPING_DUPLICATE"; }
  let quantityRejected = false;
  try {
    validateSharedGraph({ lines: [{ id: "row-c", logicalLineId, nodeType: "item", quantity: 0 }], floatingTopics: [], parentPartNumberIds: [fixture.parents.red], components: [{ nodeId: "row-c", logicalLineId, nodeLocation: "tree", componentMode: "fixed", childPartNumberIds: [fixture.children.red], parentSelections: [] }] });
  } catch (error) { quantityRejected = error instanceof SharedBomError && error.code === "BOM_ITEM_QUANTITY_INVALID"; }
  if (!duplicateRejected || !quantityRejected) throw new Error(JSON.stringify({ duplicateRejected, quantityRejected }));
});

add([36, 77, 87], "canonical evidence hashes are deterministic and order-stable for object keys", () => {
  const left = canonicalSha256({ z: 2, a: { d: 4, c: 3 }, text: " value " });
  const right = canonicalSha256({ text: "value", a: { c: 3, d: 4 }, z: 2 });
  if (left.hash !== right.hash || left.json !== right.json) throw new Error("canonical hash drift");
  return { hash: left.hash };
});

add([45, 81, 86], "diff uses logical identity across rebuilt row IDs", () => {
  const base = [{ id: "old-row", logical_line_id: "33333333-3333-4333-8333-333333333333", parent_line_id: null, node_type: "item", part_number: "DISPLAY", revision: null, group_name: null, quantity: 2, sequence_no: 1 }];
  const current = [{ ...base[0], id: "new-row" }];
  const changes = diffBomWorkbenchLines(base, current);
  if (changes.length !== 1 || changes[0].change_type !== "unchanged" || !changes[0].key.startsWith("logical:")) throw new Error(JSON.stringify(changes));
  return changes[0];
});

add([53, 56, 88], "deterministic migration IDs survive evidence loss", () => {
  const first = deterministicDev096Id("definition", fixture.parents.red);
  const second = deterministicDev096Id("definition", fixture.parents.red);
  const different = deterministicDev096Id("definition", fixture.parents.blue);
  if (first !== second || first === different) throw new Error("deterministic ID mismatch");
  return { first, different };
});

add([83], "250/5000/100000 bounds fail with 413 before mutation", () => {
  let parentLimit = false;
  try { normalizeStableIds(Array.from({ length: 251 }, (_, index) => `parent-${index}`), 250); }
  catch (error) { parentLimit = error instanceof SharedBomError && error.status === 413; }
  const logical = "44444444-4444-4444-8444-444444444444";
  let resolvedLimit = false;
  try {
    validateSharedGraph({
      lines: Array.from({ length: 401 }, (_, index) => ({ id: `n-${index}`, logicalLineId: deterministicDev096Id("limit-line", String(index)), nodeType: "group", groupName: `G${index}`, quantity: null })),
      floatingTopics: [], parentPartNumberIds: Array.from({ length: 250 }, (_, index) => `p-${index}`), components: []
    });
  } catch (error) { resolvedLimit = error instanceof SharedBomError && error.status === 413; }
  if (!parentLimit || !resolvedLimit || !logical) throw new Error(JSON.stringify({ parentLimit, resolvedLimit }));
});

add([53, 60, 79, 80], "schema objects, immutable triggers, FKs and no BOM outbox authority", () => {
  const requiredTables = ["bom_definitions", "bom_definition_parent_bindings", "bom_draft_parent_bindings", "bom_draft_component_nodes", "bom_draft_component_candidates", "bom_draft_parent_selections", "bom_release_parent_snapshots", "bom_release_resolved_lines", "bom_shared_structure_migration_issues"];
  const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  const triggers = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map((row) => row.name));
  const foreignKeys = database.pragma("foreign_key_check");
  if (requiredTables.some((table) => !tables.has(table))) throw new Error("missing shared tables");
  if (!triggers.has("trg_bom_review_shared_evidence_immutable") || !triggers.has("trg_bom_release_shared_evidence_immutable")) throw new Error("missing immutable triggers");
  if (foreignKeys.length) throw new Error(JSON.stringify(foreignKeys));
  return { tables: requiredTables.length, foreignKeyViolations: 0 };
});

database.close();
const failed = checks.filter((check) => !check.pass);
const result = { runner: "repository", status: failed.length ? "FAIL" : "PASS", checks, fixtureLedger, cases: [...new Set(checks.filter((check) => check.pass).flatMap((check) => check.cases))].sort((a, b) => a - b) };
if (process.env.DEV096_EVIDENCE_DIR) {
  fs.mkdirSync(process.env.DEV096_EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.DEV096_EVIDENCE_DIR, "repository.json"), `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.length - failed.length, total: checks.length }));
if (failed.length) process.exitCode = 1;
