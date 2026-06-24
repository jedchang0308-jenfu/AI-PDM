#!/usr/bin/env node

import Database from "better-sqlite3";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const schema = readProjectFile(root, "db/schema.sql");
const serviceSource = readProjectFile(root, "src/lib/pdm-change-control-domain.ts");
const wrapperSource = readProjectFile(root, "src/lib/pdm-change-control.ts");
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
  "submitPartNumberDraft"
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
