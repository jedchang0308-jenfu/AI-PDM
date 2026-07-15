import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = path.join(root, ".tmp", `qc-number-state-phase1c-${crypto.randomUUID()}`);
const results = [];

function record(id, passed, detail = {}) {
  results.push({ id, passed: Boolean(passed), detail });
}

function errorCode(error) {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : error instanceof Error ? error.message : String(error);
}

async function expectError(run) {
  try {
    await run();
    return "";
  } catch (error) {
    return errorCode(error);
  }
}

process.env.PDM_DATA_DIR = fixtureRoot;
process.env.PDM_REPOSITORY_DIR = path.join(fixtureRoot, "repository");
process.env.PDM_DB_PROVIDER = "sqlite";
process.env.PDM_PUBLICATION_EVIDENCE_MODE = "local_fake";

let db;
try {
  const [{ getDb }, platform, flow, databaseProvider, repositoryModule, evidenceModule, outboxModule, approvalErrorModule] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/platform-command"),
    import("@/lib/number-state-flow"),
    import("@/lib/db-async-provider"),
    import("@/lib/repositories/number-state-flow-async-repository"),
    import("@/lib/publication-evidence"),
    import("@/lib/repositories/platform-outbox-async-repository"),
    import("@/lib/approval-api-error")
  ]);
  db = getDb();
  const client = databaseProvider.getAsyncDatabaseClient();
  const companyId = "company-jenfu";

  const users = [
    ["phase1c-owner", "Phase 1C Owner", "phase1c-owner@example.invalid", "Engineer"],
    ["phase1c-reviewer", "Phase 1C Reviewer", "phase1c-reviewer@example.invalid", "R&D Manager"],
    ["phase1c-publisher", "Phase 1C Publisher", "phase1c-publisher@example.invalid", "Admin"],
    ["phase1c-other", "Phase 1C Other", "phase1c-other@example.invalid", "Engineer"]
  ];
  for (const [id, displayName, email, role] of users) {
    db.prepare(`
      INSERT INTO users (
        id, display_name, email, password_hash, role, company_id, account_status,
        system_role_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, ?, ?, 'active', 1, datetime('now'), datetime('now'))
    `).run(id, displayName, email, role, companyId);
    db.prepare(`
      INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
      VALUES (?, ?, 1, datetime('now'))
    `).run(id, companyId);
  }

  function actor(userId, roles) {
    return platform.createPlatformActorContext({
      pdmUserId: userId,
      organizationId: companyId,
      roles,
      scopes: [
        "numbering.workspace.create",
        "numbering.candidate.acquire",
        "numbering.candidate.review.submit",
        "numbering.candidate.review.withdraw",
        "numbering.candidate.review.decide",
        "numbering.publish"
      ],
      requestId: `phase1c-${crypto.randomUUID()}`
    });
  }

  const owner = actor("phase1c-owner", ["Engineer", "rd"]);
  const reviewer = actor("phase1c-reviewer", ["R&D Manager", "rd_manager"]);
  const publisher = actor("phase1c-publisher", ["Admin", "system_admin"]);
  const other = actor("phase1c-other", ["Engineer", "rd"]);

  function body(label, includeDrawing = false) {
    const part = { clientKey: "part-1", partName: `${label} Part`, itemKind: "manufactured" };
    const drawing = { clientKey: "drawing-1", purposeCode: "M", purposeDescription: `${label} Drawing`, isPrimaryManufacturing: true };
    return {
      draftMode: "new_bundle",
      root: { coreName: `${label} Root`, itemKind: "manufactured" },
      parts: [part],
      drawings: includeDrawing ? [drawing] : [],
      relations: includeDrawing ? [{ drawingClientKey: "drawing-1", partClientKey: "part-1", linkType: "primary_manufacturing", isPrimary: true }] : []
    };
  }

  let sequence = 0;
  function metadata(context, action) {
    sequence += 1;
    return { actor: context, idempotencyKey: `phase1c:${action}:${sequence}` };
  }

  async function createAcquired(label, includeDrawing = false) {
    const created = await flow.createNumberingDraftWorkspace({ metadata: metadata(owner, "create"), body: body(label, includeDrawing) });
    const acquired = await flow.acquireNumberingDraftCandidates({
      metadata: metadata(owner, "acquire"),
      workspaceId: created.workspace.id,
      expectedRowVersion: created.workspace.rowVersion
    });
    return acquired.workspace;
  }

  async function submit(workspace) {
    return flow.submitNumberingCandidateReview({
      metadata: metadata(owner, "submit"),
      workspaceId: workspace.id,
      expectedRowVersion: workspace.rowVersion,
      reason: "phase1c_qc_candidate_publication_review"
    });
  }

  async function approve(requestId) {
    return flow.decideNumberingCandidateReview({
      metadata: metadata(reviewer, "approve"),
      requestId,
      decision: "approved",
      comment: "phase1c_qc_approved"
    });
  }

  async function addFinalizedEvidence(workspace) {
    const current = await new repositoryModule.AsyncNumberStateFlowRepository(client).getWorkspace(workspace.id, companyId);
    for (const drawing of current.drawings) {
      db.prepare(`
        INSERT INTO numbering_publication_evidence (
          id, company_id, workspace_id, drawing_draft_id, provider, bucket, object_key,
          generation, content_hash, media_type, finalized_at, rule_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'google_cloud_storage', ?, ?, ?, ?, 'application/pdf', datetime('now'), ?, datetime('now'), datetime('now'))
      `).run(
        `publication-evidence-${crypto.randomUUID()}`,
        companyId,
        current.id,
        drawing.id,
        "phase1c-controlled-files",
        `${companyId}/${current.id}/${drawing.id}.pdf`,
        String(Date.now()),
        crypto.createHash("sha256").update(`${current.id}:${drawing.id}`).digest("hex"),
        evidenceModule.PUBLICATION_EVIDENCE_RULE_VERSION
      );
    }
    return current;
  }

  const unnumberedWorkspace = await flow.createNumberingDraftWorkspace({
    metadata: metadata(owner, "create-unnumbered-review"),
    body: body("Unnumbered review")
  });
  const approvalRowsBeforeUnnumbered = db.prepare("SELECT count(*) count FROM approval_platform_requests").get().count;
  const unnumberedReviewError = await expectError(() => flow.submitNumberingCandidateReview({
    metadata: metadata(owner, "submit-unnumbered"),
    workspaceId: unnumberedWorkspace.workspace.id,
    expectedRowVersion: unnumberedWorkspace.workspace.rowVersion,
    reason: "phase1c_qc_candidate_required"
  }));
  record(
    "APR-001 submit without candidates is blocked without an approval row",
    unnumberedReviewError === "candidate_required_before_review" &&
      db.prepare("SELECT count(*) count FROM approval_platform_requests").get().count === approvalRowsBeforeUnnumbered,
    { unnumberedReviewError }
  );

  const reviewWorkspace = await createAcquired("Review contract");
  const mastersBeforeReview = {
    roots: db.prepare("SELECT count(*) count FROM part_roots").get().count,
    parts: db.prepare("SELECT count(*) count FROM part_numbers").get().count,
    drawings: db.prepare("SELECT count(*) count FROM drawing_numbers").get().count
  };
  const submitted = await submit(reviewWorkspace);
  const requestRow = db.prepare("SELECT * FROM approval_platform_requests WHERE id = ?").get(submitted.requestId);
  const targetCount = db.prepare("SELECT count(*) count FROM approval_platform_targets WHERE request_id = ?").get(submitted.requestId).count;
  const snapshot = db.prepare("SELECT * FROM approval_platform_impact_snapshots WHERE request_id = ?").get(submitted.requestId);
  record(
    "APR-002 valid submit locks every candidate and persists snapshot targets without masters",
    submitted.workspace.reservations.every((item) => item.state === "review_locked") &&
      requestRow?.request_status === "pending" && targetCount === submitted.workspace.reservations.length + 1 &&
      snapshot?.snapshot_hash === submitted.snapshotHash &&
      db.prepare("SELECT count(*) count FROM part_roots").get().count === mastersBeforeReview.roots &&
      db.prepare("SELECT count(*) count FROM part_numbers").get().count === mastersBeforeReview.parts &&
      db.prepare("SELECT count(*) count FROM drawing_numbers").get().count === mastersBeforeReview.drawings,
    { requestId: submitted.requestId, targetCount, reservationStates: submitted.workspace.reservations.map((item) => item.state) }
  );

  const snapshotUpdateError = expectError(async () => db.prepare("UPDATE approval_platform_impact_snapshots SET snapshot_hash = 'tampered' WHERE request_id = ?").run(submitted.requestId));
  const targetUpdateError = expectError(async () => db.prepare("UPDATE approval_platform_targets SET target_id = 'tampered' WHERE request_id = ?").run(submitted.requestId));
  const targetDeleteError = expectError(async () => db.prepare("DELETE FROM approval_platform_targets WHERE request_id = ?").run(submitted.requestId));
  const [snapshotUpdate, targetUpdate, targetDelete] = await Promise.all([snapshotUpdateError, targetUpdateError, targetDeleteError]);
  record(
    "APR-009 submitted snapshot and targets are immutable",
    snapshotUpdate === "SQLITE_CONSTRAINT_TRIGGER" && targetUpdate === "SQLITE_CONSTRAINT_TRIGGER" && targetDelete === "SQLITE_CONSTRAINT_TRIGGER",
    { snapshotUpdate, targetUpdate, targetDelete }
  );

  const approved = await approve(submitted.requestId);
  record(
    "APR-004 approval applies approved locks and never creates masters",
    approved.workspace.latestApproval?.status === "approved" &&
      approved.workspace.latestApproval?.applyStatus === "applied" &&
      approved.workspace.reservations.every((item) => item.state === "approved_locked") &&
      db.prepare("SELECT count(*) count FROM part_roots").get().count === mastersBeforeReview.roots &&
      db.prepare("SELECT count(*) count FROM part_numbers").get().count === mastersBeforeReview.parts,
    { approval: approved.workspace.latestApproval, states: approved.workspace.reservations.map((item) => item.state) }
  );
  record(
    "APR-006 approval projection is approved pending publish with zero new masters",
    approved.workspace.projection.review === "approved" && approved.workspace.projection.publication === "ready" &&
      db.prepare("SELECT count(*) count FROM part_roots").get().count === mastersBeforeReview.roots &&
      db.prepare("SELECT count(*) count FROM part_numbers").get().count === mastersBeforeReview.parts,
    { projection: approved.workspace.projection }
  );

  const unapprovedPublishWorkspace = await createAcquired("Unapproved publication");
  const unapprovedCounts = {
    roots: db.prepare("SELECT count(*) count FROM part_roots").get().count,
    parts: db.prepare("SELECT count(*) count FROM part_numbers").get().count
  };
  const unapprovedPublishError = await expectError(() => flow.publishNumberingDraftWorkspace({
    metadata: metadata(publisher, "publish-unapproved"),
    workspaceId: unapprovedPublishWorkspace.id
  }));
  record(
    "PUB-001 unapproved workspace cannot publish",
    unapprovedPublishError === "candidate_approval_required" &&
      db.prepare("SELECT count(*) count FROM part_roots").get().count === unapprovedCounts.roots &&
      db.prepare("SELECT count(*) count FROM part_numbers").get().count === unapprovedCounts.parts,
    { unapprovedPublishError }
  );
  record(
    "PUB-002 approval alone never creates official masters",
    db.prepare("SELECT count(*) count FROM part_roots").get().count === mastersBeforeReview.roots &&
      db.prepare("SELECT count(*) count FROM part_numbers").get().count === mastersBeforeReview.parts,
    { approvalRequestId: submitted.requestId }
  );

  const publishMetadata = metadata(publisher, "publish-idempotent");
  const published = await flow.publishNumberingDraftWorkspace({ metadata: publishMetadata, workspaceId: reviewWorkspace.id });
  const replay = await flow.publishNumberingDraftWorkspace({ metadata: publishMetadata, workspaceId: reviewWorkspace.id });
  const publishedMasters = {
    root: db.prepare("SELECT root_code, development_phase, record_status FROM part_roots WHERE id = ?").get(published.masters.rootId),
    part: db.prepare("SELECT part_number, development_phase, record_status FROM part_numbers WHERE id = ?").get(published.masters.partIds[0]),
    eventCount: db.prepare("SELECT count(*) count FROM platform_outbox_events WHERE event_type = 'pdm.numbering.official_number_published.v1' AND idempotency_key = ?").get(publishMetadata.idempotencyKey).count
  };
  record(
    "PUB-003 explicit publication atomically creates Active EVT masters",
    published.workspace.lifecycleStatus === "published" && replay.idempotentReplay &&
      published.workspace.reservations.every((item) => item.state === "promoted") &&
      publishedMasters.root?.record_status === "Active" && publishedMasters.root?.development_phase === "EVT" &&
      publishedMasters.part?.record_status === "Active" && publishedMasters.part?.development_phase === "EVT" &&
      publishedMasters.eventCount === 1,
    publishedMasters
  );
  record(
    "PUB-009 identical publication retry reuses the receipt and emits once",
    replay.idempotentReplay && publishedMasters.eventCount === 1,
    { idempotentReplay: replay.idempotentReplay, eventCount: publishedMasters.eventCount }
  );
  record(
    "PUB-012 root and part only publication records server not-required evidence",
    published.evidence.status === "not_required" && published.evidence.ruleVersion === evidenceModule.PUBLICATION_EVIDENCE_RULE_VERSION,
    { evidence: published.evidence }
  );
  const publishedOutbox = await client.queryOne(
    `SELECT id FROM platform_outbox_events
     WHERE aggregate_id = :workspaceId AND event_type = 'pdm.numbering.official_number_published.v1'`,
    { workspaceId: reviewWorkspace.id }
  );
  if (publishedOutbox) {
    await new outboxModule.PlatformOutboxAsyncRepository(client).markFailed(
      publishedOutbox.id,
      "redacted_qc_delivery_failure",
      new Date(Date.now() - 1_000).toISOString()
    );
  }
  const failedDelivery = publishedOutbox
    ? db.prepare("SELECT delivery_status, attempt_count, last_error FROM platform_outbox_events WHERE id = ?").get(publishedOutbox.id)
    : null;
  const publishedAfterDeliveryFailure = await new repositoryModule.AsyncNumberStateFlowRepository(client).getWorkspace(reviewWorkspace.id, companyId);
  record(
    "PUB-010 outbox delivery failure retains published data and a retryable durable event",
    failedDelivery?.delivery_status === "failed" && failedDelivery?.attempt_count === 1 &&
      failedDelivery?.last_error === "redacted_qc_delivery_failure" && publishedAfterDeliveryFailure.lifecycleStatus === "published",
    { failedDelivery, lifecycleStatus: publishedAfterDeliveryFailure.lifecycleStatus }
  );
  const republishError = await expectError(() => flow.publishNumberingDraftWorkspace({ metadata: metadata(publisher, "publish-again"), workspaceId: reviewWorkspace.id }));
  record("PUB-009B a different command cannot republish an already published workspace", republishError === "workspace_already_published", { republishError });

  const withdrawWorkspace = await createAcquired("Withdraw contract");
  const withdrawSubmission = await submit(withdrawWorkspace);
  const nonOwnerWithdrawError = await expectError(() => flow.withdrawNumberingCandidateReview({
    metadata: metadata(other, "withdraw-other"),
    workspaceId: withdrawWorkspace.id,
    expectedRowVersion: withdrawSubmission.workspace.rowVersion
  }));
  const withdrawn = await flow.withdrawNumberingCandidateReview({
    metadata: metadata(owner, "withdraw-owner"),
    workspaceId: withdrawWorkspace.id,
    expectedRowVersion: withdrawSubmission.workspace.rowVersion
  });
  record(
    "APR-007 only the owner withdraws pending review and unlocks candidates",
    (nonOwnerWithdrawError === "review_withdraw_owner_required" || nonOwnerWithdrawError === "workspace_not_found") &&
      withdrawn.workspace.latestApproval?.status === "cancelled" &&
      withdrawn.workspace.reservations.every((item) => item.state === "active"),
    { nonOwnerWithdrawError, approval: withdrawn.workspace.latestApproval }
  );

  for (const decision of ["rejected", "needs_info"]) {
    const decisionWorkspace = await createAcquired(`Decision ${decision}`);
    const decisionSubmission = await submit(decisionWorkspace);
    const result = await flow.decideNumberingCandidateReview({
      metadata: metadata(reviewer, decision),
      requestId: decisionSubmission.requestId,
      decision,
      comment: `phase1c_qc_${decision}`
    });
    record(
      `APR-005 ${decision} unlocks candidates and preserves draft`,
      result.workspace.lifecycleStatus === "active" && result.workspace.projection.review === decision &&
        result.workspace.reservations.every((item) => item.state === "active"),
      { decision, review: result.workspace.projection.review, states: result.workspace.reservations.map((item) => item.state) }
    );
  }

  const faultWorkspace = await createAcquired("Approval apply fault");
  const faultSubmission = await submit(faultWorkspace);
  const faultResult = await client.transaction(async (transactionClient) => {
    const repository = new repositoryModule.AsyncNumberStateFlowRepository(
      transactionClient,
      () => new Date().toISOString(),
      () => crypto.randomUUID(),
      (point) => { if (point === "before_candidate_apply") throw new repositoryModule.NumberStateApprovalApplyFault(point); }
    );
    return repository.decideCandidateReview({
      requestId: faultSubmission.requestId,
      companyId,
      actorId: reviewer.pdmUserId,
      actorRole: "rd_manager",
      decision: "approved",
      comment: "forced apply failure"
    });
  });
  record(
    "APR-008 approval apply failure is explicit and keeps review locks",
    faultResult.applyFailed && faultResult.workspace.latestApproval?.status === "apply_failed" &&
      faultResult.workspace.latestApproval?.applyStatus === "failed" &&
      faultResult.workspace.reservations.every((item) => item.state === "review_locked"),
    { applyFailed: faultResult.applyFailed, approval: faultResult.workspace.latestApproval }
  );
  const retryResult = await flow.retryNumberingCandidateReviewApply({
    metadata: metadata(reviewer, "retry-apply"),
    requestId: faultSubmission.requestId
  });
  record(
    "APR-008-R failed approval apply can be retried without a new decision",
    retryResult.workspace.latestApproval?.status === "approved" &&
      retryResult.workspace.latestApproval?.applyStatus === "applied" &&
      retryResult.workspace.reservations.every((item) => item.state === "approved_locked"),
    { approval: retryResult.workspace.latestApproval }
  );

  function publicationCardinality() {
    return {
      roots: db.prepare("SELECT count(*) count FROM part_roots").get().count,
      parts: db.prepare("SELECT count(*) count FROM part_numbers").get().count,
      drawings: db.prepare("SELECT count(*) count FROM drawing_numbers").get().count,
      relations: db.prepare("SELECT count(*) count FROM drawing_part_links").get().count,
      promoted: db.prepare("SELECT count(*) count FROM number_candidate_reservations WHERE reservation_state = 'promoted'").get().count,
      candidateEvents: db.prepare("SELECT count(*) count FROM number_candidate_events WHERE event_type = 'candidate_promoted'").get().count,
      audits: db.prepare("SELECT count(*) count FROM audit_logs WHERE action = 'pdm.numbering.publish_official_numbers'").get().count,
      receipts: db.prepare("SELECT count(*) count FROM platform_command_receipts WHERE command_name = 'pdm.numbering.publish_official_numbers'").get().count,
      outbox: db.prepare("SELECT count(*) count FROM platform_outbox_events WHERE event_type = 'pdm.numbering.official_number_published.v1'").get().count
    };
  }

  const faultPoints = [
    "before_root_insert",
    "before_part_insert",
    "before_drawing_insert",
    "before_relation_insert",
    "before_reservation_promotion",
    "before_workspace_publish",
    "before_publication_audit",
    "before_outbox_enqueue",
    "before_command_complete",
    "after_command_complete"
  ];
  const publicationFaultResults = [];
  for (const faultPoint of faultPoints) {
    const publishFaultWorkspace = await createAcquired(`Publication fault ${faultPoint}`, true);
    const publishFaultSubmission = await submit(publishFaultWorkspace);
    await approve(publishFaultSubmission.requestId);
    await addFinalizedEvidence(publishFaultWorkspace);
    const before = publicationCardinality();
    const faultMetadata = metadata(publisher, `publish-fault-${faultPoint}`);
    const publicationFaultError = await expectError(() => flow.publishNumberingDraftWorkspace({
      metadata: faultMetadata,
      workspaceId: publishFaultWorkspace.id,
      faultInjector: (point) => {
        if (point === faultPoint) throw new Error(`FORCED_PUBLICATION_FAULT:${faultPoint}`);
      }
    }));
    const after = publicationCardinality();
    const workspaceAfter = await new repositoryModule.AsyncNumberStateFlowRepository(client).getWorkspace(publishFaultWorkspace.id, companyId);
    const unchanged = Object.keys(before).every((key) => before[key] === after[key]);
    publicationFaultResults.push({
      faultPoint,
      passed: publicationFaultError === `FORCED_PUBLICATION_FAULT:${faultPoint}` && unchanged &&
        workspaceAfter.lifecycleStatus === "active" && workspaceAfter.reservations.every((item) => item.state === "approved_locked"),
      publicationFaultError,
      before,
      after,
      lifecycleStatus: workspaceAfter.lifecycleStatus,
      reservationStates: workspaceAfter.reservations.map((item) => item.state)
    });
  }
  record(
    "PUB-006 root insert fault rolls back the entire publication transaction",
    publicationFaultResults.find((item) => item.faultPoint === "before_root_insert")?.passed,
    publicationFaultResults.find((item) => item.faultPoint === "before_root_insert")
  );
  record(
    "PUB-007 part/drawing/relation/promotion/workspace/audit/outbox/receipt faults all roll back",
    publicationFaultResults.filter((item) => item.faultPoint !== "before_root_insert").every((item) => item.passed),
    { results: publicationFaultResults.filter((item) => item.faultPoint !== "before_root_insert") }
  );

  const staleWorkspace = await createAcquired("Stale approval snapshot");
  const staleSubmission = await submit(staleWorkspace);
  const staleApproved = await approve(staleSubmission.requestId);
  const stalePart = staleApproved.workspace.parts[0];
  db.prepare("UPDATE numbering_draft_parts SET part_name = part_name || ' changed', updated_at = datetime('now') WHERE id = ?").run(stalePart.id);
  const staleBefore = publicationCardinality();
  const stalePublishError = await expectError(() => flow.publishNumberingDraftWorkspace({
    metadata: metadata(publisher, "publish-stale-snapshot"),
    workspaceId: staleWorkspace.id
  }));
  const staleAfter = publicationCardinality();
  const staleWorkspaceAfter = await new repositoryModule.AsyncNumberStateFlowRepository(client).getWorkspace(staleWorkspace.id, companyId);
  record(
    "PUB-004 changed facts invalidate the approved snapshot",
    stalePublishError === "approval_snapshot_stale" &&
      Object.keys(staleBefore).every((key) => staleBefore[key] === staleAfter[key]) &&
      staleWorkspaceAfter.lifecycleStatus === "active" && staleWorkspaceAfter.reservations.every((item) => item.state === "approved_locked"),
    { stalePublishError, projection: staleWorkspaceAfter.projection }
  );

  const drawingWorkspace = await createAcquired("Drawing evidence", true);
  const drawingSubmission = await submit(drawingWorkspace);
  const drawingApproved = await approve(drawingSubmission.requestId);
  const drawingBeforeEvidenceBlock = publicationCardinality();
  const evidenceBlockedError = await expectError(() => flow.publishNumberingDraftWorkspace({
    metadata: metadata(publisher, "publish-no-evidence"),
    workspaceId: drawingWorkspace.id
  }));
  const drawingAfterEvidenceBlock = publicationCardinality();
  const drawingBlockedWorkspace = await new repositoryModule.AsyncNumberStateFlowRepository(client).getWorkspace(drawingWorkspace.id, companyId);
  const drawingId = drawingApproved.workspace.drawings[0].id;
  db.prepare(`
    INSERT INTO numbering_publication_evidence (
      id, company_id, workspace_id, drawing_draft_id, provider, bucket, object_key,
      generation, content_hash, media_type, finalized_at, rule_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'google_cloud_storage', ?, ?, ?, ?, 'application/pdf', datetime('now'), ?, datetime('now'), datetime('now'))
  `).run(
    `publication-evidence-${crypto.randomUUID()}`,
    companyId,
    drawingWorkspace.id,
    drawingId,
    "phase1c-controlled-files",
    `${companyId}/${drawingWorkspace.id}/${drawingId}.pdf`,
    "1700000000000000",
    "a".repeat(64),
    evidenceModule.PUBLICATION_EVIDENCE_RULE_VERSION
  );
  const drawingPublished = await flow.publishNumberingDraftWorkspace({
    metadata: metadata(publisher, "publish-with-evidence"),
    workspaceId: drawingWorkspace.id
  });
  const drawingEvent = db.prepare("SELECT payload_json FROM platform_outbox_events WHERE aggregate_id = ? AND event_type = 'pdm.numbering.official_number_published.v1'").get(drawingWorkspace.id);
  const drawingPayload = drawingEvent ? JSON.parse(drawingEvent.payload_json) : null;
  record(
    "PUB-005 and PUB-014 missing drawing evidence fail closed with zero publication",
    evidenceBlockedError === "publication_evidence_not_ready" &&
      Object.keys(drawingBeforeEvidenceBlock).every((key) => drawingBeforeEvidenceBlock[key] === drawingAfterEvidenceBlock[key]) &&
      drawingBlockedWorkspace.lifecycleStatus === "active" && drawingBlockedWorkspace.reservations.every((item) => item.state === "approved_locked"),
    { evidenceBlockedError, lifecycleStatus: drawingBlockedWorkspace.lifecycleStatus }
  );
  record(
    "PUB-013 finalized drawing evidence publishes stable references",
    drawingPublished.evidence.status === "finalized" && drawingPublished.evidence.references.length === 1 &&
      drawingPublished.masters.drawingIds.length === 1 && drawingPublished.masters.relationIds.length === 1 &&
      drawingPayload?.evidence?.references?.[0]?.generation === "1700000000000000",
    { evidenceBlockedError, evidence: drawingPublished.evidence, eventEvidence: drawingPayload?.evidence }
  );

  const collisionWorkspace = await createAcquired("Official collision");
  const collisionSubmission = await submit(collisionWorkspace);
  const collisionApproved = await approve(collisionSubmission.requestId);
  const rootReservation = collisionApproved.workspace.reservations.find((item) => item.itemType === "root");
  db.prepare(`
    INSERT INTO part_roots (
      id, company_id, root_code, core_name, item_kind, development_phase, record_status,
      rule_version_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, 'Collision sentinel', 'manufactured', 'EVT', 'Active', ?, ?, datetime('now'), datetime('now'))
  `).run(
    `collision-root-${crypto.randomUUID()}`,
    companyId,
    rootReservation.candidateCode,
    collisionApproved.workspace.root.ruleVersionId,
    publisher.pdmUserId
  );
  const collisionError = await expectError(() => flow.publishNumberingDraftWorkspace({
    metadata: metadata(publisher, "publish-collision"),
    workspaceId: collisionWorkspace.id
  }));
  const collisionAfter = await new repositoryModule.AsyncNumberStateFlowRepository(client).getWorkspace(collisionWorkspace.id, companyId);
  record(
    "PUB-008 official collision aborts without auto-renumbering or partial masters",
    collisionError === "official_number_collision" && collisionAfter.lifecycleStatus === "active" &&
      collisionAfter.reservations.every((item) => item.state === "approved_locked") &&
      !db.prepare("SELECT id FROM part_numbers WHERE part_number = ?").get(collisionAfter.parts[0].candidateCode),
    { collisionError, candidateCodes: collisionAfter.reservations.map((item) => item.candidateCode) }
  );

  const crossCompanyDecision = await expectError(() => flow.decideNumberingCandidateReview({
    metadata: {
      actor: platform.createPlatformActorContext({
        pdmUserId: reviewer.pdmUserId,
        organizationId: "company-maxima",
        roles: ["rd_manager"],
        scopes: ["numbering.candidate.review.decide"]
      }),
      idempotencyKey: `phase1c:cross-company:${crypto.randomUUID()}`
    },
    requestId: collisionSubmission.requestId,
    decision: "rejected"
  }));
  record("SEC-004 approval decisions are company scoped", crossCompanyDecision === "approval_request_not_found", { crossCompanyDecision });

  const safeErrorResponse = approvalErrorModule.approvalApiErrorResponse(
    new Error("SQLITE_CONSTRAINT: secret_table raw provider detail"),
    "decision",
    new Request("http://127.0.0.1/api/approvals/requests/APR-test/decisions")
  );
  const safeErrorBody = await safeErrorResponse.json();
  record(
    "SEC-010 unexpected approval errors use a redacted envelope with correlation ID",
    safeErrorResponse.status === 500 && safeErrorBody.error === "APPROVAL_DECISION_FAILED" &&
      typeof safeErrorBody.correlationId === "string" && !JSON.stringify(safeErrorBody).includes("secret_table"),
    { status: safeErrorResponse.status, body: safeErrorBody }
  );

  const publicationEvents = db.prepare("SELECT payload_json, delivery_status, attempt_count FROM platform_outbox_events WHERE event_type = 'pdm.numbering.official_number_published.v1'").all();
  record(
    "EVT-001 publication events remain durable pending or retryable outbox records with trace facts",
    publicationEvents.length >= 2 && publicationEvents.every((row) => {
      const payload = JSON.parse(row.payload_json);
      return ["pending", "failed"].includes(row.delivery_status) && row.attempt_count >= 0 && payload.workspaceId && payload.approvalRequestId && payload.snapshotHash && payload.masters;
    }),
    { eventCount: publicationEvents.length, statuses: publicationEvents.map((row) => row.delivery_status) }
  );

  const providerMigrations = [
    path.join(root, "db", "postgres", "016_number_state_flow_phase1c.sql"),
    path.join(root, "supabase", "migrations", "20260713080000_number_state_flow_phase1c.sql")
  ].map((file) => ({ file, source: fs.readFileSync(file, "utf8") }));
  record(
    "MIG-012 PostgreSQL provider mirrors reject approval snapshot update and delete",
    providerMigrations.every(({ source }) =>
      source.includes("trg_approval_platform_impact_snapshots_no_update") &&
      source.includes("trg_approval_platform_impact_snapshots_no_delete") &&
      source.includes("APPROVAL_PLATFORM_IMPACT_SNAPSHOT_IMMUTABLE") &&
      source.includes("REVOKE ALL ON FUNCTION public.reject_approval_platform_snapshot_mutation()")
    ),
    { files: providerMigrations.map(({ file }) => path.relative(root, file)) }
  );
} catch (error) {
  record("PHASE1C-FIXTURE", false, { error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error) });
} finally {
  try { db?.close(); } catch {}
  const resolvedFixture = path.resolve(fixtureRoot);
  const resolvedTmp = path.resolve(root, ".tmp");
  if (resolvedFixture.startsWith(`${resolvedTmp}${path.sep}`)) {
    fs.rmSync(resolvedFixture, { recursive: true, force: true });
  }
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
