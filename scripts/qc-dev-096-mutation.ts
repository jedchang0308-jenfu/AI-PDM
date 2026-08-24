import fs from "node:fs";
import path from "node:path";
import { getAsyncDatabaseClient, closeAsyncDatabaseClient } from "@/lib/db-async-provider";
import { getBomApplicabilityCandidateContractAsync } from "@/lib/bom-create-context";
import { canonicalSha256, SharedBomError } from "@/lib/bom-shared-structure";
import {
  AsyncBomWorkbenchRepository,
  BomCreateIdempotencyConflictError,
  BomDraftEditorVersionConflictError
} from "@/lib/repositories/bom-workbench-async-repository";
import { fixture, seedDev096Fixture } from "./dev096-qc-fixture.mjs";

type Check = { cases: number[]; label: string; pass: boolean; detail: unknown };
const checks: Check[] = [];
function errorDetail(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  return {
    name: error.name,
    message: error.message,
    ...(error instanceof SharedBomError ? { code: error.code, status: error.status, details: error.details } : {})
  };
}
async function check(cases: number[], label: string, fn: () => Promise<unknown>) {
  try { const detail = await fn(); checks.push({ cases, label, pass: true, detail: detail ?? null }); console.log(`PASS ${label}`); }
  catch (error) { const detail = errorDetail(error); checks.push({ cases, label, pass: false, detail }); console.error(`FAIL ${label}: ${JSON.stringify(detail)}`); throw error; }
}

const fixtureLedger = seedDev096Fixture();
const client = getAsyncDatabaseClient();
const repository = new AsyncBomWorkbenchRepository(client, () => "2026-08-24T02:00:00.000Z");
const logicalLineId = "55555555-5555-4555-8555-555555555555";
let firstDraftId = "";
let definitionId = "";
let firstSnapshotId = "";
let nextDraftId = "";
let nextSnapshotId = "";
let firstFailure: string | null = null;

try {
  await check([11, 12, 13, 14, 15, 16, 17, 18, 69], "candidate contract locks current Parent and suggests exact initial revision", async () => {
    const contract = await getBomApplicabilityCandidateContractAsync({ companyId: fixture.companyId, contextPartNumberId: fixture.parents.red });
    const current = contract.candidates.find((candidate) => candidate.partNumberId === fixture.parents.red);
    const noM = contract.candidates.find((candidate) => candidate.partNumberId === "dev096-no-m-parent");
    const single = contract.candidates.find((candidate) => candidate.partNumberId === "dev096-single-parent");
    if (contract.mode !== "initial" || contract.suggestedBomRevision !== "1" || !current?.selected || !current.selectable) throw new Error("initial candidate mismatch");
    if (noM?.selectable || single?.selectable) throw new Error("negative candidate became selectable");
    return { selectionEtag: contract.selectionEtag, candidateCount: contract.candidates.length };
  });

  await check([11, 12, 14, 19, 20, 21, 22], "two concurrent creates yield one commit and an idempotent replay", async () => {
    const contract = await getBomApplicabilityCandidateContractAsync({ companyId: fixture.companyId, contextPartNumberId: fixture.parents.red });
    const parentIds = [fixture.parents.blue, fixture.parents.red];
    const payload = { context: fixture.parents.red, parentIds: [...parentIds].sort(), revision: "1", base: null };
    const input = {
      companyId: fixture.companyId,
      contextPartNumberId: fixture.parents.red,
      applicableParentPartNumberIds: parentIds,
      bomRevision: "1",
      source: "manual" as const,
      baseReleaseSnapshotId: null,
      actorId: fixture.users.engineer,
      idempotencyKey: "dev096-initial-create",
      requestFingerprint: canonicalSha256(payload).hash,
      selectionEtag: contract.selectionEtag
    };
    const [left, right] = await Promise.all([repository.createSharedDraft(input), repository.createSharedDraft(input)]);
    if (left.draft.id !== right.draft.id || Number(left.replayed) + Number(right.replayed) !== 1) throw new Error("concurrent idempotency mismatch");
    firstDraftId = left.draft.id;
    definitionId = left.definitionId;
    const counts = await client.queryOne<{ definitions: number; drafts: number; bindings: number; effects: number }>(`
      SELECT
        (SELECT COUNT(*) FROM bom_definitions WHERE id = :definitionId) AS definitions,
        (SELECT COUNT(*) FROM bom_drafts WHERE definition_id = :definitionId) AS drafts,
        (SELECT COUNT(*) FROM bom_draft_parent_bindings WHERE bom_draft_id = :draftId) AS bindings,
        (SELECT COUNT(*) FROM bom_create_effects WHERE idempotency_key = 'dev096-initial-create') AS effects
    `, { definitionId, draftId: firstDraftId });
    if (Number(counts?.definitions) !== 1 || Number(counts?.drafts) !== 1 || Number(counts?.bindings) !== 2 || Number(counts?.effects) !== 1) throw new Error(JSON.stringify(counts));
    let conflict = false;
    try { await repository.createSharedDraft({ ...input, requestFingerprint: "different" }); }
    catch (error) { conflict = error instanceof BomCreateIdempotencyConflictError; }
    if (!conflict) throw new Error("same key/different payload did not conflict");
    return { draftId: firstDraftId, definitionId, counts };
  });

  await check([23, 24, 25, 26, 27, 28, 29, 31, 32, 33], "tree and mapping save atomically; incomplete mapping saves but cannot submit", async () => {
    const draft = await repository.getDraftById(firstDraftId);
    if (!draft) throw new Error("draft missing");
    const incomplete = await repository.saveDraftTree({
      draftId: firstDraftId, actorId: fixture.users.engineer, expectedEditorVersion: draft.editor_version, reason: "incomplete mapping",
      lines: [{ id: "first-row", logicalLineId, parentLineId: null, nodeType: "item", partNumber: "variant child", revision: null, quantity: 4, sequenceNo: 1 }],
      floatingTopics: [],
      components: [{ nodeId: "first-row", logicalLineId, nodeLocation: "tree", componentMode: "by_parent", childPartNumberIds: [fixture.children.red, fixture.children.blue], parentSelections: [{ parentPartNumberId: fixture.parents.red, childPartNumberId: fixture.children.red }] }]
    });
    if (!incomplete || incomplete.lines.length !== 1 || incomplete.components?.[0]?.child_part_number_ids.length !== 2 || incomplete.unresolved_mappings?.length !== 1) throw new Error("incomplete save projection mismatch");
    let submitBlocked = false;
    try { await repository.submitReview({ draftId: firstDraftId, actorId: fixture.users.engineer, changeReason: "must block" }); }
    catch (error) { submitBlocked = error instanceof SharedBomError && error.code === "BOM_VARIANT_MAPPING_INCOMPLETE"; }
    if (!submitBlocked) throw new Error("incomplete mapping submit was accepted");
    const stillDraft = await repository.getDraftById(firstDraftId);
    if (stillDraft?.status !== "Draft" || stillDraft.latest_review) throw new Error("partial review mutation");
    return { unresolved: incomplete.unresolved_mappings };
  });

  await check([25, 30, 32, 34, 35, 37, 77, 78, 80], "complete mapping CAS, schema-v2 submit, stale save and self-decision gates", async () => {
    const draft = await repository.getDraftById(firstDraftId);
    if (!draft) throw new Error("draft missing");
    const complete = await repository.saveDraftTree({
      draftId: firstDraftId, actorId: fixture.users.engineer, expectedEditorVersion: draft.editor_version, reason: "complete mapping",
      lines: draft.lines.map((line) => ({ id: line.id, logicalLineId: line.logical_line_id!, parentLineId: line.parent_line_id, nodeType: line.node_type, partNumber: line.part_number, revision: line.revision, groupName: line.group_name, quantity: line.quantity, sequenceNo: line.sequence_no })),
      floatingTopics: [],
      components: [{ nodeId: draft.lines[0].id, logicalLineId, nodeLocation: "tree", componentMode: "by_parent", childPartNumberIds: [fixture.children.red, fixture.children.blue], parentSelections: [
        { parentPartNumberId: fixture.parents.red, childPartNumberId: fixture.children.red },
        { parentPartNumberId: fixture.parents.blue, childPartNumberId: fixture.children.blue }
      ] }]
    });
    let stale = false;
    try { await repository.saveDraftTree({ draftId: firstDraftId, actorId: fixture.users.engineer, expectedEditorVersion: draft.editor_version, reason: "stale", lines: [], floatingTopics: [], components: [] }); }
    catch (error) { stale = error instanceof BomDraftEditorVersionConflictError; }
    if (!stale) throw new Error("stale editor save accepted");
    const review = await repository.submitReview({ draftId: firstDraftId, actorId: fixture.users.engineer, changeReason: "release variant BOM" });
    if (!review || review.review_schema_version !== 2 || !review.review_snapshot_hash) throw new Error("schema-v2 review missing");
    let selfForbidden = false;
    try { await repository.approveReview({ reviewId: review.id, actorId: fixture.users.engineer }); }
    catch (error) { selfForbidden = error instanceof SharedBomError && error.code === "BOM_REVIEW_SELF_DECISION_FORBIDDEN"; }
    if (!selfForbidden) throw new Error("self approve accepted");
    const pending = await repository.getReviewById(review.id);
    if (pending?.status !== "PendingReview") throw new Error("self-decision changed state");
    return { editorVersion: complete?.editor_version, reviewId: review.id, reviewHash: review.review_snapshot_hash };
  });

  await check([38, 40, 43, 44, 47, 48, 52, 57, 79, 80, 87], "approval creates immutable exact per-Parent release evidence", async () => {
    const draft = await repository.getDraftById(firstDraftId);
    const review = draft?.latest_review;
    if (!review) throw new Error("pending review missing");
    const approved = await repository.approveReview({ reviewId: review.id, actorId: fixture.users.manager, decisionReason: "approved" });
    if (!approved?.snapshotId) throw new Error("snapshot missing");
    firstSnapshotId = approved.snapshotId;
    const snapshot = await repository.getReleaseSnapshotById(firstSnapshotId);
    if (!snapshot || snapshot.snapshot_schema_version !== 2 || snapshot.applicable_parents?.length !== 2 || snapshot.resolved_lines?.length !== 2) throw new Error("release evidence cardinality mismatch");
    const byParent = new Map(snapshot.resolved_lines.map((line) => [line.parent_part_number_id, line.child_part_number_id]));
    if (byParent.get(fixture.parents.red) !== fixture.children.red || byParent.get(fixture.parents.blue) !== fixture.children.blue) throw new Error("resolved mapping mismatch");
    let immutable = false;
    try { await client.execute("UPDATE bom_release_snapshots SET mapping_snapshot_json = '[]' WHERE id = :snapshotId", { snapshotId: firstSnapshotId }); }
    catch { immutable = true; }
    if (!immutable) throw new Error("release evidence mutable");
    const outbox = await client.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM platform_outbox_events");
    const audit = await client.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM audit_logs WHERE detail_json LIKE :needle", { needle: `%${definitionId}%` });
    if (Number(outbox?.count) !== 0 || Number(audit?.count) < 3) throw new Error(JSON.stringify({ outbox, audit }));
    return { snapshotId: firstSnapshotId, snapshotHash: snapshot.snapshot_hash, resolved: [...byParent] };
  });

  await check([39, 69, 70, 71, 72, 73, 74, 75, 81], "next revision clones logical identity, adds Parent unresolved, and enforces restorable singleton", async () => {
    const contract = await getBomApplicabilityCandidateContractAsync({ companyId: fixture.companyId, contextPartNumberId: fixture.parents.red });
    if (contract.mode !== "next_revision" || contract.suggestedBomRevision !== "2" || contract.baseReleaseSnapshotId !== firstSnapshotId) throw new Error("next contract mismatch");
    const result = await repository.createSharedDraft({
      companyId: fixture.companyId, contextPartNumberId: fixture.parents.red,
      applicableParentPartNumberIds: [fixture.parents.black, fixture.parents.blue, fixture.parents.red],
      bomRevision: "2", source: "manual", baseReleaseSnapshotId: firstSnapshotId,
      actorId: fixture.users.engineer, idempotencyKey: "dev096-next-create",
      requestFingerprint: canonicalSha256({ next: 2, parents: [fixture.parents.black, fixture.parents.blue, fixture.parents.red].sort() }).hash,
      selectionEtag: contract.selectionEtag
    });
    nextDraftId = result.draft.id;
    if (result.definitionId !== definitionId || result.draft.base_release_snapshot_id !== firstSnapshotId || result.draft.lines[0].logical_line_id !== logicalLineId) throw new Error("clone identity mismatch");
    if (result.draft.unresolved_mappings?.length !== 1 || result.draft.unresolved_mappings[0].parent_part_number_id !== fixture.parents.black) throw new Error("new Parent was guessed");
    const archived = await repository.deleteDraft({ draftId: nextDraftId, actorId: fixture.users.engineer, reason: "archive test" });
    if (archived?.status !== "Archived") throw new Error("archive failed");
    let openBlocked = false;
    try { await getBomApplicabilityCandidateContractAsync({ companyId: fixture.companyId, contextPartNumberId: fixture.parents.red }); }
    catch (error) { openBlocked = error instanceof SharedBomError && error.code === "BOM_OPEN_REVISION_EXISTS"; }
    if (!openBlocked) throw new Error("Archived did not reserve open slot");
    const restored = await repository.restoreDraft({ draftId: nextDraftId, actorId: fixture.users.engineer, reason: "restore test" });
    if (restored?.status !== "Draft") throw new Error("restore failed");
    let activeRetired = false;
    try { await repository.setActiveDraft({ draftId: nextDraftId, actorId: fixture.users.engineer }); }
    catch (error) { activeRetired = error instanceof SharedBomError && error.code === "BOM_OPERATION_RETIRED"; }
    if (!activeRetired) throw new Error("shared set-active accepted");
    return { nextDraftId, logicalLineId, unresolved: result.draft.unresolved_mappings };
  });

  await check([32, 33, 39, 46, 70, 76, 77, 85], "next revision completes, reconfirm only acknowledges, then whole Definition obsoletes", async () => {
    let draft = await repository.getDraftById(nextDraftId);
    if (!draft?.components?.[0]) throw new Error("next component missing");
    const component = draft.components[0];
    draft = await repository.saveDraftTree({
      draftId: nextDraftId, actorId: fixture.users.engineer, expectedEditorVersion: draft.editor_version, reason: "map black",
      lines: draft.lines.map((line) => ({ id: line.id, logicalLineId: line.logical_line_id!, parentLineId: line.parent_line_id, nodeType: line.node_type, partNumber: line.part_number, revision: line.revision, groupName: line.group_name, quantity: line.quantity, sequenceNo: line.sequence_no })),
      floatingTopics: [],
      components: [{ nodeId: component.node_id, logicalLineId: component.logical_line_id, nodeLocation: component.node_location, componentMode: component.component_mode, childPartNumberIds: [...component.child_part_number_ids, fixture.children.black], parentSelections: [
        ...component.parent_selections.map((selection) => ({ parentPartNumberId: selection.parent_part_number_id, childPartNumberId: selection.child_part_number_id })),
        { parentPartNumberId: fixture.parents.black, childPartNumberId: fixture.children.black }
      ] }]
    });
    if (!draft || draft.unresolved_mappings?.length) throw new Error("mapping completion failed");
    await client.execute(`INSERT INTO bom_reconfirmation_flags
      (id, company_id, bom_draft_id, old_part_number_id, new_part_number_id, logical_line_id, parent_part_number_id, reference_scope, reason, created_at)
      VALUES ('dev096-reconfirm-flag', :companyId, :draftId, :oldId, :newId, :logicalLineId, :parentId, 'parent_selection', 'test', :createdAt)`,
      { companyId: fixture.companyId, draftId: nextDraftId, oldId: fixture.children.black, newId: fixture.children.red, logicalLineId, parentId: fixture.parents.black, createdAt: "2026-08-24T02:00:00.000Z" });
    const mappingBefore = canonicalSha256(draft.components).hash;
    const reconfirmed = await repository.reconfirmReplacementFlags({ draftId: nextDraftId, actorId: fixture.users.engineer, note: "ack only" });
    if (!reconfirmed || reconfirmed.reconfirmation_flags.length || canonicalSha256(reconfirmed.components).hash !== mappingBefore) throw new Error("reconfirm changed mapping");
    const review = await repository.submitReview({ draftId: nextDraftId, actorId: fixture.users.engineer, changeReason: "revision 2" });
    if (!review) throw new Error("next review missing");
    const released = await repository.approveReview({ reviewId: review.id, actorId: fixture.users.manager });
    if (!released?.snapshotId) throw new Error("next release missing");
    nextSnapshotId = released.snapshotId;
    const prior = await client.queryOne<{ obsolete_at: string | null }>("SELECT obsolete_at FROM bom_release_snapshots WHERE id = :id", { id: firstSnapshotId });
    if (!prior?.obsolete_at) throw new Error("prior snapshot not obsoleted");
    const obsoleteReview = await repository.requestObsoleteReview({ draftId: nextDraftId, actorId: fixture.users.manager, reason: "whole definition retirement" });
    if (!obsoleteReview) throw new Error("obsolete review missing");
    await repository.approveReview({ reviewId: obsoleteReview.id, actorId: fixture.users.admin });
    const states = await client.query<{ status: string }>("SELECT status FROM bom_drafts WHERE definition_id = :definitionId", { definitionId });
    if (states.some((row) => row.status === "Released")) throw new Error(JSON.stringify(states));
    return { nextSnapshotId, draftStates: states.map((row) => row.status) };
  });

  await check([51, 60, 80], "all mutations remain company-scoped, FK-clean and outbox-free", async () => {
    const foreignKeys = await client.query<{ table: string }>("PRAGMA foreign_key_check");
    const crossCompany = await client.queryOne<{ count: number }>(`
      SELECT COUNT(*) AS count FROM bom_definition_parent_bindings binding
      JOIN part_numbers part ON part.id = binding.part_number_id
      JOIN bom_definitions definition ON definition.id = binding.definition_id
      WHERE binding.company_id <> part.company_id OR binding.company_id <> definition.company_id
    `);
    const outbox = await client.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM platform_outbox_events");
    if (foreignKeys.length || Number(crossCompany?.count) || Number(outbox?.count)) throw new Error(JSON.stringify({ foreignKeys, crossCompany, outbox }));
    return { foreignKeyViolations: 0, crossCompany: 0, outbox: 0 };
  });
} catch (error) {
  firstFailure = JSON.stringify(errorDetail(error));
} finally {
  await closeAsyncDatabaseClient();
}

const failed = checks.filter((item) => !item.pass);
const result = { runner: "mutation", status: failed.length || firstFailure ? "FAIL" : "PASS", firstFailure, checks, fixtureLedger, ids: { definitionId, firstDraftId, firstSnapshotId, nextDraftId, nextSnapshotId }, cases: [...new Set(checks.filter((item) => item.pass).flatMap((item) => item.cases))].sort((a, b) => a - b) };
if (process.env.DEV096_EVIDENCE_DIR) {
  fs.mkdirSync(process.env.DEV096_EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.DEV096_EVIDENCE_DIR, "mutation.json"), `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.length - failed.length, total: checks.length }));
if (failed.length || firstFailure) process.exitCode = 1;
