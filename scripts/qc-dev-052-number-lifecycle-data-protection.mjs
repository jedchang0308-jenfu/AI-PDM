#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = path.join(root, ".tmp", `qc-dev-052-data-protection-${crypto.randomUUID()}`);
const results = [];

function record(id, passed, detail = "") {
  results.push({ id, passed: Boolean(passed), detail });
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function tableHash(database, table) {
  const rows = database.prepare(`SELECT * FROM ${table} ORDER BY 1`).all();
  return crypto.createHash("sha256").update(JSON.stringify(canonical(rows))).digest("hex");
}

process.env.PDM_DATA_DIR = fixtureRoot;
process.env.PDM_REPOSITORY_DIR = path.join(fixtureRoot, "repository");
process.env.PDM_DB_PROVIDER = "sqlite";
process.env.PDM_NUMBER_LIFECYCLE_V2 = "true";

let database;
try {
  const [{ getDb }, { createAsyncDatabaseClient }, { AsyncNumberStateFlowRepository }, { projectNumberLifecycleUserView }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db-async-provider"),
    import("@/lib/repositories/number-state-flow-async-repository"),
    import("@/lib/number-lifecycle-simplification")
  ]);
  database = getDb();
  database.prepare(`
    INSERT INTO users (
      id, display_name, email, password_hash, role, company_id, account_status,
      system_role_enabled, created_at, updated_at
    ) VALUES (
      'dev052-qc-user', 'DEV-052 QC', 'dev052-qc@example.invalid', NULL, 'Engineer',
      'company-jenfu', 'active', 1, datetime('now'), datetime('now')
    )
  `).run();
  database.prepare(`
    INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
    VALUES ('dev052-qc-user', 'company-jenfu', 1, datetime('now'))
  `).run();

  function addLegacyApproval(workspaceId, status) {
    const requestId = `approval-${workspaceId}`;
    const applyStatus = status === "approved" ? "applied" : "not_ready";
    database.prepare(`
      INSERT INTO approval_platform_requests (
        id, company_id, action_code, domain_code, request_status, title, reason,
        requested_by, requested_at, resolved_by, resolved_at, apply_status,
        apply_attempts, applied_by, applied_at, payload_json, created_at, updated_at
      ) VALUES (
        :id, 'company-jenfu', 'numbering.candidate_publication_review', 'numbering', :status,
        :title, 'fixture', 'dev052-qc-user', datetime('now'), :resolvedBy, :resolvedAt,
        :applyStatus, :applyAttempts, :appliedBy, :appliedAt, :payloadJson, datetime('now'), datetime('now')
      )
    `).run({
      id: requestId,
      status,
      title: `Review ${workspaceId}`,
      resolvedBy: status === "approved" ? "dev052-qc-user" : null,
      resolvedAt: status === "approved" ? new Date().toISOString() : null,
      applyStatus,
      applyAttempts: status === "approved" ? 1 : 0,
      appliedBy: status === "approved" ? "dev052-qc-user" : null,
      appliedAt: status === "approved" ? new Date().toISOString() : null,
      payloadJson: JSON.stringify({ snapshotHash: `hash-${workspaceId}` })
    });
    database.prepare(`
      INSERT INTO approval_platform_targets (
        id, request_id, target_role, target_type, target_id, target_label, snapshot_json, created_at
      ) VALUES (:id, :requestId, 'primary', 'numbering_draft_workspace', :workspaceId, :workspaceId, '{}', datetime('now'))
    `).run({ id: `target-${workspaceId}`, requestId, workspaceId });
    database.prepare(`
      INSERT INTO approval_platform_impact_snapshots (
        id, request_id, snapshot_hash, snapshot_json, captured_by, captured_at
      ) VALUES (:id, :requestId, :snapshotHash, '{}', 'dev052-qc-user', datetime('now'))
    `).run({ id: `snapshot-${workspaceId}`, requestId, snapshotHash: `hash-${workspaceId}` });
    return requestId;
  }

  function addFixture(id, kind) {
    const lifecycle = kind === "published" ? "published" : kind === "cancelled" ? "cancelled" : "active";
    database.prepare(`
      INSERT INTO numbering_draft_workspaces (
        id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version,
        published_at, published_by, cancelled_at, cancelled_by, cancel_reason, created_at, updated_at
      ) VALUES (
        :id, 'company-jenfu', 'new_bundle', :lifecycle, 'dev052-qc-user', 'dev052-qc-user', 1,
        :publishedAt, :publishedBy, :cancelledAt, :cancelledBy, :cancelReason, datetime('now'), datetime('now')
      )
    `).run({
      id,
      lifecycle,
      publishedAt: kind === "published" ? new Date().toISOString() : null,
      publishedBy: kind === "published" ? "dev052-qc-user" : null,
      cancelledAt: kind === "cancelled" ? new Date().toISOString() : null,
      cancelledBy: kind === "cancelled" ? "dev052-qc-user" : null,
      cancelReason: kind === "cancelled" ? "fixture_cancelled" : null
    });
    database.prepare(`
      INSERT INTO numbering_draft_roots (
        id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
      ) VALUES (:id, 'company-jenfu', :workspaceId, :name, 'manufactured', 'numbering-rule-v3-alpha-root', datetime('now'), datetime('now'))
    `).run({ id: `root-${id}`, workspaceId: id, name: `Root ${id}` });
    database.prepare(`
      INSERT INTO numbering_draft_parts (
        id, company_id, workspace_id, root_draft_id, part_name, item_kind, is_universal, created_at, updated_at
      ) VALUES (:id, 'company-jenfu', :workspaceId, :rootId, :name, 'manufactured', 0, datetime('now'), datetime('now'))
    `).run({ id: `part-${id}`, workspaceId: id, rootId: `root-${id}`, name: `Part ${id}` });
    database.prepare(`
      INSERT INTO numbering_draft_drawings (
        id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description,
        is_primary_manufacturing, created_at, updated_at
      ) VALUES (:id, 'company-jenfu', :workspaceId, :rootId, 'M', 'Manufacturing', 1, datetime('now'), datetime('now'))
    `).run({ id: `drawing-${id}`, workspaceId: id, rootId: `root-${id}` });
    database.prepare(`
      INSERT INTO numbering_draft_relations (
        id, company_id, workspace_id, drawing_draft_id, part_draft_id, link_type, is_primary, created_at, updated_at
      ) VALUES (:id, 'company-jenfu', :workspaceId, :drawingId, :partId, 'primary_manufacturing', 1, datetime('now'), datetime('now'))
    `).run({ id: `relation-${id}`, workspaceId: id, drawingId: `drawing-${id}`, partId: `part-${id}` });

    let approvalRequestId = null;
    if (["pending", "approved", "inconsistent"].includes(kind)) {
      approvalRequestId = addLegacyApproval(id, kind === "approved" ? "approved" : "pending");
    }
    const items = [
      ["root", `root-${id}`, `A-${id}`],
      ["part", `part-${id}`, `A-${id}-P01`],
      ["drawing", `drawing-${id}`, `A-${id}-M01`]
    ];
    for (const [itemType, itemId, code] of items) {
      let state = "active";
      if (kind === "pending") state = "review_locked";
      if (kind === "approved") state = "approved_locked";
      if (kind === "published") state = "promoted";
      if (kind === "cancelled") state = "recycled";
      if (kind === "inconsistent") state = itemType === "root" ? "active" : "review_locked";
      database.prepare(`
        INSERT INTO number_candidate_reservations (
          id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code,
          sequence_scope_key, sequence_no, reservation_state, row_version, approval_request_id,
          promoted_master_type, promoted_master_id, promoted_at,
          recycled_at, recycled_by, recycle_reason, created_by, created_at, updated_at
        ) VALUES (
          :id, 'company-jenfu', :workspaceId, :itemType, :itemId, :code,
          :scope, 1, :state, 1, :approvalRequestId,
          :promotedMasterType, :promotedMasterId, :promotedAt,
          :recycledAt, :recycledBy, :recycleReason, 'dev052-qc-user', datetime('now'), datetime('now')
        )
      `).run({
        id: `reservation-${itemId}`,
        workspaceId: id,
        itemType,
        itemId,
        code,
        scope: `${itemType}:${id}`,
        state,
        approvalRequestId: ["review_locked", "approved_locked"].includes(state) ? approvalRequestId : null,
        promotedMasterType: state === "promoted" ? (itemType === "root" ? "part_root" : itemType === "part" ? "part_number" : "drawing_number") : null,
        promotedMasterId: state === "promoted" ? `formal-${itemId}` : null,
        promotedAt: state === "promoted" ? new Date().toISOString() : null,
        recycledAt: state === "recycled" ? new Date().toISOString() : null,
        recycledBy: state === "recycled" ? "dev052-qc-user" : null,
        recycleReason: state === "recycled" ? "fixture_cancelled" : null
      });
      const draftTable = itemType === "root" ? "numbering_draft_roots" : itemType === "part" ? "numbering_draft_parts" : "numbering_draft_drawings";
      database.prepare(`UPDATE ${draftTable} SET candidate_reservation_id = :reservationId WHERE id = :itemId`).run({
        reservationId: `reservation-${itemId}`,
        itemId
      });
    }
  }

  addFixture("f2-active", "active");
  addFixture("f3-pending", "pending");
  addFixture("f4-approved", "approved");
  addFixture("f5-published", "published");
  addFixture("f6-cancelled", "cancelled");
  addFixture("f7-inconsistent", "inconsistent");

  const protectedTables = [
    "numbering_draft_workspaces",
    "number_candidate_reservations",
    "approval_platform_requests",
    "approval_platform_targets",
    "approval_platform_impact_snapshots",
    "part_roots",
    "part_numbers",
    "drawing_numbers",
    "numbering_candidate_revision_drafts",
    "numbering_candidate_revision_files",
    "drawing_revision_package_review_approvals",
    "audit_logs",
    "platform_command_receipts",
    "platform_outbox_events",
    "numbering_sequences"
  ];
  const before = Object.fromEntries(protectedTables.map((table) => [table, tableHash(database, table)]));
  const totalChangesBefore = Number(database.prepare("SELECT total_changes() AS count").get().count);

  const client = createAsyncDatabaseClient({ kind: "sqlite", database });
  const repository = new AsyncNumberStateFlowRepository(client);
  const firstList = await repository.listWorkspaces({ companyId: "company-jenfu", limit: 50 });
  const secondList = await repository.listWorkspaces({ companyId: "company-jenfu", limit: 50 });
  const expectedStages = {
    "f2-active": "drawing_preparation",
    "f3-pending": "in_review",
    "f4-approved": "drawing_addendum_required",
    "f5-published": "official_controlled",
    "f6-cancelled": "history_only",
    "f7-inconsistent": "recovery_required"
  };
  for (const workspaceId of Object.keys(expectedStages)) {
    await repository.getWorkspace(workspaceId, "company-jenfu");
    await repository.getWorkspace(workspaceId, "company-jenfu");
  }
  const actualStages = Object.fromEntries(
    firstList.filter((workspace) => workspace.id in expectedStages).map((workspace) => [workspace.id, workspace.lifecycleV2?.stage ?? null])
  );
  record(
    "DEV052-DP-001 F2-F7 compatibility projection is deterministic",
    Object.entries(expectedStages).every(([workspaceId, stage]) => actualStages[workspaceId] === stage) &&
      JSON.stringify(firstList.map((workspace) => workspace.lifecycleV2)) === JSON.stringify(secondList.map((workspace) => workspace.lifecycleV2)),
    JSON.stringify(actualStages)
  );

  const expectedUserStages = {
    "f2-active": "drawing_preparation",
    "f3-pending": "drawing_preparation",
    "f4-approved": "drawing_preparation",
    "f5-published": "official_controlled",
    "f6-cancelled": "history_only",
    "f7-inconsistent": "drawing_preparation"
  };
  const actualUserStages = Object.fromEntries(
    firstList
      .filter((workspace) => workspace.id in expectedUserStages && workspace.lifecycleV2)
      .map((workspace) => [workspace.id, projectNumberLifecycleUserView(workspace.lifecycleV2).stage])
  );
  record(
    "DEV052-DP-006 pre-formal legacy reservations share one user-visible first-revision preparation station",
    Object.entries(expectedUserStages).every(([workspaceId, stage]) => actualUserStages[workspaceId] === stage) &&
      actualStages["f3-pending"] === "in_review" &&
      actualStages["f4-approved"] === "drawing_addendum_required" &&
      actualStages["f7-inconsistent"] === "recovery_required",
    JSON.stringify({ internalStages: actualStages, userStages: actualUserStages })
  );

  const sourceReservations = database.prepare(`
    SELECT id, workspace_id AS workspaceId, draft_item_type AS itemType,
           draft_item_id AS itemId, candidate_code AS candidateCode,
           reservation_state AS state, row_version AS rowVersion
    FROM number_candidate_reservations
    WHERE company_id = 'company-jenfu'
    ORDER BY id
  `).all();
  const projectedReservations = firstList
    .flatMap((workspace) => workspace.reservations.map((reservation) => ({
      id: reservation.id,
      workspaceId: workspace.id,
      itemType: reservation.itemType,
      itemId: reservation.itemId,
      candidateCode: reservation.candidateCode,
      state: reservation.state,
      rowVersion: reservation.rowVersion
    })))
    .sort((left, right) => left.id.localeCompare(right.id));
  const projectedIds = projectedReservations.map((reservation) => reservation.id);
  const sourceIds = sourceReservations.map((reservation) => reservation.id);
  const duplicateMappings = projectedIds.length - new Set(projectedIds).size;
  const unmapped = sourceIds.filter((id) => !projectedIds.includes(id));
  const unexpected = projectedIds.filter((id) => !sourceIds.includes(id));
  const sourceById = new Map(sourceReservations.map((reservation) => [reservation.id, reservation]));
  const changed = projectedReservations.filter((reservation) => {
    const source = sourceById.get(reservation.id);
    return !source || JSON.stringify(canonical(source)) !== JSON.stringify(canonical(reservation));
  });
  const bucketCounts = firstList.reduce((counts, workspace) => {
    const bucket = workspace.lifecycleV2?.stage ?? "unmapped";
    counts[bucket] = (counts[bucket] ?? 0) + workspace.reservations.length;
    return counts;
  }, {});
  record(
    "DEV052-DP-005 every legacy reservation maps exactly once without renumbering",
    sourceReservations.length === projectedReservations.length &&
      duplicateMappings === 0 &&
      unmapped.length === 0 &&
      unexpected.length === 0 &&
      changed.length === 0 &&
      Object.values(bucketCounts).reduce((sum, count) => sum + count, 0) === sourceReservations.length,
    JSON.stringify({
      sourceCount: sourceReservations.length,
      mappedCount: projectedReservations.length,
      duplicateMappings,
      unmapped,
      unexpected,
      changed: changed.map((reservation) => reservation.id),
      bucketCounts
    })
  );

  const schema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
  database.exec(schema);
  await repository.listWorkspaces({ companyId: "company-jenfu", limit: 50 });
  const after = Object.fromEntries(protectedTables.map((table) => [table, tableHash(database, table)]));
  const totalChangesAfter = Number(database.prepare("SELECT total_changes() AS count").get().count);
  record(
    "DEV052-DP-002 list detail refresh and bootstrap are zero-write",
    JSON.stringify(before) === JSON.stringify(after) && totalChangesBefore === totalChangesAfter,
    JSON.stringify({ totalChangesBefore, totalChangesAfter, hashesMatch: JSON.stringify(before) === JSON.stringify(after) })
  );
  record(
    "DEV052-DP-003 read path creates no candidate audit receipt outbox or sequence facts",
    [
      "numbering_candidate_revision_drafts",
      "numbering_candidate_revision_files",
      "drawing_revision_package_review_approvals",
      "platform_command_receipts",
      "platform_outbox_events",
      "numbering_sequences"
    ].every((table) => Number(database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count) === 0),
    "explicit candidate write has not occurred"
  );

  process.env.PDM_NUMBER_LIFECYCLE_V2 = "false";
  database.exec(`
    DROP TABLE drawing_revision_package_review_approvals;
    DROP TABLE numbering_candidate_revision_files;
    DROP TABLE numbering_candidate_revision_drafts;
  `);
  const flagOffWorkspace = await repository.getWorkspace("f2-active", "company-jenfu");
  record(
    "DEV052-DP-004 flag-off runtime does not query additive tables",
    flagOffWorkspace.lifecycleV2 === null && flagOffWorkspace.candidateRevisions.length === 0,
    JSON.stringify({ lifecycleV2: flagOffWorkspace.lifecycleV2, candidates: flagOffWorkspace.candidateRevisions.length })
  );
} catch (error) {
  record("DEV052-DP-fixture", false, error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
} finally {
  try {
    database?.close();
  } catch {}
  const resolvedFixture = path.resolve(fixtureRoot);
  const resolvedTmp = path.resolve(root, ".tmp");
  if (resolvedFixture.startsWith(`${resolvedTmp}${path.sep}`)) {
    fs.rmSync(resolvedFixture, { recursive: true, force: true });
  }
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
