#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { DrawingRecognitionAsyncRepository } from "../src/lib/repositories/drawing-recognition-async-repository.ts";

const root = process.cwd();
const primaryPath = path.join(root, "data", "ai-pdm.sqlite");
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-part-recognition-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const fixturePath = path.join(dataDir, "ai-pdm.sqlite");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
process.once("exit", () => {
  if (fs.existsSync(taskRoot)) fs.rmSync(taskRoot, { recursive: true, force: true });
});
Object.assign(process.env, { PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, PDM_DRAWING_RECOGNITION_V1: "1" });

console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "A0044-P01 recognition formalization transaction on a task-owned primary snapshot",
  port: "none",
  owningProcessTree: `node ${process.pid}`,
  cleanupCondition: "assertions and primary invariant comparison complete",
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  mutationScope: taskRoot
} }));

function primarySnapshot() {
  const database = new Database(primaryPath, { readonly: true, fileMustExist: true });
  try {
    database.pragma("query_only = ON");
    const rows = (sql) => database.prepare(sql).all();
    const count = (sql) => Number(database.prepare(sql).get().count ?? 0);
    const payload = {
      schema: rows("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') ORDER BY type,name"),
      identities: {
        roots: rows("SELECT id,company_id,root_code,record_status FROM part_roots ORDER BY company_id,root_code,id"),
        parts: rows("SELECT id,company_id,part_root_id,part_number,record_status FROM part_numbers ORDER BY company_id,part_number,id"),
        drawingNumbers: rows("SELECT id,company_id,part_root_id,drawing_number,record_status FROM drawing_numbers ORDER BY company_id,drawing_number,id"),
        drawings: rows("SELECT id,company_id,part_root_id,formal_drawing_number_id,drawing_number,lifecycle_state FROM drawings ORDER BY company_id,drawing_number,id")
      },
      rootReferenceViolations: {
        parts: count("SELECT COUNT(*) AS count FROM part_numbers part LEFT JOIN part_roots root ON root.id=part.part_root_id AND root.company_id=part.company_id WHERE part.part_root_id IS NOT NULL AND root.id IS NULL"),
        drawingNumbers: count("SELECT COUNT(*) AS count FROM drawing_numbers drawing LEFT JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL"),
        drawings: count("SELECT COUNT(*) AS count FROM drawings drawing LEFT JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL")
      },
      unresolvedMigrationResidue: (() => {
        const columns = new Set(database.prepare("PRAGMA table_info(pdm_workbench_migration_quarantine)").all().map((row) => String(row.name)));
        if (columns.has("resolution_status")) return count("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine WHERE resolution_status='unresolved'");
        if (columns.has("resolution")) return count("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine WHERE resolution IS NULL OR TRIM(resolution)='' OR resolution='unresolved'");
        return count("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine");
      })(),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return { payload, hash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
  } finally {
    database.close();
  }
}

const primaryBefore = primarySnapshot();
assert.ok(Object.values(primaryBefore.payload.identities).every((rows) => rows.length > 0), "primary master counts are populated");
assert.deepEqual(primaryBefore.payload.rootReferenceViolations, { parts: 0, drawingNumbers: 0, drawings: 0 });
assert.equal(primaryBefore.payload.unresolvedMigrationResidue, 0);
assert.deepEqual(primaryBefore.payload.foreignKeys, []);

const source = new Database(primaryPath, { readonly: true, fileMustExist: true });
await source.backup(fixturePath);
source.close();

const database = new Database(fixturePath);
database.pragma("foreign_keys = ON");
const client = createAsyncDatabaseClient({ kind: "sqlite", database });
try {
  const part = database.prepare("SELECT id, company_id FROM part_numbers WHERE part_number='A0044-P01'").get();
  assert.ok(part, "A0044-P01 exists in copied source snapshot");
  const activeBefore = database.prepare("SELECT id,row_version,base_formal_row_version,proposed_payload FROM part_change_works WHERE part_id=?").get(part.id);
  assert.ok(activeBefore, "A0044-P01 active owner work exists");
  const repository = new DrawingRecognitionAsyncRepository(client);
  const latest = await repository.latestForPart(part.company_id, part.id);
  assert.ok(latest, "latest recognition session resolves from part ownership");
  const impact = await repository.calculateImpact({
    sessionId: latest.id,
    companyId: part.company_id,
    expectedRowVersion: latest.rowVersion
  });
  assert.deepEqual(impact.blockers, [], "reviewed A0044-P01 recognition has no false identity blockers or active-work conflict");
  const partChanges = impact.changes.filter((change) => change.targetId === part.id && change.category === "part_attribute");
  assert.deepEqual(partChanges.map((change) => change.fieldKey).sort(), ["heat_treatment", "material"]);

  await client.transaction(async (transaction) => new DrawingRecognitionAsyncRepository(transaction).applyFormalization({
    sessionId: latest.id,
    companyId: part.company_id,
    actorId: "production-user-0003",
    expectedRowVersion: latest.rowVersion,
    idempotencyKey: `qc-part-recognition-${crypto.randomUUID()}`,
    expectedImpactFingerprint: impact.impactFingerprint,
    requirePostReleaseReason: "隔離 QC：驗證既有已核對辨識資料安全寫入"
  }));

  const material = database.prepare("SELECT material_label FROM part_variant_attributes WHERE part_number_id=?").get(part.id);
  const heatTreatment = database.prepare(`SELECT value.value_text, value.applicability_state
    FROM pdm_part_attribute_values value JOIN pdm_attribute_definitions definition ON definition.id=value.attribute_definition_id
    WHERE value.part_number_id=? AND definition.stable_key='heat_treatment'`).get(part.id);
  const activeAfter = database.prepare("SELECT row_version,base_formal_row_version,proposed_payload FROM part_change_works WHERE part_id=?").get(part.id);
  const formalState = database.prepare("SELECT row_version FROM canonical_workbench_states WHERE canonical_entity_id=? AND data_layer='part_formal'").get(part.id);
  assert.equal(material.material_label, "SUS304");
  assert.equal(heatTreatment.value_text, "無");
  assert.ok(activeAfter, "active owner work is preserved");
  assert.equal(Number(activeAfter.row_version), Number(activeBefore.row_version) + 1);
  if (formalState) assert.equal(Number(activeAfter.base_formal_row_version), Number(formalState.row_version));
  else assert.equal(activeAfter.base_formal_row_version, null, "legacy work without part_formal state remains compatible");
  assert.equal(JSON.parse(activeAfter.proposed_payload).materialLabel, "SUS304", "active work is rebased onto recognized material");
  assert.deepEqual(database.pragma("foreign_key_check"), []);
  console.log(JSON.stringify({ mutationLedger: [
    { database: fixturePath, method: "recognition formalization", sessionId: latest.id, targets: [part.id], fields: partChanges.map((change) => change.fieldKey) },
    { database: fixturePath, method: "active part work rebase", workId: activeBefore.id }
  ] }));
} finally {
  client.close();
  database.close();
}

const primaryAfter = primarySnapshot();
assert.equal(primaryAfter.hash, primaryBefore.hash, "primary schema, identities, root references, residue and foreign keys are unchanged");
fs.rmSync(taskRoot, { recursive: true, force: true });
assert.equal(fs.existsSync(taskRoot), false, "task-owned data and repository directories are removed");
console.log(`qc-part-recognition-formalization: PASS; primary=${primaryAfter.hash}; cleanup=true`);
