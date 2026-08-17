#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import {
  AsyncDrawingRevisionLifecycleRepository,
  DrawingRevisionLifecycleRepositoryError
} from "../src/lib/repositories/drawing-revision-lifecycle-async-repository.ts";
import { AsyncNumberingRepository } from "../src/lib/repositories/numbering-async-repository.ts";

const root = process.cwd();
const schema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
const results = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });
const database = new Database(":memory:");
database.pragma("foreign_keys = ON");
database.exec(schema);

database.exec(`
  INSERT OR IGNORE INTO users (
    id, display_name, email, role, company_id, account_status, system_role_enabled
  ) VALUES
    ('phase1h-engineer', 'Phase 1H Engineer', 'phase1h-engineer@example.test', 'Engineer', 'company-jenfu', 'active', 1),
    ('phase1h-manager', 'Phase 1H Manager', 'phase1h-manager@example.test', 'R&D Manager', 'company-jenfu', 'active', 1),
    ('phase1h-outsider', 'Phase 1H Outsider', 'phase1h-outsider@example.test', 'R&D Manager', 'company-maxima', 'active', 1);
`);

let sequence = 0;
const idFactory = () => `qc${String(++sequence).padStart(10, "0")}`;
const now = "2026-08-06T08:00:00.000Z";
const client = createAsyncDatabaseClient({ kind: "sqlite", database });
const repository = new AsyncDrawingRevisionLifecycleRepository(client, () => now, idFactory);

function seedDrawing(suffix) {
  const rootId = `phase1h-root-${suffix}`;
  const drawingId = `phase1h-drawing-${suffix}`;
  const drawingNumber = `H${suffix}-M01`;
  database.prepare(`
    INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, record_status)
    VALUES (:id, 'company-jenfu', :rootCode, :name, 'manufactured', 'Active')
  `).run({ id: rootId, rootCode: `H${suffix}`, name: `Phase 1H ${suffix}` });
  database.prepare(`
    INSERT INTO drawing_numbers (
      id, company_id, part_root_id, drawing_number, purpose_code, sequence_no,
      is_primary_manufacturing, record_status
    ) VALUES (:id, 'company-jenfu', :rootId, :drawingNumber, 'M', 1, 1, 'Active')
  `).run({ id: drawingId, rootId, drawingNumber });
  const parts = [];
  for (let index = 1; index <= 3; index += 1) {
    const partId = `phase1h-part-${suffix}-${index}`;
    const itemId = `phase1h-item-${suffix}-${index}`;
    const partNumber = `H${suffix}-P0${index}`;
    database.prepare(`
      INSERT INTO part_numbers (
        id, company_id, part_root_id, part_number, sequence_no, sequence_code,
        part_name, item_kind, record_status
      ) VALUES (
        :id, 'company-jenfu', :rootId, :partNumber, :sequenceNo, :sequenceCode,
        :partName, 'manufactured', 'Active'
      )
    `).run({ id: partId, rootId, partNumber, sequenceNo: index, sequenceCode: `0${index}`, partName: `Part ${index}` });
    database.prepare(`
      INSERT INTO items (id, company_id, part_number, part_name)
      VALUES (:id, 'company-jenfu', :partNumber, :partName)
    `).run({ id: itemId, partNumber, partName: `Part ${index}` });
    parts.push({
      itemId,
      partNumberId: partId,
      partNumber,
      partName: `Part ${index}`,
      linkType: "primary_manufacturing",
      formState: "no_impact",
      fitState: "no_impact",
      functionState: "no_impact",
      fffOutcome: "no_impact"
    });
  }
  const files = ["SLDDRW", "SLDPRT"].map((extension, index) => {
    const assetId = `phase1h-asset-${suffix}-${index}`;
    const filename = `${drawingNumber}.${extension}`;
    database.prepare(`
      INSERT INTO file_assets (
        id, storage_provider, file_name, file_ext, content_hash, linked_entity_type,
        linked_entity_id, document_category, display_name, revision, uploaded_by
      ) VALUES (
        :id, 'local_repository', :filename, :extension, :hash, 'drawing_number',
        :drawingId, :category, :filename, :revision, 'phase1h-engineer'
      )
    `).run({
      id: assetId,
      filename,
      extension: extension.toLowerCase(),
      hash: `hash-${suffix}-${index}`,
      drawingId,
      category: extension === "SLDDRW" ? "drawing_2d" : "cad_3d",
      revision: suffix
    });
    return {
      assetId,
      filename,
      displayName: filename,
      description: "",
      documentCategory: extension === "SLDDRW" ? "drawing_2d" : "cad_3d"
    };
  });
  return { drawingId, drawingNumber, parts, files };
}

function submitInput(fixture, revision, key) {
  return {
    companyId: "company-jenfu",
    drawingNumberId: fixture.drawingId,
    drawingNumber: fixture.drawingNumber,
    revision,
    submittedBy: "phase1h-engineer",
    idempotencyKeyHash: `submit-${key}`,
    scopeHash: `scope-${key}`,
    snapshotHash: `snapshot-${key}`,
    snapshot: { drawingNumber: fixture.drawingNumber, revision, partCount: 3, fileCount: 2 },
    note: "Phase 1H authority QC",
    files: fixture.files,
    parts: fixture.parts
  };
}

try {
  const informationFixture = seedDrawing("100");
  const informationSubmitted = await repository.submit(submitInput(informationFixture, "0.1", "needs-info"));
  const informationDecision = await repository.decide({
    requestId: informationSubmitted.projection.requestId,
    actorId: "phase1h-manager",
    actorRole: "R&D Manager",
    decision: "needs_info",
    reason: "請補充設計依據",
    keyHash: "decision-needs-info",
    scopeHash: "decision-needs-info-scope"
  });
  const informationState = database.prepare(`
    SELECT
      (SELECT request_status FROM approval_platform_requests WHERE id = ?) AS request_status,
      (SELECT decision FROM approval_platform_decisions WHERE request_id = ? ORDER BY decided_at DESC LIMIT 1) AS decision,
      (SELECT lifecycle_state FROM drawing_revision_packages WHERE id = ?) AS lifecycle_state,
      (SELECT active_correction_reason FROM drawing_revision_packages WHERE id = ?) AS reason
  `).get(
    informationSubmitted.projection.requestId,
    informationSubmitted.projection.requestId,
    informationSubmitted.projection.packageId,
    informationSubmitted.projection.packageId
  );
  record("DEV053-1H-AUTH-012 request-information remains distinct from rejection",
    informationState.request_status === "needs_info" && informationState.decision === "needs_info" &&
    informationState.lifecycle_state === "correction_required" && informationState.reason === "請補充設計依據",
    JSON.stringify(informationState));
  await repository.cleanupTerminalWorkflow(informationDecision.workflowId);

  const returnedFixture = seedDrawing("101");
  const submitted = await repository.submit(submitInput(returnedFixture, "0.1", "return"));
  const freshCounts = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM submissions) AS submissions,
      (SELECT COUNT(*) FROM numbering_notifications) AS notifications,
      (SELECT COUNT(*) FROM audit_logs) AS audit_logs,
      (SELECT COUNT(*) FROM drawing_revision_package_part_scopes WHERE package_id = ?) AS scopes,
      (SELECT COUNT(*) FROM drawing_revision_package_files WHERE package_id = ?) AS files,
      (SELECT COUNT(*) FROM approval_platform_requests) AS requests,
      (SELECT COUNT(*) FROM drawing_revision_lifecycle_workflows) AS workflows
  `).get(submitted.projection.packageId, submitted.projection.packageId);
  record("DEV053-1H-AUTH-001 fresh submit creates one native authority and no legacy/history rows",
    submitted.projection.lifecycleState === "in_review" &&
    freshCounts.submissions === 0 && freshCounts.notifications === 0 && freshCounts.audit_logs === 0 &&
    freshCounts.scopes === 3 && freshCounts.files === 2 && freshCounts.requests === 1 && freshCounts.workflows === 1,
    JSON.stringify(freshCounts));

  const submitReplay = await repository.submit(submitInput(returnedFixture, "0.1", "return"));
  let submitConflictCode = "";
  try {
    await repository.submit({ ...submitInput(returnedFixture, "0.1", "return"), scopeHash: "scope-conflict" });
  } catch (error) {
    submitConflictCode = error instanceof DrawingRevisionLifecycleRepositoryError ? error.code : String(error);
  }
  record("DEV053-1H-AUTH-010 submit replay is idempotent and key reuse with a different scope is rejected",
    submitReplay.idempotentReplay === true && submitConflictCode === "DRAWING_LIFECYCLE_IDEMPOTENCY_CONFLICT" &&
    database.prepare("SELECT COUNT(*) AS count FROM drawing_revision_lifecycle_workflows").get().count === 1,
    JSON.stringify({ replay: submitReplay.idempotentReplay, submitConflictCode }));

  let unauthorizedCode = "";
  try {
    await repository.decide({
      requestId: submitted.projection.requestId,
      actorId: "phase1h-outsider",
      actorRole: "R&D Manager",
      decision: "approved",
      keyHash: "decision-outsider",
      scopeHash: "decision-outsider-scope"
    });
  } catch (error) {
    unauthorizedCode = error instanceof DrawingRevisionLifecycleRepositoryError ? error.code : String(error);
  }
  record("DEV053-1H-AUTH-002 non-assigned reviewer is rejected before writes",
    unauthorizedCode === "DRAWING_LIFECYCLE_REVIEWER_NOT_ASSIGNED" &&
    database.prepare("SELECT COUNT(*) AS count FROM approval_platform_decisions").get().count === 0,
    unauthorizedCode);

  const returned = await repository.decide({
    requestId: submitted.projection.requestId,
    actorId: "phase1h-manager",
    actorRole: "R&D Manager",
    decision: "returned_for_correction",
    reason: "",
    keyHash: "decision-return",
    scopeHash: "decision-return-scope"
  });
  await repository.cleanupTerminalWorkflow(returned.workflowId);
  const returnedCounts = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM approval_platform_requests) AS requests,
      (SELECT COUNT(*) FROM approval_platform_decisions) AS decisions,
      (SELECT COUNT(*) FROM approval_platform_events) AS events,
      (SELECT COUNT(*) FROM drawing_revision_lifecycle_workflows) AS workflows,
      (SELECT lifecycle_state FROM drawing_revision_packages WHERE id = ?) AS state
  `).get(submitted.projection.packageId);
  record("DEV053-1H-AUTH-003 optional-reason return cleans review graph and keeps current correction state",
    returnedCounts.requests === 0 && returnedCounts.decisions === 0 && returnedCounts.events === 0 &&
    returnedCounts.workflows === 0 && returnedCounts.state === "correction_required",
    JSON.stringify(returnedCounts));

  const resubmitted = await repository.submit(submitInput(returnedFixture, "0.1", "resubmit"));
  const correction = database.prepare("SELECT active_correction_reason FROM drawing_revision_packages WHERE id = ?").get(resubmitted.projection.packageId);
  record("DEV053-1H-AUTH-004 resubmit reuses durable package and clears correction reason",
    resubmitted.projection.packageId === submitted.projection.packageId && correction.active_correction_reason === null);

  const approved = await repository.decide({
    requestId: resubmitted.projection.requestId,
    actorId: "phase1h-manager",
    actorRole: "R&D Manager",
    decision: "approved",
    keyHash: "decision-approve",
    scopeHash: "decision-approve-scope"
  });
  let staleDecisionCode = "";
  try {
    await repository.decide({
      requestId: resubmitted.projection.requestId,
      actorId: "phase1h-manager",
      actorRole: "R&D Manager",
      decision: "approved",
      keyHash: "decision-approve",
      scopeHash: "decision-approve-scope"
    });
  } catch (error) {
    staleDecisionCode = error instanceof DrawingRevisionLifecycleRepositoryError ? error.code : String(error);
  }
  record("DEV053-1H-AUTH-011 stale decision is rejected without duplicating the decision row",
    staleDecisionCode === "DRAWING_LIFECYCLE_STATE_CONFLICT" &&
    database.prepare("SELECT COUNT(*) AS count FROM approval_platform_decisions WHERE request_id = ?").get(resubmitted.projection.requestId).count === 1,
    JSON.stringify({ staleDecisionCode }));
  await repository.cleanupTerminalWorkflow(approved.workflowId);
  const approvedCounts = database.prepare(`
    SELECT
      (SELECT lifecycle_state FROM drawing_revision_packages WHERE id = ?) AS state,
      (SELECT COUNT(*) FROM drawing_revision_package_part_scopes WHERE package_id = ?) AS scopes,
      (SELECT COUNT(*) FROM drawing_revision_package_files WHERE package_id = ?) AS files,
      (SELECT COUNT(*) FROM drawing_revision_lifecycle_workflows) AS workflows,
      (SELECT COUNT(*) FROM approval_platform_requests) AS requests
  `).get(submitted.projection.packageId, submitted.projection.packageId, submitted.projection.packageId);
  record("DEV053-1H-AUTH-005 minor approval keeps durable controlled result and removes transient authority",
    approvedCounts.state === "rd_controlled" && approvedCounts.scopes === 3 && approvedCounts.files === 2 &&
    approvedCounts.workflows === 0 && approvedCounts.requests === 0,
    JSON.stringify(approvedCounts));

  const withdrawFixture = seedDrawing("102");
  const withdrawSubmitted = await repository.submit(submitInput(withdrawFixture, "0.2", "withdraw"));
  const withdrawn = await repository.withdraw({
    requestId: withdrawSubmitted.projection.requestId,
    actorId: "phase1h-engineer",
    keyHash: "withdraw-key",
    scopeHash: "withdraw-scope"
  });
  await repository.cleanupTerminalWorkflow(withdrawn.workflowId);
  const withdrawnState = database.prepare("SELECT lifecycle_state FROM drawing_revision_packages WHERE id = ?").get(withdrawSubmitted.projection.packageId);
  record("DEV053-1H-AUTH-006 original submitter may withdraw before the first decision",
    withdrawnState.lifecycle_state === "preparing" &&
    database.prepare("SELECT COUNT(*) AS count FROM drawing_revision_lifecycle_workflows").get().count === 0);

  const releasedFixture = seedDrawing("104");
  const releasedSubmitted = await repository.submit(submitInput(releasedFixture, "1", "release"));
  const released = await repository.decide({
    requestId: releasedSubmitted.projection.requestId,
    actorId: "phase1h-manager",
    actorRole: "R&D Manager",
    decision: "approved",
    keyHash: "decision-release",
    scopeHash: "decision-release-scope"
  });
  await repository.cleanupTerminalWorkflow(released.workflowId);
  const releasedMasters = database.prepare(`
    SELECT
      (SELECT lifecycle_state FROM drawing_revision_packages WHERE id = ?) AS package_state,
      (SELECT record_status FROM drawing_numbers WHERE id = ?) AS drawing_state,
      (SELECT COUNT(*) FROM part_numbers WHERE part_root_id = ? AND record_status = 'Released') AS released_parts,
      (SELECT COUNT(*) FROM items WHERE id IN (?, ?, ?) AND current_revision = '1') AS revised_items
  `).get(
    releasedSubmitted.projection.packageId,
    releasedFixture.drawingId,
    `phase1h-root-104`,
    ...releasedFixture.parts.map((part) => part.itemId)
  );
  record("DEV053-1H-AUTH-007 integer approval atomically publishes drawing and all three part identities",
    releasedMasters.package_state === "released" && releasedMasters.drawing_state === "Released" &&
    releasedMasters.released_parts === 3 && releasedMasters.revised_items === 3,
    JSON.stringify(releasedMasters));

  const taskFixture = seedDrawing("103");
  const taskSubmitted = await repository.submit(submitInput(taskFixture, "0.3", "task"));
  const taskRepository = new AsyncNumberingRepository(client);
  const tasks = await taskRepository.listNumberingTasks({
    companyId: "company-jenfu",
    user: { id: "phase1h-manager", role: "R&D Manager" },
    status: "open"
  });
  const projectedTask = tasks.find((task) => task.taskType === "drawing_revision_lifecycle_review");
  record("DEV053-1H-AUTH-008 current reviewer task is projected without a permanent task row",
    Boolean(projectedTask?.actionUrl?.includes(encodeURIComponent(taskSubmitted.projection.requestId))) &&
    database.prepare("SELECT COUNT(*) AS count FROM numbering_task_items WHERE task_type = 'drawing_revision_lifecycle_review'").get().count === 0,
    JSON.stringify(projectedTask ?? null));

  let otherDomainDeleteBlocked = false;
  database.prepare(`
    INSERT INTO approval_platform_packages (
      id, company_id, package_code, action_code, package_status, title, reason, submitted_by
    ) VALUES (
      'other-package', 'company-jenfu', 'OTHER-PACKAGE', 'numbering.release', 'pending', 'Other', '', 'phase1h-engineer'
    )
  `).run();
  database.prepare(`
    INSERT INTO approval_platform_requests (
      id, company_id, package_id, action_code, domain_code, request_status, title, reason, requested_by
    ) VALUES (
      'other-request', 'company-jenfu', 'other-package', 'numbering.release', 'numbering', 'pending', 'Other', '', 'phase1h-engineer'
    )
  `).run();
  database.prepare(`
    INSERT INTO approval_platform_targets (id, request_id, target_type, target_id, target_label)
    VALUES ('other-target', 'other-request', 'drawing', 'other', 'Other')
  `).run();
  try {
    database.prepare("DELETE FROM approval_platform_targets WHERE id = 'other-target'").run();
  } catch (error) {
    otherDomainDeleteBlocked = String(error).includes("APPROVAL_PLATFORM_TARGET_IMMUTABLE");
  }
  record("DEV053-1H-AUTH-009 Phase 1H cleanup exception does not weaken other approval domains", otherDomainDeleteBlocked);
} catch (error) {
  record("DEV053-1H-AUTH-RUNTIME", false, error instanceof Error ? `${error.stack ?? error.message}` : String(error));
} finally {
  await client.close();
}

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id}${result.detail ? ` - ${result.detail}` : ""}`);
}
const passed = results.filter((result) => result.passed).length;
console.log(`DEV-053 Phase 1H authority QC: ${passed}/${results.length} passed`);
if (passed !== results.length) process.exitCode = 1;
