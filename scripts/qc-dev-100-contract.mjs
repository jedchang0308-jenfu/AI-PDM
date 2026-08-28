#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const runId = `DEV100-contract-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV100_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-100", runId));
const checks = [];
let firstFailure = null;
fs.mkdirSync(evidenceDir, { recursive: true });

function source(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function check(label, action) {
  try { action(); checks.push({ label, status: "PASS" }); }
  catch (error) { checks.push({ label, status: "FAIL", message: error instanceof Error ? error.message : String(error) }); throw error; }
}

try {
  const invariant = source("src/lib/drawing-work-file-snapshot-invariant.ts");
  const repository = source("src/lib/repositories/drawing-revision-work-async-repository.ts");
  const upload = source("src/lib/drawing-revision-work-file.ts");
  const work = source("src/lib/drawing-revision-work.ts");
  const ui = source("src/components/canonical-drawing-change-workspace.tsx");
  const migration = source("db/postgres/043_inline_relation_matrix.sql");
  const devTask = source(".ai-doc/dev_task.md");
  const qa = source(".ai-doc/qa/qa-dev-087-status-data-rebuild-validation-plan-2026-08-21.md");

  check("active and auditable tombstone rules are separate", () => {
    assert.match(invariant, /source\.removed_at === null/u);
    assert.match(invariant, /LEGAL_TOMBSTONE_REASONS/u);
    assert.match(invariant, /source_tombstone_still_bound/u);
    assert.match(invariant, /active_source_asset_deleted/u);
    assert.doesNotMatch(invariant, /filter\([^)]*deleted_at[^)]*\).*return/u);
  });
  check("repository applies the canonical invariant to migrated and new work", () => {
    assert.match(repository, /const migrated = payload\?\.migrated === true/u);
    assert.match(repository, /collectDrawingWorkFileSnapshotAnomalies/u);
    assert.doesNotMatch(repository, /if \(!payload \|\| payload\.migrated !== true\) return/u);
  });
  check("upload and remove execute post-write snapshot gate before return", () => {
    assert.match(upload, /before_readback/u);
    assert.match(upload, /await repository\.assertWorkFileSnapshot\(tx, locked\);/u);
    assert.match(work, /drawing_revision_work_file_removed[\s\S]*await repository\.assertWorkFileSnapshot\(tx, locked\);/u);
  });
  check("workspace clears stale state and renders bounded 409 recovery", () => {
    assert.match(ui, /setData\(null\); setPayload\(\{\}\); setContractToken\(""\)/u);
    assert.match(ui, /data-dev100-load-failed/u);
    assert.match(ui, /已暫停所有操作/u);
    assert.match(ui, /返回圖號清單/u);
  });
  check("same-batch primary warning exposes exact filename order", () => {
    assert.match(ui, /names\.join\(" → "\)/u);
    assert.match(ui, /最後保留/u);
    assert.match(ui, /data-dev100-replacement-warning/u);
  });
  check("single existing Drawing workspace remains the only DEV-100 entry", () => {
    assert.match(ui, /data-workspace-kind=\{reviewRequestId \? "reviewer" : "drawing-revision-work"\}/u);
    assert.equal(fs.existsSync(path.join(root, "src", "app", "numbering", "assemblies")), false);
  });
  check("PostgreSQL Relation retirement leaves a valid Drawing/Part reference guard", () => {
    const afterDrop = migration.slice(migration.indexOf("DROP TABLE IF EXISTS relation_change_works;"));
    assert.match(afterDrop, /CREATE OR REPLACE FUNCTION dev087_guard_company_reference/u);
    const replacementFunction = afterDrop.slice(afterDrop.indexOf("CREATE OR REPLACE FUNCTION"), afterDrop.indexOf("-- Constraint names differ"));
    assert.doesNotMatch(replacementFunction, /relation_change_works/u);
    assert.match(replacementFunction, /drawing_revision_works/u);
    assert.match(replacementFunction, /part_change_works/u);
  });
  check("DEV-100 authority and fixed 18-case QA roster remain present", () => {
    assert.match(devTask, /DEV-100 \[開發點\]/u);
    for (let index = 1; index <= 18; index += 1) assert.match(qa, new RegExp(`QA-100-${String(index).padStart(3, "0")}`, "u"));
  });
} catch (error) { firstFailure = error instanceof Error ? error.stack ?? error.message : String(error); }

const manifest = { runner: "contract", runId, status: !firstFailure && checks.every((entry) => entry.status === "PASS") ? "PASS" : "FAIL", productionWrites: false, checks, firstFailure };
fs.writeFileSync(path.join(evidenceDir, "contract.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runner: manifest.runner, status: manifest.status, passed: checks.filter((entry) => entry.status === "PASS").length, total: checks.length }));
if (manifest.status !== "PASS") process.exitCode = 1;
