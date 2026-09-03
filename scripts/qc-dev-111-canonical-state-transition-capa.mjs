#!/usr/bin/env node

/*
 * DEV-111 CAPA focused repository gate.
 *
 * Scope is deliberately task-owned and disposable: no server is started,
 * no primary database is opened, and all fixture writes target an in-memory
 * SQLite database.  The runner proves both sides of the observed failure:
 * Part approval promotes legacy work-only data to a navigable formal state,
 * and the relation matrix does not expose identities that have no canonical
 * navigation state.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { dev087RequestHash } from "../src/lib/pdm-canonical-command.ts";
import { PartChangeWorkAsyncRepository } from "../src/lib/repositories/part-change-work-async-repository.ts";
import { RelationFormalAuthorityRepository } from "../src/lib/repositories/relation-formal-authority-async-repository.ts";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";

const root = process.cwd();
const runId = `DEV111-CAPA-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV111_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-111", runId));
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev111-capa-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
fs.mkdirSync(evidenceDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
Object.assign(process.env, { PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, PDM_DB_PROVIDER: "sqlite" });

const checks = [];
function check(caseId, condition, detail) {
  checks.push({ caseId, result: condition ? "PASS" : "FAIL", detail: detail ?? null });
  assert.equal(condition, true, `${caseId}: ${detail ?? "assertion failed"}`);
}

function partPayload(database) {
  const row = database.prepare(`
    SELECT p.part_name AS partName, p.item_kind AS itemKind,
           p.custom_specification AS customSpecification, p.is_universal AS isUniversal,
           p.bom_usage_policy AS bomUsagePolicy, a.material_code AS materialCode,
           a.material_label AS materialLabel, a.color_code AS colorCode,
           a.color_label AS colorLabel, a.surface_treatment AS surfaceTreatment,
           a.variant_note AS variantNote
      FROM part_numbers p
      LEFT JOIN part_variant_attributes a ON a.part_number_id = p.id
     WHERE p.id = ?`).get(ids.part);
  return {
    partName: row.partName,
    itemKind: row.itemKind,
    customSpecification: row.customSpecification,
    isUniversal: Boolean(row.isUniversal),
    bomUsagePolicy: row.bomUsagePolicy,
    materialCode: row.materialCode ?? null,
    materialLabel: row.materialLabel ?? null,
    colorCode: row.colorCode ?? null,
    colorLabel: row.colorLabel ?? null,
    surfaceTreatment: row.surfaceTreatment ?? null,
    variantNote: row.variantNote ?? null
  };
}

async function main() {
  const database = createFixtureDatabase({ canonical: true });
  const client = createAsyncDatabaseClient({ kind: "sqlite", database });
  try {
    // Model the migrated A0044 shape: master + work + part_work state, but no
    // part_formal state.  This is a fixture-only mutation.
    database.prepare(`DELETE FROM canonical_workbench_states WHERE company_id = ? AND entity_type = 'part' AND canonical_entity_id = ? AND data_layer = 'part_formal'`).run(ids.company, ids.part);
    const payload = partPayload(database);
    const workId = "work-dev111-legacy-part";
    database.prepare(`INSERT INTO part_change_works
      (id, company_id, part_id, owner_user_id, proposed_payload, base_formal_row_version, base_hash, row_version)
      VALUES (?, ?, ?, ?, ?, NULL, ?, 1)`).run(workId, ids.company, ids.part, ids.owner, JSON.stringify({ ...payload, partName: "DEV111 approved Part" }), dev087RequestHash({ ...payload, partName: "DEV111 approved Part" }));
    database.prepare(`INSERT INTO canonical_workbench_states
      (id, company_id, entity_type, canonical_entity_id, data_layer, work_id, handling, row_version)
      VALUES (?, ?, 'part', ?, 'part_work', ?, 'system', 1)`).run("state-dev111-legacy-work", ids.company, ids.part, workId);

    const repository = new PartChangeWorkAsyncRepository(client);
    const work = await repository.readWork(client, ids.company, workId);
    check("DEV111-PART-001", Boolean(work), "legacy work fixture exists");
    await client.transaction((tx) => repository.formalize(tx, { companyId: ids.company, work, reviewCycleId: "cycle-dev111" }));

    const stateCounts = database.prepare(`
      SELECT
        SUM(CASE WHEN data_layer = 'part_formal' THEN 1 ELSE 0 END) AS formal_count,
        SUM(CASE WHEN data_layer = 'part_work' THEN 1 ELSE 0 END) AS work_count
        FROM canonical_workbench_states
       WHERE company_id = ? AND entity_type = 'part' AND canonical_entity_id = ?`).get(ids.company, ids.part);
    check("DEV111-PART-002", Number(stateCounts.formal_count) === 1 && Number(stateCounts.work_count) === 0, "approval leaves exactly one formal state and no work state");
    check("DEV111-PART-003", Boolean(database.prepare(`SELECT 1 FROM canonical_workbench_states WHERE company_id = ? AND entity_type = 'part' AND canonical_entity_id = ? AND data_layer = 'part_formal'`).get(ids.company, ids.part)), "formal state is a navigation anchor");
    check("DEV111-PART-004", !database.prepare("SELECT 1 FROM part_change_works WHERE id = ?").get(workId), "approved work is removed");
    check("DEV111-PART-005", database.prepare("SELECT part_name FROM part_numbers WHERE id = ?").get(ids.part).part_name === "DEV111 approved Part", "approved payload is retained in master");

    const matrixRepository = new RelationFormalAuthorityRepository(client);
    const navigable = await matrixRepository.getMatrix({ companyId: ids.company, rootId: ids.root });
    const navigablePart = navigable.parts.find((item) => item.id === ids.part);
    check("DEV111-MATRIX-001", Boolean(navigablePart?.detailHref), "state-backed part has canonical matrix navigation");

    // A terminal/no-state identity may remain as domain evidence, but must not
    // be rendered as an unclickable current matrix axis or cell.
    database.prepare(`DELETE FROM canonical_workbench_states WHERE company_id = ? AND entity_type = 'part' AND canonical_entity_id = ?`).run(ids.company, ids.part);
    const terminalProjection = await matrixRepository.getMatrix({ companyId: ids.company, rootId: ids.root });
    check("DEV111-MATRIX-002", !terminalProjection.parts.some((item) => item.id === ids.part), "part without canonical state is omitted from matrix axes");
    check("DEV111-MATRIX-003", !terminalProjection.cells.some((cell) => cell.partNumberId === ids.part), "links to a non-navigable part are omitted from matrix cells");
    check("DEV111-MATRIX-004", terminalProjection.drawings.every((item) => Boolean(item.detailHref)), "remaining drawing axes remain navigable");

    database.prepare(`DELETE FROM canonical_workbench_states WHERE company_id = ? AND entity_type = 'drawing' AND canonical_entity_id = ?`).run(ids.company, ids.drawing);
    const terminalDrawingProjection = await matrixRepository.getMatrix({ companyId: ids.company, rootId: ids.root });
    check("DEV111-MATRIX-005", !terminalDrawingProjection.drawings.some((item) => item.id === ids.drawing), "drawing without canonical state is omitted from matrix axes");
    check("DEV111-MATRIX-006", terminalDrawingProjection.cells.length === 0, "links to a non-navigable drawing are omitted from matrix cells");

    // Formal-backed Part regressions: approval still advances the existing
    // formal row, while cancel leaves that formal payload untouched.
    const regressionDatabase = createFixtureDatabase({ canonical: true });
    const regressionClient = createAsyncDatabaseClient({ kind: "sqlite", database: regressionDatabase });
    try {
      const regressionRepository = new PartChangeWorkAsyncRepository(regressionClient);
      const regressionPayload = partPayload(regressionDatabase);
      const cancelWorkId = "work-dev111-formal-cancel";
      regressionDatabase.prepare(`INSERT INTO part_change_works
        (id, company_id, part_id, owner_user_id, proposed_payload, base_formal_row_version, base_hash, row_version)
        VALUES (?, ?, ?, ?, ?, 1, ?, 1)`).run(cancelWorkId, ids.company, ids.part, ids.owner, JSON.stringify({ ...regressionPayload, partName: "cancelled" }), dev087RequestHash({ ...regressionPayload, partName: "cancelled" }));
      regressionDatabase.prepare(`INSERT INTO canonical_workbench_states
        (id, company_id, entity_type, canonical_entity_id, data_layer, work_id, handling, row_version)
        VALUES (?, ?, 'part', ?, 'part_work', ?, 'owner', 1)`).run("state-dev111-formal-cancel", ids.company, ids.part, cancelWorkId);
      const beforeFormal = regressionDatabase.prepare(`SELECT row_version FROM canonical_workbench_states WHERE company_id = ? AND entity_type = 'part' AND canonical_entity_id = ? AND data_layer = 'part_formal'`).get(ids.company, ids.part).row_version;
      await regressionClient.transaction((tx) => regressionRepository.cancel(tx, { companyId: ids.company, workId: cancelWorkId, expectedRowVersion: 1 }));
      const afterCancel = regressionDatabase.prepare(`SELECT row_version FROM canonical_workbench_states WHERE company_id = ? AND entity_type = 'part' AND canonical_entity_id = ? AND data_layer = 'part_formal'`).get(ids.company, ids.part).row_version;
      check("DEV111-PART-006", beforeFormal === afterCancel, "formal-backed cancel leaves formal state unchanged");
      check("DEV111-PART-007", !regressionDatabase.prepare("SELECT 1 FROM part_change_works WHERE id = ?").get(cancelWorkId), "formal-backed cancel removes only the work row");

      const approveWorkId = "work-dev111-formal-approve";
      const approvedPayload = { ...regressionPayload, partName: "formal approval" };
      regressionDatabase.prepare(`INSERT INTO part_change_works
        (id, company_id, part_id, owner_user_id, proposed_payload, base_formal_row_version, base_hash, row_version)
        VALUES (?, ?, ?, ?, ?, 1, ?, 1)`).run(approveWorkId, ids.company, ids.part, ids.owner, JSON.stringify(approvedPayload), dev087RequestHash(approvedPayload));
      regressionDatabase.prepare(`INSERT INTO canonical_workbench_states
        (id, company_id, entity_type, canonical_entity_id, data_layer, work_id, handling, row_version)
        VALUES (?, ?, 'part', ?, 'part_work', ?, 'system', 1)`).run("state-dev111-formal-approve", ids.company, ids.part, approveWorkId);
      const approveWork = await regressionRepository.readWork(regressionClient, ids.company, approveWorkId);
      await regressionClient.transaction((tx) => regressionRepository.formalize(tx, { companyId: ids.company, work: approveWork, reviewCycleId: "cycle-dev111-formal" }));
      const approvedFormal = regressionDatabase.prepare(`SELECT row_version FROM canonical_workbench_states WHERE company_id = ? AND entity_type = 'part' AND canonical_entity_id = ? AND data_layer = 'part_formal'`).get(ids.company, ids.part);
      check("DEV111-PART-008", Number(approvedFormal?.row_version) === Number(beforeFormal) + 1, "formal-backed approval advances the existing formal row exactly once");
    } finally {
      await regressionClient.close();
      regressionDatabase.close();
    }

    // Company scope denial is still zero-write after the CAPA changes.
    const beforeForeign = database.prepare("SELECT COUNT(*) AS count FROM canonical_workbench_states").get().count;
    let foreignError = null;
    try {
      await client.transaction((tx) => new PartChangeWorkAsyncRepository(tx).cancel(tx, { companyId: ids.otherCompany, workId: "missing-work", expectedRowVersion: 1 }));
    } catch (error) {
      foreignError = error;
    }
    const afterForeign = database.prepare("SELECT COUNT(*) AS count FROM canonical_workbench_states").get().count;
    check("DEV111-SECURITY-001", Boolean(foreignError) && beforeForeign === afterForeign, "wrong-company cancel is denied without writes");
    check("DEV111-MATRIX-007", database.pragma("foreign_key_check").length === 0, "fixture foreign keys remain valid");

    const report = {
      runId,
      scope: { provider: "sqlite", databaseScope: "task_owned_in_memory", productionConnection: false, primaryWrites: false, port: null },
      checks,
      result: "PASS",
      cleanup: { taskRoot, removedByRunner: true }
    };
    fs.writeFileSync(path.join(evidenceDir, "report.json"), JSON.stringify(report, null, 2));
    console.log(`DEV-111 CAPA: PASS (${checks.length} checks); evidence=${path.relative(root, path.join(evidenceDir, "report.json"))}`);
  } finally {
    await client.close();
    database.close();
    fs.rmSync(taskRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
