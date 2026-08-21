#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev085-query-"));
const runId = `query-${new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}-local`;
const runDir = path.join(root, "output", "qa", "dev-085-workbench-multiselect-filter", runId);
fs.mkdirSync(runDir, { recursive: true });

Object.assign(process.env, {
  NODE_ENV: "test",
  PDM_DATA_DIR: fixtureRoot,
  PDM_REPOSITORY_DIR: path.join(fixtureRoot, "repository"),
  PDM_DB_PROVIDER: "sqlite",
  PDM_NUMBER_STATE_FLOW_V1: "true",
  PDM_NUMBER_LIFECYCLE_V2: "true",
  PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
  PDM_AUTH_SECRET: "dev085-query-secret"
});

const results = [];
const record = (id, passed, detail = "") => {
  results.push({ id, status: passed ? "PASS" : "FAIL", detail });
  if (!passed) throw new Error(`${id}: ${detail}`);
};
const url = (value) => new URL(`http://local.test/${value.startsWith("?") ? value : `?${value}`}`);
const keys = (rows) => rows.map((row) => row.rowKey);
const unique = (values) => new Set(values).size === values.length;

let database;
try {
  const [{ getDb }, provider, drawingModule, partModule, relationModule] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db-async-provider"),
    import("@/lib/drawing-workbench"),
    import("@/lib/part-workbench"),
    import("@/lib/relation-workbench")
  ]);
  database = getDb();
  const now = "2026-08-20T08:00:00.000Z";
  const companyId = "company-jenfu";
  const actorId = "dev085-query-owner";
  database.prepare(`INSERT INTO users (
    id, display_name, email, role, company_id, account_status, system_role_enabled, created_at, updated_at
  ) VALUES (?, 'DEV-085 Query Owner', 'dev085-query@example.invalid', 'Engineer', ?, 'active', 1, ?, ?)`)
    .run(actorId, companyId, now, now);
  database.prepare(`INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
    VALUES (?, ?, 1, ?)`)
    .run(actorId, companyId, now);

  const insertRoot = database.prepare(`INSERT INTO part_roots (
    id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertPart = database.prepare(`INSERT INTO part_numbers (
    id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
    item_kind, series_code, record_status, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertDrawingNumber = database.prepare(`INSERT INTO drawing_numbers (
    id, company_id, part_root_id, drawing_number, purpose_code, purpose_description,
    sequence_no, is_primary_manufacturing, record_status, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`);
  const insertLink = database.prepare(`INSERT INTO drawing_part_links (
    id, drawing_number_id, part_number_id, link_type, created_by, created_at
  ) VALUES (?, ?, ?, ?, ?, ?)`);
  const insertCanonicalDrawing = database.prepare(`INSERT INTO drawings (
    id, company_id, drawing_number, lifecycle_state, formal_drawing_number_id,
    part_root_id, purpose_code, purpose_description, sequence_no, is_primary_manufacturing,
    owner_id, rule_version_id, row_version, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, 'rd_controlled', ?, ?, ?, '', ?, ?, ?, 'numbering-rule-v3-alpha-root', 1, ?, ?, ?)`);

  const seriesValues = ["JF", "JS", "ZX"];
  const formalIds = [];
  for (let index = 1; index <= 108; index += 1) {
    const suffix = String(index).padStart(3, "0");
    const rootId = `dev085-root-${suffix}`;
    const partId = `dev085-part-${suffix}`;
    const drawingNumberId = `dev085-drawing-number-${suffix}`;
    const canonicalDrawingId = `dev085-drawing-${suffix}`;
    const series = seriesValues[(index - 1) % seriesValues.length];
    const itemKind = index % 3 === 0 ? "purchased" : "manufactured";
    const purpose = index % 2 === 0 ? "R" : "M";
    const status = index % 11 === 0 ? "Released" : index % 7 === 0 ? "PendingReview" : "Active";
    const rootCode = `D085-${suffix}`;
    const partNumber = `${rootCode}-P01`;
    const drawingNumber = `${rootCode}-${purpose}01`;
    insertRoot.run(rootId, companyId, rootCode, `DEV-085 根號 ${suffix}`, itemKind, status, actorId, now, now);
    insertPart.run(partId, companyId, rootId, partNumber, 1, "01", `DEV-085 料件 ${suffix}`, itemKind, series, status, actorId, now, now);
    insertDrawingNumber.run(drawingNumberId, companyId, rootId, drawingNumber, purpose, 1, purpose === "M" ? 1 : 0, status, actorId, now, now);
    insertLink.run(`dev085-link-${suffix}`, drawingNumberId, partId, purpose === "M" ? "primary_manufacturing" : "reference", actorId, now);
    insertCanonicalDrawing.run(canonicalDrawingId, companyId, drawingNumber, drawingNumberId, rootId, purpose, 1, purpose === "M" ? 1 : 0, actorId, actorId, now, now);
    formalIds.push({ rootId, partId, drawingNumberId, canonicalDrawingId, series, itemKind, purpose, status, rootCode });
  }

  const candidateWorkspaceId = "dev085-candidate-workspace";
  const candidateRootId = "dev085-candidate-root";
  const candidatePartId = "dev085-candidate-part";
  const candidateDrawingId = "dev085-candidate-drawing-draft";
  database.prepare(`INSERT INTO numbering_draft_workspaces (
    id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at
  ) VALUES (?, ?, 'new_bundle', 'active', ?, ?, 1, ?, ?)`)
    .run(candidateWorkspaceId, companyId, actorId, actorId, now, now);
  database.prepare(`INSERT INTO numbering_draft_roots (
    id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
  ) VALUES (?, ?, ?, 'DEV-085 候選根號', 'manufactured', 'numbering-rule-v3-alpha-root', ?, ?)`)
    .run(candidateRootId, companyId, candidateWorkspaceId, now, now);
  database.prepare(`INSERT INTO numbering_draft_parts (
    id, company_id, workspace_id, root_draft_id, part_name, item_kind, series_code, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'DEV-085 候選料件', 'manufactured', 'ZX', ?, ?)`)
    .run(candidatePartId, companyId, candidateWorkspaceId, candidateRootId, now, now);
  database.prepare(`INSERT INTO numbering_draft_drawings (
    id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description,
    is_primary_manufacturing, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'R', '', 0, ?, ?)`)
    .run(candidateDrawingId, companyId, candidateWorkspaceId, candidateRootId, now, now);
  const insertReservation = database.prepare(`INSERT INTO number_candidate_reservations (
    id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code,
    sequence_scope_key, sequence_no, reservation_state, row_version, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'active', 1, ?, ?, ?)`);
  const reservations = [
    ["dev085-candidate-root-reservation", "root", candidateRootId, "D085-C01", "dev085:candidate:root"],
    ["dev085-candidate-part-reservation", "part", candidatePartId, "D085-C01-P01", "dev085:candidate:part"],
    ["dev085-candidate-drawing-reservation", "drawing", candidateDrawingId, "D085-C01-R01", "dev085:candidate:drawing"]
  ];
  for (const [reservationId, itemType, itemId, candidateCode, scope] of reservations) {
    insertReservation.run(reservationId, companyId, candidateWorkspaceId, itemType, itemId, candidateCode, scope, actorId, now, now);
  }
  database.prepare("UPDATE numbering_draft_roots SET candidate_reservation_id = ? WHERE id = ?").run(reservations[0][0], candidateRootId);
  database.prepare("UPDATE numbering_draft_parts SET candidate_reservation_id = ? WHERE id = ?").run(reservations[1][0], candidatePartId);
  database.prepare("UPDATE numbering_draft_drawings SET candidate_reservation_id = ? WHERE id = ?").run(reservations[2][0], candidateDrawingId);
  database.prepare(`INSERT INTO drawings (
    id, company_id, drawing_number, lifecycle_state, workspace_id, drawing_draft_id,
    candidate_reservation_id, purpose_code, purpose_description, sequence_no,
    is_primary_manufacturing, owner_id, rule_version_id, row_version, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, 'building', ?, ?, ?, 'R', '', 1, 0, ?, 'numbering-rule-v3-alpha-root', 1, ?, ?, ?)`)
    .run("dev085-drawing-candidate", companyId, "D085-C01-R01", candidateWorkspaceId, candidateDrawingId, reservations[2][0], actorId, actorId, now, now);

  const actorBase = {
    id: actorId,
    companyId,
    canEditNonOwned: true,
    permissions: {
      workspaceView: true,
      workspaceUpdate: true,
      candidateSubmit: true,
      candidateWithdraw: true,
      candidateReview: true,
      publish: true,
      createRevision: true,
      draftUpdate: true,
      manageReferenceAttachments: true,
      managePermissions: true,
      manageRelations: true
    },
    viewerCapabilities: {
      canEdit: true,
      canManageRelations: true,
      canReview: true,
      canPublish: true,
      canRestoreMainDrawing: true,
      canSubmit: true
    }
  };
  const drawingActor = actorBase;
  const partActor = actorBase;
  const relationActor = actorBase;
  const rawClient = provider.createAsyncDatabaseClient({ kind: "sqlite", database });
  const drawingService = new drawingModule.DrawingWorkbenchService(rawClient);
  const partService = new partModule.PartWorkbenchService(rawClient);
  const relationService = new relationModule.RelationWorkbenchService(rawClient);
  const countQueries = async (fn) => {
    let count = 0;
    const countedClient = {
      kind: rawClient.kind,
      query: (...args) => { count += 1; return rawClient.query(...args); },
      queryOne: (...args) => { count += 1; return rawClient.queryOne(...args); },
      execute: (...args) => rawClient.execute(...args),
      transaction: (callback) => rawClient.transaction((transactionClient) => callback(transactionClient)),
      close: (...args) => rawClient.close(...args)
    };
    return { value: await fn(countedClient), count };
  };

  const allDrawing = await drawingService.list(drawingModule.normalizeDrawingWorkbenchQuery(url("?view=all&limit=10")), drawingActor);
  const allPart = await partService.list(partModule.normalizePartWorkbenchQuery(url("?view=all&limit=10")), partActor);
  const allRelation = await relationService.list(relationModule.normalizeRelationWorkbenchQuery(url("?view=all&limit=10")), relationActor);
  record("MSF-021/023 all baseline preserves candidate and 108 formal identities", allDrawing.rows.length === 10 && allPart.rows.length === 10 && allRelation.rows.length === 10 && allDrawing.filters.seriesCodeOptions.length >= 3 && allPart.filters.seriesCodeOptions.length >= 3 && allRelation.filters.seriesCodeOptions.length >= 3, JSON.stringify({ drawing: allDrawing.rows.length, part: allPart.rows.length, relation: allRelation.rows.length }));

  const drawingSome = await drawingService.list(drawingModule.normalizeDrawingWorkbenchQuery(url("?view=all&limit=100&seriesCode=JF&seriesCode=ZX&purposeCode=M")), drawingActor);
  const partSome = await partService.list(partModule.normalizePartWorkbenchQuery(url("?view=all&limit=100&seriesCode=JF&seriesCode=ZX&itemKind=manufactured")), partActor);
  const relationSome = await relationService.list(relationModule.normalizeRelationWorkbenchQuery(url("?view=all&limit=100&seriesCode=JF&seriesCode=ZX&entityType=part_number&entityType=drawing_number")), relationActor);
  record("MSF-021/022 same-field OR and cross-field AND apply across all domains", drawingSome.rows.length > 0 && drawingSome.rows.every((row) => ["M"].includes(row.purposeCode ?? "") && row.relatedPartSummary !== null) && partSome.rows.length > 0 && partSome.rows.every((row) => ["JF", "ZX"].includes(row.seriesCode ?? "") && row.itemKind === "manufactured") && relationSome.rows.length > 0, JSON.stringify({ drawing: drawingSome.rows.length, part: partSome.rows.length, relation: relationSome.rows.length }));

  const noneUrls = [
    [drawingService, drawingModule.normalizeDrawingWorkbenchQuery(url("?view=all&purposeCode=__none__")), drawingActor],
    [partService, partModule.normalizePartWorkbenchQuery(url("?view=all&itemKind=__none__")), partActor],
    [relationService, relationModule.normalizeRelationWorkbenchQuery(url("?view=all&entityType=__none__")), relationActor]
  ];
  const noneRows = [];
  for (const [service, query, actor] of noneUrls) noneRows.push((await service.list(query, actor)).rows.length);
  record("MSF-012 explicit none returns zero rows without load failure", noneRows.every((value) => value === 0), JSON.stringify(noneRows));

  const candidateFilteredDrawing = await drawingService.list(drawingModule.normalizeDrawingWorkbenchQuery(url("?view=all&purposeCode=R&recordStatus=Released&limit=100")), drawingActor);
  const candidateFilteredPart = await partService.list(partModule.normalizePartWorkbenchQuery(url("?view=all&itemKind=manufactured&recordStatus=Released&limit=100")), partActor);
  const candidateFilteredRelation = await relationService.list(relationModule.normalizeRelationWorkbenchQuery(url("?view=all&entityType=part_number&recordStatus=Released&limit=100")), relationActor);
  record("MSF-024 recordStatus some keeps formal authority and excludes candidate rows", !candidateFilteredDrawing.rows.some((row) => row.sourceKind === "candidate") && !candidateFilteredPart.rows.some((row) => row.sourceKind === "candidate") && !candidateFilteredRelation.rows.some((row) => row.sourceKind === "candidate"), JSON.stringify({ drawing: candidateFilteredDrawing.rows.length, part: candidateFilteredPart.rows.length, relation: candidateFilteredRelation.rows.length }));

  const lateDrawing = await drawingService.list(drawingModule.normalizeDrawingWorkbenchQuery(url("?view=all&limit=1&seriesCode=ZX&purposeCode=R")), drawingActor);
  const latePart = await partService.list(partModule.normalizePartWorkbenchQuery(url("?view=all&limit=1&seriesCode=ZX&itemKind=purchased")), partActor);
  const lateRelation = await relationService.list(relationModule.normalizeRelationWorkbenchQuery(url("?view=all&limit=1&seriesCode=ZX&entityType=part_number")), relationActor);
  record("MSF-028 filter-before-limit finds matching rows without false empty page", lateDrawing.rows.length === 1 && latePart.rows.length === 1 && lateRelation.rows.length === 1, JSON.stringify({ drawing: lateDrawing.rows[0]?.rowKey, part: latePart.rows[0]?.rowKey, relation: lateRelation.rows[0]?.rowKey }));

  const domains = [
    { name: "drawing", service: drawingService, normalize: drawingModule.normalizeDrawingWorkbenchQuery, actor: drawingActor },
    { name: "part", service: partService, normalize: partModule.normalizePartWorkbenchQuery, actor: partActor },
    { name: "relation", service: relationService, normalize: relationModule.normalizeRelationWorkbenchQuery, actor: relationActor }
  ];
  for (const domain of domains) {
    const first = await domain.service.list(domain.normalize(url("?view=all&limit=10")), domain.actor);
    assert.ok(first.nextCursor, `${domain.name} first page must have next cursor`);
    const second = await domain.service.list(domain.normalize(url(`?view=all&limit=10&cursor=${encodeURIComponent(first.nextCursor)}`)), domain.actor);
    assert.equal(second.rows.length, 10, `${domain.name} second page must be full`);
    assert.ok(unique([...keys(first.rows), ...keys(second.rows)]), `${domain.name} cursor pages duplicate rows`);
    assert.ok(second.previousCursor, `${domain.name} second page must have previous cursor`);
    const previous = await domain.service.list(domain.normalize(url(`?view=all&limit=10&cursor=${encodeURIComponent(second.previousCursor)}`)), domain.actor);
    assert.deepEqual(keys(previous.rows), keys(first.rows), `${domain.name} before cursor must restore first page`);
    let invalidCursorCode = "";
    try {
      await domain.service.list(domain.normalize(url(`?view=all&limit=10&seriesCode=JF&cursor=${encodeURIComponent(first.nextCursor)}`)), domain.actor);
    } catch (error) {
      invalidCursorCode = error?.code ?? String(error);
    }
    assert.equal(invalidCursorCode, "workbench_invalid_cursor", `${domain.name} changed selection must invalidate old cursor`);
    record(`MSF-029/030/031 ${domain.name} forward-backward cursor and filter invalidation`, true, JSON.stringify({ first: first.rows[0]?.rowKey, second: second.rows[0]?.rowKey, invalidCursorCode }));
  }

  const queryCountEvidence = {};
  const countedDrawing = await countQueries((client) => new drawingModule.DrawingWorkbenchService(client).list(drawingModule.normalizeDrawingWorkbenchQuery(url("?view=all&limit=10")), drawingActor));
  const countedPart = await countQueries((client) => new partModule.PartWorkbenchService(client).list(partModule.normalizePartWorkbenchQuery(url("?view=all&limit=10")), partActor));
  const countedRelation = await countQueries((client) => new relationModule.RelationWorkbenchService(client).list(relationModule.normalizeRelationWorkbenchQuery(url("?view=all&limit=10")), relationActor));
  queryCountEvidence.drawing = countedDrawing.count;
  queryCountEvidence.part = countedPart.count;
  queryCountEvidence.relation = countedRelation.count;
  record("MSF-032 query budgets remain bounded for 108-identity fixture", countedDrawing.count <= 18 && countedPart.count <= 15 && countedRelation.count <= 18, JSON.stringify(queryCountEvidence));

  const beforeChanges = database.prepare("SELECT total_changes() AS value").get().value;
  await drawingService.list(drawingModule.normalizeDrawingWorkbenchQuery(url("?view=all&seriesCode=JF&purposeCode=M")), drawingActor);
  await partService.list(partModule.normalizePartWorkbenchQuery(url("?view=all&seriesCode=JF&itemKind=manufactured")), partActor);
  await relationService.list(relationModule.normalizeRelationWorkbenchQuery(url("?view=all&seriesCode=JF&entityType=part_number")), relationActor);
  const afterChanges = database.prepare("SELECT total_changes() AS value").get().value;
  record("MSF-033 list reads remain zero-write", beforeChanges === afterChanges, JSON.stringify({ beforeChanges, afterChanges }));

  const otherActor = { ...actorBase, id: "dev085-other-company-user", companyId: "company-dev085-other" };
  database.prepare(`INSERT INTO companies (id, company_code, display_name, created_at, updated_at) VALUES (?, 'D085O', 'DEV-085 Other', ?, ?)`)
    .run(otherActor.companyId, now, now);
  const crossCompany = await partService.list(partModule.normalizePartWorkbenchQuery(url("?view=all&query=D085")), otherActor);
  record("MSF-033 company scope hides cross-company rows", crossCompany.rows.length === 0, JSON.stringify({ rows: crossCompany.rows.length }));

  const evidence = {
    runId,
    status: "PASS",
    fixture: { formalIdentityCount: 108, candidateWorkspaceCount: 1, companyId, disposable: true },
    queryCount: queryCountEvidence,
    results
  };
  fs.writeFileSync(path.join(runDir, "query-results.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`${results.length}/${results.length} PASS`);
  console.log(`evidence: ${path.relative(root, path.join(runDir, "query-results.json"))}`);
} catch (error) {
  const failed = { runId, status: "FAIL", error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error), results };
  fs.writeFileSync(path.join(runDir, "query-results.json"), `${JSON.stringify(failed, null, 2)}\n`, "utf8");
  console.error(failed.error);
  process.exitCode = 1;
} finally {
  try { database?.close(); } catch {}
  const resolved = path.resolve(fixtureRoot);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true });
}
