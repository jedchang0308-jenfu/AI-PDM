#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev053-flow-"));
const results = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });

Object.assign(process.env, {
  NODE_ENV: "test",
  PDM_DATA_DIR: fixtureRoot,
  PDM_REPOSITORY_DIR: path.join(fixtureRoot, "repository"),
  PDM_DB_PROVIDER: "sqlite",
  PDM_NUMBER_STATE_FLOW_V1: "true",
  PDM_NUMBER_LIFECYCLE_V2: "true",
  PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
  PDM_PUBLICATION_EVIDENCE_MODE: "local_fake"
});

let database;
try {
  const [dbModule, providerModule, stateModule, lifecycleModule] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db-async-provider"),
    import("@/lib/repositories/number-state-flow-async-repository"),
    import("@/lib/repositories/number-lifecycle-simplification-async-repository")
  ]);
  database = dbModule.getDb();
  const now = "2026-08-04T08:30:00.000Z";
  database.prepare(`INSERT INTO users (
      id, display_name, email, role, company_id, account_status, system_role_enabled, created_at, updated_at
    ) VALUES ('dev053-flow-user', 'DEV-053 Flow', 'dev053-flow@example.invalid', 'R&D Manager',
      'company-jenfu', 'active', 1, ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
                    VALUES ('dev053-flow-user', 'company-jenfu', 1, ?)` ).run(now);
  database.prepare(`INSERT INTO part_roots (
      id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at
    ) VALUES ('dev053-source-root', 'company-jenfu', 'Z2053', '來源馬達', 'manufactured', 'Active',
      'dev053-flow-user', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO drawing_numbers (
      id, company_id, part_root_id, drawing_number, purpose_code, sequence_no, is_primary_manufacturing,
      record_status, created_by, created_at, updated_at
    ) VALUES ('dev053-source-drawing', 'company-jenfu', 'dev053-source-root', 'Z2053-M01', 'M', 1, 1,
      'Active', 'dev053-flow-user', ?, ?)` ).run(now, now);

  const client = providerModule.createAsyncDatabaseClient({ kind: "sqlite", database });
  const stateRepository = new stateModule.AsyncNumberStateFlowRepository(client, () => now, () => crypto.randomUUID());
  const created = await client.transaction((tx) => new stateModule.AsyncNumberStateFlowRepository(tx, () => now, () => crypto.randomUUID()).createWorkspace({
    id: "dev053-append-part",
    companyId: "company-jenfu",
    draftMode: "append_part",
    ownerId: "dev053-flow-user",
    createdBy: "dev053-flow-user",
    sourceRootId: "dev053-source-root",
    sourceDrawingNumberId: "dev053-source-drawing",
    sourcePartNumberId: null,
    sourceLinkType: "primary_manufacturing",
    appendReason: "DEV-053 新增同圖料號",
    root: null,
    parts: [{
      id: "dev053-new-part-draft",
      partName: "來源馬達",
      itemKind: "manufactured",
      isUniversal: false,
      universalReason: null,
      customSpecification: null,
      seriesCode: "JF"
    }],
    drawings: [],
    relations: []
  }));
  record("DEV053-FLOW-001 contextual source is persisted as candidate context",
    created.sourceRootId === "dev053-source-root" && created.sourceDrawingNumberId === "dev053-source-drawing" &&
    created.sourcePartNumberId === null && created.sourceLinkType === "primary_manufacturing" && created.lifecycleStatus === "active");

  const acquired = await client.transaction((tx) => new stateModule.AsyncNumberStateFlowRepository(tx, () => now, () => crypto.randomUUID()).acquireCandidates({
    workspaceId: created.id,
    companyId: "company-jenfu",
    actorId: "dev053-flow-user",
    expectedRowVersion: created.rowVersion
  }));
  record("DEV053-FLOW-002 relationship-only append-part becomes bundle-ready without a drawing draft",
    acquired.reservations.length === 1 && acquired.reservations[0].itemType === "part" &&
    acquired.drawings.length === 0 && acquired.lifecycleV2?.stage === "bundle_ready",
    JSON.stringify({ stage: acquired.lifecycleV2?.stage, reservations: acquired.reservations }));

  const submitted = await client.transaction((tx) => new lifecycleModule.AsyncNumberLifecycleSimplificationRepository(tx, () => now, () => crypto.randomUUID()).submitBundleReview({
    workspaceId: acquired.id,
    companyId: "company-jenfu",
    actorId: "dev053-flow-user",
    expectedWorkspaceRowVersion: acquired.rowVersion,
    reason: "AI isolated source-link validation"
  }));
  record("DEV053-FLOW-003 candidate bundle review locks the source-linked reservation",
    submitted.workspace.lifecycleV2?.stage === "in_review" && submitted.workspace.reservations.every((item) => item.state === "review_locked"),
    submitted.requestId);

  const beforeFault = {
    parts: database.prepare("SELECT count(*) AS count FROM part_numbers WHERE part_root_id = 'dev053-source-root'").get().count,
    links: database.prepare("SELECT count(*) AS count FROM drawing_part_links WHERE drawing_number_id = 'dev053-source-drawing'").get().count
  };
  const failedDecision = await client.transaction((tx) => new lifecycleModule.AsyncNumberLifecycleSimplificationRepository(
    tx,
    () => now,
    () => crypto.randomUUID(),
    (point) => { if (point === "after_formal_master_promotion") throw new lifecycleModule.NumberLifecycleRepositoryFault(point); }
  ).decideBundleReview({
    requestId: submitted.requestId,
    companyId: "company-jenfu",
    actorId: "dev053-flow-user",
    actorRole: "R&D Manager",
    decision: "approved",
    comment: "isolated fault rollback"
  }));
  const afterFault = {
    parts: database.prepare("SELECT count(*) AS count FROM part_numbers WHERE part_root_id = 'dev053-source-root'").get().count,
    links: database.prepare("SELECT count(*) AS count FROM drawing_part_links WHERE drawing_number_id = 'dev053-source-drawing'").get().count
  };
  record("DEV053-FLOW-004 source-link formalization fault rolls back all new formal rows",
    failedDecision.applyFailed === true && JSON.stringify(beforeFault) === JSON.stringify(afterFault),
    JSON.stringify({ beforeFault, afterFault }));

  const retried = await client.transaction((tx) => new lifecycleModule.AsyncNumberLifecycleSimplificationRepository(tx, () => now, () => crypto.randomUUID()).retryBundleApply({
    requestId: submitted.requestId,
    companyId: "company-jenfu",
    actorId: "dev053-flow-user"
  }));
  const promotedPart = database.prepare(`SELECT part.id, part.part_number, link.link_type, link.drawing_number_id
      FROM part_numbers part
      JOIN drawing_part_links link ON link.part_number_id = part.id
      WHERE part.part_root_id = 'dev053-source-root' AND link.drawing_number_id = 'dev053-source-drawing'`).get();
  record("DEV053-FLOW-005 retry atomically creates the new part and cross-boundary relation once",
    retried.workspace.lifecycleStatus === "published" && promotedPart?.link_type === "primary_manufacturing" &&
    database.prepare("SELECT count(*) AS count FROM part_numbers WHERE part_root_id = 'dev053-source-root'").get().count === 1 &&
    database.prepare("SELECT count(*) AS count FROM drawing_part_links WHERE drawing_number_id = 'dev053-source-drawing'").get().count === 1,
    JSON.stringify(promotedPart));
  record("DEV053-FLOW-006 existing source root and drawing identities are preserved",
    database.prepare("SELECT count(*) AS count FROM part_roots WHERE id = 'dev053-source-root'").get().count === 1 &&
    database.prepare("SELECT count(*) AS count FROM drawing_numbers WHERE id = 'dev053-source-drawing'").get().count === 1 &&
    retried.workspace.sourceDrawingNumberId === "dev053-source-drawing");

  let crossCompanyCode = "";
  const beforeInvalid = database.prepare("SELECT count(*) AS count FROM numbering_draft_workspaces").get().count;
  try {
    await stateRepository.createWorkspace({
      id: "dev053-cross-company",
      companyId: "company-maxima",
      draftMode: "append_part",
      ownerId: "dev053-flow-user",
      createdBy: "dev053-flow-user",
      sourceRootId: "dev053-source-root",
      sourceDrawingNumberId: "dev053-source-drawing",
      sourcePartNumberId: null,
      sourceLinkType: "reference",
      appendReason: "must fail",
      root: null,
      parts: [{ id: "dev053-cross-part", partName: "blocked", itemKind: "manufactured", isUniversal: false, universalReason: null, customSpecification: null, seriesCode: null }],
      drawings: [],
      relations: []
    });
  } catch (error) { crossCompanyCode = String(error?.message ?? error); }
  const afterInvalid = database.prepare("SELECT count(*) AS count FROM numbering_draft_workspaces").get().count;
  record("DEV053-FLOW-007 cross-company source context fails before any workspace write",
    crossCompanyCode === "SOURCE_ROOT_NOT_FOUND" && beforeInvalid === afterInvalid,
    JSON.stringify({ crossCompanyCode, beforeInvalid, afterInvalid }));
} catch (error) {
  record("DEV053-FLOW-fixture", false, error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
} finally {
  try { database?.close(); } catch {}
  const resolved = path.resolve(fixtureRoot);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
