#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev053-read-model-"));
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
  PDM_AUTH_SECRET: "dev053-read-model-secret"
});

let database;
try {
  const [{ getDb }, provider, workbench] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db-async-provider"),
    import("@/lib/drawing-workbench")
  ]);
  database = getDb();
  const now = "2026-08-04T08:00:00.000Z";
  database.prepare(`INSERT INTO users (
      id, display_name, email, role, company_id, account_status, system_role_enabled, created_at, updated_at
    ) VALUES ('dev053-reader', 'DEV-053 Reader', 'dev053-reader@example.invalid', 'Engineer',
      'company-jenfu', 'active', 1, ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
                    VALUES ('dev053-reader', 'company-jenfu', 1, ?)` ).run(now);

  database.prepare(`INSERT INTO numbering_draft_workspaces (
      id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at
    ) VALUES ('dev053-candidate', 'company-jenfu', 'new_bundle', 'active', 'dev053-reader', 'dev053-reader', 1, ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_roots (
      id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
    ) VALUES ('dev053-draft-root', 'company-jenfu', 'dev053-candidate', '候選馬達', 'manufactured',
      'numbering-rule-v3-alpha-root', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_drawings (
      id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description,
      is_primary_manufacturing, created_at, updated_at
    ) VALUES ('dev053-draft-drawing', 'company-jenfu', 'dev053-candidate', 'dev053-draft-root', 'M', '', 1,
      ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO number_candidate_reservations (
      id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code,
      sequence_scope_key, sequence_no, reservation_state, row_version, created_by, created_at, updated_at
    ) VALUES ('dev053-drawing-reservation', 'company-jenfu', 'dev053-candidate', 'drawing', 'dev053-draft-drawing',
      'Z0053-M01', 'dev053:drawings', 1, 'active', 1, 'dev053-reader', ?, ?)` ).run(now, now);
  database.prepare("UPDATE numbering_draft_drawings SET candidate_reservation_id = 'dev053-drawing-reservation' WHERE id = 'dev053-draft-drawing'").run();

  database.prepare(`INSERT INTO part_roots (
      id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at
    ) VALUES ('dev053-master-root', 'company-jenfu', 'Z1053', '正式馬達', 'manufactured', 'Active', 'dev053-reader', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO part_numbers (
      id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind,
      series_code, record_status, created_by, created_at, updated_at
    ) VALUES ('dev053-master-part', 'company-jenfu', 'dev053-master-root', 'Z1053-P01', 1, '01', '正式馬達',
      'manufactured', 'JF', 'Active', 'dev053-reader', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO drawing_numbers (
      id, company_id, part_root_id, drawing_number, purpose_code, sequence_no, is_primary_manufacturing,
      record_status, created_by, created_at, updated_at
    ) VALUES ('dev053-master-drawing', 'company-jenfu', 'dev053-master-root', 'Z1053-M01', 'M', 1, 1,
      'Active', 'dev053-reader', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO drawing_part_links (
      id, drawing_number_id, part_number_id, link_type, created_by, created_at
    ) VALUES ('dev053-master-link', 'dev053-master-drawing', 'dev053-master-part', 'primary_manufacturing', 'dev053-reader', ?)` ).run(now);

  const client = provider.createAsyncDatabaseClient({ kind: "sqlite", database });
  const service = new workbench.DrawingWorkbenchService(client);
  const actor = {
    id: "dev053-reader",
    companyId: "company-jenfu",
    permissions: { workspaceView: true, workspaceUpdate: true, candidateSubmit: true, candidateReview: true, publish: true, createRevision: true }
  };
  const all = await service.list(workbench.normalizeDrawingWorkbenchQuery(new URL("http://local.test/?view=all&limit=50")), actor);
  record("DEV053-READ-001 candidate and formal master use stable disjoint identities",
    all.rows.some((row) => row.rowKey === "candidate:dev053-candidate") &&
    all.rows.some((row) => row.rowKey === "drawing:dev053-master-drawing") &&
    new Set(all.rows.map((row) => row.rowKey)).size === all.rows.length,
    JSON.stringify(all.rows.map((row) => ({ key: row.rowKey, stage: row.stage }))));
  record("DEV053-READ-002 server derives stage, usage and one primary action",
    all.rows.every((row) => row.stage && row.usage && (!row.primaryAction || row.primaryAction.label)) &&
    all.rows.find((row) => row.rowKey === "candidate:dev053-candidate")?.primaryAction?.kind === "complete_first_drawing" &&
    all.rows.find((row) => row.rowKey === "drawing:dev053-master-drawing")?.primaryAction?.kind === "create_revision" &&
    all.rows.find((row) => row.rowKey === "drawing:dev053-master-drawing")?.primaryAction?.label === "圖面進版");

  const filtered = await service.list(workbench.normalizeDrawingWorkbenchQuery(new URL("http://local.test/?view=all&query=Z1053-P01&seriesCode=JF")), actor);
  record("DEV053-READ-003 search and series filter include linked part identity", filtered.rows.length === 1 && filtered.rows[0].rowKey === "drawing:dev053-master-drawing");

  const firstPage = await service.list(workbench.normalizeDrawingWorkbenchQuery(new URL("http://local.test/?view=all&limit=1")), actor);
  const cursor = firstPage.nextCursor;
  const secondPage = await service.list(workbench.normalizeDrawingWorkbenchQuery(new URL(`http://local.test/?view=all&limit=1&cursor=${encodeURIComponent(cursor ?? "")}`)), actor);
  let tamperCode = "";
  let mismatchCode = "";
  try {
    await service.list(workbench.normalizeDrawingWorkbenchQuery(new URL(`http://local.test/?view=all&limit=1&cursor=${encodeURIComponent(`${cursor}x`)}`)), actor);
  } catch (error) { tamperCode = error?.code ?? String(error); }
  try {
    await service.list(workbench.normalizeDrawingWorkbenchQuery(new URL(`http://local.test/?view=work&limit=1&cursor=${encodeURIComponent(cursor ?? "")}`)), actor);
  } catch (error) { mismatchCode = error?.code ?? String(error); }
  record("DEV053-READ-004 bounded keyset pagination has no duplicate and opaque cursor rejects replay",
    Boolean(cursor) && firstPage.rows.length === 1 && secondPage.rows.length === 1 &&
    firstPage.rows[0].rowKey !== secondPage.rows[0].rowKey && secondPage.nextCursor === null &&
    tamperCode === "workbench_invalid_cursor" && mismatchCode === "workbench_invalid_cursor",
    JSON.stringify({ first: firstPage.rows[0]?.rowKey, second: secondPage.rows[0]?.rowKey, tamperCode, mismatchCode }));

  const beforeChanges = database.prepare("SELECT total_changes() AS value").get().value;
  const beforeHash = crypto.createHash("sha256").update(JSON.stringify(database.prepare("SELECT * FROM numbering_draft_workspaces ORDER BY id").all())).digest("hex");
  await service.list(workbench.normalizeDrawingWorkbenchQuery(new URL("http://local.test/?view=all&query=Z")), actor);
  await service.detail("candidate:dev053-candidate", actor);
  await service.detail("drawing:dev053-master-drawing", actor);
  const afterChanges = database.prepare("SELECT total_changes() AS value").get().value;
  const afterHash = crypto.createHash("sha256").update(JSON.stringify(database.prepare("SELECT * FROM numbering_draft_workspaces ORDER BY id").all())).digest("hex");
  record("DEV053-READ-005 list, search and detail are zero-write", beforeChanges === afterChanges && beforeHash === afterHash,
    JSON.stringify({ beforeChanges, afterChanges, beforeHash, afterHash }));

  const noCandidateActor = { ...actor, permissions: { ...actor.permissions, workspaceView: false } };
  const mastersOnly = await service.list(workbench.normalizeDrawingWorkbenchQuery(new URL("http://local.test/?view=all")), noCandidateActor);
  record("DEV053-READ-006 candidate visibility fails closed without workspace permission",
    mastersOnly.rows.every((row) => row.rowKind === "drawing_master") && await service.detail("candidate:dev053-candidate", noCandidateActor) === null);

  const formalFiltered = await service.list(workbench.normalizeDrawingWorkbenchQuery(new URL("http://local.test/?view=all&purposeCode=M&recordStatus=Active")), actor);
  record("DEV053-READ-007 purpose and record-status filters apply to formal drawings without leaking candidates",
    formalFiltered.rows.length === 1 && formalFiltered.rows[0].rowKey === "drawing:dev053-master-drawing" &&
    formalFiltered.rows[0].purposeCode === "M" && formalFiltered.rows[0].recordStatus === "Active" &&
    formalFiltered.rows[0].relatedPartSummary === "Z1053-P01");

  const formalDetail = await service.detail("drawing:dev053-master-drawing", actor);
  record("DEV053-READ-008 formal detail preserves same-root part management and viewer capabilities",
    formalDetail?.drawing?.sameRootParts.some((part) => part.partNumber === "Z1053-P01" && part.primaryDrawingNumber === "Z1053-M01") &&
    formalDetail?.drawing?.linkedPartNumbers.includes("Z1053-P01") &&
    formalDetail?.capabilities.canReviewApprovals === true && formalDetail?.capabilities.canCreateRevision === true);
} catch (error) {
  record("DEV053-READ-fixture", false, error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
} finally {
  try { database?.close(); } catch {}
  const resolved = path.resolve(fixtureRoot);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
