import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const root = process.cwd();
const fixtureRoot = path.join(root, ".tmp", `qc-number-state-transfer-${crypto.randomUUID()}`);
const results = [];

function record(id, passed, detail = {}) {
  results.push({ id, passed: Boolean(passed), detail });
}

function code(error) {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : error instanceof Error ? error.message : String(error);
}

async function expectError(run) {
  try {
    await run();
    return "";
  } catch (error) {
    return code(error);
  }
}

function verifyUpgradeFixture() {
  const upgradeRoot = path.join(root, ".tmp", `qc-number-state-transfer-upgrade-${crypto.randomUUID()}`);
  fs.mkdirSync(upgradeRoot, { recursive: true });
  const databasePath = path.join(upgradeRoot, "ai-pdm.sqlite");
  const currentSchema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
  const legacySchema = currentSchema
    .replace(
      "CHECK (package_status IN ('Draft', 'InReview', 'NeedsInfo', 'ApprovedPendingPublish', 'Publishing', 'Published', 'ReleaseFailed', 'Cancelled'))",
      "CHECK (package_status IN ('Draft', 'Cancelled'))"
    )
    .replace(
      /event_type TEXT NOT NULL CHECK \(event_type IN \(\s*'DraftCreated', 'HeaderUpdated', 'ScopeItemAdded', 'ScopeItemRemoved',\s*'DraftWorkspaceAdded', 'DraftWorkspaceRemoved', 'ReviewSubmitted', 'ReviewWithdrawn',\s*'ReviewDecided', 'SnapshotInvalidated', 'PackagePublished', 'ReleaseFailed', 'PackageCancelled'\s*\)\)/u,
      "event_type TEXT NOT NULL CHECK (event_type IN ('DraftCreated', 'HeaderUpdated', 'ScopeItemAdded', 'ScopeItemRemoved', 'PackageCancelled'))"
    );
  const legacy = new Database(databasePath);
  legacy.exec(legacySchema);
  const now = new Date().toISOString();
  legacy.pragma("foreign_keys = OFF");
  legacy.prepare(`INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
    VALUES ('phase1d-existing-unrelated-fk', 'missing-submission', NULL, 'LegacyFixture', '{}', ?)`)
    .run(now);
  legacy.prepare(`INSERT INTO users (
    id, display_name, email, role, company_id, account_status, system_role_enabled, created_at, updated_at
  ) VALUES (?, ?, ?, 'Engineer', 'company-jenfu', 'active', 1, ?, ?)`)
    .run("phase1d-upgrade-user", "Upgrade User", "phase1d-upgrade@example.invalid", now, now);
  const insert = legacy.prepare(`INSERT INTO transfer_packages (
    id, company_id, package_code, title, case_type, case_reason,
    source_reference_status, source_reference_reason, package_status,
    owner_id, created_by, create_idempotency_key, row_version,
    cancel_reason, cancelled_by, cancelled_at, created_at, updated_at
  ) VALUES (?, 'company-jenfu', ?, ?, 'design_change_case', 'upgrade fixture',
    'not_available', 'upgrade fixture', ?, 'phase1d-upgrade-user', 'phase1d-upgrade-user', ?, 1,
    ?, ?, ?, ?, ?)`);
  insert.run("upgrade-draft", "TP-2026-9101", "Upgrade Draft", "Draft", "upgrade-key-draft", null, null, null, now, now);
  insert.run("upgrade-cancelled", "TP-2026-9102", "Upgrade Cancelled", "Cancelled", "upgrade-key-cancelled", "cancelled fixture", "phase1d-upgrade-user", now, now, now);
  legacy.prepare(`INSERT INTO transfer_package_events
    (id, company_id, package_id, event_type, actor_id, detail_json, created_at)
    VALUES ('upgrade-event', 'company-jenfu', 'upgrade-draft', 'DraftCreated', 'phase1d-upgrade-user', '{}', ?)`)
    .run(now);
  legacy.close();
  const child = spawnSync(process.execPath, [
    "--experimental-transform-types",
    "--experimental-loader", "./scripts/qc-ts-path-loader.mjs",
    "--input-type=module",
    "--eval",
    `const { getDb } = await import('@/lib/db'); const db = getDb(); const rows = db.prepare("SELECT package_status, count(*) count FROM transfer_packages WHERE id LIKE 'upgrade-%' GROUP BY package_status ORDER BY package_status").all(); const fk = db.prepare('PRAGMA foreign_key_check').all(); const transferFk = fk.filter((item) => item.table === 'transfer_packages' || item.table === 'transfer_package_events'); const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='transfer_packages'").get().sql; const events = db.prepare("SELECT count(*) count FROM transfer_package_events WHERE id='upgrade-event'").get().count; console.log(JSON.stringify({ rows, fk, transferFk, sql, events })); db.close();`
  ], {
    cwd: root,
    env: { ...process.env, PDM_DATA_DIR: upgradeRoot, PDM_REPOSITORY_DIR: path.join(upgradeRoot, "repository"), PDM_DB_PROVIDER: "sqlite" },
    encoding: "utf8",
    windowsHide: true
  });
  const line = child.stdout.trim().split(/\r?\n/u).at(-1) ?? "{}";
  let result = {};
  try { result = JSON.parse(line); } catch {}
  fs.rmSync(upgradeRoot, { recursive: true, force: true });
  return {
    passed: child.status === 0 && result.rows?.length === 2 && result.rows.every((row) => row.count === 1) && result.fk?.length === 1 && result.fk[0]?.table === "audit_logs" && result.transferFk?.length === 0 && result.sql?.includes("ApprovedPendingPublish") && result.events === 1,
    detail: { status: child.status, result, stderr: child.stderr.slice(-1000) }
  };
}

process.env.PDM_DATA_DIR = fixtureRoot;
process.env.PDM_REPOSITORY_DIR = path.join(fixtureRoot, "repository");
process.env.PDM_DB_PROVIDER = "sqlite";
process.env.PDM_PUBLICATION_EVIDENCE_MODE = "local_fake";

let db;
try {
  const upgrade = verifyUpgradeFixture();
  record("MIG-011 upgrade preserves Draft/Cancelled rows and rejects only newly introduced FK failures", upgrade.passed, upgrade.detail);
  const [{ getDb }, platform, flow, databaseProvider, transferModule, transferRepositoryModule] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/platform-command"),
    import("@/lib/number-state-flow"),
    import("@/lib/db-async-provider"),
    import("@/lib/transfer-package-phase1d"),
    import("@/lib/repositories/transfer-package-async-repository")
  ]);
  db = getDb();
  const client = databaseProvider.getAsyncDatabaseClient();
  const companyId = "company-jenfu";
  const companyB = "company-phase1d-b";
  db.prepare("INSERT INTO companies (id, company_code, display_name) VALUES (?, ?, ?)")
    .run(companyB, "PH1DB", "Phase1D Company B");

  const users = [
    ["phase1d-owner", "Phase1D Owner", "phase1d-owner@example.invalid", "Engineer", companyId],
    ["phase1d-reviewer", "Phase1D Reviewer", "phase1d-reviewer@example.invalid", "R&D Manager", companyId],
    ["phase1d-publisher", "Phase1D Publisher", "phase1d-publisher@example.invalid", "Admin", companyId],
    ["phase1d-company-b", "Phase1D Company B", "phase1d-b@example.invalid", "Admin", companyB]
  ];
  for (const [id, displayName, email, role, userCompanyId] of users) {
    db.prepare(`INSERT INTO users (
      id, display_name, email, password_hash, role, company_id, account_status,
      system_role_enabled, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?, 'active', 1, datetime('now'), datetime('now'))`)
      .run(id, displayName, email, role, userCompanyId);
    db.prepare("INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at) VALUES (?, ?, 1, datetime('now'))")
      .run(id, userCompanyId);
  }

  function actor(userId, roles, organizationId = companyId) {
    return platform.createPlatformActorContext({
      pdmUserId: userId,
      organizationId,
      roles,
      scopes: [
        "numbering.workspace.create", "numbering.candidate.acquire",
        "numbering.candidate.review.submit", "numbering.candidate.review.decide", "numbering.publish",
        "transfer.package.update", "transfer.package.review.submit",
        "transfer.package.review.decide", "transfer.package.publish", "handoff.published.view"
      ],
      requestId: `phase1d-${crypto.randomUUID()}`
    });
  }

  const owner = actor("phase1d-owner", ["Engineer", "rd"]);
  const reviewer = actor("phase1d-reviewer", ["R&D Manager", "rd_manager"]);
  const publisher = actor("phase1d-publisher", ["Admin", "system_admin"]);
  let sequence = 0;
  function metadata(context, action) {
    sequence += 1;
    return { actor: context, idempotencyKey: `phase1d:${String(action).replace(/[^A-Za-z0-9._:/-]+/gu, "-")}:${sequence}` };
  }

  function workspaceBody(label) {
    return {
      draftMode: "new_bundle",
      root: { coreName: `${label} Root`, itemKind: "manufactured" },
      parts: [{ clientKey: "part-1", partName: `${label} Part`, itemKind: "manufactured" }],
      drawings: [],
      relations: []
    };
  }

  async function createWorkspace(label, acquire = true) {
    const created = await flow.createNumberingDraftWorkspace({ metadata: metadata(owner, `create-${label}`), body: workspaceBody(label) });
    if (!acquire) return created.workspace;
    const acquired = await flow.acquireNumberingDraftCandidates({
      metadata: metadata(owner, `acquire-${label}`),
      workspaceId: created.workspace.id,
      expectedRowVersion: created.workspace.rowVersion
    });
    return acquired.workspace;
  }

  async function createOfficialWorkspace(label) {
    const workspace = await createWorkspace(label);
    const submitted = await flow.submitNumberingCandidateReview({
      metadata: metadata(owner, `number-submit-${label}`),
      workspaceId: workspace.id,
      expectedRowVersion: workspace.rowVersion,
      reason: "Phase1D existing official fixture"
    });
    await flow.decideNumberingCandidateReview({
      metadata: metadata(reviewer, `number-approve-${label}`),
      requestId: submitted.requestId,
      decision: "approved",
      comment: "approved"
    });
    return flow.publishNumberingDraftWorkspace({
      metadata: metadata(publisher, `number-publish-${label}`),
      workspaceId: workspace.id
    });
  }

  const transferActor = { userId: "phase1d-owner", companyId, role: "Engineer" };
  const repository = new transferRepositoryModule.AsyncTransferPackageRepository(client);

  const scopeReplayWorkspace = await createWorkspace("Scope Replay");
  let scopeReplayPackage = await repository.createDraft({
    actor: transferActor, idempotencyKey: "phase1d-scope-replay-package", title: "Scope replay package",
    caseType: "development_case", caseReason: "Verify scope command replay",
    sourceReferenceStatus: "not_available", sourceReference: null, sourceReferenceReason: "QC fixture"
  });
  const scopeAddMetadata = metadata(owner, "transfer-scope-add-replay");
  const scopeAddInput = {
    metadata: scopeAddMetadata, actor: transferActor, packageId: scopeReplayPackage.id,
    expectedRowVersion: scopeReplayPackage.rowVersion, workspaceId: scopeReplayWorkspace.id,
    requiredness: "required", inclusionReason: "scope replay"
  };
  const scopeAdded = await transferModule.addTransferDraftWorkspace(scopeAddInput);
  const scopeAddReplay = await transferModule.addTransferDraftWorkspace(scopeAddInput);
  scopeReplayPackage = scopeAdded.workbench;
  record("TRF-003A draft scope add replays one command receipt", !scopeAdded.idempotentReplay && scopeAddReplay.idempotentReplay && scopeReplayPackage.draftItems.length === 1 && scopeAddReplay.workbench.rowVersion === scopeReplayPackage.rowVersion, { rowVersion: scopeReplayPackage.rowVersion });

  const scopeRemoveMetadata = metadata(owner, "transfer-scope-remove-replay");
  const scopeRemoveInput = {
    metadata: scopeRemoveMetadata, actor: transferActor, packageId: scopeReplayPackage.id,
    itemId: scopeReplayPackage.draftItems[0].id, expectedRowVersion: scopeReplayPackage.rowVersion,
    reason: "scope replay removal"
  };
  const scopeRemoved = await transferModule.removeTransferDraftWorkspace(scopeRemoveInput);
  const scopeRemoveReplay = await transferModule.removeTransferDraftWorkspace(scopeRemoveInput);
  record("TRF-003B draft scope remove replays one command receipt", !scopeRemoved.idempotentReplay && scopeRemoveReplay.idempotentReplay && scopeRemoved.workbench.draftItems.length === 0 && scopeRemoveReplay.workbench.rowVersion === scopeRemoved.workbench.rowVersion, { rowVersion: scopeRemoved.workbench.rowVersion });

  const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transfer_packages'").get().sql;
  const eventSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transfer_package_events'").get().sql;
  record("MIG-011 fresh transfer lifecycle and typed draft scope schema", tableSql.includes("ApprovedPendingPublish") && eventSql.includes("PackagePublished") && Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transfer_package_draft_items'").get()));

  const officialPublication = await createOfficialWorkspace("Existing Official");
  const officialPartId = officialPublication.masters.partIds[0];
  const officialEntity = await repository.resolveScopeEntity(companyId, "part_number", officialPartId);
  record("TRF-011 existing released item fixture has stable official identity", Boolean(officialEntity?.entityId === officialPartId), { officialPartId });

  const workspaceA = await createWorkspace("Transfer A");
  const workspaceB = await createWorkspace("Transfer B");
  let pkg = await repository.createDraft({
    actor: transferActor,
    idempotencyKey: "phase1d-main-package",
    title: "Phase1D aggregate transfer",
    caseType: "design_change_case",
    caseReason: "Verify aggregate review and atomic publication",
    sourceReferenceStatus: "not_available",
    sourceReference: null,
    sourceReferenceReason: "QC fixture",
    sourceItem: officialEntity
  });
  pkg = await repository.addDraftWorkspace({
    packageId: pkg.id, actor: transferActor, expectedRowVersion: pkg.rowVersion,
    workspaceId: workspaceA.id, requiredness: "required", inclusionReason: "required A"
  });
  pkg = await repository.addDraftWorkspace({
    packageId: pkg.id, actor: transferActor, expectedRowVersion: pkg.rowVersion,
    workspaceId: workspaceB.id, requiredness: "required", inclusionReason: "required B"
  });
  record("TRF-002/003 package retains official and stable-ID draft scopes", pkg.status === "Draft" && pkg.items.length === 1 && pkg.draftItems.length === 2, { packageId: pkg.id, rowVersion: pkg.rowVersion });

  const candidateText = workspaceA.reservations[0].candidateCode;
  const candidateLookupError = await expectError(() => repository.addDraftWorkspace({
    packageId: pkg.id, actor: transferActor, expectedRowVersion: pkg.rowVersion,
    workspaceId: candidateText, requiredness: "required", inclusionReason: "must reject candidate text"
  }));
  record("TRF-003 candidate text is never workspace lookup authority", candidateLookupError === "TRANSFER_WORKSPACE_NOT_FOUND", { candidateLookupError });

  const readiness = await transferModule.buildTransferPackageReadiness(pkg.id, companyId);
  record("TRF-005 readiness aggregates owner/rule/BOM/file facts with snapshot hash", readiness.ready && readiness.blockers.length === 0 && readiness.snapshot.workspaceSnapshots.length === 2 && readiness.snapshotHash.length === 64, { snapshotHash: readiness.snapshotHash });

  const unnumbered = await createWorkspace("Unnumbered", false);
  let blockedPackage = await repository.createDraft({
    actor: transferActor, idempotencyKey: "phase1d-blocked-package", title: "Blocked package",
    caseType: "development_case", caseReason: "Verify candidate blocker",
    sourceReferenceStatus: "not_available", sourceReference: null, sourceReferenceReason: "QC fixture"
  });
  blockedPackage = await repository.addDraftWorkspace({
    packageId: blockedPackage.id, actor: transferActor, expectedRowVersion: blockedPackage.rowVersion,
    workspaceId: unnumbered.id, requiredness: "required", inclusionReason: "required unnumbered"
  });
  const blockedReadiness = await transferModule.buildTransferPackageReadiness(blockedPackage.id, companyId);
  record("TRF-004 required unnumbered draft fails closed with owner action", !blockedReadiness.ready && blockedReadiness.firstBlocker?.code === "candidate_required_before_review" && Boolean(blockedReadiness.firstBlocker?.actionHref), blockedReadiness.firstBlocker ?? {});

  const masterCountsBeforeReview = {
    roots: db.prepare("SELECT count(*) count FROM part_roots").get().count,
    parts: db.prepare("SELECT count(*) count FROM part_numbers").get().count,
    drawings: db.prepare("SELECT count(*) count FROM drawing_numbers").get().count
  };
  const submitted = await transferModule.submitTransferPackageReview({
    metadata: metadata(owner, "transfer-submit"), packageId: pkg.id,
    expectedRowVersion: pkg.rowVersion, reason: "Aggregate transfer QC"
  });
  pkg = await repository.getById(pkg.id, companyId);
  const frozenSnapshot = db.prepare("SELECT * FROM approval_platform_impact_snapshots WHERE request_id = ?").get(submitted.requestId);
  record("TRF-006 valid submit freezes aggregate snapshot and review locks candidates", pkg.status === "InReview" && pkg.reviewSnapshotHash === submitted.snapshotHash && frozenSnapshot?.snapshot_hash === submitted.snapshotHash && db.prepare("SELECT count(*) count FROM number_candidate_reservations WHERE approval_request_id = ? AND reservation_state = 'review_locked'").get(submitted.requestId).count === 4, { requestId: submitted.requestId });

  await transferModule.decideTransferPackageReview({
    metadata: metadata(reviewer, "transfer-approve"), requestId: submitted.requestId,
    decision: "approved", comment: "Aggregate approved"
  });
  pkg = await repository.getById(pkg.id, companyId);
  const mastersAfterApproval = {
    roots: db.prepare("SELECT count(*) count FROM part_roots").get().count,
    parts: db.prepare("SELECT count(*) count FROM part_numbers").get().count,
    drawings: db.prepare("SELECT count(*) count FROM drawing_numbers").get().count
  };
  const prePublishHandoff = await transferModule.listPublishedTransferHandoffs(companyId);
  record("TRF-008 approval reaches ApprovedPendingPublish with zero master or handoff writes", pkg.status === "ApprovedPendingPublish" && JSON.stringify(mastersAfterApproval) === JSON.stringify(masterCountsBeforeReview) && prePublishHandoff.every((item) => item.id !== pkg.id), { status: pkg.status, mastersAfterApproval });

  let rootInsertCount = 0;
  const faultError = await expectError(() => transferModule.publishTransferPackage({
    metadata: metadata(publisher, "transfer-publish-fault"), packageId: pkg.id,
    expectedRowVersion: pkg.rowVersion,
    faultInjector: (point) => {
      if (point.endsWith(":before_root_insert")) {
        rootInsertCount += 1;
        if (rootInsertCount === 2) throw new Error("PHASE1D_SECOND_WORKSPACE_FAULT");
      }
    }
  }));
  pkg = await repository.getById(pkg.id, companyId);
  const mastersAfterFault = {
    roots: db.prepare("SELECT count(*) count FROM part_roots").get().count,
    parts: db.prepare("SELECT count(*) count FROM part_numbers").get().count,
    drawings: db.prepare("SELECT count(*) count FROM drawing_numbers").get().count
  };
  const publicationOutboxAfterFault = db.prepare("SELECT count(*) count FROM platform_outbox_events WHERE event_type IN ('pdm.transfer.package_published.v1', 'pdm.numbering.official_number_published.v1') AND payload_json LIKE ?").get(`%${pkg.id}%`).count;
  record("TRF-010/014 mid-batch fault rolls every promotion back before separate failure marker", faultError === "TRANSFER_BATCH_PUBLICATION_FAILED" && pkg.status === "ReleaseFailed" && JSON.stringify(mastersAfterFault) === JSON.stringify(masterCountsBeforeReview) && publicationOutboxAfterFault === 0, { faultError, status: pkg.status, mastersAfterFault });

  const published = await transferModule.publishTransferPackage({
    metadata: metadata(publisher, "transfer-publish-retry"), packageId: pkg.id,
    expectedRowVersion: pkg.rowVersion
  });
  pkg = await repository.getById(pkg.id, companyId);
  const packageOutbox = db.prepare("SELECT count(*) count FROM platform_outbox_events WHERE event_type = 'pdm.transfer.package_published.v1' AND aggregate_id = ?").get(pkg.id).count;
  const workspaceOutbox = db.prepare("SELECT count(*) count FROM platform_outbox_events WHERE event_type = 'pdm.numbering.official_number_published.v1' AND payload_json LIKE ?").get(`%\"transferPackageId\":\"${pkg.id}\"%`).count;
  record("TRF-009/013 explicit retry publishes all workspaces with 1+N deterministic events", pkg.status === "Published" && published.publications.filter((item) => item.newlyPublished).length === 2 && packageOutbox === 1 && workspaceOutbox === 2, { packageOutbox, workspaceOutbox, publications: published.publications.length });

  const recoveryWorkspace = await createWorkspace("Failure Recovery");
  let recoveryPackage = await repository.createDraft({
    actor: transferActor, idempotencyKey: "phase1d-recovery-package", title: "Failure recovery package",
    caseType: "design_change_case", caseReason: "Verify failed review recovery",
    sourceReferenceStatus: "not_available", sourceReference: null, sourceReferenceReason: "QC fixture"
  });
  recoveryPackage = await repository.addDraftWorkspace({
    packageId: recoveryPackage.id, actor: transferActor, expectedRowVersion: recoveryPackage.rowVersion,
    workspaceId: recoveryWorkspace.id, requiredness: "required", inclusionReason: "recovery scope"
  });
  const recoverySubmit = await transferModule.submitTransferPackageReview({
    metadata: metadata(owner, "recovery-submit-initial"), packageId: recoveryPackage.id,
    expectedRowVersion: recoveryPackage.rowVersion, reason: "initial recovery review"
  });
  await transferModule.decideTransferPackageReview({
    metadata: metadata(reviewer, "recovery-approve-initial"), requestId: recoverySubmit.requestId,
    decision: "approved", comment: "approved for failure recovery"
  });
  recoveryPackage = await repository.getById(recoveryPackage.id, companyId);
  await expectError(() => transferModule.publishTransferPackage({
    metadata: metadata(publisher, "recovery-publish-fault-one"), packageId: recoveryPackage.id,
    expectedRowVersion: recoveryPackage.rowVersion,
    faultInjector: (point) => { if (point.endsWith(":before_root_insert")) throw new Error("RECOVERY_FAULT_ONE"); }
  }));
  recoveryPackage = await repository.getById(recoveryPackage.id, companyId);
  db.prepare("UPDATE numbering_draft_workspaces SET row_version = row_version + 1 WHERE id = ?").run(recoveryWorkspace.id);
  const rebuiltSubmit = await transferModule.submitTransferPackageReview({
    metadata: metadata(owner, "recovery-submit-rebuilt"), packageId: recoveryPackage.id,
    expectedRowVersion: recoveryPackage.rowVersion, reason: "rebuild stale failed review"
  });
  const rebuiltLocks = db.prepare("SELECT count(*) count FROM number_candidate_reservations WHERE workspace_id = ? AND approval_request_id = ? AND reservation_state = 'review_locked'").get(recoveryWorkspace.id, rebuiltSubmit.requestId).count;
  record("TRF-009A stale ReleaseFailed package unlocks old approval and rebuilds a new review", recoveryPackage.status === "ReleaseFailed" && rebuiltSubmit.requestId !== recoverySubmit.requestId && rebuiltLocks === 2, { oldRequestId: recoverySubmit.requestId, newRequestId: rebuiltSubmit.requestId, rebuiltLocks });

  await transferModule.decideTransferPackageReview({
    metadata: metadata(reviewer, "recovery-approve-rebuilt"), requestId: rebuiltSubmit.requestId,
    decision: "approved", comment: "approved rebuilt review"
  });
  recoveryPackage = await repository.getById(recoveryPackage.id, companyId);
  await expectError(() => transferModule.publishTransferPackage({
    metadata: metadata(publisher, "recovery-publish-fault-two"), packageId: recoveryPackage.id,
    expectedRowVersion: recoveryPackage.rowVersion,
    faultInjector: (point) => { if (point.endsWith(":before_root_insert")) throw new Error("RECOVERY_FAULT_TWO"); }
  }));
  recoveryPackage = await repository.getById(recoveryPackage.id, companyId);
  const modifiedRecovery = await repository.updateHeader({
    packageId: recoveryPackage.id, actor: transferActor, expectedRowVersion: recoveryPackage.rowVersion,
    title: `${recoveryPackage.title} updated`, caseType: recoveryPackage.caseType,
    caseReason: recoveryPackage.caseReason, sourceReferenceStatus: recoveryPackage.sourceReferenceStatus,
    sourceReference: recoveryPackage.sourceReference, sourceReferenceReason: recoveryPackage.sourceReferenceReason
  });
  const unlockedAfterEdit = db.prepare("SELECT count(*) count FROM number_candidate_reservations WHERE workspace_id = ? AND reservation_state = 'active' AND approval_request_id IS NULL").get(recoveryWorkspace.id).count;
  const recoveryResubmit = await transferModule.submitTransferPackageReview({
    metadata: metadata(owner, "recovery-submit-after-edit"), packageId: modifiedRecovery.id,
    expectedRowVersion: modifiedRecovery.rowVersion, reason: "review after failed package edit"
  });
  await transferModule.decideTransferPackageReview({
    metadata: metadata(reviewer, "recovery-approve-after-edit"), requestId: recoveryResubmit.requestId,
    decision: "approved", comment: "approved after edit"
  });
  recoveryPackage = await repository.getById(recoveryPackage.id, companyId);
  const recoveredPublication = await transferModule.publishTransferPackage({
    metadata: metadata(publisher, "recovery-publish-success"), packageId: recoveryPackage.id,
    expectedRowVersion: recoveryPackage.rowVersion
  });
  recoveryPackage = await repository.getById(recoveryPackage.id, companyId);
  record("TRF-009B editing ReleaseFailed clears old approval locks and supports a fresh publish", modifiedRecovery.status === "Draft" && modifiedRecovery.approvedBy === null && unlockedAfterEdit === 2 && recoveryPackage.status === "Published" && recoveredPublication.publications.length === 1, { modifiedStatus: modifiedRecovery.status, unlockedAfterEdit, finalStatus: recoveryPackage.status });

  const cancelRecoveryWorkspace = await createWorkspace("Failure Cancel");
  let cancelRecoveryPackage = await repository.createDraft({
    actor: transferActor, idempotencyKey: "phase1d-cancel-recovery-package", title: "Failure cancel package",
    caseType: "development_case", caseReason: "Verify failed package cancellation unlock",
    sourceReferenceStatus: "not_available", sourceReference: null, sourceReferenceReason: "QC fixture"
  });
  cancelRecoveryPackage = await repository.addDraftWorkspace({
    packageId: cancelRecoveryPackage.id, actor: transferActor, expectedRowVersion: cancelRecoveryPackage.rowVersion,
    workspaceId: cancelRecoveryWorkspace.id, requiredness: "required", inclusionReason: "cancel recovery scope"
  });
  const cancelRecoverySubmit = await transferModule.submitTransferPackageReview({
    metadata: metadata(owner, "cancel-recovery-submit"), packageId: cancelRecoveryPackage.id,
    expectedRowVersion: cancelRecoveryPackage.rowVersion, reason: "cancel recovery review"
  });
  await transferModule.decideTransferPackageReview({
    metadata: metadata(reviewer, "cancel-recovery-approve"), requestId: cancelRecoverySubmit.requestId,
    decision: "approved", comment: "approved before cancellation failure"
  });
  cancelRecoveryPackage = await repository.getById(cancelRecoveryPackage.id, companyId);
  await expectError(() => transferModule.publishTransferPackage({
    metadata: metadata(publisher, "cancel-recovery-fault"), packageId: cancelRecoveryPackage.id,
    expectedRowVersion: cancelRecoveryPackage.rowVersion,
    faultInjector: (point) => { if (point.endsWith(":before_root_insert")) throw new Error("CANCEL_RECOVERY_FAULT"); }
  }));
  cancelRecoveryPackage = await repository.getById(cancelRecoveryPackage.id, companyId);
  const cancelledRecovery = await repository.cancel({
    packageId: cancelRecoveryPackage.id, actor: transferActor,
    expectedRowVersion: cancelRecoveryPackage.rowVersion, reason: "Stop failed package"
  });
  const unlockedAfterCancel = db.prepare("SELECT count(*) count FROM number_candidate_reservations WHERE workspace_id = ? AND reservation_state = 'active' AND approval_request_id IS NULL").get(cancelRecoveryWorkspace.id).count;
  record("TRF-009C cancelling ReleaseFailed unlocks old approval reservations", cancelledRecovery.status === "Cancelled" && cancelledRecovery.reviewRequestId === null && unlockedAfterCancel === 2, { status: cancelledRecovery.status, unlockedAfterCancel });

  const handoffs = await transferModule.listPublishedTransferHandoffs(companyId);
  const handoff = handoffs.find((item) => item.id === pkg.id);
  record("TRF-012 published-only handoff returns official identities after publication", Boolean(handoff && handoff.items.length === 5 && handoff.items.every((item) => item.id && item.code)), { handoff });
  db.prepare("UPDATE part_numbers SET record_status = 'Obsolete' WHERE id = ?").run(officialPartId);
  const handoffsAfterObsolete = await transferModule.listPublishedTransferHandoffs(companyId);
  db.prepare("UPDATE part_numbers SET record_status = 'Active' WHERE id = ?").run(officialPartId);
  record(
    "TRF-012A handoff fails closed when any published item is no longer formal-use",
    !handoffsAfterObsolete.some((item) => item.id === pkg.id),
    { visiblePackageIds: handoffsAfterObsolete.map((item) => item.id) }
  );
  const companyBHandoffs = await transferModule.listPublishedTransferHandoffs(companyB);
  const companyBReadError = await expectError(() => repository.getById(pkg.id, companyB));
  record("SEC-006/009 company boundary is non-disclosing for package and handoff reads", companyBHandoffs.length === 0 && companyBReadError === "TRANSFER_PACKAGE_NOT_FOUND", { companyBHandoffs: companyBHandoffs.length, companyBReadError });

  const staleWorkspace = await createWorkspace("Stale");
  let stalePackage = await repository.createDraft({
    actor: transferActor, idempotencyKey: "phase1d-stale-package", title: "Stale package",
    caseType: "design_change_case", caseReason: "Verify snapshot invalidation",
    sourceReferenceStatus: "not_available", sourceReference: null, sourceReferenceReason: "QC fixture"
  });
  stalePackage = await repository.addDraftWorkspace({
    packageId: stalePackage.id, actor: transferActor, expectedRowVersion: stalePackage.rowVersion,
    workspaceId: staleWorkspace.id, requiredness: "required", inclusionReason: "stale test"
  });
  const staleSubmit = await transferModule.submitTransferPackageReview({
    metadata: metadata(owner, "stale-submit"), packageId: stalePackage.id,
    expectedRowVersion: stalePackage.rowVersion, reason: "stale test"
  });
  db.prepare("UPDATE numbering_draft_workspaces SET row_version = row_version + 1 WHERE id = ?").run(staleWorkspace.id);
  await transferModule.decideTransferPackageReview({
    metadata: metadata(reviewer, "stale-approve"), requestId: staleSubmit.requestId,
    decision: "approved", comment: "approve stale fixture"
  });
  stalePackage = await repository.getById(stalePackage.id, companyId);
  const staleReadiness = await transferModule.buildTransferPackageReadiness(stalePackage.id, companyId);
  const stalePublishError = await expectError(() => transferModule.publishTransferPackage({
    metadata: metadata(publisher, "stale-publish"), packageId: stalePackage.id,
    expectedRowVersion: stalePackage.rowVersion
  }));
  record("TRF-007 workspace version change invalidates old approval snapshot", staleReadiness.stale && staleReadiness.firstBlocker?.code === "approval_snapshot_stale" && stalePublishError === "approval_snapshot_stale", { stalePublishError, firstBlocker: staleReadiness.firstBlocker });

  let replayPackage = await repository.createDraft({
    actor: transferActor, idempotencyKey: "phase1d-replay-package", title: "Existing publication package",
    caseType: "development_case", caseReason: "Verify no duplicate official event",
    sourceReferenceStatus: "not_available", sourceReference: null, sourceReferenceReason: "QC fixture"
  });
  replayPackage = await repository.addDraftWorkspace({
    packageId: replayPackage.id, actor: transferActor, expectedRowVersion: replayPackage.rowVersion,
    workspaceId: workspaceA.id, requiredness: "required", inclusionReason: "already official"
  });
  const replaySubmit = await transferModule.submitTransferPackageReview({
    metadata: metadata(owner, "replay-submit"), packageId: replayPackage.id,
    expectedRowVersion: replayPackage.rowVersion, reason: "existing official identity"
  });
  await transferModule.decideTransferPackageReview({
    metadata: metadata(reviewer, "replay-approve"), requestId: replaySubmit.requestId,
    decision: "approved", comment: "approved"
  });
  replayPackage = await repository.getById(replayPackage.id, companyId);
  const officialEventsBeforeReplay = db.prepare("SELECT count(*) count FROM platform_outbox_events WHERE event_type = 'pdm.numbering.official_number_published.v1' AND aggregate_id = ?").get(workspaceA.id).count;
  const replayPublish = await transferModule.publishTransferPackage({
    metadata: metadata(publisher, "replay-publish"), packageId: replayPackage.id,
    expectedRowVersion: replayPackage.rowVersion
  });
  const officialEventsAfterReplay = db.prepare("SELECT count(*) count FROM platform_outbox_events WHERE event_type = 'pdm.numbering.official_number_published.v1' AND aggregate_id = ?").get(workspaceA.id).count;
  record("CON-006/EVENT-006 second package validates published identity without re-event", replayPublish.publications.length === 1 && !replayPublish.publications[0].newlyPublished && officialEventsAfterReplay === officialEventsBeforeReplay, { officialEventsBeforeReplay, officialEventsAfterReplay });

  let immutableSnapshot = false;
  try {
    db.prepare("UPDATE approval_platform_impact_snapshots SET snapshot_hash = 'tampered' WHERE request_id = ?").run(submitted.requestId);
  } catch (error) {
    immutableSnapshot = String(error).includes("APPROVAL_PLATFORM_IMPACT_SNAPSHOT_IMMUTABLE");
  }
  record("DATA-003 aggregate approval snapshot is immutable", immutableSnapshot);

  const destructiveSql = fs.readFileSync(path.join(root, "db", "postgres", "017_number_state_flow_phase1d.sql"), "utf8");
  record("MIG-012 Phase1D migration is additive and has no destructive master rollback", !/DROP TABLE\s+(?:part_roots|part_numbers|drawing_numbers|number_candidate_reservations)/iu.test(destructiveSql) && destructiveSql.includes("VALIDATE CONSTRAINT"));
} catch (error) {
  record("TRF-RUNTIME", false, { error: String(error), stack: error instanceof Error ? error.stack : "" });
} finally {
  try { db?.close(); } catch {}
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
