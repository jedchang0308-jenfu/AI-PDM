import fs from "node:fs";
import path from "node:path";
import { canonicalSha256, SharedBomError } from "@/lib/bom-shared-structure";
import { getBomApplicabilityCandidateContractAsync } from "@/lib/bom-create-context";
import { buildSharedReleaseExportFilename, buildSharedReleaseExportRows } from "@/lib/bom-release-export";
import { closeAsyncDatabaseClient, getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncBomWorkbenchRepository } from "@/lib/repositories/bom-workbench-async-repository";
import { AsyncItemInsightRepository } from "@/lib/repositories/item-insight-async-repository";
import { officialItemSnapshot } from "@/lib/transfer-package-phase1d";
import { authorizeSharedBomHttpAsync } from "@/lib/bom-shared-http";
import { resolveSharedBomCapabilityAsync } from "@/lib/bom-create-context";
import { fixture, seedDev096Fixture } from "./dev096-qc-fixture.mjs";

const checks = [];
async function check(cases, label, fn) {
  try {
    const detail = await fn();
    checks.push({ cases, label, pass: true, detail: detail ?? null });
    console.log(`PASS ${label}`);
  } catch (error) {
    const detail = error instanceof SharedBomError
      ? { name: error.name, code: error.code, status: error.status, details: error.details }
      : { name: error?.name ?? "Error", message: error?.message ?? String(error) };
    checks.push({ cases, label, pass: false, detail });
    console.error(`FAIL ${label}: ${JSON.stringify(detail)}`);
    throw error;
  }
}

const fixtureLedger = seedDev096Fixture();
const client = getAsyncDatabaseClient();
const repository = new AsyncBomWorkbenchRepository(client, () => "2026-08-24T04:00:00.000Z");
const insightRepository = new AsyncItemInsightRepository(client);
const logicalLineId = "77777777-7777-4777-8777-777777777777";
let releaseId = "";
let definitionId = "";
let draftId = "";
let nextDraftId = "";
let firstFailure = null;

try {
  await check([38, 43, 44], "create one schema-v2 release with two exact Parent projections", async () => {
    const contract = await getBomApplicabilityCandidateContractAsync({ companyId: fixture.companyId, contextPartNumberId: fixture.parents.red });
    const result = await repository.createSharedDraft({
      companyId: fixture.companyId,
      contextPartNumberId: fixture.parents.red,
      applicableParentPartNumberIds: [fixture.parents.blue, fixture.parents.red],
      bomRevision: "1",
      source: "manual",
      baseReleaseSnapshotId: null,
      actorId: fixture.users.engineer,
      idempotencyKey: "dev096-consumer-create",
      requestFingerprint: canonicalSha256({ consumer: "initial" }).hash,
      selectionEtag: contract.selectionEtag
    });
    definitionId = result.definitionId;
    draftId = result.draft.id;
    const saved = await repository.saveDraftTree({
      draftId,
      actorId: fixture.users.engineer,
      expectedEditorVersion: result.draft.editor_version,
      reason: "consumer fixture mapping",
      lines: [{ id: "consumer-line", logicalLineId, parentLineId: null, nodeType: "item", partNumber: "COLOR CHILD", quantity: 3, sequenceNo: 1 }],
      floatingTopics: [],
      components: [{
        nodeId: "consumer-line",
        logicalLineId,
        nodeLocation: "tree",
        componentMode: "by_parent",
        childPartNumberIds: [fixture.children.blue, fixture.children.red],
        parentSelections: [
          { parentPartNumberId: fixture.parents.blue, childPartNumberId: fixture.children.blue },
          { parentPartNumberId: fixture.parents.red, childPartNumberId: fixture.children.red }
        ]
      }]
    });
    if (!saved || saved.unresolved_mappings?.length) throw new Error("consumer fixture save failed");
    const review = await repository.submitReview({ draftId, actorId: fixture.users.engineer, changeReason: "consumer fixture release" });
    const approved = review ? await repository.approveReview({ reviewId: review.id, actorId: fixture.users.manager }) : null;
    if (!approved?.snapshotId) throw new Error("consumer fixture release failed");
    releaseId = approved.snapshotId;
    const snapshot = await repository.getReleaseSnapshotById(releaseId);
    if (!snapshot || snapshot.resolved_lines?.length !== 2) throw new Error("consumer fixture projection missing");
    return { definitionId, draftId, releaseId, snapshotHash: snapshot.snapshot_hash };
  });

  await check([44, 45], "CSV/XLSX source rows require and isolate an exact Parent", async () => {
    const snapshot = await repository.getReleaseSnapshotById(releaseId);
    if (!snapshot) throw new Error("release not found");
    const red = buildSharedReleaseExportRows(snapshot, fixture.parents.red);
    const blue = buildSharedReleaseExportRows(snapshot, fixture.parents.blue);
    if (red.length !== 2 || blue.length !== 2) throw new Error("export cardinality mismatch");
    if (red[1][2] !== "Z960101" || red[1][3] !== "Z960201") throw new Error(`red export mixed projection: ${JSON.stringify(red)}`);
    if (blue[1][2] !== "Z960102" || blue[1][3] !== "Z960202") throw new Error(`blue export mixed projection: ${JSON.stringify(blue)}`);
    const csv = buildSharedReleaseExportFilename(snapshot, fixture.parents.red, "csv");
    const xlsx = buildSharedReleaseExportFilename(snapshot, fixture.parents.blue, "xlsx");
    if (csv !== "Z960101-BOM-1.csv" || xlsx !== "Z960102-BOM-1.xlsx") throw new Error(`${csv}/${xlsx}`);
    let invalid = false;
    try { buildSharedReleaseExportRows(snapshot, fixture.parents.black); } catch { invalid = true; }
    if (!invalid) throw new Error("non-applicable Parent exported");
    return { red: red[1], blue: blue[1], csv, xlsx };
  });

  await check([47, 48, 51], "where-used is exact per resolved Parent and company scoped", async () => {
    const red = await insightRepository.listWhereUsed({ companyId: fixture.companyId, partNumber: "Z960201" });
    const blue = await insightRepository.listWhereUsed({ companyId: fixture.companyId, partNumber: "Z960202" });
    const other = await insightRepository.listWhereUsed({ companyId: fixture.otherCompanyId, partNumber: "Z960201" });
    if (red.length !== 1 || red[0].parent_part_number !== "Z960101") throw new Error(`red where-used mismatch: ${JSON.stringify(red)}`);
    if (blue.length !== 1 || blue[0].parent_part_number !== "Z960102") throw new Error(`blue where-used mismatch: ${JSON.stringify(blue)}`);
    if (other.length !== 0) throw new Error("cross-company where-used leaked");
    return { redParent: red[0].parent_part_number, blueParent: blue[0].parent_part_number, otherCount: other.length };
  });

  await check([46, 87], "technical-transfer official Part resolves and validates schema-v2 snapshot", async () => {
    const official = await officialItemSnapshot(client, fixture.companyId, {
      id: "dev096-transfer-item",
      packageId: "dev096-transfer-package",
      entityType: "part_number",
      entityId: fixture.parents.red,
      entityCode: "Z960101",
      createdAt: "2026-08-24T04:00:00.000Z"
    });
    if (!official || official.currentControlledVersionId !== releaseId || official.currentControlledVersion !== "1") {
      throw new Error(`transfer snapshot mismatch: ${JSON.stringify(official)}`);
    }
    return { currentControlledVersionId: official.currentControlledVersionId, currentControlledVersion: official.currentControlledVersion };
  });

  await check([39, 81, 86], "next revision list/search and keyset cursor have no duplicate or loss", async () => {
    const contract = await getBomApplicabilityCandidateContractAsync({ companyId: fixture.companyId, contextPartNumberId: fixture.parents.red });
    const next = await repository.createSharedDraft({
      companyId: fixture.companyId,
      contextPartNumberId: fixture.parents.red,
      applicableParentPartNumberIds: [fixture.parents.blue, fixture.parents.red],
      bomRevision: "2",
      source: "manual",
      baseReleaseSnapshotId: releaseId,
      actorId: fixture.users.engineer,
      idempotencyKey: "dev096-consumer-next",
      requestFingerprint: canonicalSha256({ consumer: "next" }).hash,
      selectionEtag: contract.selectionEtag
    });
    nextDraftId = next.draft.id;
    if (next.draft.lines[0]?.logical_line_id !== logicalLineId) throw new Error("next clone lost logical line identity");
    const firstPage = await repository.listWorkbenchRecords({ companyId: fixture.companyId, query: "Z960102", limit: 1 });
    if (firstPage.length !== 1) throw new Error("first cursor page mismatch");
    const first = firstPage[0];
    const secondPage = await repository.listWorkbenchRecords({
      companyId: fixture.companyId,
      query: "Z960102",
      limit: 2,
      cursor: {
        updatedAt: first.updatedAt,
        definitionKey: first.definitionId ?? first.draftId,
        revisionNumber: Number.parseInt(first.bomRevision ?? "0", 10) || 0,
        draftId: first.draftId
      }
    });
    const ids = [first.draftId, ...secondPage.map((record) => record.draftId)];
    if (ids.length !== 2 || new Set(ids).size !== 2 || !ids.includes(draftId) || !ids.includes(nextDraftId)) throw new Error(`cursor mismatch: ${JSON.stringify(ids)}`);
    return { ids };
  });

  await check([49, 50, 51, 52, 78, 79], "central capability and HTTP boundary distinguish 404, 403 and self-decision", async () => {
    const [engineer, manager, manufacturing, outsider] = await Promise.all([
      client.queryOne("SELECT * FROM users WHERE id = :id", { id: fixture.users.engineer }),
      client.queryOne("SELECT * FROM users WHERE id = :id", { id: fixture.users.manager }),
      client.queryOne("SELECT * FROM users WHERE id = :id", { id: fixture.users.manufacturing }),
      client.queryOne("SELECT * FROM users WHERE id = :id", { id: fixture.users.otherEngineer })
    ]);
    if (!engineer || !manager || !manufacturing || !outsider) throw new Error("permission fixture users missing");
    const review = await repository.submitReview({ draftId: nextDraftId, actorId: fixture.users.engineer, changeReason: "permission boundary" });
    if (!review) throw new Error("permission review missing");
    const [editor, reviewer, self, releasedReader] = await Promise.all([
      resolveSharedBomCapabilityAsync({ user: engineer, draftId: nextDraftId, capability: "edit" }),
      resolveSharedBomCapabilityAsync({ user: manager, reviewId: review.id, capability: "decision" }),
      resolveSharedBomCapabilityAsync({ user: engineer, reviewId: review.id, capability: "decision" }),
      resolveSharedBomCapabilityAsync({ user: manufacturing, snapshotId: releaseId, capability: "released_projection_read" })
    ]);
    const cross = await authorizeSharedBomHttpAsync({ user: outsider, draftId: nextDraftId, capability: "edit" });
    const denied = await authorizeSharedBomHttpAsync({ user: manufacturing, draftId: nextDraftId, capability: "edit" });
    const crossBody = cross.response ? await cross.response.json() : null;
    const deniedBody = denied.response ? await denied.response.json() : null;
    if (!editor.authorized || !reviewer.authorized || self.authorized || self.submittedBy !== engineer.id || !releasedReader.authorized) {
      throw new Error("central capability matrix mismatch");
    }
    if (cross.response?.status !== 404 || denied.response?.status !== 403) throw new Error("HTTP denial status mismatch");
    for (const body of [crossBody, deniedBody]) {
      if (!body || typeof body.error !== "string" || typeof body.message !== "string" || typeof body.details !== "object" || typeof body.correlationId !== "string") {
        throw new Error(`structured error missing: ${JSON.stringify(body)}`);
      }
    }
    return { crossStatus: cross.response.status, deniedStatus: denied.response.status, selfSubmittedBy: self.submittedBy };
  });

  await check([84], "feature flag off blocks mutation but keeps schema-v2 consumer reads exact", async () => {
    process.env.PDM_ASSEMBLY_SHARED_BOM_V1 = "false";
    const snapshot = await repository.getReleaseSnapshotById(releaseId);
    const whereUsed = await insightRepository.listWhereUsed({ companyId: fixture.companyId, partNumber: "Z960201" });
    const rows = snapshot ? buildSharedReleaseExportRows(snapshot, fixture.parents.red) : [];
    let mutationBlocked = false;
    try { await getBomApplicabilityCandidateContractAsync({ companyId: fixture.companyId, contextPartNumberId: fixture.parents.red }); }
    catch (error) { mutationBlocked = error instanceof SharedBomError && error.code === "BOM_SHARED_STRUCTURE_DISABLED"; }
    if (!snapshot || whereUsed.length !== 1 || rows.length !== 2 || !mutationBlocked) throw new Error("flag-off read/mutation boundary mismatch");
    return { snapshotId: snapshot.id, whereUsed: whereUsed.length, mutationBlocked };
  });

  await check([46, 47, 48, 87], "corrupt schema-v2 evidence fails closed in release, where-used and transfer consumers", async () => {
    await client.execute("DROP TRIGGER trg_bom_release_shared_evidence_immutable");
    await client.execute("UPDATE bom_release_snapshots SET parent_snapshot_json = '[]' WHERE id = :releaseId", { releaseId });
    const failures = { release: false, whereUsed: false, transfer: false };
    try { await repository.getReleaseSnapshotById(releaseId); } catch (error) { failures.release = error instanceof SharedBomError && error.code === "BOM_RELEASE_SNAPSHOT_INVALID"; }
    try { await insightRepository.listWhereUsed({ companyId: fixture.companyId, partNumber: "Z960201" }); } catch (error) { failures.whereUsed = error instanceof SharedBomError && error.code === "BOM_RELEASE_SNAPSHOT_INVALID"; }
    try {
      await officialItemSnapshot(client, fixture.companyId, {
        id: "dev096-transfer-corrupt", packageId: "dev096-transfer-package", entityType: "part_number",
        entityId: fixture.parents.red, entityCode: "Z960101", createdAt: "2026-08-24T04:00:00.000Z"
      });
    } catch (error) { failures.transfer = error instanceof SharedBomError && error.code === "BOM_RELEASE_SNAPSHOT_INVALID"; }
    if (!Object.values(failures).every(Boolean)) throw new Error(`corruption fallback detected: ${JSON.stringify(failures)}`);
    return failures;
  });
} catch (error) {
  firstFailure = error instanceof Error ? `${error.name}:${error.message}` : String(error);
} finally {
  await closeAsyncDatabaseClient();
}

const result = {
  runner: "consumers",
  status: checks.every((check) => check.pass) && !firstFailure ? "PASS" : "FAIL",
  firstFailure,
  checks,
  fixtureLedger,
  ids: { definitionId, draftId, nextDraftId, releaseId },
  corruptionLedger: releaseId ? [{ table: "bom_release_snapshots", id: releaseId, field: "parent_snapshot_json", injectedValue: "[]" }] : [],
  cases: [...new Set(checks.filter((check) => check.pass).flatMap((check) => check.cases))].sort((a, b) => a - b)
};
const evidenceDir = process.env.DEV096_EVIDENCE_DIR;
if (evidenceDir) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "consumers.json"), `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.filter((check) => check.pass).length, total: checks.length }));
if (result.status !== "PASS") process.exitCode = 1;
