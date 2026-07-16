import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = path.join(root, ".tmp", `qc-number-state-runtime-${crypto.randomUUID()}`);
const results = [];

function record(id, passed, detail) {
  results.push({ id, passed: Boolean(passed), detail });
}

function count(db, table, where = "1 = 1") {
  return Number(db.prepare(`SELECT count(*) AS count FROM ${table} WHERE ${where}`).get().count);
}

process.env.PDM_DATA_DIR = fixtureRoot;
process.env.PDM_REPOSITORY_DIR = path.join(fixtureRoot, "repository");
process.env.PDM_DB_PROVIDER = "sqlite";

let db;
try {
  const [{ getDb }, platform, numberStateFlow] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/platform-command"),
    import("@/lib/number-state-flow")
  ]);
  db = getDb();
  db.prepare(`
    INSERT INTO users (
      id, display_name, email, password_hash, role, company_id, account_status,
      system_role_enabled, created_at, updated_at
    ) VALUES (
      'dev048-qc-user', 'DEV-048 QC', 'dev048-qc@example.invalid', NULL, 'Engineer',
      'company-jenfu', 'active', 1, datetime('now'), datetime('now')
    )
  `).run();
  db.prepare(`
    INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
    VALUES ('dev048-qc-user', 'company-jenfu', 1, datetime('now'))
  `).run();

  const actor = platform.createPlatformActorContext({
    pdmUserId: "dev048-qc-user",
    organizationId: "company-jenfu",
    roles: ["Engineer", "rd"],
    scopes: [
      "numbering.workspace.create",
      "numbering.workspace.update",
      "numbering.workspace.cancel",
      "numbering.candidate.acquire"
    ],
    requestId: "dev048-runtime-qc"
  });
  const body = {
    draftMode: "new_bundle",
    root: { coreName: "DEV048 Runtime Root", itemKind: "manufactured" },
    parts: [{ clientKey: "part-1", partName: "Runtime Part", itemKind: "manufactured" }],
    drawings: [{ clientKey: "drawing-1", purposeCode: "M", purposeDescription: "Runtime manufacturing drawing", isPrimaryManufacturing: true }],
    relations: [{ drawingClientKey: "drawing-1", partClientKey: "part-1", linkType: "primary_manufacturing", isPrimary: true }]
  };

  const createMetadata = { actor, idempotencyKey: "dev048:create:1" };
  const created = await numberStateFlow.createNumberingDraftWorkspace({ metadata: createMetadata, body });
  const createReplay = await numberStateFlow.createNumberingDraftWorkspace({ metadata: createMetadata, body });
  record(
    "NSF-RT-001 create is idempotent and remains unnumbered",
    created.workspace.id === createReplay.workspace.id &&
      !created.idempotentReplay && createReplay.idempotentReplay &&
      created.workspace.projection.numberQualification === "unnumbered" &&
      created.workspace.reservations.length === 0,
    JSON.stringify({ workspaceId: created.workspace.id, replay: createReplay.idempotentReplay })
  );

  const acquireMetadata = { actor, idempotencyKey: "dev048:acquire:1" };
  const acquired = await numberStateFlow.acquireNumberingDraftCandidates({
    metadata: acquireMetadata,
    workspaceId: created.workspace.id,
    expectedRowVersion: 1
  });
  const acquireReplay = await numberStateFlow.acquireNumberingDraftCandidates({
    metadata: acquireMetadata,
    workspaceId: created.workspace.id,
    expectedRowVersion: 1
  });
  const acquiredCodes = acquired.workspace.reservations.map((reservation) => reservation.candidateCode);
  record(
    "NSF-RT-002 acquire is atomic root-first and idempotent",
    acquired.workspace.rowVersion === 2 &&
      acquireReplay.idempotentReplay &&
      acquiredCodes.join(",") === "A0001,A0001-P01,A0001-M01" &&
      count(db, "part_roots") === 0 && count(db, "part_numbers") === 0 && count(db, "drawing_numbers") === 0,
    JSON.stringify({ acquiredCodes, replay: acquireReplay.idempotentReplay })
  );

  const cancelMetadata = { actor, idempotencyKey: "dev048:cancel:1" };
  const cancelled = await numberStateFlow.cancelNumberingDraftWorkspace({
    metadata: cancelMetadata,
    workspaceId: created.workspace.id,
    expectedRowVersion: 2,
    reason: "runtime_qc_cancel"
  });
  const cancelReplay = await numberStateFlow.cancelNumberingDraftWorkspace({
    metadata: cancelMetadata,
    workspaceId: created.workspace.id,
    expectedRowVersion: 2,
    reason: "runtime_qc_cancel"
  });
  record(
    "NSF-RT-003 cancel recycles candidates in the command transaction",
    cancelled.workspace.lifecycleStatus === "cancelled" &&
      cancelled.workspace.reservations.every((reservation) => reservation.state === "recycled") &&
      cancelReplay.idempotentReplay,
    JSON.stringify({ lifecycle: cancelled.workspace.lifecycleStatus, states: cancelled.workspace.reservations.map((item) => item.state) })
  );

  const second = await numberStateFlow.createNumberingDraftWorkspace({
    metadata: { actor, idempotencyKey: "dev048:create:2" },
    body
  });
  const secondAcquired = await numberStateFlow.acquireNumberingDraftCandidates({
    metadata: { actor, idempotencyKey: "dev048:acquire:2" },
    workspaceId: second.workspace.id,
    expectedRowVersion: 1
  });
  const secondCodes = secondAcquired.workspace.reservations.map((reservation) => reservation.candidateCode);
  record(
    "NSF-RT-004 recycled gaps are reusable with new reservation IDs",
    secondCodes.join(",") === acquiredCodes.join(",") &&
      secondAcquired.workspace.reservations.every((reservation, index) => reservation.id !== acquired.workspace.reservations[index].id),
    JSON.stringify({ first: acquiredCodes, second: secondCodes })
  );

  const beforeRollback = {
    workspaces: count(db, "numbering_draft_workspaces"),
    events: count(db, "number_candidate_events"),
    audits: count(db, "audit_logs", "action = 'pdm.numbering.create_draft_workspace'"),
    receipts: count(db, "platform_command_receipts")
  };
  let rollbackError = "";
  try {
    await numberStateFlow.createNumberingDraftWorkspace({
      metadata: { actor, idempotencyKey: "dev048:create:rollback" },
      body: { ...body, relations: [...body.relations, ...body.relations] }
    });
  } catch (error) {
    rollbackError = error instanceof Error ? error.message : String(error);
  }
  const afterRollback = {
    workspaces: count(db, "numbering_draft_workspaces"),
    events: count(db, "number_candidate_events"),
    audits: count(db, "audit_logs", "action = 'pdm.numbering.create_draft_workspace'"),
    receipts: count(db, "platform_command_receipts")
  };
  record(
    "NSF-RT-005 domain failure rolls back workspace audit receipt and events",
    Boolean(rollbackError) && JSON.stringify(beforeRollback) === JSON.stringify(afterRollback),
    JSON.stringify({ rollbackError, beforeRollback, afterRollback })
  );

  db.prepare(`
    INSERT INTO part_number_drafts (
      id, company_id, reserved_part_number, draft_type, item_type, status, created_by, created_at, updated_at
    ) VALUES (
      'legacy-dev048-qc', 'company-jenfu', 'LEGACY-QC-001', 'new_part', 'self_made', 'draft',
      'dev048-qc-user', datetime('now'), datetime('now')
    )
  `).run();
  const legacyBefore = count(db, "part_number_drafts");
  const classifier = await numberStateFlow.classifyLegacyNumberingDryRun("company-jenfu");
  record(
    "NSF-RT-006 legacy classifier is deterministic and non-destructive",
    classifier.mode === "dry_run" && classifier.mutationCount === 0 &&
      classifier.classifications.some((item) => item.sourceId === "legacy-dev048-qc" && item.classification === "candidate_draft") &&
      count(db, "part_number_drafts") === legacyBefore,
    JSON.stringify({ mutationCount: classifier.mutationCount, classifications: classifier.classifications.length })
  );

  const commandEvidence = {
    audits: count(db, "audit_logs", "action LIKE 'pdm.numbering.%'"),
    receipts: count(db, "platform_command_receipts", "command_status = 'completed'"),
    outbox: count(db, "platform_outbox_events")
  };
  record(
    "NSF-RT-007 successful commands persist audit receipt and outbox once",
    commandEvidence.audits === 5 && commandEvidence.receipts === 5 && commandEvidence.outbox === 5,
    JSON.stringify(commandEvidence)
  );
} catch (error) {
  record("NSF-RT-fixture", false, error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
} finally {
  try {
    db?.close();
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
