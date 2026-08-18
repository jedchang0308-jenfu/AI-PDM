#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev062-relation-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  PDM_DATA_DIR: fixtureRoot,
  PDM_REPOSITORY_DIR: path.join(fixtureRoot, "repository"),
  PDM_DB_PROVIDER: "sqlite",
  PDM_NUMBER_STATE_FLOW_V1: "true",
  PDM_NUMBER_LIFECYCLE_V2: "true",
  PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
  PDM_AUTH_SECRET: "dev062-relation-secret"
});

let database;
try {
  const [{ getDb }, provider, workbench] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db-async-provider"),
    import("@/lib/relation-workbench")
  ]);
  database = getDb();
  const now = "2026-08-10T08:00:00.000Z";
  database.prepare(`INSERT INTO users (
    id, display_name, email, role, company_id, account_status, system_role_enabled, created_at, updated_at
  ) VALUES ('dev062-relation-owner', 'DEV-062 Relation Owner', 'dev062-relation@example.invalid', 'Engineer', 'company-jenfu', 'active', 1, ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
    VALUES ('dev062-relation-owner', 'company-jenfu', 1, ?)` ).run(now);
  database.prepare(`INSERT INTO part_roots (
    id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at
  ) VALUES ('dev062-relation-root', 'company-jenfu', 'R3062', '正式閥體', 'manufactured', 'Active', 'dev062-relation-owner', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO part_numbers (
    id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, series_code,
    record_status, created_by, created_at, updated_at
  ) VALUES ('dev062-relation-part', 'company-jenfu', 'dev062-relation-root', 'R3062-P01', 1, '01', '正式閥體', 'manufactured', 'JF', 'Active', 'dev062-relation-owner', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO drawing_numbers (
    id, company_id, part_root_id, drawing_number, purpose_code, sequence_no, is_primary_manufacturing,
    record_status, created_by, created_at, updated_at
  ) VALUES ('dev062-relation-drawing', 'company-jenfu', 'dev062-relation-root', 'R3062-M01', 'M', 1, 1, 'Active', 'dev062-relation-owner', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO drawing_part_links (
    id, drawing_number_id, part_number_id, link_type, created_by, created_at
  ) VALUES ('dev062-relation-link', 'dev062-relation-drawing', 'dev062-relation-part', 'primary_manufacturing', 'dev062-relation-owner', ?)` ).run(now);

  database.prepare(`INSERT INTO numbering_draft_workspaces (
    id, company_id, draft_mode, lifecycle_status, owner_id, created_by, source_root_id, row_version, created_at, updated_at
  ) VALUES ('dev062-source-change', 'company-jenfu', 'append_part', 'active', 'dev062-relation-owner', 'dev062-relation-owner', 'dev062-relation-root', 1, ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_parts (
    id, company_id, workspace_id, source_root_id, part_name, item_kind, series_code, created_at, updated_at
  ) VALUES ('dev062-source-change-part', 'company-jenfu', 'dev062-source-change', 'dev062-relation-root', '新增閥體', 'manufactured', 'JF', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO number_candidate_reservations (
    id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code, sequence_scope_key, sequence_no,
    reservation_state, row_version, created_by, created_at, updated_at
  ) VALUES ('dev062-source-change-reservation', 'company-jenfu', 'dev062-source-change', 'part', 'dev062-source-change-part', 'R3062-P02', 'dev062:source-change', 2, 'active', 1, 'dev062-relation-owner', ?, ?)` ).run(now, now);
  database.prepare("UPDATE numbering_draft_parts SET candidate_reservation_id = 'dev062-source-change-reservation' WHERE id = 'dev062-source-change-part'").run();

  database.prepare(`INSERT INTO numbering_draft_workspaces (
    id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at
  ) VALUES ('dev062-source-less', 'company-jenfu', 'new_bundle', 'active', 'dev062-relation-owner', 'dev062-relation-owner', 1, ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_roots (
    id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
  ) VALUES ('dev062-source-less-root', 'company-jenfu', 'dev062-source-less', '候選閥體', 'manufactured', 'numbering-rule-v3-alpha-root', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_parts (
    id, company_id, workspace_id, root_draft_id, part_name, item_kind, series_code, created_at, updated_at
  ) VALUES ('dev062-source-less-part', 'company-jenfu', 'dev062-source-less', 'dev062-source-less-root', '候選閥體', 'manufactured', 'JF', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_drawings (
    id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description, is_primary_manufacturing,
    created_at, updated_at
  ) VALUES ('dev062-source-less-drawing', 'company-jenfu', 'dev062-source-less', 'dev062-source-less-root',
    'M', '', 1, ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_relations (
    id, company_id, workspace_id, drawing_draft_id, part_draft_id, link_type, is_primary, created_at, updated_at
  ) VALUES ('dev062-source-less-relation', 'company-jenfu', 'dev062-source-less', 'dev062-source-less-drawing',
    'dev062-source-less-part', 'primary_manufacturing', 1, ?, ?)` ).run(now, now);
  for (const [id, itemType, itemId, code] of [
    ['dev062-source-less-part-reservation', 'part', 'dev062-source-less-part', 'Z4062-P01'],
    ['dev062-source-less-drawing-reservation', 'drawing', 'dev062-source-less-drawing', 'Z4062-M01']
  ]) {
    database.prepare(`INSERT INTO number_candidate_reservations (
      id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code, sequence_scope_key, sequence_no,
      reservation_state, row_version, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', 'dev062-source-less', ?, ?, ?, ?, 1, 'active', 1,
      'dev062-relation-owner', ?, ?)` ).run(id, itemType, itemId, code, `dev062:source-less:${itemType}`, now, now);
    const table = itemType === 'part' ? 'numbering_draft_parts' : 'numbering_draft_drawings';
    database.prepare(`UPDATE ${table} SET candidate_reservation_id = ? WHERE id = ?`).run(id, itemId);
  }

  const actor = {
    id: "dev062-relation-owner",
    companyId: "company-jenfu",
    permissions: { workspaceView: true, workspaceUpdate: true, candidateSubmit: true, candidateReview: true, publish: true, manageRelations: true, managePermissions: true },
    viewerCapabilities: { canEdit: true, canManageRelations: true, canReview: true, canPublish: true, canRestoreMainDrawing: true, canSubmit: true }
  };
  const rawClient = provider.createAsyncDatabaseClient({ kind: "sqlite", database });
  let queryCount = 0;
  const wrap = (base) => ({
    kind: base.kind,
    query: (...args) => { queryCount += 1; return base.query(...args); },
    queryOne: (...args) => { queryCount += 1; return base.queryOne(...args); },
    execute: (...args) => base.execute(...args),
    transaction: (fn) => base.transaction((transactionClient) => fn(wrap(transactionClient))),
    close: (...args) => base.close(...args)
  });
  const service = new workbench.RelationWorkbenchService(wrap(rawClient));
  const all = await service.list(workbench.normalizeRelationWorkbenchQuery(new URL("http://local.test/?view=all&limit=60")), actor);
  const formalRows = all.rows.filter((row) => row.rowKey === "root:dev062-relation-root");
  assert.equal(formalRows.length, 1, "formal root appears exactly once");
  assert.equal(formalRows[0].activeChanges.length, 1, "source-root candidate is an overlay");
  const candidateRow = all.rows.find((row) => row.rowKey === "candidate:dev062-source-less");
  assert.ok(candidateRow, "source-less candidate is reachable");
  assert.equal(candidateRow.drawings.length, 1, "candidate row projects its draft drawing");
  assert.equal(candidateRow.drawings[0]?.drawingNumber, "Z4062-M01");
  assert.equal(candidateRow.parts.length, 1, "candidate row projects its draft part");
  assert.equal(candidateRow.parts[0]?.partNumber, "Z4062-P01");
  assert.deepEqual(candidateRow.matrix, [{
    drawingNumber: "Z4062-M01",
    partNumber: "Z4062-P01",
    relationType: "manufacturing_basis",
    isPrimary: true
  }], "candidate matrix projects the stored primary manufacturing relation");
  assert.equal(candidateRow.relationshipHealth, "draft", "candidate relationship remains non-formal");
  assert.equal(candidateRow.relationshipLabel, "關係已建立（尚未生效）", "complete candidate relationship is not mislabeled as pending");
  assert.equal(formalRows[0].drawings[0]?.drawingNumber, "R3062-M01");
  assert.equal(formalRows[0].parts[0]?.partNumber, "R3062-P01");
  const listQueryCount = queryCount;
  assert.ok(listQueryCount <= 18, `relation list query budget exceeded: ${listQueryCount}`);

  queryCount = 0;
  const formalDetail = await service.detail("root:dev062-relation-root", actor);
  const rootDetailQueryCount = queryCount;
  const legacyDetail = await service.detail("R3062", actor);
  queryCount = 0;
  const candidateDetail = await service.detail("candidate:dev062-source-less", actor);
  const candidateDetailQueryCount = queryCount;
  assert.equal(formalDetail?.rootDetail?.root.rootCode, "R3062");
  assert.equal(formalDetail?.row.activeChanges.length, 1);
  assert.equal(legacyDetail?.row.rowKey, "root:dev062-relation-root");
  assert.equal(candidateDetail?.candidate?.id, "dev062-source-less");
  assert.deepEqual(candidateDetail?.row.matrix, candidateRow.matrix, "candidate list/detail use the same relation projector");
  assert.ok(rootDetailQueryCount <= 10, `relation root detail query budget exceeded: ${rootDetailQueryCount}`);
  assert.ok(candidateDetailQueryCount <= 13, `relation candidate detail query budget exceeded: ${candidateDetailQueryCount}`);

  database.prepare(`INSERT INTO numbering_draft_relations (
    id, company_id, workspace_id, drawing_draft_id, part_draft_id, link_type, is_primary, created_at, updated_at
  ) VALUES ('dev062-source-less-duplicate-relation', 'company-jenfu', 'dev062-source-less',
    'dev062-source-less-drawing', 'dev062-source-less-part', 'reference', 0, ?, ?)` ).run(now, now);
  const duplicateCandidate = await service.detail("candidate:dev062-source-less", actor);
  assert.equal(duplicateCandidate?.row.relationshipHealth, "blocked", "duplicate candidate pair fails closed in the workbench");
  assert.ok(duplicateCandidate?.row.blockers.some((blocker) => blocker.code === "candidate_relation_duplicate"), "duplicate candidate pair exposes a reconciliation blocker");
  assert.equal(duplicateCandidate?.row.matrix[0]?.relationType, "blocked", "duplicate candidate pair is not silently reduced to one matrix relation");
  database.prepare("DELETE FROM numbering_draft_relations WHERE id = 'dev062-source-less-duplicate-relation'").run();

  const seedCardinalityGrowth = database.transaction(() => {
    const insertRoot = database.prepare(`INSERT INTO part_roots (
      id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, 'manufactured', 'Active', 'dev062-relation-owner', ?, ?)`);
    const insertPart = database.prepare(`INSERT INTO part_numbers (
      id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, series_code,
      record_status, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, ?, ?, ?, 'manufactured', 'JF', 'Active', 'dev062-relation-owner', ?, ?)`);
    const insertDrawing = database.prepare(`INSERT INTO drawing_numbers (
      id, company_id, part_root_id, drawing_number, purpose_code, sequence_no, is_primary_manufacturing,
      record_status, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, 'M', ?, ?, 'Active', 'dev062-relation-owner', ?, ?)`);
    const insertLink = database.prepare(`INSERT INTO drawing_part_links (
      id, drawing_number_id, part_number_id, link_type, created_by, created_at
    ) VALUES (?, ?, ?, ?, 'dev062-relation-owner', ?)`);
    for (let sequence = 2; sequence <= 5; sequence += 1) {
      const suffix = String(sequence).padStart(2, "0");
      insertPart.run(`dev062-relation-part-${suffix}`, "dev062-relation-root", `R3062-P${suffix}`, sequence, suffix, `正式閥體 ${suffix}`, now, now);
    }
    for (let sequence = 2; sequence <= 3; sequence += 1) {
      const suffix = String(sequence).padStart(2, "0");
      insertDrawing.run(`dev062-relation-drawing-${suffix}`, "dev062-relation-root", `R3062-M${suffix}`, sequence, 0, now, now);
      insertLink.run(`dev062-relation-link-${suffix}`, `dev062-relation-drawing-${suffix}`, `dev062-relation-part-${suffix}`, "reference", now);
    }
    for (let rootSequence = 1; rootSequence <= 59; rootSequence += 1) {
      const rootSuffix = String(rootSequence).padStart(4, "0");
      const rootId = `dev062-scale-root-${rootSuffix}`;
      const rootCode = `S${rootSuffix}`;
      insertRoot.run(rootId, rootCode, `代表性關係 ${rootSuffix}`, now, now);
      for (let partSequence = 1; partSequence <= 5; partSequence += 1) {
        const partSuffix = String(partSequence).padStart(2, "0");
        insertPart.run(`dev062-scale-part-${rootSuffix}-${partSuffix}`, rootId, `${rootCode}-P${partSuffix}`, partSequence, partSuffix, `代表性料號 ${rootSuffix}-${partSuffix}`, now, now);
      }
      for (let drawingSequence = 1; drawingSequence <= 3; drawingSequence += 1) {
        const drawingSuffix = String(drawingSequence).padStart(2, "0");
        const drawingId = `dev062-scale-drawing-${rootSuffix}-${drawingSuffix}`;
        const partId = `dev062-scale-part-${rootSuffix}-${drawingSuffix}`;
        insertDrawing.run(drawingId, rootId, `${rootCode}-M${drawingSuffix}`, drawingSequence, drawingSequence === 1 ? 1 : 0, now, now);
        insertLink.run(`dev062-scale-link-${rootSuffix}-${drawingSuffix}`, drawingId, partId, drawingSequence === 1 ? "primary_manufacturing" : "reference", now);
      }
    }
    const insertDraftPart = database.prepare(`INSERT INTO numbering_draft_parts (
      id, company_id, workspace_id, root_draft_id, part_name, item_kind, series_code, created_at, updated_at
    ) VALUES (?, 'company-jenfu', 'dev062-source-less', 'dev062-source-less-root', ?, 'manufactured', 'JF', ?, ?)`);
    for (let sequence = 2; sequence <= 5; sequence += 1) {
      insertDraftPart.run(`dev062-source-less-part-${sequence}`, `候選閥體 ${sequence}`, now, now);
    }
  });
  seedCardinalityGrowth();

  queryCount = 0;
  const representativeList = await service.list(workbench.normalizeRelationWorkbenchQuery(new URL("http://local.test/?view=all&limit=60")), actor);
  const representativeListQueryCount = queryCount;
  assert.equal(representativeList.rows.length, 60, "representative Relation list returns the contract limit");
  assert.equal(representativeListQueryCount, listQueryCount, "Relation list query count must not grow with root/child cardinality");
  queryCount = 0;
  const representativeRoot = await service.detail("root:dev062-relation-root", actor);
  const representativeRootQueryCount = queryCount;
  assert.equal(representativeRoot?.row.parts.length, 5, "root detail hydrates representative Part children");
  assert.equal(representativeRoot?.row.drawings.length, 3, "root detail hydrates representative Drawing children");
  assert.equal(representativeRootQueryCount, rootDetailQueryCount, "Relation root detail query count must not grow with child cardinality");
  queryCount = 0;
  const representativeCandidate = await service.detail("candidate:dev062-source-less", actor);
  const representativeCandidateQueryCount = queryCount;
  assert.equal(representativeCandidate?.candidate?.parts.length, 5, "candidate detail hydrates representative Part children");
  assert.equal(representativeCandidateQueryCount, candidateDetailQueryCount, "Relation candidate detail query count must not grow with child cardinality");

  const noCandidateActor = { ...actor, permissions: { ...actor.permissions, workspaceView: false } };
  const formalOnly = await service.list(workbench.normalizeRelationWorkbenchQuery(new URL("http://local.test/?view=all")), noCandidateActor);
  assert.ok(formalOnly.rows.every((row) => row.sourceKind === "formal" && row.activeChanges.length === 0));
  assert.equal(await service.detail("candidate:dev062-source-less", noCandidateActor), null);

  database.prepare(`INSERT INTO companies (id, company_code, display_name, created_at, updated_at)
    VALUES ('company-dev062-relation-other', 'D62R', 'DEV-062 Relation Other Company', ?, ?)` ).run(now, now);
  const otherCompanyActor = { ...actor, id: "dev062-relation-other-user", companyId: "company-dev062-relation-other" };
  const crossCompany = await service.list(workbench.normalizeRelationWorkbenchQuery(new URL("http://local.test/?view=all&query=R3062")), otherCompanyActor);
  assert.equal(crossCompany.rows.length, 0, "cross-company list does not expose matching root codes");
  assert.equal(await service.detail("root:dev062-relation-root", otherCompanyActor), null, "cross-company stable root ID is not resolvable");

  const before = crypto.createHash("sha256").update(JSON.stringify(database.prepare("SELECT * FROM numbering_draft_workspaces ORDER BY id").all())).digest("hex");
  await service.list(workbench.normalizeRelationWorkbenchQuery(new URL("http://local.test/?query=R3062")), actor);
  await service.detail("root:dev062-relation-root", actor);
  const after = crypto.createHash("sha256").update(JSON.stringify(database.prepare("SELECT * FROM numbering_draft_workspaces ORDER BY id").all())).digest("hex");
  assert.equal(after, before);
  const evidence = {
    suite: "DEV-062 Relation workbench",
    passed: true,
    queryBudget: {
      list: { budget: 18, baseline: listQueryCount, representative: representativeListQueryCount, rootCardinality: 60, rowCardinality: representativeList.rows.length },
      rootDetail: { budget: 10, baseline: rootDetailQueryCount, representative: representativeRootQueryCount, partCardinality: representativeRoot?.row.parts.length ?? 0, drawingCardinality: representativeRoot?.row.drawings.length ?? 0 },
      candidateDetail: { budget: 13, baseline: candidateDetailQueryCount, representative: representativeCandidateQueryCount, childCardinality: representativeCandidate?.candidate?.parts.length ?? 0 }
    },
    permission: { candidateOmittedWithoutWorkspaceView: true, crossCompanyStableIdHidden: true },
    zeroWrite: { before, after, unchanged: before === after }
  };
  if (process.env.DEV062_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.DEV062_EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.DEV062_EVIDENCE_DIR, "relation-results.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }
  console.log(`QC DEV-062 Relation workbench: PASS (root unique, overlay, source-less, permission/company, zero-write, cardinality-invariant queries list/root/candidate=${listQueryCount}/${rootDetailQueryCount}/${candidateDetailQueryCount})`);
} finally {
  try { database?.close(); } catch {}
  const resolved = path.resolve(fixtureRoot);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true });
}
