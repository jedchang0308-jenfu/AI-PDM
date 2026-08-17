#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const results = [];
const record = (name, passed, detail = "") => results.push({ name, passed, detail });
const includesAll = (source, values) => values.every((value) => source.includes(value));

const sqlite = read("db/schema.sql");
const postgres = read("db/postgres/001_initial_schema.sql");
const migration = read("db/postgres/035_bom_draft_floating_topics.sql");
const repository = read("src/lib/repositories/bom-workbench-async-repository.ts");
const route = read("src/app/api/bom/drafts/[draftId]/route.ts");
const editor = read("src/components/bom-editor/bom-xmind-editor.tsx");
const inspector = read("src/components/bom-editor/bom-node-inspector.tsx");
const picker = read("src/components/bom-editor/bom-inline-picker.tsx");
const toolbar = read("src/components/bom-editor/xmind-bom-toolbar.tsx");
const shortcuts = read("src/components/bom-editor/use-bom-editor-shortcuts.ts");
const css = read("src/app/globals.css");

record("XMB-001 editor version exists in both schemas", sqlite.includes("editor_version INTEGER NOT NULL DEFAULT 0") && postgres.includes("editor_version INTEGER NOT NULL DEFAULT 0"));
record("XMB-002 floating table exists in both schemas and migration", [sqlite, postgres, migration].every((source) => source.includes("bom_draft_floating_topics")));
record("XMB-003 floating hierarchy and position are persisted", ["parent_floating_topic_id", "root_position_x", "root_position_y", "sequence_no"].every((column) => migration.includes(column)));
record("XMB-004 repository serializes saves and locks Postgres row", repository.includes("await this.client.transaction(save)") && repository.includes("FOR UPDATE"));
record("XMB-005 stale writes have a typed conflict", includesAll(repository, ["BomDraftEditorVersionConflictError", "expectedEditorVersion", "actualVersion"]));
record("XMB-006 unresolved floating topics block submit and approve", (repository.match(/BomFloatingTopicsUnresolvedError/g) ?? []).length >= 3);
record("XMB-007 PATCH contract accepts both graphs", includesAll(route, ["expectedEditorVersion", "floatingTopics", "status: 409"]));
record("XMB-008 toolbar order follows XMind muscle memory", /onUndo[\s\S]*onRedo[\s\S]*onTopic[\s\S]*onSubtopic[\s\S]*onInsert[\s\S]*onToggleFold[\s\S]*onToggleFocus[\s\S]*onSave[\s\S]*onToggleInspector[\s\S]*onToggleMore/u.test(toolbar));
record("XMB-009 XMind shortcut contract is implemented", includesAll(shortcuts, ["event.key === \"Enter\"", "event.key === \"Tab\"", "event.key === \"Delete\"", "key === \"z\"", "key === \"y\"", "event.key === \"/\"", "event.key === \";\"", "key === \"s\"", "event.key === \"Home\""]));
record("XMB-010 browser reserved refresh and zoom are not intercepted", !shortcuts.includes("key === \"r\"") && !shortcuts.includes("key === \"+\"") && !shortcuts.includes("key === \"-\""));
record("XMB-011 double-click blank creates Floating Topic", editor.includes(".react-flow__pane") && editor.includes("addGroup(\"floating\""));
record("XMB-012 three drop zones and both graph conversions exist", includesAll(editor, ["\"before\"", "\"child\"", "\"after\"", "formalBranchToFloating", "floatingBranchToFormal"]));
record("XMB-013 map and outliner share one snapshot", includesAll(editor, ["viewMode", "snapshot.lines", "snapshot.floatingTopics", "<BomOutliner"]));
record("XMB-014 semantic history is capped at 100", editor.includes("pushBomEditorHistory(current, producer(base), 100)"));
record("XMB-015 toolbar uses stable 52px XMind-style slots", css.includes("height: 52px") && css.includes("xmind-bom-toolbar-button"));
record("XMB-016 mobile defaults to Outliner", editor.includes("max-width: 767px") && editor.includes("setViewMode(\"outliner\")"));
record("XMB-017 right inspector and bottom-right controls exist", editor.includes("<BomNodeInspector") && editor.includes('position="bottom-right"'));
record("XMB-018 feature flag defaults off", read("src/lib/bom-editor-feature.ts").includes("PDM_BOM_XMIND_EDITOR_V2_ENABLED") && read(".env.example").includes("PDM_BOM_XMIND_EDITOR_V2_ENABLED=false"));
record(
  "XMB-019 canonical Part Number lines never present a transient Part Number revision",
  includesAll(editor, ["usesCanonicalPartIdentity", "preserveLegacyRevision ? item.revision || null : null", "showLegacyRevision={!usesCanonicalPartIdentity}"]) &&
    inspector.includes("來源 Drawing Rev") &&
    picker.includes("來源 Drawing Rev")
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
