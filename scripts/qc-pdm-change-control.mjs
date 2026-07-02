#!/usr/bin/env node

import Database from "better-sqlite3";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const schema = readProjectFile(root, "db/schema.sql");
const serviceSource = readProjectFile(root, "src/lib/pdm-change-control-domain.ts");
const wrapperSource = readProjectFile(root, "src/lib/pdm-change-control.ts");
const apiListRouteSource = readProjectFile(root, "src/app/api/numbering/part-number-drafts/route.ts");
const apiPatchRouteSource = readProjectFile(root, "src/app/api/numbering/part-number-drafts/[draftId]/route.ts");
const apiSubmitRouteSource = readProjectFile(root, "src/app/api/numbering/part-number-drafts/[draftId]/submit-review/route.ts");
const apiVoidRouteSource = readProjectFile(root, "src/app/api/numbering/part-number-drafts/[draftId]/void/route.ts");
const apiRecycleRouteSource = readProjectFile(root, "src/app/api/numbering/part-number-drafts/[draftId]/recycle/route.ts");
const apiRestoreRouteSource = readProjectFile(root, "src/app/api/numbering/part-number-drafts/[draftId]/restore/route.ts");
const apiReconfirmRouteSource = readProjectFile(root, "src/app/api/numbering/part-number-drafts/[draftId]/reconfirm/route.ts");
const fffAssessmentRouteSource = readProjectFile(root, "src/app/api/numbering/drawing-revisions/fff-assessments/route.ts");
const reviewActionHandlerSource = readProjectFile(root, "src/app/api/numbering/reviews/_review-action-handler.ts");
const reviewPendingRouteSource = readProjectFile(root, "src/app/api/numbering/reviews/pending/route.ts");
const reviewConfirmBomRouteSource = readProjectFile(root, "src/app/api/numbering/reviews/[reviewId]/confirm-bom-no-revision/route.ts");
const reviewApproveReleaseRouteSource = readProjectFile(root, "src/app/api/numbering/reviews/[reviewId]/approve-confirmed-impact-release/route.ts");
const bomWorkbenchRepositorySource = readProjectFile(root, "src/lib/repositories/bom-workbench-async-repository.ts");
const bomSubmitReviewRouteSource = readProjectFile(root, "src/app/api/bom/drafts/[draftId]/submit-review/route.ts");
const bomReconfirmReplacementRouteSource = readProjectFile(root, "src/app/api/bom/drafts/[draftId]/reconfirm-replacements/route.ts");
const bomWorkbenchPageSource = readProjectFile(root, "src/app/bom/workbench/page.tsx");
const partDraftPageSource = readProjectFile(root, "src/app/numbering/part-drafts/page.tsx");
const drawingRevisionPageSource = readProjectFile(root, "src/app/numbering/revisions/page.tsx");
const changeReviewPageSource = readProjectFile(root, "src/app/numbering/change-reviews/page.tsx");
const sidebarSource = readProjectFile(root, "src/components/sidebar-nav.tsx");
const navPermissionSource = readProjectFile(root, "src/lib/numbering-permission-codes.ts");
const packageJson = readProjectJson(root, "package.json");
const results = [];
const companyId = "company-jenfu";
const engineer = { userId: "user-qc-rd", companyId, role: "Engineer", roleCodes: ["rd"] };
const manager = { userId: "user-qc-admin", companyId, role: "Admin", roleCodes: ["pdm_admin"] };
const otherUser = { userId: "user-qc-other", companyId, role: "Engineer", roleCodes: ["rd"] };
const fixedNow = "2026-06-24T00:00:00.000Z";
let sequence = 1;

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function assert(name, passed, detail = "") {
  record(name, passed, detail);
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function nextId(prefix) {
  return `${prefix}-${sequence++}`;
}

class TestSqliteClient {
  kind = "sqlite";

  constructor(database) {
    this.database = database;
  }

  async query(sql, params) {
    const statement = this.database.prepare(sql);
    return params ? statement.all(params) : statement.all();
  }

  async queryOne(sql, params) {
    const statement = this.database.prepare(sql);
    return (params ? statement.get(params) : statement.get()) ?? null;
  }

  async execute(sql, params) {
    const statement = this.database.prepare(sql);
    if (params) statement.run(params);
    else statement.run();
  }
}

function catchCode(error) {
  return error && typeof error === "object" && "code" in error ? error.code : String(error);
}

async function expectReject(name, fn, expectedCode) {
  try {
    await fn();
    assert(name, false, "operation unexpectedly succeeded");
  } catch (error) {
    assert(name, catchCode(error) === expectedCode, `expected ${expectedCode}, got ${catchCode(error)}`);
  }
}

function seedUsers(database) {
  database
    .prepare(
      "INSERT INTO users (id, display_name, email, role, company_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING"
    )
    .run(engineer.userId, "QC RD", "qc-rd@example.com", "Engineer", companyId);
  database
    .prepare(
      "INSERT INTO users (id, display_name, email, role, company_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING"
    )
    .run(manager.userId, "QC PDM Admin", "qc-admin@example.com", "Admin", companyId);
  database
    .prepare(
      "INSERT INTO users (id, display_name, email, role, company_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING"
    )
    .run(otherUser.userId, "QC Other", "qc-other@example.com", "Engineer", companyId);
}

function seedFormalPart(database, partNumber, sequenceNo = sequence++) {
  const rootId = nextId("root");
  const partId = nextId("part");
  database
    .prepare(
      `
      INSERT INTO part_roots (
        id, company_id, root_code, core_name, item_kind, development_phase, record_status, rule_version_id, created_by
      ) VALUES (?, ?, ?, ?, 'manufactured', 'DVT', 'Active', 'numbering-rule-v1', ?)
      `
    )
    .run(rootId, companyId, String(sequenceNo).padStart(4, "0"), `QC root ${partNumber}`, engineer.userId);
  database
    .prepare(
      `
      INSERT INTO part_numbers (
        id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
        item_kind, is_universal, development_phase, record_status, rule_version_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'manufactured', 0, 'DVT', 'Active', 'numbering-rule-v1', ?)
      `
    )
    .run(partId, companyId, rootId, partNumber, sequenceNo, String(sequenceNo).padStart(3, "0"), `QC part ${partNumber}`, engineer.userId);
  return { rootId, partId, partNumber };
}

function seedDrawing(database, drawingNumber, sequenceNo = sequence++) {
  const rootId = nextId("drawing-root");
  const drawingId = nextId("drawing");
  database
    .prepare(
      `
      INSERT INTO part_roots (
        id, company_id, root_code, core_name, item_kind, development_phase, record_status, rule_version_id, created_by
      ) VALUES (?, ?, ?, ?, 'manufactured', 'DVT', 'Active', 'numbering-rule-v1', ?)
      `
    )
    .run(rootId, companyId, `D${String(sequenceNo).padStart(3, "0")}`, `QC drawing root ${drawingNumber}`, engineer.userId);
  database
    .prepare(
      `
      INSERT INTO drawing_numbers (
        id, company_id, part_root_id, drawing_number, purpose_code, purpose_description,
        sequence_no, is_primary_manufacturing, development_phase, record_status, rule_version_id, created_by
      ) VALUES (?, ?, ?, ?, 'MA', 'QC MA drawing', 1, 1, 'DVT', 'Active', 'numbering-rule-v1', ?)
      `
    )
    .run(drawingId, companyId, rootId, drawingNumber, engineer.userId);
  return { rootId, drawingId, drawingNumber };
}

function seedBomReference(database, partNumber) {
  const itemId = nextId("item");
  const submissionId = nextId("submission");
  const bomHeaderId = nextId("bom-header");
  const bomLineId = nextId("bom-line");
  database.prepare("INSERT INTO items (id, company_id, part_number, part_name) VALUES (?, ?, ?, ?)").run(
    itemId,
    companyId,
    `ASM-${partNumber}`,
    "QC assembly"
  );
  database
    .prepare(
      `
      INSERT INTO submissions (
        id, company_id, item_id, drawing_number, revision, material, surface_finish, document_type,
        change_description, status, submitted_by
      ) VALUES (?, ?, ?, ?, '1', 'QC material', 'QC finish', 'drawing', 'QC BOM boundary', 'Released', ?)
      `
    )
    .run(submissionId, companyId, itemId, `D-BOM-${partNumber}`, engineer.userId);
  database
    .prepare(
      "INSERT INTO bom_headers (id, parent_item_id, parent_submission_id, parent_revision, status, source, line_count) VALUES (?, ?, ?, '1', 'Draft', 'manual', 1)"
    )
    .run(bomHeaderId, itemId, submissionId);
  database
    .prepare("INSERT INTO bom_lines (id, bom_header_id, line_no, child_part_number, quantity) VALUES (?, ?, 1, ?, 1)")
    .run(bomLineId, bomHeaderId, partNumber);
}

function seedReleasedBomSnapshotReference(database, partNumber) {
  const itemId = nextId("released-bom-item");
  const submissionId = nextId("released-bom-submission");
  const bomHeaderId = nextId("released-bom-header");
  const bomLineId = nextId("released-bom-line");
  database.prepare("INSERT INTO items (id, company_id, part_number, part_name) VALUES (?, ?, ?, ?)").run(
    itemId,
    companyId,
    `ASM-REL-${partNumber}`,
    "QC released assembly"
  );
  database
    .prepare(
      `
      INSERT INTO submissions (
        id, company_id, item_id, drawing_number, revision, material, surface_finish, document_type,
        change_description, status, submitted_by
      ) VALUES (?, ?, ?, ?, '1', 'QC material', 'QC finish', 'drawing', 'QC released BOM immutability', 'Released', ?)
      `
    )
    .run(submissionId, companyId, itemId, `D-REL-BOM-${partNumber}`, engineer.userId);
  database
    .prepare(
      "INSERT INTO bom_headers (id, parent_item_id, parent_submission_id, parent_revision, status, source, line_count) VALUES (?, ?, ?, '1', 'ReleasedSnapshot', 'manual', 1)"
    )
    .run(bomHeaderId, itemId, submissionId);
  database
    .prepare("INSERT INTO bom_lines (id, bom_header_id, line_no, child_part_number, quantity) VALUES (?, ?, 1, ?, 1)")
    .run(bomLineId, bomHeaderId, partNumber);
  return bomHeaderId;
}

function seedUnreleasedBomDraftReference(database, partNumber) {
  const itemId = nextId("draft-item");
  const submissionId = nextId("draft-submission");
  const bomDraftId = nextId("bom-draft");
  const lineId = nextId("bom-tree-line");
  database.prepare("INSERT INTO items (id, company_id, part_number, part_name) VALUES (?, ?, ?, ?)").run(
    itemId,
    companyId,
    `ASM-DRAFT-${partNumber}`,
    "QC draft assembly"
  );
  database
    .prepare(
      `
      INSERT INTO submissions (
        id, company_id, item_id, drawing_number, revision, material, surface_finish, document_type,
        change_description, status, submitted_by
      ) VALUES (?, ?, ?, ?, '1', 'QC material', 'QC finish', 'drawing', 'QC BOM draft boundary', 'Pending', ?)
      `
    )
    .run(submissionId, companyId, itemId, `D-DRAFT-${partNumber}`, engineer.userId);
  database
    .prepare(
      "INSERT INTO bom_drafts (id, parent_item_id, parent_submission_id, parent_revision, draft_name, status, source, is_active, line_count, created_by) VALUES (?, ?, ?, '1', 'QC draft BOM', 'Draft', 'manual', 1, 1, ?)"
    )
    .run(bomDraftId, itemId, submissionId, engineer.userId);
  database
    .prepare("INSERT INTO bom_lines_tree (id, bom_draft_id, node_type, part_number, quantity, sequence_no, source, created_by) VALUES (?, ?, 'item', ?, 1, 1, 'manual', ?)")
    .run(lineId, bomDraftId, partNumber, engineer.userId);
  return bomDraftId;
}

function eventTypes(database, draftId) {
  return database
    .prepare("SELECT event_type FROM part_number_events WHERE part_number_draft_id = ? ORDER BY occurred_at ASC, id ASC")
    .all(draftId)
    .map((row) => row.event_type);
}

const { PdmChangeControlDomainService } = await import(
  pathToFileURL(path.join(root, "src", "lib", "pdm-change-control-domain.ts")).href
);

record("CHG-SRC-001 schema defines part_number_drafts", schema.includes("CREATE TABLE IF NOT EXISTS part_number_drafts"), "db/schema.sql");
record("CHG-SRC-002 schema defines part_number_events", schema.includes("CREATE TABLE IF NOT EXISTS part_number_events"), "db/schema.sql");
record("CHG-SRC-003 schema defines replacement / FFF / review / BOM flag tables", [
  "part_replacement_links",
  "drawing_revision_fff_assessments",
  "review_confirmation_events",
  "bom_reconfirmation_flags"
].every((text) => schema.includes(`CREATE TABLE IF NOT EXISTS ${text}`)), "db/schema.sql");
record("CHG-SRC-004 active draft number unique index exists", schema.includes("idx_part_number_drafts_active_number"), "db/schema.sql");
record("CHG-SRC-005 domain service exposes controlled-boundary functions", [
  "getPartNumberControlBoundary",
  "assertPartNumberDraftIsRecyclable",
  "assertPartNumberDraftCanSubmit",
  "recyclePartNumberDraft",
  "restorePartNumberDraft",
  "listDeletedPartNumberDrafts",
  "getPartNumberDraftLifecyclePolicy",
  "submitPartNumberDraft",
  "listPartNumberDrafts",
  "markSameSourceDraftsNeedReconfirmation",
  "reconfirmPartNumberDraft"
].every((text) => serviceSource.includes(text)), "pdm-change-control-domain.ts");
record("CHG-SRC-006 domain service carries required reason codes", [
  "referenced_by_bom",
  "referenced_by_replacement_link",
  "drawing_uploaded_to_pdm",
  "submitted_for_review"
].every((text) => serviceSource.includes(text)), "pdm-change-control-domain.ts");
record("CHG-SRC-007 wrapper uses async DB provider", wrapperSource.includes("getAsyncDatabaseClient"), "pdm-change-control.ts");
record(
  "CHG-SRC-008 package exposes qc:pdm-change-control",
  packageJson.scripts?.["qc:pdm-change-control"] === "node --experimental-strip-types scripts/qc-pdm-change-control.mjs",
  "package.json"
);
record(
  "CHG-SRC-009 part-number draft API routes exist",
  [
    "GET(request: Request)",
    "POST(request: Request)",
    "PATCH(request: Request",
    "submitPartNumberDraft",
    "voidPartNumberDraft",
    "recyclePartNumberDraft",
    "restorePartNumberDraft",
    "reconfirmPartNumberDraft"
  ].every((text) =>
    [
      apiListRouteSource,
      apiPatchRouteSource,
      apiSubmitRouteSource,
      apiVoidRouteSource,
      apiRecycleRouteSource,
      apiRestoreRouteSource,
      apiReconfirmRouteSource
    ].join("\n").includes(text)
  ),
  "src/app/api/numbering/part-number-drafts"
);
record(
  "CHG-SRC-010 part draft page and nav entry exist",
  partDraftPageSource.includes("料號草稿") &&
    partDraftPageSource.includes("/api/numbering/part-number-drafts") &&
    partDraftPageSource.includes("已刪除資料") &&
    partDraftPageSource.includes("surface=deleted_data") &&
    partDraftPageSource.includes("/restore") &&
    partDraftPageSource.includes("刪除") &&
    partDraftPageSource.includes("還原") &&
    sidebarSource.includes("/numbering/part-drafts") &&
    navPermissionSource.includes('"/numbering/part-drafts": "numbering.tasks"'),
  "src/app/numbering/part-drafts/page.tsx"
);
record("CHG-SRC-011 reconfirm event type is allowed by schema", schema.includes("'draft_reconfirmed'"), "db/schema.sql");
record(
  "CHG-SRC-012 drawing revision FFF API and page exist",
  fffAssessmentRouteSource.includes("submitDrawingRevisionFffAssessment") &&
    drawingRevisionPageSource.includes("Form") &&
    drawingRevisionPageSource.includes("Fit") &&
    drawingRevisionPageSource.includes("Function") &&
    drawingRevisionPageSource.includes("/api/numbering/drawing-revisions/fff-assessments") &&
    sidebarSource.includes("/numbering/revisions") &&
    navPermissionSource.includes('"/numbering/revisions": "numbering.drawings.view"'),
  "src/app/numbering/revisions/page.tsx"
);
record(
  "CHG-SRC-013 FFF assessment stores drawing part-number read/correction values",
  ["replacement_part_number_draft_id", "detected_part_number", "corrected_part_number"].every((column) => schema.includes(column)),
  "db/schema.sql"
);
record(
  "CHG-SRC-014 review action APIs and page exist",
  reviewActionHandlerSource.includes("applyDrawingRevisionReviewAction") &&
    reviewPendingRouteSource.includes("listPendingDrawingRevisionReviews") &&
    reviewConfirmBomRouteSource.includes("confirm_bom_no_revision") &&
    reviewApproveReleaseRouteSource.includes("approve_replacement_part_and_drawing_release") &&
    changeReviewPageSource.includes("/api/numbering/reviews/") &&
    sidebarSource.includes("/numbering/change-reviews") &&
    navPermissionSource.includes('"/numbering/change-reviews": "numbering.approvals"'),
  "src/app/api/numbering/reviews"
);
record(
  "CHG-SRC-015 review release domain supports atomic replacement and BOM flags",
  ["applyDrawingRevisionReviewAction", "createReleasedPartNumberFromDraft", "createBomReconfirmationFlags", "runReleaseTransaction"].every((text) =>
    serviceSource.includes(text)
  ),
  "pdm-change-control-domain.ts"
);
record(
  "CHG-SRC-016 BOM workbench blocks and resolves replacement reconfirmation flags",
  bomWorkbenchRepositorySource.includes("BOM_RECONFIRMATION_REQUIRED") &&
    bomWorkbenchRepositorySource.includes("reconfirmReplacementFlags") &&
    bomSubmitReviewRouteSource.includes("submitBomWorkbenchDraftReviewAsync") &&
    bomReconfirmReplacementRouteSource.includes("reconfirmBomWorkbenchReplacementFlagsAsync") &&
    bomWorkbenchPageSource.includes("reconfirmation_flags") &&
    bomWorkbenchPageSource.includes("已重新確認") &&
    bomWorkbenchPageSource.includes("openReconfirmationFlags.length > 0"),
  "src/app/bom/workbench/page.tsx"
);

const database = new Database(":memory:");
try {
  database.pragma("foreign_keys = ON");
  database.exec(schema);
  seedUsers(database);
  const client = new TestSqliteClient(database);
  const service = new PdmChangeControlDomainService(client, () => fixedNow, () => nextId("chg"));

  const firstDraft = await service.reservePartNumberDraft({
    reservedPartNumber: "P-QC-CHG-001",
    draftType: "replacement_part",
    itemType: "self_made",
    actor: engineer
  });
  assert("CHG-DATA-001 reserve creates draft status and version", firstDraft.status === "draft" && firstDraft.version === 1, JSON.stringify(firstDraft));
  assert(
    "CHG-DATA-002 draft creation appends audit event",
    eventTypes(database, firstDraft.id).includes("draft_created"),
    eventTypes(database, firstDraft.id).join(",")
  );

  await expectReject(
    "CHG-GUARD-001 active draft number cannot be reserved twice",
    () =>
      service.reservePartNumberDraft({
        reservedPartNumber: "P-QC-CHG-001",
        draftType: "new_part",
        itemType: "purchased",
        actor: engineer
      }),
    "reserved_number_already_active_draft"
  );

  const updated = await service.updatePartNumberDraft({
    draftId: firstDraft.id,
    expectedVersion: 1,
    itemType: "purchased",
    useType: "supplier_replace",
    actor: engineer
  });
  assert("CHG-LOCK-001 optimistic update increments version", updated.version === 2 && updated.itemType === "purchased", JSON.stringify(updated));
  await expectReject(
    "CHG-LOCK-002 stale optimistic update is rejected",
    () => service.updatePartNumberDraft({ draftId: firstDraft.id, expectedVersion: 1, itemType: "standard", actor: engineer }),
    "optimistic_lock_conflict"
  );

  const voided = await service.voidPartNumberDraft({ draftId: firstDraft.id, actor: engineer });
  assert(
    "CHG-RECYCLE-001 void schedules seven-day recycle cooling period",
    voided.status === "voided" && voided.recycleAvailableAt === "2026-07-01T00:00:00.000Z",
    JSON.stringify(voided)
  );
  await expectReject(
    "CHG-RECYCLE-002 unrelated user cannot immediately recycle",
    () => service.recyclePartNumberDraft({ draftId: firstDraft.id, actor: otherUser }),
    "draft_recycle_forbidden"
  );
  const recycled = await service.recyclePartNumberDraft({ draftId: firstDraft.id, actor: engineer });
  assert("CHG-RECYCLE-003 creator can immediately recycle eligible voided draft", recycled.recycledAt === fixedNow, JSON.stringify(recycled));
  assert(
    "CHG-RECYCLE-004 recycle events are retained",
    ["draft_voided", "draft_recycle_scheduled", "draft_recycled"].every((eventType) => eventTypes(database, firstDraft.id).includes(eventType)),
    eventTypes(database, firstDraft.id).join(",")
  );
  await expectReject(
    "CHG-RESTORE-001 recycled deleted draft cannot be restored",
    () => service.restorePartNumberDraft({ draftId: firstDraft.id, actor: engineer }),
    "draft_already_recycled"
  );

  const restorableDraft = await service.reservePartNumberDraft({
    reservedPartNumber: "P-QC-CHG-RESTORE",
    draftType: "new_part",
    itemType: "purchased",
    actor: engineer
  });
  const deletedRestorableDraft = await service.voidPartNumberDraft({ draftId: restorableDraft.id, actor: engineer });
  const deletedDrafts = await service.listDeletedPartNumberDrafts({ actor: engineer });
  const deletedDraftListItem = deletedDrafts.find((item) => item.draft.id === restorableDraft.id);
  assert(
    "CHG-RESTORE-002 deleted draft appears on deleted-data surface with restore policy",
    deletedRestorableDraft.status === "voided" &&
      deletedDraftListItem?.policy.uiSurface === "deleted_data" &&
      deletedDraftListItem.policy.actions.restore?.allowed === true,
    JSON.stringify({ deletedRestorableDraft, deletedDraftListItem })
  );
  const restoredDraft = await service.restorePartNumberDraft({ draftId: restorableDraft.id, actor: engineer });
  assert(
    "CHG-RESTORE-003 restore returns draft to editable work list",
    restoredDraft.status === "draft" &&
      restoredDraft.voidedAt === null &&
      restoredDraft.recycleAvailableAt === null &&
      restoredDraft.recycledAt === null,
    JSON.stringify(restoredDraft)
  );
  assert(
    "CHG-RESTORE-004 restore event is retained",
    eventTypes(database, restorableDraft.id).includes("draft_reissued"),
    eventTypes(database, restorableDraft.id).join(",")
  );

  const reusedOriginalDraft = await service.reservePartNumberDraft({
    reservedPartNumber: "P-QC-CHG-REUSED",
    draftType: "new_part",
    itemType: "standard",
    actor: engineer
  });
  await service.voidPartNumberDraft({ draftId: reusedOriginalDraft.id, actor: engineer });
  await service.reservePartNumberDraft({
    reservedPartNumber: "P-QC-CHG-REUSED",
    draftType: "new_part",
    itemType: "standard",
    actor: engineer
  });
  const reusedDeletedDraftPolicy = await service.getPartNumberDraftLifecyclePolicy({ draftId: reusedOriginalDraft.id, actor: engineer });
  assert(
    "CHG-RESTORE-005 reused deleted draft policy blocks restore",
    reusedDeletedDraftPolicy.actions.restore?.allowed === false &&
      reusedDeletedDraftPolicy.actions.restore.reasonCode === "LIFE_DRAFT_NUMBER_REUSED",
    JSON.stringify(reusedDeletedDraftPolicy)
  );
  await expectReject(
    "CHG-RESTORE-006 reused deleted draft cannot be restored",
    () => service.restorePartNumberDraft({ draftId: reusedOriginalDraft.id, actor: engineer }),
    "draft_number_reused"
  );

  const submittedDraft = await service.reservePartNumberDraft({
    reservedPartNumber: "P-QC-CHG-002",
    draftType: "new_part",
    itemType: "purchased",
    actor: engineer
  });
  const submitted = await service.submitPartNumberDraft({ draftId: submittedDraft.id, actor: engineer });
  const submittedBoundary = await service.getPartNumberControlBoundary(submitted.id, engineer);
  assert(
    "CHG-SUBMIT-001 submit moves draft to pending review and controlled boundary",
    submitted.status === "pending_review" && submittedBoundary.reasons.includes("submitted_for_review"),
    JSON.stringify({ submitted, submittedBoundary })
  );

  const selfMadeDraft = await service.reservePartNumberDraft({
    reservedPartNumber: "P-QC-CHG-003",
    draftType: "replacement_part",
    itemType: "self_made",
    actor: engineer
  });
  await expectReject(
    "CHG-SUBMIT-002 self-made replacement without drawing is blocked",
    () => service.submitPartNumberDraft({ draftId: selfMadeDraft.id, actor: engineer }),
    "self_made_source_drawing_required"
  );

  const bomDraft = await service.reservePartNumberDraft({
    reservedPartNumber: "P-QC-CHG-004",
    draftType: "new_part",
    itemType: "standard",
    actor: engineer
  });
  seedBomReference(database, "P-QC-CHG-004");
  await expectReject(
    "CHG-BOUNDARY-001 BOM reference blocks recycle",
    () => service.voidPartNumberDraft({ draftId: bomDraft.id, actor: engineer }),
    "controlled_boundary_recycle_blocked"
  );
  const bomBoundary = await service.getPartNumberControlBoundary(bomDraft.id, engineer);
  assert("CHG-BOUNDARY-002 BOM reason is reported", bomBoundary.reasons.includes("referenced_by_bom"), JSON.stringify(bomBoundary));

  const drawing = seedDrawing(database, "D-QC-CHG-MA1");
  database
    .prepare(
      `
      INSERT INTO file_assets (
        id, storage_provider, file_name, file_ext, linked_entity_type, linked_entity_id, document_category, display_name
      ) VALUES (?, 'j_drive', 'D-QC-CHG-MA1.pdf', 'pdf', 'drawing_number', ?, 'engineering_drawing', 'QC drawing')
      `
    )
    .run(nextId("asset"), drawing.drawingId);
  const drawingBoundaryDraft = await service.reservePartNumberDraft({
    reservedPartNumber: "P-QC-CHG-005",
    draftType: "drawing_revision_generated",
    itemType: "self_made",
    sourceDrawingNumberId: drawing.drawingId,
    actor: engineer
  });
  const drawingBoundary = await service.getPartNumberControlBoundary(drawingBoundaryDraft.id, engineer);
  assert(
    "CHG-BOUNDARY-003 drawing upload reason is reported",
    drawingBoundary.reasons.includes("drawing_uploaded_to_pdm"),
    JSON.stringify(drawingBoundary)
  );

  const oldPart = seedFormalPart(database, "P-QC-OLD-001");
  const newPart = seedFormalPart(database, "P-QC-NEW-001");
  database
    .prepare(
      `
      INSERT INTO part_replacement_links (
        id, company_id, old_part_number_id, new_part_number_id, reason_category, fff_summary_json, released_by
      ) VALUES (?, ?, ?, ?, 'FFF change', '{}', ?)
      `
    )
    .run(nextId("replacement"), companyId, oldPart.partId, newPart.partId, manager.userId);
  const replacementBoundaryDraft = await service.reservePartNumberDraft({
    reservedPartNumber: "P-QC-OLD-001-DRAFT",
    draftType: "replacement_part",
    itemType: "purchased",
    actor: engineer
  });
  database
    .prepare(
      "UPDATE part_number_drafts SET reserved_part_number = ? WHERE id = ?"
    )
    .run("P-QC-NEW-001", replacementBoundaryDraft.id);
  const replacementBoundary = await service.getPartNumberControlBoundary(replacementBoundaryDraft.id, engineer);
  assert(
    "CHG-BOUNDARY-004 formal replacement link reason is reported",
    replacementBoundary.reasons.includes("formal_part_exists") &&
      replacementBoundary.reasons.includes("referenced_by_replacement_link"),
    JSON.stringify(replacementBoundary)
  );

  const sameSourcePart = seedFormalPart(database, "P-QC-SAME-SOURCE-001");
  const sameSourceA = await service.reservePartNumberDraft({
    reservedPartNumber: "P-QC-SAME-A",
    draftType: "replacement_part",
    itemType: "purchased",
    sourcePartNumberId: sameSourcePart.partId,
    actor: engineer
  });
  const sameSourceB = await service.reservePartNumberDraft({
    reservedPartNumber: "P-QC-SAME-B",
    draftType: "replacement_part",
    itemType: "standard",
    sourcePartNumberId: sameSourcePart.partId,
    actor: engineer
  });
  const listedDrafts = await service.listPartNumberDrafts({ actor: engineer, status: "all" });
  const listedSameSourceA = listedDrafts.find((draft) => draft.id === sameSourceA.id);
  assert(
    "CHG-LIST-001 list reports same-source unfinished warning",
    listedSameSourceA?.sameSourceUnfinishedDraftCount === 1 && listedSameSourceA.warnings.includes("same_source_unfinished_draft"),
    JSON.stringify(listedSameSourceA)
  );
  const reconfirmationTargets = await service.markSameSourceDraftsNeedReconfirmation({ draftId: sameSourceA.id, actor: manager });
  assert(
    "CHG-RECONFIRM-001 same-source drafts can be marked needs_reconfirmation",
    reconfirmationTargets.some((draft) => draft.id === sameSourceB.id && draft.status === "needs_reconfirmation"),
    JSON.stringify(reconfirmationTargets)
  );
  const reconfirmed = await service.reconfirmPartNumberDraft({ draftId: sameSourceB.id, actor: engineer });
  assert("CHG-RECONFIRM-002 reconfirm returns draft to editable status", reconfirmed.status === "draft", JSON.stringify(reconfirmed));
  assert(
    "CHG-RECONFIRM-003 reconfirmation events are retained",
    ["draft_reconfirmation_required", "draft_reconfirmed"].every((eventType) => eventTypes(database, sameSourceB.id).includes(eventType)),
    eventTypes(database, sameSourceB.id).join(",")
  );

  const revisionDrawing = seedDrawing(database, "D-QC-REV-MA1");
  const noImpact = await service.submitDrawingRevisionFffAssessment({
    drawingNumberId: revisionDrawing.drawingId,
    revision: "0.1",
    formState: "no_impact",
    fitState: "no_impact",
    functionState: "no_impact",
    reasonCategory: "標註 / 文字修正",
    note: "QC no impact",
    actor: engineer
  });
  assert(
    "CHG-FFF-001 no-impact FFF stores assessment without replacement draft",
    noImpact.outcome === "no_impact" && noImpact.replacementDraft === null && noImpact.assessment.replacementPartNumberDraftId === null,
    JSON.stringify(noImpact)
  );
  const pendingReviewsBeforeAction = await service.listPendingDrawingRevisionReviews(manager);
  assert(
    "CHG-REVIEW-000 pending review queue lists unconfirmed FFF assessments",
    pendingReviewsBeforeAction.some((review) => review.id === noImpact.assessment.id && review.outcome === "no_impact"),
    JSON.stringify(pendingReviewsBeforeAction.map((review) => ({ id: review.id, outcome: review.outcome })))
  );
  await expectReject(
    "CHG-FFF-002 confirmed impact requires replacement part number",
    () =>
      service.submitDrawingRevisionFffAssessment({
        drawingNumberId: revisionDrawing.drawingId,
        revision: "0.2",
        formState: "confirmed_impact",
        fitState: "no_impact",
        functionState: "no_impact",
        reasonCategory: "尺寸 / 公差修正",
        detectedPartNumber: "P-QC-REV-NEW",
        actor: engineer
      }),
    "replacement_part_number_required"
  );
  await expectReject(
    "CHG-FFF-003 drawing part-number mismatch blocks confirmed impact",
    () =>
      service.submitDrawingRevisionFffAssessment({
        drawingNumberId: revisionDrawing.drawingId,
        revision: "0.3",
        formState: "confirmed_impact",
        fitState: "no_impact",
        functionState: "no_impact",
        reasonCategory: "尺寸 / 公差修正",
        replacementReservedPartNumber: "P-QC-REV-NEW",
        detectedPartNumber: "P-QC-REV-OTHER",
        actor: engineer
      }),
    "drawing_part_number_mismatch"
  );
  const drawingCountBeforeReplacement = database.prepare("SELECT COUNT(*) AS count FROM drawing_numbers WHERE company_id = ?").get(companyId).count;
  const confirmedImpact = await service.submitDrawingRevisionFffAssessment({
    drawingNumberId: revisionDrawing.drawingId,
    revision: "0.4",
    formState: "confirmed_impact",
    fitState: "no_impact",
    functionState: "no_impact",
    reasonCategory: "尺寸 / 公差修正",
    replacementReservedPartNumber: "P-QC-REV-NEW",
    detectedPartNumber: "P-QC-REV-OCR",
    correctedPartNumber: "P-QC-REV-NEW",
    actor: engineer
  });
  const drawingCountAfterReplacement = database.prepare("SELECT COUNT(*) AS count FROM drawing_numbers WHERE company_id = ?").get(companyId).count;
  assert(
    "CHG-FFF-004 confirmed impact creates drawing-revision generated draft",
    confirmedImpact.outcome === "confirmed_impact" &&
      confirmedImpact.replacementDraft?.draftType === "drawing_revision_generated" &&
      confirmedImpact.assessment.replacementPartNumberDraftId === confirmedImpact.replacementDraft.id,
    JSON.stringify(confirmedImpact)
  );
  assert(
    "CHG-FFF-005 confirmed impact keeps original drawing number",
    drawingCountBeforeReplacement === drawingCountAfterReplacement,
    JSON.stringify({ drawingCountBeforeReplacement, drawingCountAfterReplacement })
  );

  await expectReject(
    "CHG-REVIEW-001 no-impact review rejects wrong action",
    () =>
      service.applyDrawingRevisionReviewAction({
        assessmentId: noImpact.assessment.id,
        action: "approve_replacement_part_and_drawing_release",
        actor: manager
      }),
    "review_action_mismatch"
  );
  const noImpactReview = await service.applyDrawingRevisionReviewAction({
    assessmentId: noImpact.assessment.id,
    action: "confirm_bom_no_revision",
    actor: manager
  });
  assert(
    "CHG-REVIEW-002 no-impact review requires BOM no-revision confirmation",
    noImpactReview.action === "confirm_bom_no_revision" && noImpactReview.replacementPartNumberId === null,
    JSON.stringify(noImpactReview)
  );

  const suspected = await service.submitDrawingRevisionFffAssessment({
    drawingNumberId: revisionDrawing.drawingId,
    revision: "0.5",
    formState: "suspected_impact",
    fitState: "no_impact",
    functionState: "no_impact",
    reasonCategory: "BOM / 料件影響",
    actor: engineer
  });
  await expectReject(
    "CHG-REVIEW-003 suspected impact rejects skipped conclusion",
    () =>
      service.applyDrawingRevisionReviewAction({
        assessmentId: suspected.assessment.id,
        action: "confirm_bom_no_revision",
        actor: manager
      }),
    "review_action_mismatch"
  );
  const suspectedReview = await service.applyDrawingRevisionReviewAction({
    assessmentId: suspected.assessment.id,
    action: "confirm_original_part_reuse",
    actor: manager
  });
  assert("CHG-REVIEW-004 suspected impact allows explicit reuse confirmation", suspectedReview.action === "confirm_original_part_reuse", JSON.stringify(suspectedReview));

  const releaseOldPart = seedFormalPart(database, "P-QC-REL-OLD");
  const flaggedBomDraftId = seedUnreleasedBomDraftReference(database, releaseOldPart.partNumber);
  const releasedBomHeaderId = seedReleasedBomSnapshotReference(database, releaseOldPart.partNumber);
  const releasedBomBefore = database.prepare("SELECT child_part_number FROM bom_lines WHERE bom_header_id = ?").get(releasedBomHeaderId).child_part_number;
  const releaseDrawing = seedDrawing(database, "D-QC-REL-MA1");
  const releaseAssessment = await service.submitDrawingRevisionFffAssessment({
    drawingNumberId: releaseDrawing.drawingId,
    revision: "1",
    formState: "confirmed_impact",
    fitState: "no_impact",
    functionState: "no_impact",
    reasonCategory: "材質 / 製程修正",
    currentPartNumberId: releaseOldPart.partId,
    replacementReservedPartNumber: "P-QC-REL-NEW",
    detectedPartNumber: "P-QC-REL-NEW",
    actor: engineer
  });
  const releaseResult = await service.applyDrawingRevisionReviewAction({
    assessmentId: releaseAssessment.assessment.id,
    action: "approve_replacement_part_and_drawing_release",
    actor: manager
  });
  const replacementLinkCount = database
    .prepare("SELECT COUNT(*) AS count FROM part_replacement_links WHERE old_part_number_id = ? AND new_part_number_id = ?")
    .get(releaseOldPart.partId, releaseResult.replacementPartNumberId).count;
  const bomFlagCount = database
    .prepare("SELECT COUNT(*) AS count FROM bom_reconfirmation_flags WHERE bom_draft_id = ? AND old_part_number_id = ?")
    .get(flaggedBomDraftId, releaseOldPart.partId).count;
  const openBomFlag = database
    .prepare(
      `
      SELECT resolved_by, resolved_at
      FROM bom_reconfirmation_flags
      WHERE bom_draft_id = ? AND old_part_number_id = ?
      `
    )
    .get(flaggedBomDraftId, releaseOldPart.partId);
  assert(
    "CHG-REVIEW-005 confirmed impact release creates part, replacement link, and BOM flag",
    releaseResult.replacementDraft?.status === "released" && replacementLinkCount === 1 && bomFlagCount === 1 && releaseResult.bomReconfirmationFlagCount === 1,
    JSON.stringify({ releaseResult, replacementLinkCount, bomFlagCount })
  );
  assert(
    "CHG-BOM-001 BOM reconfirmation flag starts unresolved",
    openBomFlag?.resolved_by === null && openBomFlag?.resolved_at === null,
    JSON.stringify(openBomFlag)
  );
  const releasedBomAfter = database.prepare("SELECT child_part_number FROM bom_lines WHERE bom_header_id = ?").get(releasedBomHeaderId).child_part_number;
  assert(
    "CHG-BOM-002 released BOM keeps old part after replacement release",
    releasedBomBefore === releaseOldPart.partNumber && releasedBomAfter === releaseOldPart.partNumber,
    JSON.stringify({ releasedBomBefore, releasedBomAfter })
  );

  const rollbackOldPart = seedFormalPart(database, "P-QC-ROLLBACK-OLD");
  const rollbackDrawing = seedDrawing(database, "D-QC-ROLLBACK-MA1");
  const rollbackAssessment = await service.submitDrawingRevisionFffAssessment({
    drawingNumberId: rollbackDrawing.drawingId,
    revision: "1",
    formState: "confirmed_impact",
    fitState: "no_impact",
    functionState: "no_impact",
    reasonCategory: "尺寸 / 公差修正",
    currentPartNumberId: rollbackOldPart.partId,
    replacementReservedPartNumber: "P-QC-ROLLBACK-NEW",
    detectedPartNumber: "P-QC-ROLLBACK-NEW",
    actor: engineer
  });
  seedFormalPart(database, "P-QC-ROLLBACK-NEW");
  await expectReject(
    "CHG-REVIEW-006 failed release rolls back transaction",
    () =>
      service.applyDrawingRevisionReviewAction({
        assessmentId: rollbackAssessment.assessment.id,
        action: "approve_replacement_part_and_drawing_release",
        actor: manager
      }),
    "replacement_part_already_released"
  );
  const rollbackReviewEvents = database
    .prepare("SELECT COUNT(*) AS count FROM review_confirmation_events WHERE review_id = ?")
    .get(rollbackAssessment.assessment.id).count;
  const rollbackDraft = database
    .prepare("SELECT status FROM part_number_drafts WHERE id = ?")
    .get(rollbackAssessment.replacementDraft.id);
  assert(
    "CHG-REVIEW-007 rollback leaves no review event or released draft",
    rollbackReviewEvents === 0 && rollbackDraft.status === "draft",
    JSON.stringify({ rollbackReviewEvents, rollbackDraft })
  );
} catch (error) {
  record("CHG-RUNTIME-000 runtime test setup failed", false, error instanceof Error ? error.message : String(error));
} finally {
  database.close();
}

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);

process.exitCode = failed.length === 0 ? 0 : 1;
