#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev062-part-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  PDM_DATA_DIR: fixtureRoot,
  PDM_REPOSITORY_DIR: path.join(fixtureRoot, "repository"),
  PDM_DB_PROVIDER: "sqlite",
  PDM_NUMBER_STATE_FLOW_V1: "true",
  PDM_NUMBER_LIFECYCLE_V2: "true",
  PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
  PDM_AUTH_SECRET: "dev062-part-secret"
});

let database;
try {
  const [{ getDb }, provider, workbench] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db-async-provider"),
    import("@/lib/part-workbench")
  ]);
  database = getDb();
  const now = "2026-08-10T08:00:00.000Z";
  database.prepare(`INSERT INTO users (
    id, display_name, email, role, company_id, account_status, system_role_enabled, created_at, updated_at
  ) VALUES ('dev062-owner', 'DEV-062 Owner', 'dev062-owner@example.invalid', 'Engineer', 'company-jenfu', 'active', 1, ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
    VALUES ('dev062-owner', 'company-jenfu', 1, ?)` ).run(now);
  database.prepare(`INSERT INTO numbering_draft_workspaces (
    id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at
  ) VALUES ('dev062-part-candidate', 'company-jenfu', 'new_bundle', 'active', 'dev062-owner', 'dev062-owner', 1, ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_roots (
    id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
  ) VALUES ('dev062-draft-root', 'company-jenfu', 'dev062-part-candidate', '候選泵浦', 'manufactured', 'numbering-rule-v3-alpha-root', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_parts (
    id, company_id, workspace_id, root_draft_id, part_name, item_kind, series_code, created_at, updated_at
  ) VALUES ('dev062-draft-part', 'company-jenfu', 'dev062-part-candidate', 'dev062-draft-root', '候選泵浦', 'manufactured', 'JF', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO number_candidate_reservations (
    id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code, sequence_scope_key, sequence_no,
    reservation_state, row_version, created_by, created_at, updated_at
  ) VALUES ('dev062-part-reservation', 'company-jenfu', 'dev062-part-candidate', 'part', 'dev062-draft-part', 'Z2062-P01', 'dev062:parts', 1, 'active', 1, 'dev062-owner', ?, ?)` ).run(now, now);
  database.prepare("UPDATE numbering_draft_parts SET candidate_reservation_id = 'dev062-part-reservation' WHERE id = 'dev062-draft-part'").run();
  database.prepare(`INSERT INTO part_roots (
    id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at
  ) VALUES ('dev062-root', 'company-jenfu', 'Z3062', '正式泵浦', 'manufactured', 'Active', 'dev062-owner', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO part_numbers (
    id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, series_code,
    record_status, created_by, created_at, updated_at
  ) VALUES ('dev062-part', 'company-jenfu', 'dev062-root', 'Z3062-P01', 1, '01', '正式泵浦', 'manufactured', 'JF', 'Active', 'dev062-owner', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO drawing_numbers (
    id, company_id, part_root_id, drawing_number, purpose_code, sequence_no, is_primary_manufacturing,
    record_status, created_by, created_at, updated_at
  ) VALUES ('dev062-drawing', 'company-jenfu', 'dev062-root', 'Z3062-M01', 'M', 1, 1, 'Active', 'dev062-owner', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO drawing_part_links (
    id, drawing_number_id, part_number_id, link_type, created_by, created_at
  ) VALUES ('dev062-link', 'dev062-drawing', 'dev062-part', 'primary_manufacturing', 'dev062-owner', ?)` ).run(now);

  const actor = {
    id: "dev062-owner",
    companyId: "company-jenfu",
    permissions: { workspaceView: true, workspaceUpdate: true, candidateSubmit: true, candidateReview: true, publish: true, managePermissions: true },
    viewerCapabilities: { canEdit: true, canManageRelations: true, canReview: true, canPublish: true, canRestoreMainDrawing: true, canSubmit: true },
    canViewCostAmounts: false
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
  const service = new workbench.PartWorkbenchService(wrap(rawClient));
  const all = await service.list(workbench.normalizePartWorkbenchQuery(new URL("http://local.test/?view=all&limit=50")), actor);
  const listQueryCount = queryCount;
  assert.deepEqual(new Set(all.rows.map((row) => row.rowKey)), new Set(["candidate:dev062-part-candidate", "part:dev062-part"]));
  assert.equal(all.rows.find((row) => row.rowKind === "candidate_bundle")?.partCount, 1);
  assert.equal(all.rows.find((row) => row.rowKind === "part_master")?.primaryDrawingNumber, "Z3062-M01");

  assert.ok(listQueryCount <= 15, `part list query budget exceeded: ${listQueryCount}`);
  queryCount = 0;
  const candidate = await service.detail("candidate:dev062-part-candidate", actor);
  const candidateDetailQueryCount = queryCount;
  queryCount = 0;
  const formal = await service.detail("part:dev062-part", actor);
  const formalDetailQueryCount = queryCount;
  const legacy = await service.detail("Z3062-P01", actor);
  assert.equal(candidate?.candidate?.parts.length, 1);
  assert.equal(formal?.part?.partNumber, "Z3062-P01");
  assert.equal(legacy?.row.rowKey, "part:dev062-part");
  assert.ok(candidateDetailQueryCount <= 13, `part candidate detail query budget exceeded: ${candidateDetailQueryCount}`);
  assert.ok(formalDetailQueryCount <= 6, `part formal detail query budget exceeded: ${formalDetailQueryCount}`);

  const seedCardinalityGrowth = database.transaction(() => {
    const insertFormalPart = database.prepare(`INSERT INTO part_numbers (
      id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, series_code,
      record_status, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', 'dev062-root', ?, ?, ?, ?, 'manufactured', 'JF', 'Active', 'dev062-owner', ?, ?)`);
    const insertDraftPart = database.prepare(`INSERT INTO numbering_draft_parts (
      id, company_id, workspace_id, root_draft_id, part_name, item_kind, series_code, created_at, updated_at
    ) VALUES (?, 'company-jenfu', 'dev062-part-candidate', 'dev062-draft-root', ?, 'manufactured', 'JF', ?, ?)`);
    const insertReservation = database.prepare(`INSERT INTO number_candidate_reservations (
      id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code, sequence_scope_key, sequence_no,
      reservation_state, row_version, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', 'dev062-part-candidate', 'part', ?, ?, 'dev062:parts', ?, 'active', 1, 'dev062-owner', ?, ?)`);
    for (let sequence = 2; sequence <= 50; sequence += 1) {
      const suffix = String(sequence).padStart(2, "0");
      insertFormalPart.run(`dev062-part-${suffix}`, `Z3062-P${suffix}`, sequence, suffix, `正式泵浦 ${suffix}`, now, now);
    }
    for (let sequence = 2; sequence <= 25; sequence += 1) {
      const suffix = String(sequence).padStart(2, "0");
      const draftPartId = `dev062-draft-part-${suffix}`;
      const reservationId = `dev062-part-reservation-${suffix}`;
      insertDraftPart.run(draftPartId, `候選泵浦 ${suffix}`, now, now);
      insertReservation.run(reservationId, draftPartId, `Z2062-P${suffix}`, sequence, now, now);
      database.prepare("UPDATE numbering_draft_parts SET candidate_reservation_id = ? WHERE id = ?").run(reservationId, draftPartId);
    }
    for (let sequence = 2; sequence <= 10; sequence += 1) {
      const suffix = String(sequence).padStart(2, "0");
      database.prepare(`INSERT INTO drawing_numbers (
        id, company_id, part_root_id, drawing_number, purpose_code, sequence_no, is_primary_manufacturing,
        record_status, created_by, created_at, updated_at
      ) VALUES (?, 'company-jenfu', 'dev062-root', ?, 'R', ?, 0, 'Active', 'dev062-owner', ?, ?)`)
        .run(`dev062-drawing-${suffix}`, `Z3062-R${suffix}`, sequence, now, now);
      database.prepare(`INSERT INTO drawing_part_links (
        id, drawing_number_id, part_number_id, link_type, created_by, created_at
      ) VALUES (?, ?, 'dev062-part', 'reference', 'dev062-owner', ?)`)
        .run(`dev062-link-${suffix}`, `dev062-drawing-${suffix}`, now);
    }
  });
  seedCardinalityGrowth();

  queryCount = 0;
  const representativeList = await service.list(workbench.normalizePartWorkbenchQuery(new URL("http://local.test/?view=all&limit=50")), actor);
  const representativeListQueryCount = queryCount;
  assert.equal(representativeList.rows.length, 50, "representative Part list returns the contract limit");
  assert.equal(representativeListQueryCount, listQueryCount, "Part list query count must not grow with row cardinality");
  queryCount = 0;
  const representativeCandidate = await service.detail("candidate:dev062-part-candidate", actor);
  const representativeCandidateQueryCount = queryCount;
  assert.equal(representativeCandidate?.candidate?.parts.length, 25, "candidate detail hydrates all representative child Parts");
  assert.equal(representativeCandidateQueryCount, candidateDetailQueryCount, "Part candidate detail query count must not grow with child cardinality");
  queryCount = 0;
  const representativeFormal = await service.detail("part:dev062-part", actor);
  const representativeFormalQueryCount = queryCount;
  assert.equal(representativeFormal?.part?.linkedDrawings.length, 10, "formal detail hydrates representative linked drawings");
  assert.equal(representativeFormalQueryCount, formalDetailQueryCount, "Part formal detail query count must not grow with child cardinality");

  const noCandidateActor = { ...actor, permissions: { ...actor.permissions, workspaceView: false } };
  const formalOnly = await service.list(workbench.normalizePartWorkbenchQuery(new URL("http://local.test/?view=all")), noCandidateActor);
  assert.ok(formalOnly.rows.every((row) => row.sourceKind === "formal"));
  assert.equal(await service.detail("candidate:dev062-part-candidate", noCandidateActor), null);

  database.prepare(`INSERT INTO companies (id, company_code, display_name, created_at, updated_at)
    VALUES ('company-dev062-other', 'D62O', 'DEV-062 Other Company', ?, ?)` ).run(now, now);
  const otherCompanyActor = { ...actor, id: "dev062-other-user", companyId: "company-dev062-other" };
  const crossCompany = await service.list(workbench.normalizePartWorkbenchQuery(new URL("http://local.test/?view=all&query=Z3062-P01")), otherCompanyActor);
  assert.equal(crossCompany.rows.length, 0, "cross-company list does not expose matching display codes");
  assert.equal(await service.detail("part:dev062-part", otherCompanyActor), null, "cross-company stable ID is not resolvable");

  const page1 = await service.list(workbench.normalizePartWorkbenchQuery(new URL("http://local.test/?view=all&limit=1")), actor);
  assert.ok(page1.nextCursor);
  const page2 = await service.list(workbench.normalizePartWorkbenchQuery(new URL(`http://local.test/?view=all&limit=1&cursor=${encodeURIComponent(page1.nextCursor)}`)), actor);
  assert.notEqual(page1.rows[0].rowKey, page2.rows[0].rowKey);
  await assert.rejects(
    () => service.list(workbench.normalizePartWorkbenchQuery(new URL(`http://local.test/?view=work&limit=1&cursor=${encodeURIComponent(page1.nextCursor)}`)), actor),
    (error) => error?.code === "workbench_invalid_cursor"
  );

  const before = crypto.createHash("sha256").update(JSON.stringify(database.prepare("SELECT * FROM numbering_draft_workspaces ORDER BY id").all())).digest("hex");
  await service.list(workbench.normalizePartWorkbenchQuery(new URL("http://local.test/?query=泵浦")), actor);
  await service.detail("part:dev062-part", actor);
  const after = crypto.createHash("sha256").update(JSON.stringify(database.prepare("SELECT * FROM numbering_draft_workspaces ORDER BY id").all())).digest("hex");
  assert.equal(after, before);
  const evidence = {
    suite: "DEV-062 Part workbench",
    passed: true,
    queryBudget: {
      list: { budget: 15, baseline: listQueryCount, representative: representativeListQueryCount, rowCardinality: representativeList.rows.length },
      candidateDetail: { budget: 13, baseline: candidateDetailQueryCount, representative: representativeCandidateQueryCount, childCardinality: representativeCandidate?.candidate?.parts.length ?? 0 },
      formalDetail: { budget: 6, baseline: formalDetailQueryCount, representative: representativeFormalQueryCount, childCardinality: representativeFormal?.part?.linkedDrawings.length ?? 0 }
    },
    permission: { candidateOmittedWithoutWorkspaceView: true, crossCompanyStableIdHidden: true },
    zeroWrite: { before, after, unchanged: before === after }
  };
  if (process.env.DEV062_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.DEV062_EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.DEV062_EVIDENCE_DIR, "part-results.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }
  console.log(`QC DEV-062 Part workbench: PASS (candidate/formal, stable identity, legacy detail, permission/company, cursor, zero-write, cardinality-invariant queries list/candidate/formal=${listQueryCount}/${candidateDetailQueryCount}/${formalDetailQueryCount})`);
} finally {
  try { database?.close(); } catch {}
  const resolved = path.resolve(fixtureRoot);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true });
}
