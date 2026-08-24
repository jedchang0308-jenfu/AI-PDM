import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { closeAsyncDatabaseClient, getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getBomApplicabilityCandidateContractAsync } from "@/lib/bom-create-context";
import { canonicalSha256, type SharedBomError } from "@/lib/bom-shared-structure";
import {
  AsyncBomWorkbenchRepository,
  type BomWorkbenchTransactionCheckpoint,
  type BomWorkbenchTransactionCheckpointHandler
} from "@/lib/repositories/bom-workbench-async-repository";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { fixture, seedDev096Fixture } from "./dev096-qc-fixture.mjs";

type Check = { cases: number[]; label: string; pass: boolean; detail: unknown };
type CheckpointEvidence = { command: string; point: string; before: string; after: string; reached: boolean };

const checks: Check[] = [];
const checkpointEvidence: CheckpointEvidence[] = [];
const client = getAsyncDatabaseClient();
const fixtureLedger = seedDev096Fixture();
const now = () => "2026-08-24T06:00:00.000Z";
const logicalLineId = "66666666-6666-4666-8666-666666666666";
const SHARED_TABLES = [
  "bom_definitions", "bom_definition_parent_bindings", "bom_drafts", "bom_draft_parent_bindings",
  "bom_lines_tree", "bom_draft_floating_topics", "bom_draft_component_nodes",
  "bom_draft_component_candidates", "bom_draft_parent_selections", "bom_create_effects",
  "bom_review_requests", "bom_release_snapshots", "bom_release_parent_snapshots",
  "bom_release_resolved_lines", "bom_reconfirmation_flags", "bom_edit_events", "audit_logs",
  "platform_outbox_events"
];
const NUMBERING_TABLES = [
  "numbering_sequences", "part_roots", "part_numbers", "drawing_numbers", "drawing_part_links",
  "drawings", "pdm_workbench_aggregates", "canonical_workbench_states", "drawing_rd_branches",
  "drawing_revision_claims", "drawing_revisions", "drawing_revision_works", "audit_logs"
];

function detailOf(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const shared = error as SharedBomError;
  return { name: error.name, message: error.message, code: shared.code, status: shared.status, details: shared.details };
}

async function check(cases: number[], label: string, fn: () => Promise<unknown>) {
  try {
    const detail = await fn();
    checks.push({ cases, label, pass: true, detail: detail ?? null });
    console.log(`PASS ${label}`);
  } catch (error) {
    checks.push({ cases, label, pass: false, detail: detailOf(error) });
    console.error(`FAIL ${label}: ${JSON.stringify(detailOf(error))}`);
    throw error;
  }
}

async function tableDigest(database: AsyncDatabaseClient, tables: string[]) {
  const manifest: Record<string, string> = {};
  for (const table of tables) {
    const rows = await database.query<Record<string, unknown>>(`SELECT * FROM ${table}`);
    const stableRows = rows.map((row) => canonicalSha256(row).json).sort((left, right) => left.localeCompare(right, "en"));
    manifest[table] = canonicalSha256(stableRows).hash;
  }
  return canonicalSha256(manifest).hash;
}

async function expectRollback(input: {
  command: string;
  point: string;
  tables: string[];
  invoke: (markReached: () => void) => Promise<unknown>;
}) {
  const before = await tableDigest(client, input.tables);
  let reached = false;
  let injected = false;
  try {
    await input.invoke(() => { reached = true; });
  } catch (error) {
    injected = error instanceof Error && error.message === `DEV096_INJECTED:${input.command}:${input.point}`;
    if (!injected) throw error;
  }
  const after = await tableDigest(client, input.tables);
  checkpointEvidence.push({ command: input.command, point: input.point, before, after, reached });
  if (!injected || !reached || before !== after) {
    throw new Error(`FAULT_ROLLBACK_MISMATCH:${JSON.stringify({ command: input.command, point: input.point, injected, reached, before, after })}`);
  }
}

function bomFaultHandler(command: string, target: BomWorkbenchTransactionCheckpoint, markReached: () => void): BomWorkbenchTransactionCheckpointHandler {
  return async (point, context) => {
    if (point !== target || (context.command && context.command !== command)) return;
    markReached();
    throw new Error(`DEV096_INJECTED:${command}:${target}`);
  };
}

function sharedCreateInput(contract: Awaited<ReturnType<typeof getBomApplicabilityCandidateContractAsync>>, idempotencyKey: string) {
  const parentIds = [fixture.parents.blue, fixture.parents.red].sort((left, right) => left.localeCompare(right, "en"));
  const payload = { context: fixture.parents.red, parentIds, revision: "1", base: null };
  return {
    companyId: fixture.companyId,
    contextPartNumberId: fixture.parents.red,
    applicableParentPartNumberIds: parentIds,
    bomRevision: "1",
    source: "manual" as const,
    baseReleaseSnapshotId: null,
    actorId: fixture.users.engineer,
    idempotencyKey,
    requestFingerprint: canonicalSha256(payload).hash,
    selectionEtag: contract.selectionEtag
  };
}

function saveInput(draft: NonNullable<Awaited<ReturnType<AsyncBomWorkbenchRepository["getDraftById"]>>>, quantity: number) {
  const nodeId = draft.lines[0]?.id ?? "fault-row";
  return {
    draftId: draft.id,
    actorId: fixture.users.engineer,
    expectedEditorVersion: draft.editor_version,
    reason: `fault save quantity ${quantity}`,
    lines: [{ id: nodeId, logicalLineId, parentLineId: null, nodeType: "item" as const, partNumber: "variant child", revision: null, quantity, sequenceNo: 1 }],
    floatingTopics: [],
    components: [{
      nodeId,
      logicalLineId,
      nodeLocation: "tree" as const,
      componentMode: "by_parent" as const,
      childPartNumberIds: [fixture.children.red, fixture.children.blue],
      parentSelections: [
        { parentPartNumberId: fixture.parents.red, childPartNumberId: fixture.children.red },
        { parentPartNumberId: fixture.parents.blue, childPartNumberId: fixture.children.blue }
      ]
    }]
  };
}

let definitionId = "";
let initialDraftId = "";
let initialSnapshotId = "";
let nextDraftId = "";
let firstFailure: unknown = null;

try {
  await check([1, 2, 4, 5, 21], "numbering named transaction checkpoints roll back every new-root write", async () => {
    const points = ["before_sequence", "after_root", "after_part", "after_drawing", "after_relation"] as const;
    for (const point of points) {
      await expectRollback({
        command: "numbering_create",
        point,
        tables: NUMBERING_TABLES,
        invoke: async (markReached) => {
          const repository = new AsyncNumberingRepository(client, now, () => crypto.randomUUID(), async (candidate) => {
            if (candidate !== point) return;
            markReached();
            throw new Error(`DEV096_INJECTED:numbering_create:${point}`);
          });
          await repository.createNumberingRecord({
            companyId: fixture.companyId,
            coreName: `DEV096 FAULT ${point}`,
            itemKind: "manufactured",
            structureType: "assembly",
            recordStatus: "Draft",
            isUniversal: false,
            drawingPurposeCode: "M",
            drawingPurposeDescription: "Primary manufacturing",
            createdBy: fixture.users.engineer
          });
        }
      });
    }
    return { points };
  });

  const initialContract = await getBomApplicabilityCandidateContractAsync({ companyId: fixture.companyId, contextPartNumberId: fixture.parents.red });
  await check([11, 12, 19, 20, 21], "shared create named checkpoints and different-key contention are atomic", async () => {
    const points: BomWorkbenchTransactionCheckpoint[] = [
      "after_definition", "after_definition_binding", "after_draft", "after_draft_binding_n",
      "after_create_effect", "before_commit"
    ];
    for (const point of points) {
      await expectRollback({
        command: "create",
        point,
        tables: SHARED_TABLES,
        invoke: async (markReached) => {
          const repository = new AsyncBomWorkbenchRepository(client, now, () => crypto.randomUUID(), bomFaultHandler("create", point, markReached));
          await repository.createSharedDraft(sharedCreateInput(initialContract, `fault-create-${point}`));
        }
      });
    }
    const leftInput = sharedCreateInput(initialContract, "different-key-left");
    const rightInput = sharedCreateInput(initialContract, "different-key-right");
    const leftRepository = new AsyncBomWorkbenchRepository(client, now);
    const rightRepository = new AsyncBomWorkbenchRepository(client, now);
    const outcomes = await Promise.allSettled([
      leftRepository.createSharedDraft(leftInput),
      rightRepository.createSharedDraft(rightInput)
    ]);
    const fulfilled = outcomes.filter((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<AsyncBomWorkbenchRepository["createSharedDraft"]>>> => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    if (fulfilled.length !== 1 || rejected.length !== 1) throw new Error(`DIFFERENT_KEY_CONTENTION:${JSON.stringify(outcomes.map((outcome) => outcome.status))}`);
    const winnerInput = outcomes[0].status === "fulfilled" ? leftInput : rightInput;
    const replay = await leftRepository.createSharedDraft(winnerInput);
    if (!replay.replayed || replay.draft.id !== fulfilled[0].value.draft.id) throw new Error("UNKNOWN_RESPONSE_REPLAY_MISMATCH");
    definitionId = fulfilled[0].value.definitionId;
    initialDraftId = fulfilled[0].value.draft.id;
    return { points, definitionId, initialDraftId, loser: detailOf(rejected[0].reason) };
  });

  const normalRepository = new AsyncBomWorkbenchRepository(client, now);
  const createdDraft = await normalRepository.getDraftById(initialDraftId);
  if (!createdDraft) throw new Error("FAULT_CREATED_DRAFT_MISSING");
  const seededDraft = await normalRepository.saveDraftTree(saveInput(createdDraft, 1));
  if (!seededDraft) throw new Error("FAULT_SEEDED_DRAFT_MISSING");

  await check([28, 29, 32], "save named checkpoints preserve the complete old graph and editor CAS", async () => {
    const points: BomWorkbenchTransactionCheckpoint[] = [
      "after_old_graph_delete", "after_tree_insert", "after_component_node", "after_candidate",
      "after_parent_selection", "before_editor_cas"
    ];
    for (const point of points) {
      const baseline = await normalRepository.getDraftById(initialDraftId);
      if (!baseline) throw new Error("SAVE_BASELINE_MISSING");
      await expectRollback({
        command: "save",
        point,
        tables: SHARED_TABLES,
        invoke: async (markReached) => {
          const repository = new AsyncBomWorkbenchRepository(client, now, () => crypto.randomUUID(), bomFaultHandler("save", point, markReached));
          await repository.saveDraftTree(saveInput(baseline, 2));
        }
      });
      const after = await normalRepository.getDraftById(initialDraftId);
      if (!after || after.editor_version !== baseline.editor_version || after.lines[0]?.quantity !== baseline.lines[0]?.quantity) {
        throw new Error(`SAVE_ROLLBACK_READBACK:${point}`);
      }
    }
    const baseline = await normalRepository.getDraftById(initialDraftId);
    if (!baseline) throw new Error("SAVE_COMMIT_BASELINE_MISSING");
    const committed = await normalRepository.saveDraftTree(saveInput(baseline, 2));
    if (!committed || committed.editor_version !== baseline.editor_version + 1 || committed.lines[0]?.quantity !== 2) throw new Error("SAVE_COMMIT_MISMATCH");
    return { points, editorVersion: committed.editor_version };
  });

  await check([34, 35, 37, 77], "submit named checkpoints and stale Part/editor decisions remain zero-partial", async () => {
    const points: BomWorkbenchTransactionCheckpoint[] = ["after_validation", "after_review_insert", "before_draft_status"];
    for (const point of points) {
      await expectRollback({
        command: "submit",
        point,
        tables: SHARED_TABLES,
        invoke: async (markReached) => {
          const repository = new AsyncBomWorkbenchRepository(client, now, () => crypto.randomUUID(), bomFaultHandler("submit", point, markReached));
          await repository.submitReview({ draftId: initialDraftId, actorId: fixture.users.engineer, changeReason: `fault ${point}` });
        }
      });
      const draft = await normalRepository.getDraftById(initialDraftId);
      if (draft?.status !== "Draft" || draft.latest_review) throw new Error(`SUBMIT_ROLLBACK_READBACK:${point}`);
    }
    const review = await normalRepository.submitReview({ draftId: initialDraftId, actorId: fixture.users.engineer, changeReason: "fault matrix complete" });
    if (!review) throw new Error("SUBMIT_COMMIT_MISSING");
    const before = await tableDigest(client, SHARED_TABLES);
    await client.execute("UPDATE bom_definitions SET row_version = row_version + 1 WHERE id = :definitionId", { definitionId });
    let stale = false;
    try { await normalRepository.approveReview({ reviewId: review.id, actorId: fixture.users.manager }); }
    catch (error) { stale = (error as SharedBomError).code === "BOM_REVIEW_SNAPSHOT_STALE"; }
    await client.execute("UPDATE bom_definitions SET row_version = row_version - 1 WHERE id = :definitionId", { definitionId });
    const after = await tableDigest(client, SHARED_TABLES);
    if (!stale || before !== after) throw new Error(`STALE_DECISION_DELTA:${JSON.stringify({ stale, before, after })}`);
    return { points, reviewId: review.id };
  });

  const pendingDraft = await normalRepository.getDraftById(initialDraftId);
  const pendingReview = pendingDraft?.latest_review;
  if (!pendingReview) throw new Error("FAULT_PENDING_REVIEW_MISSING");
  await check([37, 38, 39, 40, 78, 80], "approve named checkpoints and two-reviewer contention publish at most one immutable snapshot", async () => {
    const points: BomWorkbenchTransactionCheckpoint[] = [
      "after_snapshot_header", "after_parent_snapshot", "after_resolved_line", "after_hash",
      "after_prior_obsolete", "before_review_approved"
    ];
    for (const point of points) {
      await expectRollback({
        command: "approve",
        point,
        tables: SHARED_TABLES,
        invoke: async (markReached) => {
          const repository = new AsyncBomWorkbenchRepository(client, now, () => crypto.randomUUID(), bomFaultHandler("approve", point, markReached));
          await repository.approveReview({ reviewId: pendingReview.id, actorId: fixture.users.manager });
        }
      });
      const review = await normalRepository.getReviewById(pendingReview.id);
      const snapshotCount = await client.queryOne<{ count: number | string }>("SELECT COUNT(*) AS count FROM bom_release_snapshots WHERE bom_draft_id = :draftId", { draftId: initialDraftId });
      if (review?.status !== "PendingReview" || Number(snapshotCount?.count) !== 0) throw new Error(`APPROVE_ROLLBACK_READBACK:${point}`);
    }
    const outcomes = await Promise.allSettled([
      new AsyncBomWorkbenchRepository(client, now).approveReview({ reviewId: pendingReview.id, actorId: fixture.users.manager }),
      new AsyncBomWorkbenchRepository(client, now).approveReview({ reviewId: pendingReview.id, actorId: fixture.users.admin })
    ]);
    const fulfilled = outcomes.filter((outcome): outcome is PromiseFulfilledResult<NonNullable<Awaited<ReturnType<AsyncBomWorkbenchRepository["approveReview"]>>>> => outcome.status === "fulfilled");
    if (fulfilled.length !== 1 || outcomes.filter((outcome) => outcome.status === "rejected").length !== 1 || !fulfilled[0].value?.snapshotId) {
      throw new Error(`REVIEWER_CONTENTION:${JSON.stringify(outcomes.map((outcome) => outcome.status))}`);
    }
    initialSnapshotId = fulfilled[0].value.snapshotId;
    return { points, snapshotId: initialSnapshotId, outcomes: outcomes.map((outcome) => outcome.status) };
  });

  await check([39, 70, 71, 73], "next-revision clone line checkpoint rolls back all cloned authority", async () => {
    const contract = await getBomApplicabilityCandidateContractAsync({ companyId: fixture.companyId, contextPartNumberId: fixture.parents.red });
    const parentIds = [fixture.parents.black, fixture.parents.blue, fixture.parents.red].sort((left, right) => left.localeCompare(right, "en"));
    const input = {
      companyId: fixture.companyId,
      contextPartNumberId: fixture.parents.red,
      applicableParentPartNumberIds: parentIds,
      bomRevision: "2",
      source: "manual" as const,
      baseReleaseSnapshotId: initialSnapshotId,
      actorId: fixture.users.engineer,
      idempotencyKey: "fault-next-create",
      requestFingerprint: canonicalSha256({ context: fixture.parents.red, parentIds, revision: "2", base: initialSnapshotId }).hash,
      selectionEtag: contract.selectionEtag
    };
    await expectRollback({
      command: "create",
      point: "after_clone_line",
      tables: SHARED_TABLES,
      invoke: async (markReached) => {
        const repository = new AsyncBomWorkbenchRepository(client, now, () => crypto.randomUUID(), bomFaultHandler("create", "after_clone_line", markReached));
        await repository.createSharedDraft(input);
      }
    });
    const created = await normalRepository.createSharedDraft(input);
    nextDraftId = created.draft.id;
    if (created.draft.base_release_snapshot_id !== initialSnapshotId || created.draft.unresolved_mappings?.length !== 1) throw new Error("NEXT_CLONE_COMMIT_MISMATCH");
    return { nextDraftId, unresolved: created.draft.unresolved_mappings };
  });

  await check([46, 74, 76, 80, 85], "archive, restore, reconfirm and obsolete lifecycle checkpoints are atomic", async () => {
    for (const point of ["after_state_cas", "after_audit", "before_commit"] as BomWorkbenchTransactionCheckpoint[]) {
      await expectRollback({
        command: "archive", point, tables: SHARED_TABLES,
        invoke: async (markReached) => new AsyncBomWorkbenchRepository(client, now, () => crypto.randomUUID(), bomFaultHandler("archive", point, markReached))
          .deleteDraft({ draftId: nextDraftId, actorId: fixture.users.engineer, reason: `fault ${point}` })
      });
    }
    await normalRepository.deleteDraft({ draftId: nextDraftId, actorId: fixture.users.engineer, reason: "archive commit" });
    for (const point of ["after_state_cas", "after_audit", "before_commit"] as BomWorkbenchTransactionCheckpoint[]) {
      await expectRollback({
        command: "restore", point, tables: SHARED_TABLES,
        invoke: async (markReached) => new AsyncBomWorkbenchRepository(client, now, () => crypto.randomUUID(), bomFaultHandler("restore", point, markReached))
          .restoreDraft({ draftId: nextDraftId, actorId: fixture.users.engineer, reason: `fault ${point}` })
      });
    }
    await normalRepository.restoreDraft({ draftId: nextDraftId, actorId: fixture.users.engineer, reason: "restore commit" });
    await client.execute(`INSERT INTO bom_reconfirmation_flags
      (id, company_id, bom_draft_id, old_part_number_id, new_part_number_id, logical_line_id, parent_part_number_id, reference_scope, reason, created_at)
      VALUES ('dev096-fault-reconfirm', :companyId, :draftId, :oldId, :newId, :logicalLineId, :parentId, 'parent_selection', 'fault matrix', :createdAt)`, {
      companyId: fixture.companyId, draftId: nextDraftId, oldId: fixture.children.red, newId: fixture.children.black,
      logicalLineId, parentId: fixture.parents.black, createdAt: now()
    });
    for (const point of ["after_flag_update", "after_audit", "before_commit"] as BomWorkbenchTransactionCheckpoint[]) {
      await expectRollback({
        command: "reconfirm", point, tables: SHARED_TABLES,
        invoke: async (markReached) => new AsyncBomWorkbenchRepository(client, now, () => crypto.randomUUID(), bomFaultHandler("reconfirm", point, markReached))
          .reconfirmReplacementFlags({ draftId: nextDraftId, actorId: fixture.users.engineer, note: `fault ${point}` })
      });
    }
    await normalRepository.reconfirmReplacementFlags({ draftId: nextDraftId, actorId: fixture.users.engineer, note: "reconfirm commit" });

    for (const point of ["after_state_cas", "after_audit", "before_commit"] as BomWorkbenchTransactionCheckpoint[]) {
      await expectRollback({
        command: "obsolete_request", point, tables: SHARED_TABLES,
        invoke: async (markReached) => new AsyncBomWorkbenchRepository(client, now, () => crypto.randomUUID(), bomFaultHandler("obsolete_request", point, markReached))
          .requestObsoleteReview({ draftId: initialDraftId, actorId: fixture.users.engineer, reason: `fault ${point}` })
      });
    }
    const obsoleteReview = await normalRepository.requestObsoleteReview({ draftId: initialDraftId, actorId: fixture.users.engineer, reason: "obsolete commit" });
    if (!obsoleteReview) throw new Error("OBSOLETE_REVIEW_MISSING");
    for (const point of ["after_state_cas", "after_audit", "before_commit"] as BomWorkbenchTransactionCheckpoint[]) {
      await expectRollback({
        command: "obsolete_approve", point, tables: SHARED_TABLES,
        invoke: async (markReached) => new AsyncBomWorkbenchRepository(client, now, () => crypto.randomUUID(), bomFaultHandler("obsolete_approve", point, markReached))
          .approveReview({ reviewId: obsoleteReview.id, actorId: fixture.users.manager })
      });
    }
    await normalRepository.approveReview({ reviewId: obsoleteReview.id, actorId: fixture.users.manager });
    return { lifecycleCommands: ["archive", "restore", "reconfirm", "obsolete_request", "obsolete_approve"] };
  });

  await check([21, 32, 35, 37, 38, 40, 46, 74, 76, 80], "fault matrix reached every required product checkpoint with no partial delta", async () => {
    const required = new Set([
      "numbering_create:before_sequence", "numbering_create:after_root", "numbering_create:after_part", "numbering_create:after_drawing", "numbering_create:after_relation",
      "create:after_definition", "create:after_definition_binding", "create:after_draft", "create:after_draft_binding_n", "create:after_clone_line", "create:after_create_effect", "create:before_commit",
      "save:after_old_graph_delete", "save:after_tree_insert", "save:after_component_node", "save:after_candidate", "save:after_parent_selection", "save:before_editor_cas",
      "submit:after_validation", "submit:after_review_insert", "submit:before_draft_status",
      "approve:after_snapshot_header", "approve:after_parent_snapshot", "approve:after_resolved_line", "approve:after_hash", "approve:after_prior_obsolete", "approve:before_review_approved",
      "archive:after_state_cas", "archive:after_audit", "archive:before_commit",
      "restore:after_state_cas", "restore:after_audit", "restore:before_commit",
      "reconfirm:after_flag_update", "reconfirm:after_audit", "reconfirm:before_commit",
      "obsolete_request:after_state_cas", "obsolete_request:after_audit", "obsolete_request:before_commit",
      "obsolete_approve:after_state_cas", "obsolete_approve:after_audit", "obsolete_approve:before_commit"
    ]);
    const actual = new Set(checkpointEvidence.filter((entry) => entry.reached && entry.before === entry.after).map((entry) => `${entry.command}:${entry.point}`));
    const missing = [...required].filter((entry) => !actual.has(entry));
    if (missing.length) throw new Error(`FAULT_POINTS_MISSING:${JSON.stringify(missing)}`);
    const foreignKeys = await client.query<Record<string, unknown>>("PRAGMA foreign_key_check");
    if (foreignKeys.length) throw new Error(`FAULT_FOREIGN_KEYS:${JSON.stringify(foreignKeys)}`);
    return { required: required.size, proven: actual.size, foreignKeyViolations: 0 };
  });
} catch (error) {
  firstFailure = detailOf(error);
} finally {
  await closeAsyncDatabaseClient();
}

const failed = checks.filter((item) => !item.pass);
const result = {
  runner: "faults",
  status: failed.length || firstFailure ? "FAIL" : "PASS",
  firstFailure,
  productionWrites: false,
  checks,
  checkpointEvidence,
  fixtureLedger,
  ids: { definitionId, initialDraftId, initialSnapshotId, nextDraftId },
  cases: [...new Set(checks.filter((item) => item.pass).flatMap((item) => item.cases))].sort((left, right) => left - right)
};
if (process.env.DEV096_EVIDENCE_DIR) {
  fs.mkdirSync(process.env.DEV096_EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.DEV096_EVIDENCE_DIR, "faults.json"), `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.length - failed.length, total: checks.length, checkpoints: checkpointEvidence.length }));
if (result.status !== "PASS") process.exitCode = 1;
