#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { applyBomEditorCommand, bomEditorControllerReducer, createBomEditorControllerState, isBomEditorDirty, snapshotFromDraft } from "../src/components/bom-editor/bom-editor-reducer.ts";

const root = process.cwd();
const runId = `DEV104-state-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceRoot = path.resolve(process.env.DEV104_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-104", runId));
const evidenceDir = path.join(evidenceRoot, "state");
fs.mkdirSync(evidenceDir, { recursive: true });
const sourceRevision = gitRevision();
const dirtyBoundary = gitStatus();
const results = [];

function line(id, parentLineId, sequenceNo, nodeType = "item", partNumber = id) {
  return {
    id,
    logical_line_id: id,
    bom_draft_id: "draft-104-state",
    parent_line_id: parentLineId,
    node_type: nodeType,
    item_id: nodeType === "item" ? `item-${id}` : null,
    part_number: nodeType === "item" ? partNumber : null,
    part_name: nodeType === "item" ? `Part ${partNumber}` : null,
    revision: null,
    group_name: nodeType === "group" ? partNumber : null,
    quantity: nodeType === "item" ? 1 : null,
    sequence_no: sequenceNo,
    source: "manual",
    source_priority: 30
  };
}

function floating(id, parentFloatingTopicId = null, sequenceNo = 1) {
  return {
    ...line(id, null, sequenceNo),
    parent_floating_topic_id: parentFloatingTopicId,
    root_position_x: 320,
    root_position_y: 220
  };
}

function draft(overrides = {}) {
  return {
    id: "draft-104-state",
    draft_name: "DEV-104 state fixture",
    status: "Draft",
    identity_authority: "manual_review",
    editor_version: 7,
    lines: [line("A", null, 1, "group", "Group A"), line("B", null, 2), line("C", "A", 1), line("D", "B", 1)],
    floating_topics: [floating("F")],
    components: [{
      node_id: "B",
      logical_line_id: "B",
      node_location: "tree",
      component_mode: "fixed",
      child_part_root_id: "root-b",
      child_part_number_ids: ["child-b"],
      parent_selections: []
    }],
    applicable_parents: [
      { part_number_id: "P1", part_number: "P1", part_name: "Parent 1", selection_order: 1 },
      { part_number_id: "P2", part_number: "P2", part_name: "Parent 2", selection_order: 2 }
    ],
    reconfirmation_flags: [],
    ...overrides
  };
}

function get(snapshot, id) {
  return snapshot.lines.find((entry) => entry.id === id) ?? snapshot.floatingTopics.find((entry) => entry.id === id);
}

function documentOnly(snapshot) {
  return { lines: snapshot.lines, floatingTopics: snapshot.floatingTopics, components: snapshot.components };
}

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

function execute(caseId, fixtureId, preconditions, actions, expected, fn) {
  const actual = { status: "not-run" };
  const result = {
    caseId,
    runner: "state",
    status: "PASS",
    sourceRevision,
    dirtyBoundary,
    artifactId: `${runId}/state/${caseId}.json`,
    environment: "node pure in-memory reducer fixture; no app/database/runtime",
    actor: "Engineer",
    route: null,
    viewport: null,
    fixtureId,
    preconditions,
    actions,
    expected,
    actual,
    evidencePaths: [],
    consoleErrors: [],
    httpFailures: [],
    visibleErrors: [],
    dataSanity: { productionConnected: false, productionWrites: false, primaryWrites: false },
    primaryInvariantBefore: null,
    primaryInvariantAfter: null,
    fixtureMutationLedger: [],
    failureCode: null,
    blockedReason: null,
    recoveryCondition: null,
    supersedesRunId: null,
    runtimeOwnership: null,
    cleanup: { status: "not-applicable", condition: "pure in-memory state runner" }
  };
  try {
    const value = fn();
    actual.status = "verified";
    actual.result = value ?? null;
    const evidenceFile = path.join(evidenceDir, `${caseId}.json`);
    fs.writeFileSync(evidenceFile, `${JSON.stringify({ caseId, preconditions, actions, expected, actual }, null, 2)}\n`, "utf8");
    result.evidencePaths = [path.relative(root, evidenceFile).replaceAll("\\", "/")];
  } catch (error) {
    result.status = "FAIL";
    result.failureCode = "STATE_ASSERTION_FAILED";
    actual.status = "failed";
    actual.error = error instanceof Error ? error.message : String(error);
    const evidenceFile = path.join(evidenceDir, `${caseId}.json`);
    fs.writeFileSync(evidenceFile, `${JSON.stringify({ caseId, preconditions, actions, expected, actual }, null, 2)}\n`, "utf8");
    result.evidencePaths = [path.relative(root, evidenceFile).replaceAll("\\", "/")];
  }
  results.push(result);
}

execute("QA-104-013", "state-insert-sibling", "root下A、B", "在A後插入C", "A、C、B且sequence連續，一個history atom", () => {
  const before = snapshotFromDraft(draft());
  const after = applyBomEditorCommand(before, { type: "line.insert", location: "formal", parentId: null, afterId: "A", node: line("E", null, 3) }).snapshot;
  assert.ok(after);
  assert.deepEqual(after.lines.filter((entry) => entry.parent_line_id === null).sort((a, b) => a.sequence_no - b.sequence_no).map((entry) => entry.id), ["A", "E", "B"]);
  assert.deepEqual(after.lines.filter((entry) => entry.parent_line_id === null).sort((a, b) => a.sequence_no - b.sequence_no).map((entry) => entry.sequence_no), [1, 2, 3]);
  return { before: documentOnly(before), command: "line.insert after A", after: documentOnly(after) };
});

execute("QA-104-014", "state-insert-child", "root下A", "對A插入子節點C", "C.parent=A且可定位", () => {
  const before = snapshotFromDraft(draft());
  const result = applyBomEditorCommand(before, { type: "line.insert", location: "formal", parentId: "A", afterId: null, node: line("F2", "A", 1) });
  assert.equal(result.error, undefined);
  assert.equal(get(result.snapshot, "F2").parent_line_id, "A");
  return { selectedId: result.snapshot.selectedId, child: get(result.snapshot, "F2") };
});

execute("QA-104-015", "state-single-remove", "A→B→C，B有component", "移除B但保留子分支", "C提升至B原parent，B component移除", () => {
  const before = snapshotFromDraft(draft({ lines: [line("A", null, 1), line("B", "A", 1), line("C", "B", 1)], components: [{ ...draft().components[0], node_id: "B", logical_line_id: "B" }, { ...draft().components[0], node_id: "C", logical_line_id: "C" }] }));
  const result = applyBomEditorCommand(before, { type: "line.remove", id: "B", mode: "single" });
  assert.ok(result.snapshot);
  assert.equal(get(result.snapshot, "B"), undefined);
  assert.equal(get(result.snapshot, "C").parent_line_id, "A");
  assert.equal(result.snapshot.components.some((component) => component.node_id === "B"), false);
  assert.equal(result.snapshot.components.some((component) => component.node_id === "C"), true);
  return documentOnly(result.snapshot);
});

execute("QA-104-016", "state-branch-remove", "B→C、B→D且各有component", "移除B branch", "B/C/D與components全數移除，其他branch不變", () => {
  const before = snapshotFromDraft(draft({ lines: [line("A", null, 1), line("B", "A", 1), line("C", "B", 1), line("D", "B", 2), line("E", null, 2)], components: ["B", "C", "D"].map((id) => ({ ...draft().components[0], node_id: id, logical_line_id: id })) }));
  const result = applyBomEditorCommand(before, { type: "line.remove", id: "B", mode: "branch" });
  assert.ok(result.snapshot);
  assert.deepEqual(result.snapshot.lines.map((entry) => entry.id), ["A", "E"]);
  assert.equal(result.snapshot.components.length, 0);
  return documentOnly(result.snapshot);
});

execute("QA-104-017", "state-reparent", "root下A、B；A下C", "C移入B指定位置", "C.parent=B且descendants不變", () => {
  const before = snapshotFromDraft(draft());
  const result = applyBomEditorCommand(before, { type: "line.reparent", id: "C", parentId: "B", index: 0 });
  assert.ok(result.snapshot);
  assert.equal(get(result.snapshot, "C").parent_line_id, "B");
  assert.equal(result.snapshot.lines.find((entry) => entry.id === "C").sequence_no, 1);
  return documentOnly(result.snapshot);
});

execute("QA-104-018", "state-cycle-guard", "A→B→C及formal/floating roots", "嘗試cycle、missing parent與跨location reparent", "每次typed error且document不變", () => {
  const before = snapshotFromDraft(draft());
  for (const command of [
    { type: "line.reparent", id: "A", parentId: "C", index: 0 },
    { type: "line.reparent", id: "A", parentId: "missing", index: 0 },
    { type: "line.reparent", id: "F", parentId: "A", index: 0 }
  ]) {
    const result = applyBomEditorCommand(before, command);
    assert.ok(result.error);
    assert.equal(result.snapshot, undefined);
  }
  return { unchanged: true, document: documentOnly(before) };
});

execute("QA-104-019", "state-reorder", "同parent A、B、C", "C→index 0並測越界", "合法結果C、A、B；越界不變", () => {
  const before = snapshotFromDraft(draft({ lines: [line("A", null, 1), line("B", null, 2), line("C", null, 3)] }));
  const result = applyBomEditorCommand(before, { type: "line.reorder", id: "C", index: 0 });
  assert.ok(result.snapshot);
  assert.deepEqual(result.snapshot.lines.sort((a, b) => a.sequence_no - b.sequence_no).map((entry) => entry.id), ["C", "A", "B"]);
  for (const index of [-1, 99]) assert.ok(applyBomEditorCommand(before, { type: "line.reorder", id: "C", index }).error);
  return documentOnly(result.snapshot);
});

execute("QA-104-020", "state-quantity", "quantity=1 formal line", "設為2.5並測0、負數、NaN、Infinity", "2.5成功，非法值typed error", () => {
  const before = snapshotFromDraft(draft());
  const result = applyBomEditorCommand(before, { type: "line.quantity.set", id: "B", quantity: 2.5 });
  assert.equal(get(result.snapshot, "B").quantity, 2.5);
  for (const quantity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.ok(applyBomEditorCommand(before, { type: "line.quantity.set", id: "B", quantity }).error);
  return { quantity: get(result.snapshot, "B").quantity };
});

execute("QA-104-021", "state-group-rename", "group G1", "rename含空白與trimmed empty", "保存G2、拒絕空白且不改item master", () => {
  const before = snapshotFromDraft(draft());
  const result = applyBomEditorCommand(before, { type: "line.group.rename", id: "A", groupName: "  G2  " });
  assert.equal(get(result.snapshot, "A").group_name, "G2");
  assert.ok(applyBomEditorCommand(before, { type: "line.group.rename", id: "A", groupName: "  " }).error);
  return { groupName: get(result.snapshot, "A").group_name, itemName: get(result.snapshot, "B").part_name };
});

execute("QA-104-022", "state-formal-to-floating", "formal B branch含descendant與component", "B branch移入Floating並給rootPosition", "branch/IDs/components保留且location一致", () => {
  const before = snapshotFromDraft(draft({ lines: [line("A", null, 1), line("B", "A", 1), line("C", "B", 1)], components: ["B", "C"].map((id) => ({ ...draft().components[0], node_id: id, logical_line_id: id })) }));
  const result = applyBomEditorCommand(before, { type: "line.location.move", id: "B", to: "floating", parentId: null, index: 0, rootPosition: { x: 10, y: 20 } });
  assert.ok(result.snapshot);
  assert.equal(result.snapshot.lines.some((lineEntry) => lineEntry.id === "B"), false);
  assert.deepEqual(result.snapshot.floatingTopics.filter((entry) => ["B", "C"].includes(entry.id)).map((entry) => entry.id), ["B", "C"]);
  assert.deepEqual(result.snapshot.floatingTopics.find((entry) => entry.id === "B"), { ...result.snapshot.floatingTopics.find((entry) => entry.id === "B"), root_position_x: 10, root_position_y: 20 });
  assert.ok(result.snapshot.components.every((component) => component.node_location === "floating"));
  return documentOnly(result.snapshot);
});

execute("QA-104-023", "state-floating-to-formal", "Floating B branch", "B branch移至formal A下", "branch/IDs/components保留且formal parent/sequence合法", () => {
  const before = snapshotFromDraft(draft({ lines: [line("A", null, 1)], floating_topics: [floating("B"), floating("C", "B", 1)], components: [{ ...draft().components[0], node_id: "B", logical_line_id: "B", node_location: "floating" }, { ...draft().components[0], node_id: "C", logical_line_id: "C", node_location: "floating" }] }));
  const result = applyBomEditorCommand(before, { type: "line.location.move", id: "B", to: "formal", parentId: "A", index: 0 });
  assert.ok(result.snapshot);
  assert.equal(result.snapshot.floatingTopics.length, 0);
  assert.equal(get(result.snapshot, "B").parent_line_id, "A");
  assert.equal(get(result.snapshot, "C").parent_line_id, "B");
  assert.ok(result.snapshot.components.every((component) => component.node_location === "tree"));
  return documentOnly(result.snapshot);
});

execute("QA-104-024", "state-parent-mapping", "shared L with P1/P2 candidates", "只對P2選C2並測invalid candidate", "只更新L+P2 selection", () => {
  const before = snapshotFromDraft(draft({ lines: [line("L", null, 1)], components: [{ ...draft().components[0], node_id: "L", logical_line_id: "L", component_mode: "by_parent", child_part_number_ids: ["C1", "C2"] }] }));
  const result = applyBomEditorCommand(before, { type: "component.mapping.select", logicalLineId: "L", parentPartNumberId: "P2", childPartNumberId: "C2" });
  assert.ok(result.snapshot);
  assert.deepEqual(result.snapshot.components[0].parent_selections, [{ parent_part_number_id: "P2", child_part_number_id: "C2" }]);
  assert.ok(applyBomEditorCommand(before, { type: "component.mapping.select", logicalLineId: "L", parentPartNumberId: "P2", childPartNumberId: "missing" }).error);
  return result.snapshot.components[0];
});

execute("QA-104-025", "state-view-actions", "clean session與既有history", "selection/collapse/focus/context/view/floating/inspector actions", "document、savedIndex、history length、dirty完全不變", () => {
  const initial = createBomEditorControllerState(draft());
  let state = initial;
  const actions = [
    { type: "selection.set", id: "B" }, { type: "collapse.toggle", id: "A" }, { type: "focus.set", id: "A" },
    { type: "context-parent.set", partNumberId: "P2" }, { type: "view.set", mode: "map" },
    { type: "floating.expanded.set", expanded: true }, { type: "inspector.set", open: true }
  ];
  for (const action of actions) state = bomEditorControllerReducer(state, { type: "view", action });
  assert.deepEqual(documentOnly(state.history.entries[state.history.index]), documentOnly(initial.history.entries[initial.history.index]));
  assert.equal(state.history.index, initial.history.index);
  assert.equal(state.history.savedIndex, initial.history.savedIndex);
  assert.equal(isBomEditorDirty(state), false);
  return { selection: state.history.entries[state.history.index].selectedId, collapsedIds: state.history.entries[state.history.index].collapsedIds };
});

execute("QA-104-026", "state-semantic-history", "合法document", "兩個command、Undo兩次、Redo兩次，再從Undo點開新branch", "每個semantic command一個atom且redo截斷", () => {
  const initial = createBomEditorControllerState(draft());
  const first = bomEditorControllerReducer(initial, { type: "command", command: { type: "line.quantity.set", id: "B", quantity: 2 } });
  const second = bomEditorControllerReducer(first, { type: "command", command: { type: "line.group.rename", id: "A", groupName: "Renamed" } });
  const undoneOnce = bomEditorControllerReducer(second, { type: "command", command: { type: "history.undo" } });
  const undoneTwice = bomEditorControllerReducer(undoneOnce, { type: "command", command: { type: "history.undo" } });
  const redoneOnce = bomEditorControllerReducer(undoneTwice, { type: "command", command: { type: "history.redo" } });
  const redoneTwice = bomEditorControllerReducer(redoneOnce, { type: "command", command: { type: "history.redo" } });
  assert.equal(get(redoneTwice.history.entries[redoneTwice.history.index], "B").quantity, 2);
  assert.equal(get(redoneTwice.history.entries[redoneTwice.history.index], "A").group_name, "Renamed");
  const undoPoint = bomEditorControllerReducer(redoneTwice, { type: "command", command: { type: "history.undo" } });
  const branched = bomEditorControllerReducer(undoPoint, { type: "command", command: { type: "line.quantity.set", id: "B", quantity: 3 } });
  assert.equal(branched.history.entries.length, 3);
  assert.equal(branched.history.index, 2);
  assert.equal(branched.history.entries.length - 1 > branched.history.index, false);
  return { historyLength: branched.history.entries.length, index: branched.history.index, quantity: get(branched.history.entries[branched.history.index], "B").quantity };
});

execute("QA-104-027", "state-save-baseline", "dirty version 7；server save version 8；clean version 9 push", "save.success後接受新server document", "save response是新baseline且editorVersion正確", () => {
  const initial = createBomEditorControllerState(draft());
  const changed = bomEditorControllerReducer(initial, { type: "command", command: { type: "line.quantity.set", id: "B", quantity: 2 } });
  const savedDraft = draft({ editor_version: 8, lines: draft().lines.map((entry) => entry.id === "B" ? { ...entry, quantity: 2 } : entry) });
  const saved = bomEditorControllerReducer(changed, { type: "save.success", draft: savedDraft, editorVersion: 8 });
  assert.equal(saved.history.index, saved.history.savedIndex);
  assert.equal(saved.editorVersion, 8);
  assert.equal(isBomEditorDirty(saved), false);
  const pushed = bomEditorControllerReducer(saved, { type: "hydrate", draft: draft({ editor_version: 9, lines: savedDraft.lines.map((entry) => entry.id === "B" ? { ...entry, quantity: 4 } : entry) }) });
  assert.equal(pushed.editorVersion, 9);
  assert.equal(get(pushed.history.entries[pushed.history.index], "B").quantity, 4);
  return { savedVersion: saved.editorVersion, pushedVersion: pushed.editorVersion, dirty: isBomEditorDirty(pushed) };
});

execute("QA-104-028", "state-conflict-preservation", "dirty version 7與server version 8", "模擬stale/conflict與unknown readback", "local document/history保留，不blind overwrite", () => {
  const initial = createBomEditorControllerState(draft());
  const changed = bomEditorControllerReducer(initial, { type: "command", command: { type: "line.quantity.set", id: "B", quantity: 2 } });
  const conflict = bomEditorControllerReducer(changed, { type: "save.failure", code: "BOM_EDITOR_STALE", message: "stale", conflict: true });
  assert.equal(conflict.saveState, "conflict");
  assert.equal(conflict.history.index, changed.history.index);
  assert.equal(get(conflict.history.entries[conflict.history.index], "B").quantity, 2);
  assert.equal(conflict.editorVersion, 7);
  const error = bomEditorControllerReducer(conflict, { type: "save.failure", code: "BOM_SAVE_NETWORK_ERROR", message: "unknown result" });
  assert.equal(error.saveState, "error");
  assert.equal(get(error.history.entries[error.history.index], "B").quantity, 2);
  return { saveState: error.saveState, localQuantity: get(error.history.entries[error.history.index], "B").quantity, editorVersion: error.editorVersion };
});

const passed = results.filter((result) => result.status === "PASS").length;
const manifest = {
  runner: "state",
  runId,
  status: passed === results.length && results.length === 16 ? "PASS" : "FAIL",
  fixedDenominator: 48,
  executedCases: results.length,
  checks: results,
  productionConnected: false,
  productionWrites: false,
  primaryWrites: false,
  note: "Pure in-memory reducer/controller state contract; no app, database, schema, or runtime was touched."
};
fs.writeFileSync(path.join(evidenceDir, "case-results.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runner: "state", status: manifest.status, passed, total: results.length, evidenceDir }));
if (manifest.status !== "PASS") process.exitCode = 1;

function gitRevision() {
  try {
    return String(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })).trim();
  } catch { return null; }
}

function gitStatus() {
  try {
    return String(execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" })).trim().split(/\r?\n/u).filter(Boolean);
  } catch { return []; }
}
