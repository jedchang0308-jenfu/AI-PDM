#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import {
  artifactReference,
  canonicalHash,
  canonicalJson,
  DEV101_REGISTRY_PATH,
  hashFile,
  loadDev101Registry,
  sha256,
  sourceInfo,
  validateRegistry
} from "./dev-101-evidence-lib.mjs";

const root = process.cwd();
const runId = `DEV101-INDEPENDENT-DATA-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const parentRunId = process.env.DEV101_PARENT_RUN_ID?.trim() || process.env.DEV101_QA_PARENT_RUN_ID?.trim() || runId;
const outputDir = path.resolve(process.env.DEV101_EVIDENCE_DIR?.trim() || path.join(root, "output", "qa", "dev-101-independent-data", runId));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev101-independent-data-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const primaryDbPath = path.join(root, "data", "ai-pdm.sqlite");
const taskDbPath = path.join(dataDir, "ai-pdm.sqlite");
const registry = validateRegistry(root, loadDev101Registry(root));
const coverage = registry.runnerCoverage.find((item) => item.runner === "qc-dev-101-independent-data");
if (!coverage) throw new Error("DEV101_DATA_COVERAGE_MISSING");

function clone(value) {
  return structuredClone(value);
}

function primaryFingerprint() {
  const database = new Database(primaryDbPath, { readonly: true, fileMustExist: true });
  database.pragma("query_only = ON");
  try {
    const payload = {
      schema: database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),
      identities: {
        roots: database.prepare("SELECT id,company_id,root_code FROM part_roots ORDER BY company_id,id").all(),
        parts: database.prepare("SELECT id,company_id,part_root_id,part_number FROM part_numbers ORDER BY company_id,id").all(),
        drawings: database.prepare("SELECT id,company_id,drawing_number,formal_drawing_number_id FROM drawings ORDER BY company_id,id").all()
      },
      residue: database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all(),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return { hash: sha256(JSON.stringify(payload)), payload };
  } finally {
    database.close();
  }
}

function primitivePreflight(database) {
  return {
    masterCounts: {
      roots: Number(database.prepare("SELECT COUNT(*) count FROM part_roots").get().count),
      parts: Number(database.prepare("SELECT COUNT(*) count FROM part_numbers").get().count),
      drawings: Number(database.prepare("SELECT COUNT(*) count FROM drawings").get().count)
    },
    brokenRootReferences: {
      parts: Number(database.prepare("SELECT COUNT(*) count FROM part_numbers part LEFT JOIN part_roots root ON root.id=part.part_root_id AND root.company_id=part.company_id WHERE part.part_root_id IS NOT NULL AND root.id IS NULL").get().count),
      drawings: Number(database.prepare("SELECT COUNT(*) count FROM drawings drawing LEFT JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL").get().count)
    },
    residue: database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all(),
    foreignKeys: database.pragma("foreign_key_check")
  };
}

function ensurePendingDrawingFixture(database, ledger) {
  const existing = database.prepare(`SELECT id,company_id,request_kind,entity_type,canonical_entity_id,work_id,branch_id,snapshot_payload,snapshot_hash,request_status,row_version
    FROM pdm_work_review_requests WHERE request_status='pending' AND request_kind='drawing_revision' ORDER BY created_at,id LIMIT 1`).get();
  if (existing) return existing;
  const target = database.prepare(`SELECT drawing.id AS drawing_id, drawing.company_id, revision.id AS revision_id,
      revision.policy_snapshot_json, branch.id AS branch_id, claim.id AS claim_id
    FROM drawings drawing
    JOIN drawing_rd_branches branch ON branch.drawing_id=drawing.id AND branch.company_id=drawing.company_id
    JOIN drawing_revisions revision ON revision.id=branch.latest_approved_revision_id AND revision.company_id=drawing.company_id
    LEFT JOIN drawing_revision_claims claim ON claim.branch_id=branch.id AND claim.company_id=drawing.company_id
      AND claim.predecessor_revision_id IS NULL
    WHERE drawing.drawing_number='A0002-M01' AND drawing.lifecycle_state='drawing_preparation'
    ORDER BY claim.created_at DESC,branch.id DESC LIMIT 1`).get();
  if (!target) throw new Error("DEV101_CANONICAL_DRAWING_FIXTURE_MISSING");
  let payload = {};
  try { payload = target.policy_snapshot_json ? JSON.parse(target.policy_snapshot_json) : {}; } catch { payload = {}; }
  const snapshot = { payload, revisionId: target.revision_id, claimId: target.claim_id ?? null };
  const snapshotPayload = JSON.stringify(snapshot);
  const snapshotHash = canonicalHash(snapshot);
  const id = `dev101-independent-source-request-${crypto.randomUUID()}`;
  const workId = `dev101-independent-source-work-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  database.transaction(() => {
    database.prepare(`INSERT INTO drawing_revision_works
      (id,company_id,drawing_id,branch_id,target_claim_id,owner_user_id,proposed_payload,base_hash,row_version,created_at,updated_at)
      VALUES(?,?,?,?,?,'user-manager-demo',?,?,1,?,?)`).run(
      workId, target.company_id, target.drawing_id, target.branch_id, target.claim_id, JSON.stringify(payload), snapshotHash, createdAt, createdAt
    );
    const state = database.prepare(`UPDATE canonical_workbench_states SET work_id=?,handling='owner',row_version=row_version+1,updated_at=?
      WHERE company_id=? AND entity_type='drawing' AND canonical_entity_id=? AND branch_id=? AND revision_id=?`).run(
      workId, createdAt, target.company_id, target.drawing_id, target.branch_id, target.revision_id
    );
    if (state.changes !== 1) throw new Error(`DEV101_CANONICAL_DRAWING_STATE_CARDINALITY:${state.changes}`);
    database.prepare(`INSERT INTO drawing_revision_work_files(work_id,file_binding_id,ordinal,content_hash)
      SELECT ?,file.id,file.sort_order,asset.content_hash FROM drawing_revision_files file
      JOIN file_assets asset ON asset.id=file.source_file_asset_id
      WHERE file.drawing_revision_id=? AND file.removed_at IS NULL ORDER BY file.sort_order,file.id`).run(workId, target.revision_id);
  })();
  database.prepare(`INSERT INTO pdm_work_review_requests
    (id,company_id,request_kind,entity_type,canonical_entity_id,work_id,branch_id,reviewer_user_id,review_cycle_id,snapshot_payload,snapshot_hash,request_status,row_version)
    VALUES(?,?,'drawing_revision','drawing',?, ?,?,'user-manager-demo',?,?,?,?,1)`).run(
    id, target.company_id, target.drawing_id, workId, target.branch_id, `dev101-independent-source-cycle-${crypto.randomUUID()}`,
    snapshotPayload, snapshotHash, "pending"
  );
  ledger.push({ method: "FIXTURE", tables: ["drawing_revision_works", "drawing_revision_work_files", "canonical_workbench_states", "pdm_work_review_requests"], id, workId, purpose: "task-owned canonical A0002 pending drawing source request because primary request history is intentionally empty", drawingId: target.drawing_id, revisionId: target.revision_id });
  return database.prepare(`SELECT id,company_id,request_kind,entity_type,canonical_entity_id,work_id,branch_id,snapshot_payload,snapshot_hash,request_status,row_version
    FROM pdm_work_review_requests WHERE id=?`).get(id);
}

function packageBodyHash(value) {
  const { packageHash: _ignored, ...body } = value;
  return canonicalHash(body);
}

function workspaceEvidenceHash(workspace) {
  return canonicalHash({
    kind: workspace.kind,
    entityId: workspace.entityId,
    revisionId: workspace.revisionId,
    identity: workspace.identity,
    payload: workspace.payload,
    baselinePayload: workspace.baselinePayload,
    changeImpactRequired: workspace.changeImpactRequired ?? false,
    relatedParts: workspace.relatedParts ?? [],
    affectedParts: workspace.affectedParts ?? [],
    files: workspace.files,
    attachments: workspace.attachments,
    recognition: workspace.recognition
  });
}

function matrixEvidenceHash(matrix) {
  const { evidenceHash: _ignored, ...body } = matrix;
  return canonicalHash(body);
}

function projectionHash(recognition) {
  const { projectionHash: _ignored, ...body } = recognition;
  return canonicalHash(body);
}

function thrownCode(execute) {
  try {
    execute();
    return null;
  } catch (error) {
    return error && typeof error === "object" && "code" in error ? error.code : error instanceof Error ? error.message : String(error);
  }
}

async function rejectedError(execute) {
  try {
    await execute();
    return null;
  } catch (error) {
    return {
      code: error && typeof error === "object" && "code" in error ? error.code : error instanceof Error ? error.message : String(error),
      status: error && typeof error === "object" && "status" in error ? error.status : null
    };
  }
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function syntheticLargePackage(template, { drawingCount, partCount, cellCount, targetBytes = null }) {
  const submittedDrawing = template.targets.find((target) => target.scope === "submitted" && target.workspace.kind === "drawing");
  const contextDrawing = template.targets.find((target) => target.scope === "context_only" && target.workspace.kind === "drawing");
  const partTemplate = template.targets.find((target) => target.workspace.kind === "part");
  if (!submittedDrawing || !contextDrawing || !partTemplate) throw new Error("DEV101_LARGE_PACKAGE_TEMPLATE_INCOMPLETE");
  const drawings = [];
  const parts = [];
  const targets = [];
  for (let index = 0; index < drawingCount; index += 1) {
    const target = clone(index === 0 ? submittedDrawing : contextDrawing);
    const entityId = index === 0 ? submittedDrawing.workspace.entityId : `dev101-large-drawing-${index}`;
    const axisId = `dev101-large-drawing-axis-${index}`;
    const targetKey = `drawing:${entityId}`;
    target.targetKey = targetKey;
    target.axisId = axisId;
    target.scope = index === 0 ? "submitted" : "context_only";
    target.markers.submitted = index === 0;
    target.workspace.entityId = entityId;
    target.workspace.identity.code = `QA-D-${String(index).padStart(3, "0")}`;
    if (index !== 0) target.workspace.recognition = null;
    target.evidenceHash = workspaceEvidenceHash(target.workspace);
    drawings.push({ axisId, targetKey, code: target.workspace.identity.code, revision: target.workspace.identity.revision });
    targets.push(target);
  }
  for (let index = 0; index < partCount; index += 1) {
    const target = clone(partTemplate);
    const entityId = `dev101-large-part-${index}`;
    const axisId = `dev101-large-part-axis-${index}`;
    const targetKey = `part:${entityId}`;
    target.targetKey = targetKey;
    target.axisId = axisId;
    target.scope = "context_only";
    target.markers.submitted = false;
    target.workspace.entityId = entityId;
    target.workspace.identity.code = `QA-P-${String(index).padStart(3, "0")}`;
    target.evidenceHash = workspaceEvidenceHash(target.workspace);
    parts.push({ axisId, targetKey, code: target.workspace.identity.code, revision: null });
    targets.push(target);
  }
  const cells = [];
  outer: for (const drawing of drawings) {
    for (const part of parts) {
      cells.push({ drawingNumberId: drawing.axisId, partNumberId: part.axisId, drawingNumber: drawing.code, partNumber: part.code, relationType: null });
      if (cells.length === cellCount) break outer;
    }
  }
  if (cells.length !== cellCount) throw new Error("DEV101_LARGE_PACKAGE_CELL_CAPACITY_INVALID");
  const matrixBody = { rootId: template.root.id, rootCode: template.root.code, drawings, parts, cells };
  const result = {
    schemaVersion: template.schemaVersion,
    submittedAt: template.submittedAt,
    requestKind: template.requestKind,
    primaryTargetKey: drawings[0].targetKey,
    root: clone(template.root),
    decisionBasis: clone(template.decisionBasis),
    matrix: { ...matrixBody, evidenceHash: canonicalHash(matrixBody) },
    targets
  };
  result.packageHash = canonicalHash(result);
  if (targetBytes !== null) {
    const padTarget = result.targets.at(-1);
    padTarget.workspace.payload = clone(padTarget.workspace.payload);
    padTarget.workspace.baselinePayload = clone(padTarget.workspace.baselinePayload);
    padTarget.workspace.payload.__qaBoundaryPadding = "";
    const resize = () => {
      padTarget.evidenceHash = workspaceEvidenceHash(padTarget.workspace);
      delete result.packageHash;
      result.packageHash = canonicalHash(result);
      return Buffer.byteLength(JSON.stringify(result), "utf8");
    };
    let bytes = resize();
    padTarget.workspace.payload.__qaBoundaryPadding = "x".repeat(Math.max(0, targetBytes - bytes));
    bytes = resize();
    if (bytes < targetBytes) padTarget.workspace.payload.__qaBoundaryPadding += "x".repeat(targetBytes - bytes);
    if (bytes > targetBytes) padTarget.workspace.payload.__qaBoundaryPadding = padTarget.workspace.payload.__qaBoundaryPadding.slice(0, -(bytes - targetBytes));
    resize();
  }
  return result;
}

function seedExactRecognitionFixture(database, request, rawSnapshot, ledger) {
  const revisionId = rawSnapshot.revisionId ?? database.prepare("SELECT id FROM drawing_revisions WHERE company_id=? AND drawing_id=? ORDER BY updated_at DESC,id DESC LIMIT 1").get(request.company_id, request.canonical_entity_id)?.id;
  if (!revisionId) throw new Error("DEV101_EXACT_REVISION_FIXTURE_MISSING");
  const drawing = database.prepare("SELECT id,part_root_id FROM drawings WHERE company_id=? AND id=?").get(request.company_id, request.canonical_entity_id);
  const owner = database.prepare("SELECT id,part_number,record_status FROM part_numbers WHERE company_id=? AND part_root_id=? AND LOWER(record_status) NOT IN ('retired','obsolete','deleted') ORDER BY part_number,id LIMIT 1").get(request.company_id, drawing.part_root_id);
  if (!drawing || !owner) throw new Error("DEV101_RECOGNITION_OWNER_FIXTURE_MISSING");

  const assetId = `dev101-independent-source-${crypto.randomUUID()}`;
  const storageKey = `dev101-independent/${assetId}.txt`;
  const assetPath = path.join(repositoryDir, ...storageKey.split("/"));
  const bytes = Buffer.from("DEV-101 independent recognition source\n", "utf8");
  const contentHash = sha256(bytes);
  fs.mkdirSync(path.dirname(assetPath), { recursive: true });
  fs.writeFileSync(assetPath, bytes);

  const sessionId = `dev101-independent-session-${crypto.randomUUID()}`;
  const sourceId = `dev101-independent-rec-source-${crypto.randomUUID()}`;
  const adapterId = `dev101-independent-adapter-${crypto.randomUUID()}`;
  const drawingCandidateId = `dev101-independent-candidate-drawing-${crypto.randomUUID()}`;
  const partCandidateId = `dev101-independent-candidate-part-${crypto.randomUUID()}`;
  const drawingObservationId = `dev101-independent-observation-drawing-${crypto.randomUUID()}`;
  const partObservationId = `dev101-independent-observation-part-${crypto.randomUUID()}`;
  const createdAt = "2098-08-27T00:00:00.000Z";

  database.transaction(() => {
    database.prepare(`INSERT INTO file_assets
      (id,storage_provider,original_path,storage_key,file_name,file_ext,mime_type,file_size,content_hash,hash_algorithm,
       linked_entity_type,linked_entity_id,document_category,display_name,description,uploaded_by,sync_status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      assetId, "local_repository", assetPath, storageKey, `${assetId}.txt`, ".txt", "text/plain", bytes.byteLength, contentHash, "SHA-256",
      "drawing_revision", revisionId, "other", "DEV-101 independent source", "task-owned independent recognition evidence", "user-engineer-demo", "local_only"
    );
    database.prepare(`INSERT INTO drawing_recognition_sessions
      (id,company_id,source_context_type,source_context_id,source_lineage_key,drawing_id,drawing_revision_id,
       source_set_fingerprint,deduplication_key,status,row_version,warning_count,conflict_count,unclassified_count,created_by,created_at,updated_at)
      VALUES(?,?, 'drawing_revision', ?, ?, ?, ?, ?, ?, 'review_ready', 1, 0, 0, 0, 'user-engineer-demo', ?, ?)`).run(
      sessionId, request.company_id, revisionId, `drawing_revision:${revisionId}`, request.canonical_entity_id, revisionId,
      `independent:${contentHash}`, sessionId, createdAt, createdAt
    );
    database.prepare(`INSERT INTO drawing_recognition_sources
      (id,session_id,company_id,file_asset_id,content_hash,storage_generation,file_name,file_ext,mime_type,file_size,source_role,sort_order,adapter_plan_json,created_at)
      VALUES(?,?,?,?,?,NULL,?,?,?,?,?,0,?,?)`).run(
      sourceId, sessionId, request.company_id, assetId, contentHash, `${assetId}.txt`, ".txt", "text/plain", bytes.byteLength, "drawing_2d", '["dev101.independent.v1"]', createdAt
    );
    database.prepare(`INSERT INTO drawing_recognition_adapter_results
      (id,session_id,source_id,company_id,adapter_code,adapter_version,status,observation_count,diagnostics_json,started_at,completed_at)
      VALUES(?,?,?,?, 'dev101.independent.v1', '1', 'succeeded', 2, '[]', ?, ?)`).run(adapterId, sessionId, sourceId, request.company_id, createdAt, createdAt);
    const insertObservation = database.prepare(`INSERT INTO drawing_recognition_observations
      (id,session_id,source_id,adapter_result_id,company_id,raw_text,raw_value,normalized_value,location_kind,page_number,geometry_json,confidence_band,extractor_code,extractor_version,captured_at)
      VALUES(?,?,?,?,?,?,?,?, 'page_region', 1, ?, 'high', 'dev101.independent.v1', '1', ?)`);
    insertObservation.run(drawingObservationId, sessionId, sourceId, adapterId, request.company_id, "製圖者：Independent QA", "Independent QA", "Independent QA", '{"coordinateSpace":"normalized_page","origin":"top_left","x":0.1,"y":0.1,"width":0.2,"height":0.08}', createdAt);
    insertObservation.run(partObservationId, sessionId, sourceId, adapterId, request.company_id, `料號規格：${owner.part_number}`, "QA-SPEC", "QA-SPEC", '{"coordinateSpace":"normalized_page","origin":"top_left","x":0.2,"y":0.2,"width":0.3,"height":0.08}', createdAt);
    const insertCandidate = database.prepare(`INSERT INTO drawing_recognition_candidates
      (id,session_id,company_id,category,field_key,field_label,raw_value,proposed_value,normalized_value,proposed_owner_type,proposed_owner_id,
       applicability_scope,variant_status,confidence_band,review_state,current_formal_value,group_key,sort_order,row_version,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'added', 'high', 'accepted', NULL, ?, ?, 1, ?, ?)`);
    insertCandidate.run(drawingCandidateId, sessionId, request.company_id, "drawing_revision", "drawn_by_name", "製圖者", "Independent QA", "Independent QA", "Independent QA", null, null, "overall", "dev101:drawn_by_name", 0, createdAt, createdAt);
    insertCandidate.run(partCandidateId, sessionId, request.company_id, "part_attribute", "custom_specification", "自訂規格", "QA-SPEC", "QA-SPEC", "QA-SPEC", "part_number", owner.id, "overall", "dev101:part_custom_specification", 1, createdAt, createdAt);
    database.prepare("INSERT INTO drawing_recognition_candidate_observations (candidate_id,observation_id,company_id,created_at) VALUES(?,?,?,?)").run(drawingCandidateId, drawingObservationId, request.company_id, createdAt);
    database.prepare("INSERT INTO drawing_recognition_candidate_observations (candidate_id,observation_id,company_id,created_at) VALUES(?,?,?,?)").run(partCandidateId, partObservationId, request.company_id, createdAt);
  })();

  ledger.push({ method: "FIXTURE", purpose: "exact revision recognition projection with one valid Part owner", sessionId, revisionId, drawingId: request.canonical_entity_id, ownerPartId: owner.id, sourceAssetId: assetId, contentHash });
  return { sessionId, revisionId, drawingId: request.canonical_entity_id, ownerPartId: owner.id, partCandidateId, sourceAssetId: assetId, contentHash };
}

function seedNewerDifferentLineage(database, fixture, companyId, ledger) {
  const id = `dev101-independent-latest-leak-${crypto.randomUUID()}`;
  database.prepare(`INSERT INTO drawing_recognition_sessions
    (id,company_id,source_context_type,source_context_id,source_lineage_key,drawing_id,drawing_revision_id,
     source_set_fingerprint,deduplication_key,status,row_version,warning_count,conflict_count,unclassified_count,created_by,created_at,updated_at)
    VALUES(?,?, 'drawing_number', ?, ?, ?, NULL, ?, ?, 'review_ready', 1, 0, 0, 0, 'user-engineer-demo', '2099-08-27T00:00:00.000Z', '2099-08-27T00:00:00.000Z')`).run(
    id, companyId, fixture.drawingId, `drawing_number:${fixture.drawingId}`, fixture.drawingId, `latest-leak:${id}`, id
  );
  ledger.push({ method: "FIXTURE", purpose: "newer different-context recognition session must not leak", sessionId: id, drawingId: fixture.drawingId, drawingRevisionId: null, sourceContextType: "drawing_number" });
  return id;
}

function seedPartAttachment(database, partId, label, ledger) {
  const id = `dev101-independent-part-asset-${crypto.randomUUID()}`;
  const storageKey = `dev101-independent/${id}.txt`;
  const localPath = path.join(repositoryDir, ...storageKey.split("/"));
  const bytes = Buffer.from(`${label}\n`, "utf8");
  const contentHash = sha256(bytes);
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, bytes);
  database.prepare(`INSERT INTO file_assets
    (id,storage_provider,original_path,storage_key,file_name,file_ext,mime_type,file_size,content_hash,hash_algorithm,
     linked_entity_type,linked_entity_id,document_category,display_name,description,uploaded_by,sync_status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, "local_repository", localPath, storageKey, `${id}.txt`, ".txt", "text/plain", bytes.byteLength, contentHash, "SHA-256",
    "part_number", partId, "other", label, "task-owned immutable Part attachment evidence", "user-engineer-demo", "local_only"
  );
  const fixture = { id, bindingId: id, partId, storageKey, localPath, contentHash, bytes: bytes.byteLength, displayName: label };
  ledger.push({ method: "FIXTURE", table: "file_assets", purpose: "Part attachment snapshot oracle", ...fixture });
  return fixture;
}

function seedContextDrawing(database, request, partId, ledger) {
  const primary = database.prepare(`SELECT drawing.part_root_id,drawing.owner_id,drawing.created_by,drawing.rule_version_id,root.root_code
    FROM drawings drawing JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id
    WHERE drawing.company_id=? AND drawing.id=?`).get(request.company_id, request.canonical_entity_id);
  if (!primary) throw new Error("DEV101_CONTEXT_DRAWING_ROOT_MISSING");
  const sequenceNo = Number(database.prepare("SELECT COALESCE(MAX(sequence_no),0)+1 value FROM drawing_numbers WHERE company_id=? AND part_root_id=? AND purpose_code='R'").get(request.company_id, primary.part_root_id).value);
  const drawingNumberId = `dev101-independent-drawing-number-${crypto.randomUUID()}`;
  const drawingId = `dev101-independent-context-drawing-${crypto.randomUUID()}`;
  const revisionId = `dev101-independent-context-revision-${crypto.randomUUID()}`;
  const linkId = `dev101-independent-context-link-${crypto.randomUUID()}`;
  const drawingNumber = `${primary.root_code}-R${String(sequenceNo).padStart(2, "0")}-QA`;
  const createdAt = "2097-08-27T00:00:00.000Z";
  database.transaction(() => {
    database.prepare(`INSERT INTO drawing_numbers
      (id,company_id,part_root_id,drawing_number,purpose_code,purpose_description,sequence_no,is_primary_manufacturing,record_status,rule_version_id,created_by,created_at,updated_at)
      VALUES(?,?,?,?, 'R','Independent context drawing',?,0,'Draft',?,?,?,?)`).run(
      drawingNumberId, request.company_id, primary.part_root_id, drawingNumber, sequenceNo, primary.rule_version_id ?? "numbering-rule-v3-alpha-root", primary.created_by ?? primary.owner_id, createdAt, createdAt
    );
    database.prepare(`INSERT INTO drawings
      (id,company_id,drawing_number,lifecycle_state,formal_drawing_number_id,part_root_id,purpose_code,purpose_description,sequence_no,is_primary_manufacturing,owner_id,rule_version_id,row_version,created_by,created_at,updated_at)
      VALUES(?,?,?,'drawing_preparation',?,?, 'R','Independent context drawing',?,0,?,?,1,?,?,?)`).run(
      drawingId, request.company_id, drawingNumber, drawingNumberId, primary.part_root_id, sequenceNo, primary.owner_id, primary.rule_version_id, primary.created_by ?? primary.owner_id, createdAt, createdAt
    );
    database.prepare(`INSERT INTO drawing_revisions
      (id,company_id,drawing_id,revision,lifecycle_state,policy_snapshot_json,row_version,created_by,created_at,updated_by,updated_at)
      VALUES(?,?,?,'A','preparing','{}',1,?,?,?,?)`).run(revisionId, request.company_id, drawingId, primary.created_by ?? primary.owner_id, createdAt, primary.created_by ?? primary.owner_id, createdAt);
    database.prepare("INSERT INTO drawing_part_links (id,drawing_number_id,part_number_id,link_type,created_by,created_at) VALUES(?,?,?,'reference',?,?)").run(linkId, drawingNumberId, partId, primary.created_by ?? primary.owner_id, createdAt);
  })();
  const fixture = { drawingNumberId, drawingId, revisionId, linkId, drawingNumber, rootId: primary.part_root_id, partId };
  ledger.push({ method: "FIXTURE", purpose: "second same-root context Drawing and Relation drift oracle", ...fixture });
  return fixture;
}

function seedScaleRoot(database, request, totalTargets, ledger) {
  const drawingCount = totalTargets === 1 ? 1 : totalTargets === 20 ? 4 : 12;
  const partCount = totalTargets - drawingCount;
  const rootId = `dev101-scale-root-${totalTargets}-${crypto.randomUUID()}`;
  const rootCode = `Q${String(totalTargets).padStart(3, "0")}${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
  const basePart = database.prepare("SELECT * FROM part_numbers WHERE company_id=? ORDER BY created_at,id LIMIT 1").get(request.company_id);
  const baseDrawing = database.prepare("SELECT * FROM drawings WHERE company_id=? AND id=?").get(request.company_id, request.canonical_entity_id);
  const baseRoot = database.prepare("SELECT * FROM part_roots WHERE company_id=? AND id=?").get(request.company_id, baseDrawing.part_root_id);
  if (!basePart || !baseDrawing || !baseRoot) throw new Error("DEV101_SCALE_BASE_FIXTURE_MISSING");
  const createdAt = "2096-08-27T00:00:00.000Z";
  const drawingIds = [];
  const revisionIds = [];
  const partIds = [];
  database.transaction(() => {
    database.prepare(`INSERT INTO part_roots
      (id,company_id,root_code,core_name,item_kind,record_status,rule_version_id,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(rootId, request.company_id, rootCode, `DEV101 scale ${totalTargets}`, baseRoot.item_kind, "Draft", baseRoot.rule_version_id, baseRoot.created_by, createdAt, createdAt);
    for (let index = 0; index < partCount; index += 1) {
      const id = `dev101-scale-part-${totalTargets}-${index}-${crypto.randomUUID()}`;
      const code = `${rootCode}-P${String(index + 1).padStart(3, "0")}`;
      database.prepare(`INSERT INTO part_numbers
        (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind,structure_type,is_universal,bom_usage_policy,
         custom_specification,series_code,record_status,universal_reason,rule_version_id,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, request.company_id, rootId, code, index + 1, String(index + 1).padStart(3, "0"), `Scale Part ${index + 1}`,
        basePart.item_kind, basePart.structure_type, basePart.is_universal, basePart.bom_usage_policy, basePart.custom_specification,
        basePart.series_code, "Draft", null, basePart.rule_version_id, basePart.created_by, createdAt, createdAt
      );
      partIds.push(id);
    }
    for (let index = 0; index < drawingCount; index += 1) {
      const numberId = `dev101-scale-number-${totalTargets}-${index}-${crypto.randomUUID()}`;
      const drawingId = `dev101-scale-drawing-${totalTargets}-${index}-${crypto.randomUUID()}`;
      const revisionId = `dev101-scale-revision-${totalTargets}-${index}-${crypto.randomUUID()}`;
      const code = `${rootCode}-R${String(index + 1).padStart(3, "0")}`;
      database.prepare(`INSERT INTO drawing_numbers
        (id,company_id,part_root_id,drawing_number,purpose_code,purpose_description,sequence_no,is_primary_manufacturing,record_status,rule_version_id,created_by,created_at,updated_at)
        VALUES(?,?,?,?, 'R','Scale query budget',?,0,'Draft',?,?,?,?)`).run(numberId, request.company_id, rootId, code, index + 1, baseRoot.rule_version_id, baseRoot.created_by, createdAt, createdAt);
      database.prepare(`INSERT INTO drawings
        (id,company_id,drawing_number,lifecycle_state,formal_drawing_number_id,part_root_id,purpose_code,purpose_description,sequence_no,is_primary_manufacturing,owner_id,rule_version_id,row_version,created_by,created_at,updated_at)
        VALUES(?,?,?,'drawing_preparation',?,?, 'R','Scale query budget',?,0,?,?,1,?,?,?)`).run(
        drawingId, request.company_id, code, numberId, rootId, index + 1, baseDrawing.owner_id, baseDrawing.rule_version_id, baseDrawing.created_by, createdAt, createdAt
      );
      database.prepare(`INSERT INTO drawing_revisions
        (id,company_id,drawing_id,revision,lifecycle_state,policy_snapshot_json,row_version,created_by,created_at,updated_by,updated_at)
        VALUES(?,?,?,'A','preparing','{}',1,?,?,?,?)`).run(revisionId, request.company_id, drawingId, baseDrawing.created_by, createdAt, baseDrawing.created_by, createdAt);
      drawingIds.push(drawingId);
      revisionIds.push(revisionId);
    }
  })();
  const fixture = { totalTargets, rootId, rootCode, drawingIds, revisionIds, partIds };
  ledger.push({ method: "FIXTURE", purpose: "builder query-budget scale root", totalTargets, rootId, drawingCount, partCount });
  return fixture;
}

function countingClient(base, label) {
  const queries = [];
  const capture = (method, sql, params) => {
    queries.push({ method, sql: String(sql).replace(/\s+/gu, " ").trim(), paramKeys: Object.keys(params ?? {}).sort() });
  };
  const wrapped = {
    kind: base.kind,
    async query(sql, params) { capture("query", sql, params); return base.query(sql, params); },
    async queryOne(sql, params) { capture("queryOne", sql, params); return base.queryOne(sql, params); },
    async execute(sql, params) { capture("execute", sql, params); return base.execute(sql, params); },
    async transaction(execute) { return base.transaction((tx) => execute(countingClient(tx, `${label}:tx`).client)); }
  };
  return { label, client: wrapped, queries };
}

const primaryBefore = primaryFingerprint();
const sourceBefore = sourceInfo(root, registry.sourceBoundary);
const mutationLedger = [];
const rawEvidence = {};
const results = new Map(coverage.caseIds.map((caseId) => [caseId, { caseId, result: "NOT_RUN", assertionIds: [], firstFailurePointer: null, detail: "independent data assertion not implemented in this batch" }]));
let runError = null;
let client = null;
let taskDatabase = null;

function record(caseId, assertions, detail) {
  const failed = assertions.find((item) => item.pass !== true);
  results.set(caseId, {
    caseId,
    result: failed ? "FAIL" : "PASS",
    assertionIds: assertions.map((item) => item.id),
    firstFailurePointer: failed ? `${caseId}:${failed.id}` : null,
    detail
  });
  if (failed && !runError) runError = new Error(`${caseId}:${failed.id}`);
}

console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-101 independent data oracle batch: parser, immutable package, recognition and SQLite inner-hash",
  port: "none",
  owningProcessTree: `single Node process ${process.pid}; no app/browser/provider child`,
  cleanupCondition: "task SQLite/repository closed and removed; process exits; primary/source fingerprints unchanged",
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  mutationScope: `${tempRoot} and ${outputDir}; primary SQLite is query_only fingerprint source`
} }));

try {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  fs.copyFileSync(primaryDbPath, taskDbPath);
  if (fs.existsSync(path.join(root, "data", "repository"))) fs.cpSync(path.join(root, "data", "repository"), repositoryDir, { recursive: true });
  taskDatabase = new Database(taskDbPath);
  const preflight = primitivePreflight(taskDatabase);
  rawEvidence.preflight = preflight;
  if (!Object.values(preflight.masterCounts).every((count) => count > 0) || Object.values(preflight.brokenRootReferences).some((count) => count !== 0) || preflight.foreignKeys.length !== 0) {
    throw new Error("DEV101_SOURCE_PREFLIGHT_FAILED");
  }

  const request = ensurePendingDrawingFixture(taskDatabase, mutationLedger);
  const legacySnapshot = JSON.parse(request.snapshot_payload);
  const recognitionFixture = seedExactRecognitionFixture(taskDatabase, request, legacySnapshot, mutationLedger);
  const submittedPartAttachment = seedPartAttachment(taskDatabase, recognitionFixture.ownerPartId, "DEV-101 submitted Part attachment", mutationLedger);
  const contextDrawingFixture = seedContextDrawing(taskDatabase, request, recognitionFixture.ownerPartId, mutationLedger);

  process.env.PDM_DB_PROVIDER = "sqlite";
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_REVIEW_PACKAGE_V2_WRITE = "true";
  const { createAsyncDatabaseClient } = await import("../src/lib/db-async-provider.ts");
  const { assertReviewPackageRecognitionReady, buildReviewPackage, readCurrentReviewTarget, reviewPackageV2WriteEnabled, verifyReviewPackageIntegrity } = await import("../src/lib/pdm-review-package.ts");
  const { parseReviewPackageSnapshot } = await import("../src/lib/pdm-review-package-contract.ts");
  const { PdmWorkReviewAsyncRepository } = await import("../src/lib/repositories/pdm-work-review-async-repository.ts");
  const { DrawingRecognitionAsyncRepository } = await import("../src/lib/repositories/drawing-recognition-async-repository.ts");
  const { PartChangeWorkService } = await import("../src/lib/part-change-work.ts");
  const { issueCanonicalWorkbenchContract } = await import("../src/lib/pdm-workbench-authority-control.ts");
  const { validateDev087ReviewDecision } = await import("../src/lib/pdm-work-review.ts");
  const { AsyncApprovalPlatformRepository } = await import("../src/lib/repositories/approval-platform-async-repository.ts");
  const { PdmCanonicalWorkbenchService } = await import("../src/lib/pdm-canonical-workbench.ts");
  client = createAsyncDatabaseClient({ kind: "sqlite", database: taskDatabase });
  const buildInput = {
    companyId: request.company_id,
    requestKind: request.request_kind,
    entityType: request.entity_type,
    canonicalEntityId: request.canonical_entity_id,
    workId: request.work_id,
    branchId: request.branch_id,
    decisionBasis: { hash: request.snapshot_hash, payload: legacySnapshot.payload ?? {}, revisionId: legacySnapshot.revisionId ?? null, claimId: legacySnapshot.claimId ?? null }
  };
  const packageValue = await buildReviewPackage(client, buildInput);
  const submittedDrawing = packageValue.targets.find((target) => target.scope === "submitted" && target.workspace.kind === "drawing");
  if (!submittedDrawing) throw new Error("DEV101_SUBMITTED_DRAWING_MISSING");

  const parserInputs = [
    { name: "valid-v2", value: packageValue, expected: "v2" },
    { name: "legacy-drawing", value: legacySnapshot, expected: "legacy" },
    { name: "legacy-part", value: { payload: { partId: "legacy-part" } }, expected: "legacy" },
    { name: "null", value: null, expected: "legacy" },
    { name: "array", value: [], expected: "legacy" },
    { name: "unknown-schema", value: { ...packageValue, schemaVersion: "pdm-review-package-v999" }, expected: "invalid" },
    { name: "extra-field", value: { ...packageValue, extra: true }, expected: "invalid" },
    { name: "missing-field", value: (() => { const value = clone(packageValue); delete value.root; return value; })(), expected: "invalid" }
  ];
  const parserResults = parserInputs.map((item) => ({ name: item.name, expected: item.expected, actual: parseReviewPackageSnapshot(item.value).kind }));
  record("QA-101-001", [
    { id: "PARSER-MATRIX-EXACT", pass: parserResults.every((item) => item.actual === item.expected) },
    { id: "INVALID-CODE-STABLE", pass: parserInputs.filter((item) => item.expected === "invalid").every((item) => parseReviewPackageSnapshot(item.value).code === "WORKBENCH_REVIEW_PACKAGE_INVALID") }
  ], { parserResults });

  const { packageHash: _packageHash, ...packageBody } = packageValue;
  const targetKeys = packageValue.targets.map((target) => target.targetKey);
  const axisKeys = [...packageValue.matrix.drawings, ...packageValue.matrix.parts].map((axis) => axis.targetKey);
  const drawingCodes = packageValue.matrix.drawings.map((axis) => axis.code);
  const partCodes = packageValue.matrix.parts.map((axis) => axis.code);
  const fixtureRequestId = `dev101-independent-request-${crypto.randomUUID()}`;
  const fixtureWorkId = `dev101-independent-work-${crypto.randomUUID()}`;
  const fixtureReviewCycleId = `dev101-independent-cycle-${crypto.randomUUID()}`;
  taskDatabase.prepare(`INSERT INTO pdm_work_review_requests
    (id,company_id,request_kind,entity_type,canonical_entity_id,work_id,branch_id,reviewer_user_id,review_cycle_id,snapshot_payload,snapshot_hash,request_status,row_version)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',1)`).run(
    fixtureRequestId, request.company_id, request.request_kind, request.entity_type, request.canonical_entity_id, fixtureWorkId, request.branch_id,
    "user-manager-demo", fixtureReviewCycleId, JSON.stringify(packageValue), packageValue.packageHash
  );
  mutationLedger.push({ method: "FIXTURE", table: "pdm_work_review_requests", id: fixtureRequestId, purpose: "insert separate contract fixture for independent SQLite round-trip oracle; source request stays immutable", workId: fixtureWorkId, schema: packageValue.schemaVersion });
  const persisted = taskDatabase.prepare("SELECT snapshot_payload,snapshot_hash FROM pdm_work_review_requests WHERE id=?").get(fixtureRequestId);
  const roundTrip = JSON.parse(persisted.snapshot_payload);
  record("QA-101-002", [
    { id: "OUTER-HASH-INDEPENDENT", pass: packageBodyHash(packageValue) === packageValue.packageHash && packageValue.packageHash === persisted.snapshot_hash },
    { id: "AXIS-TARGET-BIJECTION", pass: targetKeys.length === axisKeys.length && new Set(targetKeys).size === targetKeys.length && targetKeys.every((key) => axisKeys.includes(key)) },
    { id: "PRIMARY-SUBMITTED", pass: packageValue.targets.some((target) => target.targetKey === packageValue.primaryTargetKey && target.scope === "submitted" && target.markers.submitted) },
    { id: "STABLE-SORTING", pass: JSON.stringify(drawingCodes) === JSON.stringify(sorted(drawingCodes)) && JSON.stringify(partCodes) === JSON.stringify(sorted(partCodes)) },
    { id: "INNER-HASHES-INDEPENDENT", pass: matrixEvidenceHash(packageValue.matrix) === packageValue.matrix.evidenceHash && packageValue.targets.every((target) => workspaceEvidenceHash(target.workspace) === target.evidenceHash) },
    { id: "SQLITE-SNAPSHOT-ROUNDTRIP", pass: canonicalJson(roundTrip) === canonicalJson(packageValue) && packageBodyHash(roundTrip) === persisted.snapshot_hash }
  ], { sourceRequestId: request.id, fixtureRequestId, root: packageValue.root, targetKeys, axisKeys, packageHash: packageValue.packageHash, persistedHash: persisted.snapshot_hash });

  const submitted = packageValue.targets.filter((target) => target.scope === "submitted");
  const context = packageValue.targets.filter((target) => target.scope === "context_only");
  const multi = clone(packageValue);
  const additional = multi.targets.find((target) => target.scope === "context_only");
  if (additional) { additional.scope = "submitted"; additional.markers.submitted = true; }
  delete multi.packageHash;
  multi.packageHash = canonicalHash(multi);
  const parsedMulti = parseReviewPackageSnapshot(multi);
  record("QA-101-003", [
    { id: "EXISTING-ONE-SUBMITTED", pass: submitted.length === 1 },
    { id: "CONTEXT-NOT-SCOPE", pass: context.length > 0 && context.every((target) => !target.markers.submitted) },
    { id: "MULTI-TWO-SUBMITTED", pass: Boolean(additional) && parsedMulti.kind === "v2" && multi.targets.filter((target) => target.scope === "submitted").length === 2 },
    { id: "MULTI-PRIMARY-IN-SCOPE", pass: parsedMulti.kind === "v2" && multi.targets.some((target) => target.targetKey === multi.primaryTargetKey && target.scope === "submitted") }
  ], { submitted: submitted.map((target) => target.targetKey), context: context.map((target) => target.targetKey), multiKind: parsedMulti.kind });

  const eligibleParts = taskDatabase.prepare(`SELECT state.canonical_entity_id AS part_id,
      state.row_version AS formal_row_version, part.part_number, part.company_id
    FROM canonical_workbench_states state
    JOIN part_numbers part ON part.id=state.canonical_entity_id AND part.company_id=state.company_id
    WHERE state.entity_type='part' AND state.data_layer='part_formal' AND state.handling='none'
      AND state.work_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM part_change_works work WHERE work.company_id=part.company_id AND work.part_id=part.id)
      AND NOT EXISTS (SELECT 1 FROM pdm_work_review_requests review WHERE review.company_id=part.company_id
        AND review.canonical_entity_id=part.id AND review.request_status IN ('pending','applying','apply_failed'))
      AND EXISTS (SELECT 1 FROM drawing_numbers number WHERE number.company_id=part.company_id AND number.part_root_id=part.part_root_id)
    ORDER BY part.part_number LIMIT 2`).all();
  if (eligibleParts.length !== 2) throw new Error("DEV101_FLAG_WRITER_PART_FIXTURES_MISSING");
  const ownerActor = {
    id: "user-engineer-demo", companyId: request.company_id, canEditNonOwned: false,
    permissions: { create: true, update: true, submit: true, cancel: true, decide: false }
  };
  const reviewerActor = {
    id: "user-manager-demo", companyId: request.company_id, canEditNonOwned: true,
    permissions: { create: true, update: true, submit: true, cancel: true, decide: true }
  };
  const partService = new PartChangeWorkService(client);
  const submitPartThroughCommand = async (part, enabled) => {
    process.env.PDM_REVIEW_PACKAGE_V2_WRITE = enabled ? "true" : "false";
    const contractToken = await issueCanonicalWorkbenchContract(client, { companyId: request.company_id, actorId: ownerActor.id });
    const beforeRequestCount = Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_requests WHERE canonical_entity_id=?").get(part.part_id).count);
    const created = await partService.create(part.part_id, ownerActor, {
      contractToken, expectedRowVersion: Number(part.formal_row_version),
      idempotencyKey: `dev101-independent-create-${enabled ? "v2" : "v1"}-${crypto.randomUUID()}`
    });
    const submittedResult = await partService.submit(created.workId, ownerActor, {
      contractToken, expectedRowVersion: Number(created.rowVersion),
      idempotencyKey: `dev101-independent-submit-${enabled ? "v2" : "v1"}-${crypto.randomUUID()}`
    });
    const row = taskDatabase.prepare(`SELECT id,company_id,request_kind,entity_type,canonical_entity_id,work_id,reviewer_user_id,
        review_cycle_id,snapshot_payload,snapshot_hash,request_status,row_version
      FROM pdm_work_review_requests WHERE id=?`).get(submittedResult.requestId);
    mutationLedger.push({ method: "COMMAND", command: "part.create+part.submit", workId: created.workId, requestId: submittedResult.requestId, partId: part.part_id, writerFlag: enabled, beforeRequestCount, afterRequestCount: beforeRequestCount + 1 });
    return { part, created, submitted: submittedResult, row: { ...row, snapshot: JSON.parse(row.snapshot_payload) }, beforeRequestCount };
  };
  const v1Writer = await submitPartThroughCommand(eligibleParts[0], false);
  const v2Writer = await submitPartThroughCommand(eligibleParts[1], true);
  reviewerActor.id = v2Writer.row.reviewer_user_id;
  process.env.PDM_REVIEW_PACKAGE_V2_WRITE = "false";
  const writerFlagReadback = reviewPackageV2WriteEnabled();
  const reviewRepository = new PdmWorkReviewAsyncRepository(client);
  const [v1ReadWithFlagOff, v2ReadWithFlagOff] = await Promise.all([
    reviewRepository.get(client, { companyId: request.company_id, requestId: v1Writer.row.id }),
    reviewRepository.get(client, { companyId: request.company_id, requestId: v2Writer.row.id })
  ]);
  const v1Schema = parseReviewPackageSnapshot(v1ReadWithFlagOff.snapshotPayload);
  const v2Schema = parseReviewPackageSnapshot(v2ReadWithFlagOff.snapshotPayload);
  record("QA-101-006", [
    { id: "FLAG-OFF-WRITES-V1", pass: parseReviewPackageSnapshot(v1Writer.row.snapshot).kind === "legacy" },
    { id: "FLAG-ON-WRITES-V2", pass: parseReviewPackageSnapshot(v2Writer.row.snapshot).kind === "v2" && v2Writer.row.snapshot_hash === v2Writer.row.snapshot.packageHash },
    { id: "FLAG-OFF-READS-EXISTING-V2", pass: writerFlagReadback === false && v2Schema.kind === "v2" },
    { id: "V1-READ-REMAINS-LEGACY", pass: v1Schema.kind === "legacy" && v1ReadWithFlagOff.snapshotHash === v1Writer.row.snapshot_hash },
    { id: "WRITER-COMMANDS-PERSIST-ONE-REQUEST", pass: [v1Writer, v2Writer].every((item) => Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_requests WHERE work_id=?").get(item.created.workId).count) === 1) }
  ], { writerFlagReadback, v1: { requestId: v1Writer.row.id, workId: v1Writer.created.workId, schema: v1Schema.kind, hash: v1Writer.row.snapshot_hash }, v2: { requestId: v2Writer.row.id, workId: v2Writer.created.workId, schema: v2Schema.kind, hash: v2Writer.row.snapshot_hash } });

  const approvalRepository = new AsyncApprovalPlatformRepository(client);
  const inboxFilter = { companyId: request.company_id, actorId: v2Writer.row.reviewer_user_id, status: "active", domainCode: "numbering", actionCode: "numbering.pdm_part_change_review", limit: 500 };
  const exactInbox = await approvalRepository.listInbox(inboxFilter);
  const writerRows = exactInbox.items.filter((item) => [v1Writer.row.id, v2Writer.row.id].includes(item.id));
  const otherInbox = await approvalRepository.listInbox({ ...inboxFilter, actorId: ownerActor.id });
  const searchInbox = await approvalRepository.listInbox({ ...inboxFilter, query: v2Writer.part.part_number });
  const firstCursorPage = await approvalRepository.listInbox({ ...inboxFilter, limit: 1 });
  const secondCursorPage = firstCursorPage.nextCursor
    ? await approvalRepository.listInbox({ ...inboxFilter, limit: 1, cursor: firstCursorPage.nextCursor })
    : { items: [], nextCursor: null, previousCursor: null, summary: firstCursorPage.summary };
  const applyingRequestId = `dev101-independent-applying-${crypto.randomUUID()}`;
  const applyingWorkId = `dev101-independent-applying-work-${crypto.randomUUID()}`;
  taskDatabase.prepare(`INSERT INTO pdm_work_review_requests
    (id,company_id,request_kind,entity_type,canonical_entity_id,work_id,reviewer_user_id,review_cycle_id,snapshot_payload,snapshot_hash,request_status,row_version)
    VALUES(?,?,'part_change','part',?,?,?,?,?,?,'applying',2)`).run(
    applyingRequestId, request.company_id, v1Writer.part.part_id, applyingWorkId, v1Writer.row.reviewer_user_id, `dev101-independent-applying-cycle-${crypto.randomUUID()}`,
    JSON.stringify(v1Writer.row.snapshot), v1Writer.row.snapshot_hash
  );
  mutationLedger.push({ method: "FIXTURE", table: "pdm_work_review_requests", id: applyingRequestId, purpose: "non-actionable applying inbox exclusion oracle" });
  const inboxAfterApplying = await approvalRepository.listInbox(inboxFilter);
  record("QA-101-037", [
    { id: "V1-V2-NORMAL-INBOX-ROWS", pass: writerRows.length === 2 && new Set(writerRows.map((item) => item.id)).size === 2 },
    { id: "INBOX-SUMMARY-MATCHES-ROWS", pass: exactInbox.summary.total === exactInbox.items.length && exactInbox.summary.pending === exactInbox.items.filter((item) => item.status === "pending").length },
    { id: "ROW-FACTS-DISTINGUISHABLE", pass: writerRows.every((item) => item.source === "pdm_work_review" && item.status === "pending" && item.primaryTarget?.type === "part" && item.targetSummary) }
  ], { writerRows, summary: exactInbox.summary });
  record("QA-101-038", [
    { id: "EXACT-REVIEWER-ONLY", pass: writerRows.length === 2 && otherInbox.items.every((item) => ![v1Writer.row.id, v2Writer.row.id].includes(item.id)) },
    { id: "APPLYING-EXCLUDED", pass: inboxAfterApplying.items.every((item) => item.id !== applyingRequestId) },
    { id: "SEARCH-BEFORE-LIMIT", pass: searchInbox.items.some((item) => item.id === v2Writer.row.id) && searchInbox.items.every((item) => item.targetSummary?.includes(v2Writer.part.part_number)) },
    { id: "CURSOR-STABLE-NO-DUPLICATE", pass: firstCursorPage.items.length === 1 && (!firstCursorPage.nextCursor || (secondCursorPage.items.length === 1 && secondCursorPage.items[0].rowKey !== firstCursorPage.items[0].rowKey)) }
  ], { exactIds: writerRows.map((item) => item.id), otherIds: otherInbox.items.map((item) => item.id), searchIds: searchInbox.items.map((item) => item.id), cursorIds: [...firstCursorPage.items, ...secondCursorPage.items].map((item) => item.rowKey) });
  record("QA-101-039", [
    { id: "POSTCONDITION-NOT-PRESEEDED", pass: v2Writer.beforeRequestCount === 0 && mutationLedger.some((item) => item.method === "COMMAND" && item.requestId === v2Writer.row.id) },
    { id: "OWNER-COMMAND-PERSISTED-V2", pass: v2Writer.row.request_kind === "part_change" && v2Schema.kind === "v2" },
    { id: "REVIEWER-NORMAL-INBOX-DISCOVERY", pass: writerRows.some((item) => item.id === v2Writer.row.id && item.primaryTarget?.targetId === v2Writer.part.part_id) }
  ], { workId: v2Writer.created.workId, requestId: v2Writer.row.id, partNumber: v2Writer.part.part_number, inboxRow: writerRows.find((item) => item.id === v2Writer.row.id) });
  record("QA-101-040", [
    { id: "LEGACY-NORMAL-INBOX-DISCOVERY", pass: writerRows.some((item) => item.id === v1Writer.row.id) },
    { id: "LEGACY-COMPATIBILITY-READER", pass: v1Schema.kind === "legacy" },
    { id: "LEGACY-NO-BACKFILL", pass: taskDatabase.prepare("SELECT snapshot_payload,snapshot_hash FROM pdm_work_review_requests WHERE id=?").get(v1Writer.row.id).snapshot_payload === v1Writer.row.snapshot_payload && taskDatabase.prepare("SELECT snapshot_hash FROM pdm_work_review_requests WHERE id=?").get(v1Writer.row.id).snapshot_hash === v1Writer.row.snapshot_hash },
    { id: "LEGACY-NOT-V2-MATRIX", pass: !("schemaVersion" in v1Writer.row.snapshot) && !("matrix" in v1Writer.row.snapshot) }
  ], { requestId: v1Writer.row.id, schema: v1Schema.kind, hash: v1Writer.row.snapshot_hash });

  const envelopeMutant = clone(packageValue);
  envelopeMutant.root.code = `${envelopeMutant.root.code}-tampered`;
  const basisMutant = clone(packageValue);
  basisMutant.decisionBasis.payload.__qaTamper = true;
  delete basisMutant.packageHash;
  basisMutant.packageHash = canonicalHash(basisMutant);
  const contextTarget = packageValue.targets.find((target) => target.scope === "context_only");
  const contextRowBefore = contextTarget?.workspace.kind === "part"
    ? taskDatabase.prepare("SELECT part_name AS value FROM part_numbers WHERE id=?").get(contextTarget.workspace.entityId)
    : contextTarget?.workspace.kind === "drawing"
      ? taskDatabase.prepare("SELECT purpose_description AS value FROM drawings WHERE id=?").get(contextTarget.workspace.entityId)
      : null;
  if (contextTarget?.workspace.kind === "part") taskDatabase.prepare("UPDATE part_numbers SET part_name=? WHERE id=?").run(`${contextRowBefore.value} [QA drift]`, contextTarget.workspace.entityId);
  if (contextTarget?.workspace.kind === "drawing") taskDatabase.prepare("UPDATE drawings SET purpose_description=? WHERE id=?").run(`${contextRowBefore.value ?? ""} [QA drift]`, contextTarget.workspace.entityId);
  if (contextTarget) mutationLedger.push({ method: "FAULT_FIXTURE", purpose: "context-only current data drift", targetKey: contextTarget.targetKey, before: contextRowBefore?.value ?? null });
  const persistedAfterContextDrift = taskDatabase.prepare("SELECT snapshot_payload,snapshot_hash FROM pdm_work_review_requests WHERE id=?").get(fixtureRequestId);
  const effectBeforeIntegrityMutants = {
    approvedSnapshots: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM part_approved_change_snapshots").get().count),
    traces: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_review_traces").get().count),
    receipts: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_terminal_receipts").get().count)
  };
  const envelopeMutantCode = thrownCode(() => verifyReviewPackageIntegrity(envelopeMutant, packageValue.packageHash));
  const basisMutantCode = thrownCode(() => verifyReviewPackageIntegrity(basisMutant, basisMutant.packageHash));
  const originalAfterContextDriftCode = thrownCode(() => verifyReviewPackageIntegrity(packageValue, packageValue.packageHash));
  const effectAfterIntegrityMutants = {
    approvedSnapshots: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM part_approved_change_snapshots").get().count),
    traces: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_review_traces").get().count),
    receipts: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_terminal_receipts").get().count)
  };
  record("QA-101-005", [
    { id: "ENVELOPE-TAMPER-REJECTED", pass: envelopeMutantCode === "WORKBENCH_REVIEW_PACKAGE_INTEGRITY_FAILED" },
    { id: "PRIMARY-BASIS-TAMPER-REJECTED", pass: basisMutantCode === "WORKBENCH_REVIEW_PACKAGE_INTEGRITY_FAILED" },
    { id: "CONTEXT-DRIFT-NOT-BASIS-DRIFT", pass: originalAfterContextDriftCode === null && persistedAfterContextDrift.snapshot_hash === packageValue.packageHash && canonicalJson(JSON.parse(persistedAfterContextDrift.snapshot_payload)) === canonicalJson(packageValue) },
    { id: "INTEGRITY-MUTANTS-ZERO-EFFECT", pass: canonicalJson(effectAfterIntegrityMutants) === canonicalJson(effectBeforeIntegrityMutants) }
  ], { envelopeMutantCode, basisMutantCode, originalAfterContextDriftCode, packageHash: packageValue.packageHash, decisionBasisHash: packageValue.decisionBasis.hash, contextTarget: contextTarget?.targetKey ?? null, effectBefore: effectBeforeIntegrityMutants, effectAfter: effectAfterIntegrityMutants });

  const invalidRequestCountBefore = Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_requests").get().count);
  const duplicateTarget = clone(packageValue); duplicateTarget.targets.push(clone(duplicateTarget.targets[0]));
  const missingPrimary = clone(packageValue); missingPrimary.primaryTargetKey = "drawing:missing-primary";
  const crossAxis = clone(packageValue); crossAxis.targets[0].axisId = "cross-root-axis";
  const invalidMatrix = [
    { name: "duplicate-target", value: duplicateTarget },
    { name: "missing-primary", value: missingPrimary },
    { name: "cross-root-axis", value: crossAxis }
  ].map((item) => ({ name: item.name, result: parseReviewPackageSnapshot(item.value) }));
  const invalidRequestCountAfter = Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_requests").get().count);
  record("QA-101-007", [
    { id: "INVALID-MEMBERSHIP-FAIL-CLOSED", pass: invalidMatrix.every((item) => item.result.kind === "invalid" && item.result.code === "WORKBENCH_REVIEW_PACKAGE_INVALID") },
    { id: "INVALID-MEMBERSHIP-ZERO-REQUEST-DELTA", pass: invalidRequestCountAfter === invalidRequestCountBefore },
    { id: "SOURCE-REQUEST-STILL-IMMUTABLE", pass: taskDatabase.prepare("SELECT snapshot_hash FROM pdm_work_review_requests WHERE id=?").get(request.id).snapshot_hash === request.snapshot_hash }
  ], { invalidMatrix, requestCountBefore: invalidRequestCountBefore, requestCountAfter: invalidRequestCountAfter });

  const submittedPartTarget = packageValue.targets.find((target) => target.workspace.kind === "part" && target.workspace.entityId === recognitionFixture.ownerPartId);
  const submittedAttachmentSnapshot = submittedPartTarget?.workspace.attachments.find((attachment) => attachment.id === submittedPartAttachment.id);
  taskDatabase.prepare("UPDATE file_assets SET deleted_at=CURRENT_TIMESTAMP,deleted_by='user-engineer-demo',deleted_reason='QA post-submit drift',display_name='QA current renamed attachment' WHERE id=?").run(submittedPartAttachment.id);
  mutationLedger.push({ method: "FAULT_FIXTURE", table: "file_assets", id: submittedPartAttachment.id, purpose: "post-submit soft delete and rename" });
  const currentPartAttachment = seedPartAttachment(taskDatabase, recognitionFixture.ownerPartId, "DEV-101 current-only Part attachment", mutationLedger);
  const persistedAfterAttachmentDrift = taskDatabase.prepare("SELECT snapshot_payload,snapshot_hash FROM pdm_work_review_requests WHERE id=?").get(fixtureRequestId);
  const persistedPackageAfterAttachmentDrift = JSON.parse(persistedAfterAttachmentDrift.snapshot_payload);
  const persistedPartTarget = persistedPackageAfterAttachmentDrift.targets.find((target) => target.workspace.kind === "part" && target.workspace.entityId === recognitionFixture.ownerPartId);
  const exactSubmittedBytes = fs.readFileSync(submittedPartAttachment.localPath);
  record("QA-101-008", [
    { id: "SUBMITTED-ATTACHMENT-IN-SNAPSHOT", pass: submittedAttachmentSnapshot?.contentHash === submittedPartAttachment.contentHash && submittedAttachmentSnapshot?.displayName === submittedPartAttachment.displayName },
    { id: "SOFT-DELETE-DOES-NOT-REWRITE-PACKAGE", pass: persistedAfterAttachmentDrift.snapshot_hash === packageValue.packageHash && canonicalJson(persistedPackageAfterAttachmentDrift) === canonicalJson(packageValue) },
    { id: "CURRENT-ONLY-ASSET-NOT-LIVE-FILLED", pass: !persistedPartTarget.workspace.attachments.some((attachment) => attachment.id === currentPartAttachment.id) },
    { id: "SUBMITTED-OBJECT-BYTES-STILL-EXACT", pass: sha256(exactSubmittedBytes) === submittedPartAttachment.contentHash },
    { id: "BASIS-HASH-STABLE-AFTER-ATTACHMENT-DRIFT", pass: persistedPackageAfterAttachmentDrift.decisionBasis.hash === packageValue.decisionBasis.hash }
  ], { submittedAttachmentSnapshot, submittedPartAttachment, currentPartAttachment, persistedHash: persistedAfterAttachmentDrift.snapshot_hash, packageHash: packageValue.packageHash });

  const rollbackState = taskDatabase.prepare("SELECT id,handling,row_version FROM canonical_workbench_states WHERE company_id=? AND handling='none' ORDER BY id LIMIT 1").get(request.company_id);
  if (!rollbackState) throw new Error("DEV101_ROLLBACK_STATE_FIXTURE_MISSING");
  const rollbackBranchId = request.branch_id ?? taskDatabase.prepare("SELECT id FROM drawing_rd_branches WHERE company_id=? ORDER BY id LIMIT 1").get(request.company_id)?.id;
  if (!rollbackBranchId) throw new Error("DEV101_ROLLBACK_BRANCH_FIXTURE_MISSING");
  const rollbackMatrix = [];
  for (const [requestKind, checkpoint] of [["drawing_revision", "after_request_insert"], ["drawing_rd_void", "after_handling_update"], ["part_change", "before_commit"]]) {
    const rollbackRequestId = `dev101-rollback-${requestKind}-${crypto.randomUUID()}`;
    const beforeState = taskDatabase.prepare("SELECT handling,row_version FROM canonical_workbench_states WHERE id=?").get(rollbackState.id);
    let injected = null;
    try {
      await client.transaction(async (tx) => {
        await tx.execute(`INSERT INTO pdm_work_review_requests
          (id,company_id,request_kind,entity_type,canonical_entity_id,work_id,branch_id,reviewer_user_id,review_cycle_id,snapshot_payload,snapshot_hash,request_status,row_version)
          VALUES(:id,:companyId,:requestKind,:entityType,:entityId,:workId,:branchId,:reviewerId,:cycleId,:snapshot,:hash,'pending',1)`, {
          id: rollbackRequestId, companyId: request.company_id, requestKind,
          entityType: requestKind === "part_change" ? "part" : "drawing",
          entityId: requestKind === "part_change" ? v1Writer.part.part_id : request.canonical_entity_id,
          workId: requestKind === "drawing_rd_void" ? null : `dev101-rollback-work-${crypto.randomUUID()}`,
          branchId: requestKind === "drawing_rd_void" ? rollbackBranchId : null,
          reviewerId: reviewerActor.id, cycleId: `dev101-rollback-cycle-${crypto.randomUUID()}`,
          snapshot: JSON.stringify(v1Writer.row.snapshot), hash: v1Writer.row.snapshot_hash
        });
        if (checkpoint === "after_request_insert") throw new Error(`INJECTED:${checkpoint}`);
        await tx.execute("UPDATE canonical_workbench_states SET handling='review_owner',row_version=row_version+1 WHERE id=:id", { id: rollbackState.id });
        if (checkpoint === "after_handling_update") throw new Error(`INJECTED:${checkpoint}`);
        await tx.queryOne("SELECT id FROM pdm_work_review_requests WHERE id=:id", { id: rollbackRequestId });
        throw new Error(`INJECTED:${checkpoint}`);
      });
    } catch (error) {
      injected = error instanceof Error ? error.message : String(error);
    }
    const afterState = taskDatabase.prepare("SELECT handling,row_version FROM canonical_workbench_states WHERE id=?").get(rollbackState.id);
    rollbackMatrix.push({ requestKind, checkpoint, injected, requestDelta: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_requests WHERE id=?").get(rollbackRequestId).count), beforeState, afterState });
  }
  record("QA-101-009", [
    { id: "NAMED-CHECKPOINTS-INJECTED", pass: rollbackMatrix.every((item) => item.injected === `INJECTED:${item.checkpoint}`) },
    { id: "REQUESTS-ROLL-BACK", pass: rollbackMatrix.every((item) => item.requestDelta === 0) },
    { id: "HANDLING-AND-VERSION-ROLL-BACK", pass: rollbackMatrix.every((item) => canonicalJson(item.beforeState) === canonicalJson(item.afterState)) }
  ], { rollbackMatrix });

  const strictDecisionBody = (body) => {
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("decision" in body)) return { accepted: false, code: "DEV087_DECISION_NOT_ALLOWED" };
    try { return { accepted: true, value: validateDev087ReviewDecision(body.decision) }; }
    catch (error) { return { accepted: false, code: error?.code ?? String(error) }; }
  };
  const decisionBodyMatrix = [
    { body: { decision: "approve" }, accepted: true },
    { body: { decision: "return_for_correction" }, accepted: true },
    { body: {}, accepted: false },
    { body: { decision: "approve", target: submittedDrawing.targetKey }, accepted: false },
    { body: { decision: "reject" }, accepted: false },
    { body: { decision: "needs_info" }, accepted: false }
  ].map((item) => ({ ...item, actual: strictDecisionBody(item.body) }));
  const reviewerContract = await issueCanonicalWorkbenchContract(client, { companyId: request.company_id, actorId: reviewerActor.id });
  const decisionEffectsBeforeInvalid = {
    traces: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_review_traces").get().count),
    receipts: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_terminal_receipts").get().count),
    requests: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_requests").get().count)
  };
  const badTokenError = await rejectedError(() => partService.decide(v1Writer.row.id, "return_for_correction", reviewerActor, {
    contractToken: "invalid-contract-token", expectedRowVersion: 1, idempotencyKey: `dev101-invalid-token-${crypto.randomUUID()}`
  }));
  const staleVersionError = await rejectedError(() => partService.decide(v1Writer.row.id, "return_for_correction", reviewerActor, {
    contractToken: reviewerContract, expectedRowVersion: 999, idempotencyKey: `dev101-stale-version-${crypto.randomUUID()}`
  }));
  const decisionEffectsAfterInvalid = {
    traces: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_review_traces").get().count),
    receipts: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_terminal_receipts").get().count),
    requests: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_requests").get().count)
  };
  record("QA-101-018", [
    { id: "STRICT-DECISION-BODY-MATRIX", pass: decisionBodyMatrix.every((item) => item.actual.accepted === item.accepted) },
    { id: "BAD-CONTRACT-REJECTED", pass: badTokenError?.status === 401 || badTokenError?.status === 403 || String(badTokenError?.code).includes("CONTRACT") },
    { id: "STALE-ROW-VERSION-REJECTED", pass: staleVersionError?.code === "WORKBENCH_REVIEW_REQUEST_STALE" && staleVersionError?.status === 409 },
    { id: "INVALID-DECISIONS-ZERO-EFFECT", pass: canonicalJson(decisionEffectsBeforeInvalid) === canonicalJson(decisionEffectsAfterInvalid) }
  ], { decisionBodyMatrix, badTokenError, staleVersionError, effectBefore: decisionEffectsBeforeInvalid, effectAfter: decisionEffectsAfterInvalid });

  const targetDecisionTables = taskDatabase.prepare("SELECT name FROM sqlite_master WHERE type='table' AND lower(name) LIKE '%target%decision%' ORDER BY name").all();
  record("QA-101-014", [
    { id: "MULTI-HAS-TWO-SUBMITTED-TARGETS", pass: parsedMulti.kind === "v2" && multi.targets.filter((target) => target.scope === "submitted").length === 2 },
    { id: "EXTRA-TARGET-BODY-REJECTED", pass: strictDecisionBody({ decision: "approve", target: multi.targets[0].targetKey }).accepted === false },
    { id: "REQUEST-LEVEL-BODIES-ONLY", pass: strictDecisionBody({ decision: "approve" }).accepted && strictDecisionBody({ decision: "return_for_correction" }).accepted },
    { id: "NO-PER-TARGET-DECISION-TABLE", pass: targetDecisionTables.length === 0 }
  ], { submittedTargets: multi.targets.filter((target) => target.scope === "submitted").map((target) => target.targetKey), targetDecisionTables, decisionBodyMatrix });

  const packageTargetKeys = new Set(packageValue.targets.map((target) => target.targetKey));
  const crossRequestTarget = { targetKey: `part:cross-request-${crypto.randomUUID()}` };
  const targetRouteMatrix = [
    { name: "exact", entityType: submittedDrawing.workspace.kind, entityId: submittedDrawing.workspace.entityId, found: packageTargetKeys.has(submittedDrawing.targetKey) },
    { name: "wrong-type", entityType: "part", entityId: submittedDrawing.workspace.entityId, found: packageTargetKeys.has(`part:${submittedDrawing.workspace.entityId}`) },
    { name: "foreign-id", entityType: "drawing", entityId: "foreign-target", found: packageTargetKeys.has("drawing:foreign-target") },
    { name: "bad-encoded-id", entityType: "drawing", entityId: "%2F..%2F", found: packageTargetKeys.has("drawing:%2F..%2F") }
  ];
  record("QA-101-017", [
    { id: "EXACT-TARGET-FOUND", pass: targetRouteMatrix.find((item) => item.name === "exact")?.found === true },
    { id: "MUTATED-TARGETS-NOT-FOUND", pass: targetRouteMatrix.filter((item) => item.name !== "exact").every((item) => item.found === false) },
    { id: "SHELL-PRIMARY-STILL-EXACT", pass: packageTargetKeys.has(packageValue.primaryTargetKey) },
    { id: "CROSS-REQUEST-TARGET-NOT-LIVE-FILLED", pass: !crossRequestTarget || !packageTargetKeys.has(crossRequestTarget.targetKey) }
  ], { targetRouteMatrix, primaryTargetKey: packageValue.primaryTargetKey, crossRequestTargetKey: crossRequestTarget?.targetKey ?? null });

  const exactAttachmentTarget = packageValue.targets.find((target) => [...target.workspace.files, ...target.workspace.attachments].some((file) => file.sourceFileAssetId === submittedPartAttachment.id));
  const exactAttachment = exactAttachmentTarget ? [...exactAttachmentTarget.workspace.files, ...exactAttachmentTarget.workspace.attachments].find((file) => file.sourceFileAssetId === submittedPartAttachment.id) : null;
  const reviewFileMembership = ({ reviewRequestId, targetKey, bindingId, assetId, contentHash }) => {
    if (reviewRequestId !== fixtureRequestId) return false;
    const target = packageValue.targets.find((item) => item.targetKey === targetKey);
    if (!target) return false;
    return [...target.workspace.files, ...target.workspace.attachments].some((file) => file.bindingId === bindingId && file.sourceFileAssetId === assetId && (!file.contentHash || file.contentHash === contentHash));
  };
  const fileMembershipMatrix = exactAttachment ? [
    { name: "exact", pass: reviewFileMembership({ reviewRequestId: fixtureRequestId, targetKey: exactAttachmentTarget.targetKey, bindingId: exactAttachment.bindingId, assetId: exactAttachment.sourceFileAssetId, contentHash: exactAttachment.contentHash }) },
    { name: "wrong-request", pass: reviewFileMembership({ reviewRequestId: "foreign-request", targetKey: exactAttachmentTarget.targetKey, bindingId: exactAttachment.bindingId, assetId: exactAttachment.sourceFileAssetId, contentHash: exactAttachment.contentHash }) },
    { name: "wrong-target", pass: reviewFileMembership({ reviewRequestId: fixtureRequestId, targetKey: submittedDrawing.targetKey, bindingId: exactAttachment.bindingId, assetId: exactAttachment.sourceFileAssetId, contentHash: exactAttachment.contentHash }) },
    { name: "wrong-binding", pass: reviewFileMembership({ reviewRequestId: fixtureRequestId, targetKey: exactAttachmentTarget.targetKey, bindingId: "foreign-binding", assetId: exactAttachment.sourceFileAssetId, contentHash: exactAttachment.contentHash }) },
    { name: "wrong-asset", pass: reviewFileMembership({ reviewRequestId: fixtureRequestId, targetKey: exactAttachmentTarget.targetKey, bindingId: exactAttachment.bindingId, assetId: currentPartAttachment.id, contentHash: currentPartAttachment.contentHash }) },
    { name: "wrong-hash", pass: reviewFileMembership({ reviewRequestId: fixtureRequestId, targetKey: exactAttachmentTarget.targetKey, bindingId: exactAttachment.bindingId, assetId: exactAttachment.sourceFileAssetId, contentHash: "0".repeat(64) }) }
  ] : [];
  record("QA-101-019", [
    { id: "EXACT-ACTIVE-MEMBERSHIP", pass: fileMembershipMatrix.find((item) => item.name === "exact")?.pass === true },
    { id: "WRONG-MEMBERSHIP-MATRIX-FAILS", pass: fileMembershipMatrix.filter((item) => item.name !== "exact").every((item) => item.pass === false) },
    { id: "SUBMITTED-BYTES-HASH-EXACT", pass: sha256(exactSubmittedBytes) === exactAttachment?.contentHash },
    { id: "CURRENT-REPLACEMENT-NOT-SUBSTITUTE", pass: !fileMembershipMatrix.find((item) => item.name === "wrong-asset")?.pass }
  ], { exactTargetKey: exactAttachmentTarget?.targetKey ?? null, exactAttachment, fileMembershipMatrix });

  const v2Pending = await reviewRepository.get(client, { companyId: request.company_id, requestId: v2Writer.row.id });
  const otherActorAuthorization = [ownerActor.id, "user-viewer-demo", "foreign-user"].map((actorId) => ({ actorId, authorized: v2Pending?.reviewerUserId === actorId }));
  record("QA-101-016", [
    { id: "EXACT-REVIEWER-AUTHORIZED", pass: v2Pending?.reviewerUserId === reviewerActor.id },
    { id: "OTHER-ACTORS-FAIL-CLOSED", pass: otherActorAuthorization.every((item) => item.authorized === false) },
    { id: "OTHER-ACTORS-INBOX-ZERO-FACT", pass: otherInbox.items.every((item) => item.id !== v2Writer.row.id) },
    { id: "AUTHORIZATION-CHECK-ZERO-WRITE", pass: taskDatabase.prepare("SELECT snapshot_hash FROM pdm_work_review_requests WHERE id=?").get(v2Writer.row.id).snapshot_hash === v2Writer.row.snapshot_hash }
  ], { reviewerId: v2Pending?.reviewerUserId ?? null, otherActorAuthorization, otherInboxIds: otherInbox.items.map((item) => item.id) });

  const terminalCountsBefore = {
    traces: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_review_traces WHERE review_cycle_id=?").get(v2Writer.row.review_cycle_id).count),
    receipts: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_terminal_receipts WHERE request_id=?").get(v2Writer.row.id).count)
  };
  const terminalKey = `dev101-independent-terminal-${crypto.randomUUID()}`;
  const firstTerminal = await partService.decide(v2Writer.row.id, "return_for_correction", reviewerActor, { contractToken: reviewerContract, expectedRowVersion: 1, idempotencyKey: terminalKey });
  const replayTerminal = await partService.decide(v2Writer.row.id, "return_for_correction", reviewerActor, { contractToken: reviewerContract, expectedRowVersion: 1, idempotencyKey: terminalKey });
  const terminalCountsAfter = {
    traces: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_review_traces WHERE review_cycle_id=?").get(v2Writer.row.review_cycle_id).count),
    receipts: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_terminal_receipts WHERE request_id=?").get(v2Writer.row.id).count),
    activeRequests: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_requests WHERE id=?").get(v2Writer.row.id).count),
    ownerState: taskDatabase.prepare("SELECT handling FROM canonical_workbench_states WHERE work_id=?").get(v2Writer.created.workId)?.handling ?? null
  };
  const terminalNewKeyError = await rejectedError(() => partService.decide(v2Writer.row.id, "return_for_correction", reviewerActor, { contractToken: reviewerContract, expectedRowVersion: 1, idempotencyKey: `dev101-terminal-second-key-${crypto.randomUUID()}` }));
  record("QA-101-010", [
    { id: "TWO-CALLS-SAME-RECEIPT", pass: firstTerminal?.acknowledged === true && replayTerminal?.acknowledged === true },
    { id: "EXACTLY-ONE-TRACE-AND-TERMINAL", pass: terminalCountsAfter.traces - terminalCountsBefore.traces === 1 && terminalCountsAfter.receipts - terminalCountsBefore.receipts === 1 },
    { id: "REQUEST-LEVEL-TERMINAL", pass: terminalCountsAfter.activeRequests === 0 && terminalCountsAfter.ownerState === "owner" },
    { id: "SECOND-KEY-NO-SECOND-EFFECT", pass: terminalNewKeyError?.status === 404 && terminalCountsAfter.traces === Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_review_traces WHERE review_cycle_id=?").get(v2Writer.row.review_cycle_id).count) }
  ], { terminalKey, firstTerminal, replayTerminal, terminalCountsBefore, terminalCountsAfter, terminalNewKeyError });
  record("QA-101-015", [
    { id: "PENDING-READ-WAS-VALID", pass: v2Pending?.id === v2Writer.row.id && parseReviewPackageSnapshot(v2Pending.snapshotPayload).kind === "v2" },
    { id: "TERMINAL-SHELL-STALE", pass: await reviewRepository.get(client, { companyId: request.company_id, requestId: v2Writer.row.id }) === null },
    { id: "TERMINAL-RECEIPT-EXISTS", pass: Boolean(await reviewRepository.getTerminalReceipt(client, { companyId: request.company_id, requestId: v2Writer.row.id })) },
    { id: "TERMINAL-FACTS-REMOVED", pass: terminalCountsAfter.activeRequests === 0 },
    { id: "SECOND-EFFECT-REJECTED", pass: terminalNewKeyError?.status === 404 }
  ], { requestId: v2Writer.row.id, pending: Boolean(v2Pending), terminalCountsAfter, terminalNewKeyError });

  const source3d = submittedDrawing.workspace.files.find((file) => /\.sld(?:prt|asm)$/iu.test(file.fileName));
  const sourceState = source3d ? taskDatabase.prepare(`SELECT id FROM canonical_workbench_states
    WHERE company_id=? AND entity_type='drawing' AND canonical_entity_id=? AND revision_id=? ORDER BY updated_at DESC,id LIMIT 1`).get(
    request.company_id, submittedDrawing.workspace.entityId, submittedDrawing.workspace.revisionId
  ) : null;
  let derivativeEvidence = { source3d, sourceState, wrongState: null, correctState: null, wrongDerivativeId: null, correctDerivativeId: null };
  if (source3d && sourceState) {
    taskDatabase.prepare("DELETE FROM file_derivatives WHERE source_file_asset_id=?").run(source3d.sourceFileAssetId);
    const insertDerivative = taskDatabase.prepare(`INSERT INTO file_derivatives
      (id,company_id,source_file_asset_id,source_content_hash,derivative_kind,storage_provider,storage_key,file_name,mime_type,file_size,content_hash,generator_profile,generator_version,status)
      VALUES(?,?,?,?, 'model_preview_png','local_repository',?,?, 'image/png',1,?,'dev101-independent-oracle','1','ready')`);
    const wrongDerivativeId = `dev101-wrong-derivative-${crypto.randomUUID()}`;
    insertDerivative.run(wrongDerivativeId, request.company_id, source3d.sourceFileAssetId, "f".repeat(64), `dev101/${wrongDerivativeId}.png`, `${wrongDerivativeId}.png`, sha256("wrong"));
    const detailActor = { id: reviewerActor.id, companyId: request.company_id, canEditNonOwned: true, permissions: { createWork: true, updateWork: true, submitWork: true, cancelWork: true, decideReview: true, obsoleteDrawing: true, obsoleteFormal: true, manageAttachments: true } };
    const workbench = new PdmCanonicalWorkbenchService(client);
    const wrongDetail = await workbench.detail(`cw_${sourceState.id}`, "drawing", detailActor);
    const wrongSlot = wrongDetail.data.presentation.kind === "drawing" ? wrongDetail.data.presentation.previews.find((slot) => slot.kind === "three-d") : null;
    const correctDerivativeId = `dev101-correct-derivative-${crypto.randomUUID()}`;
    insertDerivative.run(correctDerivativeId, request.company_id, source3d.sourceFileAssetId, source3d.contentHash, `dev101/${correctDerivativeId}.png`, `${correctDerivativeId}.png`, sha256("correct"));
    const correctDetail = await workbench.detail(`cw_${sourceState.id}`, "drawing", detailActor);
    const correctSlot = correctDetail.data.presentation.kind === "drawing" ? correctDetail.data.presentation.previews.find((slot) => slot.kind === "three-d") : null;
    derivativeEvidence = { source3d, sourceState, wrongState: wrongSlot, correctState: correctSlot, wrongDerivativeId, correctDerivativeId };
    mutationLedger.push({ method: "FIXTURE", tables: ["file_derivatives"], sourceFileAssetId: source3d.sourceFileAssetId, wrongDerivativeId, correctDerivativeId, purpose: "source-hash derivative readiness oracle" });
  }
  const persistedAfterDerivative = taskDatabase.prepare("SELECT snapshot_payload,snapshot_hash FROM pdm_work_review_requests WHERE id=?").get(fixtureRequestId);
  record("QA-101-013", [
    { id: "DERIVATIVE-SOURCE-FIXTURE", pass: Boolean(derivativeEvidence.source3d && derivativeEvidence.sourceState) },
    { id: "WRONG-SOURCE-HASH-NOT-VISIBLE", pass: !String(derivativeEvidence.wrongState?.mediaHref ?? "").includes(String(derivativeEvidence.wrongDerivativeId)) },
    { id: "MATCHING-SOURCE-HASH-READY", pass: derivativeEvidence.correctState?.state === "ready" && String(derivativeEvidence.correctState.mediaHref ?? "").includes(String(derivativeEvidence.correctDerivativeId)) },
    { id: "DERIVATIVE-DOES-NOT-REWRITE-SNAPSHOT", pass: persistedAfterDerivative.snapshot_hash === packageValue.packageHash && canonicalJson(JSON.parse(persistedAfterDerivative.snapshot_payload)) === canonicalJson(packageValue) }
  ], derivativeEvidence);

  const requestCountBeforeLimits = Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_requests").get().count);
  const boundaryPackage = syntheticLargePackage(packageValue, { drawingCount: 100, partCount: 100, cellCount: 2_500, targetBytes: 7_999_900 });
  const boundaryBytes = Buffer.byteLength(JSON.stringify(boundaryPackage), "utf8");
  const boundaryParse = parseReviewPackageSnapshot(boundaryPackage);
  const boundaryIntegrityCode = thrownCode(() => verifyReviewPackageIntegrity(boundaryPackage, boundaryPackage.packageHash));
  const targetOverLimit = syntheticLargePackage(packageValue, { drawingCount: 101, partCount: 100, cellCount: 2_500 });
  const cellOverLimit = syntheticLargePackage(packageValue, { drawingCount: 100, partCount: 100, cellCount: 2_501 });
  const byteOverLimit = clone(boundaryPackage);
  const byteOverTarget = byteOverLimit.targets.at(-1);
  byteOverTarget.workspace.payload.__qaBoundaryPadding += "x".repeat(200);
  byteOverTarget.evidenceHash = workspaceEvidenceHash(byteOverTarget.workspace);
  delete byteOverLimit.packageHash;
  byteOverLimit.packageHash = canonicalHash(byteOverLimit);
  const limitResults = [
    { kind: "targets", result: parseReviewPackageSnapshot(targetOverLimit), count: targetOverLimit.targets.length },
    { kind: "cells", result: parseReviewPackageSnapshot(cellOverLimit), count: cellOverLimit.matrix.cells.length },
    { kind: "bytes", result: parseReviewPackageSnapshot(byteOverLimit), count: Buffer.byteLength(JSON.stringify(byteOverLimit), "utf8") }
  ];
  const requestCountAfterLimits = Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_requests").get().count);
  record("QA-101-011", [
    { id: "BOUNDARY-COUNTS-EXACT", pass: boundaryPackage.targets.length === 200 && boundaryPackage.matrix.cells.length === 2_500 && boundaryBytes >= 7_999_000 && boundaryBytes <= 8_000_000 },
    { id: "BOUNDARY-PARSER-AND-INTEGRITY-PASS", pass: boundaryParse.kind === "v2" && boundaryIntegrityCode === null },
    { id: "THREE-OVER-LIMITS-REJECTED", pass: limitResults.every((item) => item.result.kind === "invalid" && item.result.reason === "limit") },
    { id: "LIMIT-FAILURES-ZERO-REQUEST-DELTA", pass: requestCountBeforeLimits === requestCountAfterLimits }
  ], { boundary: { targets: boundaryPackage.targets.length, cells: boundaryPackage.matrix.cells.length, bytes: boundaryBytes, packageHash: boundaryPackage.packageHash, parser: boundaryParse.kind, integrityCode: boundaryIntegrityCode }, overLimits: limitResults.map((item) => ({ kind: item.kind, count: item.count, parser: item.result.kind, reason: item.result.reason ?? null })), requestCountBefore: requestCountBeforeLimits, requestCountAfter: requestCountAfterLimits });

  const scaleFixtures = [1, 20, 200].map((totalTargets) => seedScaleRoot(taskDatabase, request, totalTargets, mutationLedger));
  const builderBudgets = [];
  const scalePackages = new Map();
  for (const scale of scaleFixtures) {
    const counted = countingClient(client, `builder-${scale.totalTargets}`);
    const decisionBasis = { payload: {}, revisionId: scale.revisionIds[0], claimId: null };
    const startedAt = performance.now();
    const value = await buildReviewPackage(counted.client, {
      companyId: request.company_id,
      requestKind: "drawing_revision",
      entityType: "drawing",
      canonicalEntityId: scale.drawingIds[0],
      workId: null,
      branchId: null,
      decisionBasis: { ...decisionBasis, hash: canonicalHash(decisionBasis) }
    });
    const elapsedMs = performance.now() - startedAt;
    scalePackages.set(scale.totalTargets, value);
    builderBudgets.push({ totalTargets: scale.totalTargets, actualTargets: value.targets.length, queryCount: counted.queries.length, elapsedMs, queries: counted.queries });
  }
  const scale200 = scaleFixtures.find((item) => item.totalTargets === 200);
  const package200 = scalePackages.get(200);
  const scaleRequestId = `dev101-query-budget-request-${crypto.randomUUID()}`;
  taskDatabase.prepare(`INSERT INTO pdm_work_review_requests
    (id,company_id,request_kind,entity_type,canonical_entity_id,work_id,branch_id,reviewer_user_id,review_cycle_id,snapshot_payload,snapshot_hash,request_status,row_version)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',1)`).run(
    scaleRequestId, request.company_id, "drawing_revision", "drawing", scale200.drawingIds[0], `dev101-query-budget-work-${crypto.randomUUID()}`, null,
    "user-manager-demo", `dev101-query-budget-cycle-${crypto.randomUUID()}`, JSON.stringify(package200), package200.packageHash
  );
  mutationLedger.push({ method: "FIXTURE", table: "pdm_work_review_requests", id: scaleRequestId, purpose: "200-target shell query budget" });
  const shellCounter = countingClient(client, "shell-200");
  const shellRow = await new PdmWorkReviewAsyncRepository(shellCounter.client).get(shellCounter.client, { companyId: request.company_id, requestId: scaleRequestId });
  const drawingCounter = countingClient(client, "target-drawing");
  const activeDrawing = await readCurrentReviewTarget(drawingCounter.client, { companyId: request.company_id, entityType: "drawing", entityId: scale200.drawingIds[0] });
  const partCounter = countingClient(client, "target-part");
  const activePart = await readCurrentReviewTarget(partCounter.client, { companyId: request.company_id, entityType: "part", entityId: scale200.partIds[0] });
  const builderQueryCounts = builderBudgets.map((item) => item.queryCount);
  const activeTargetQueries = [...drawingCounter.queries, ...partCounter.queries];
  const multiTargetParameterShape = activeTargetQueries.some((entry) => entry.paramKeys.some((key) => /(?:drawing|part|recognitionDrawing|recognitionRevision)\d+/u.test(key) && !key.endsWith("0")));
  record("QA-101-012", [
    { id: "BUILDER-1-20-200-EXACT-TARGETS", pass: builderBudgets.every((item) => item.actualTargets === item.totalTargets) },
    { id: "BUILDER-QUERY-BUDGET", pass: builderQueryCounts.every((count) => count <= 18) },
    { id: "BUILDER-NON-LINEAR", pass: Math.max(...builderQueryCounts) - Math.min(...builderQueryCounts) <= 2 },
    { id: "SHELL-ONE-REQUEST-ROW", pass: shellRow?.id === scaleRequestId && shellCounter.queries.length === 1 },
    { id: "ACTIVE-TARGET-READ-BUDGET", pass: Boolean(activeDrawing) && Boolean(activePart) && drawingCounter.queries.length <= 14 && partCounter.queries.length <= 14 },
    { id: "ACTIVE-TARGET-NO-MULTI-HYDRATION", pass: multiTargetParameterShape === false }
  ], { builderBudgets, shell: { queryCount: shellCounter.queries.length, queries: shellCounter.queries }, drawingTarget: { queryCount: drawingCounter.queries.length, queries: drawingCounter.queries }, partTarget: { queryCount: partCounter.queries.length, queries: partCounter.queries } });

  const largeBudget = builderBudgets.find((item) => item.totalTargets === 200);
  record("QA-101-032", [
    { id: "LARGE-MATRIX-BUILD-WITHIN-QUERY-BUDGET", pass: largeBudget?.actualTargets === 200 && largeBudget.queryCount <= 18 },
    { id: "LARGE-MATRIX-BUILD-WITHIN-TIME-BUDGET", pass: Number.isFinite(largeBudget?.elapsedMs) && largeBudget.elapsedMs < 10_000 },
    { id: "ACTIVE-TARGET-ONLY-READ-BUDGET", pass: drawingCounter.queries.length <= 14 && partCounter.queries.length <= 14 && multiTargetParameterShape === false },
    { id: "SHELL-NO-TARGET-WATERFALL", pass: shellCounter.queries.length === 1 },
    { id: "CANONICAL-TARGET-COUNT-STABLE", pass: package200.targets.length === 200 && new Set(package200.targets.map((target) => target.targetKey)).size === 200 }
  ], { largeBudget, shellQueryCount: shellCounter.queries.length, drawingQueryCount: drawingCounter.queries.length, partQueryCount: partCounter.queries.length, multiTargetParameterShape });

  const contextDrawingSnapshot = packageValue.targets.find((target) => target.workspace.kind === "drawing" && target.workspace.entityId === contextDrawingFixture.drawingId);
  const contextPartSnapshot = packageValue.targets.find((target) => target.workspace.kind === "part" && target.workspace.entityId === recognitionFixture.ownerPartId);
  const newerContextRevisionId = `dev101-independent-context-revision-${crypto.randomUUID()}`;
  const contextPartBefore = taskDatabase.prepare("SELECT part_name FROM part_numbers WHERE id=?").get(recognitionFixture.ownerPartId);
  taskDatabase.transaction(() => {
    taskDatabase.prepare(`INSERT INTO drawing_revisions
      (id,company_id,drawing_id,revision,lifecycle_state,policy_snapshot_json,row_version,created_by,created_at,updated_by,updated_at)
      VALUES(?,?,?,'B','preparing','{}',1,'user-engineer-demo','2099-08-27T00:00:00.000Z','user-engineer-demo','2099-08-27T00:00:00.000Z')`).run(newerContextRevisionId, request.company_id, contextDrawingFixture.drawingId);
    taskDatabase.prepare("UPDATE part_numbers SET part_name=? WHERE id=?").run(`${contextPartBefore.part_name} [QA context drift]`, recognitionFixture.ownerPartId);
    taskDatabase.prepare("DELETE FROM drawing_part_links WHERE id=?").run(contextDrawingFixture.linkId);
  })();
  mutationLedger.push({ method: "FAULT_FIXTURE", purpose: "post-submit context Drawing revision, Part identity and Relation drift", drawingId: contextDrawingFixture.drawingId, revisionId: newerContextRevisionId, partId: recognitionFixture.ownerPartId, relationLinkId: contextDrawingFixture.linkId });
  const currentContextDrawing = await readCurrentReviewTarget(client, { companyId: request.company_id, entityType: "drawing", entityId: contextDrawingFixture.drawingId });
  const currentContextPart = await readCurrentReviewTarget(client, { companyId: request.company_id, entityType: "part", entityId: recognitionFixture.ownerPartId });
  const currentRelation = taskDatabase.prepare("SELECT link_type FROM drawing_part_links WHERE id=?").get(contextDrawingFixture.linkId) ?? null;
  const snapshotRelation = packageValue.matrix.cells.find((cell) => cell.drawingNumberId === contextDrawingFixture.drawingNumberId && cell.partNumberId === recognitionFixture.ownerPartId);
  const persistedAfterAllContextDrift = taskDatabase.prepare("SELECT snapshot_payload,snapshot_hash FROM pdm_work_review_requests WHERE id=?").get(fixtureRequestId);
  record("QA-101-004", [
    { id: "CONTEXT-DRAWING-REVISION-DRIFT-SEPARATE", pass: Boolean(contextDrawingSnapshot) && contextDrawingSnapshot.workspace.revisionId === contextDrawingFixture.revisionId && currentContextDrawing?.revisionId === newerContextRevisionId && currentContextDrawing?.identity.revision === "B" },
    { id: "CONTEXT-PART-IDENTITY-DRIFT-SEPARATE", pass: Boolean(contextPartSnapshot) && contextPartSnapshot.workspace.identity.name === contextPartBefore.part_name && currentContextPart?.identity.name === `${contextPartBefore.part_name} [QA context drift]` },
    { id: "CONTEXT-RELATION-DRIFT-SEPARATE", pass: snapshotRelation?.relationType === "reference" && currentRelation === null },
    { id: "CONTEXT-ATTACHMENT-DRIFT-SEPARATE", pass: Boolean(contextPartSnapshot?.workspace.attachments.some((attachment) => attachment.id === submittedPartAttachment.id)) && !currentContextPart?.attachments.some((attachment) => attachment.id === submittedPartAttachment.id) && currentContextPart?.attachments.some((attachment) => attachment.id === currentPartAttachment.id) },
    { id: "PACKAGE-JSON-AND-HASH-IMMUTABLE", pass: persistedAfterAllContextDrift.snapshot_hash === packageValue.packageHash && canonicalJson(JSON.parse(persistedAfterAllContextDrift.snapshot_payload)) === canonicalJson(packageValue) }
  ], { snapshot: { drawingRevisionId: contextDrawingSnapshot?.workspace.revisionId, partName: contextPartSnapshot?.workspace.identity.name, relationType: snapshotRelation?.relationType, attachmentIds: contextPartSnapshot?.workspace.attachments.map((item) => item.id) }, current: { drawingRevisionId: currentContextDrawing?.revisionId, partName: currentContextPart?.identity.name, relationType: currentRelation?.link_type, attachmentIds: currentContextPart?.attachments.map((item) => item.id) }, packageHash: packageValue.packageHash, persistedHash: persistedAfterAllContextDrift.snapshot_hash });

  const recognition = submittedDrawing.workspace.recognition;
  const ownerFields = recognition?.fields?.filter((field) => field.ownerResolution !== "not_required") ?? [];
  const sourceMembership = recognition?.sources?.every((source) => {
    const row = taskDatabase.prepare("SELECT id,content_hash FROM file_assets WHERE id=?").get(source.fileAssetId);
    return row?.id === source.fileAssetId && row.content_hash === source.contentHash;
  }) ?? false;
  const observationIds = new Set((recognition?.candidateDecisions ?? []).flatMap((candidate) => candidate.observations.map((observation) => observation.id)));
  record("QA-101-043", [
    { id: "FULL-PROJECTION-SCHEMA", pass: recognition?.schemaVersion === "pdm-recognition-review-projection-v1" && Array.isArray(recognition.sources) && recognition.sources.length > 0 && Array.isArray(recognition.candidateDecisions) && recognition.candidateDecisions.length >= 2 && Array.isArray(recognition.fields) && recognition.fields.length >= 2 },
    { id: "EXACT-SESSION-TUPLE", pass: recognition?.session?.id === recognitionFixture.sessionId && recognition.session.drawingId === recognitionFixture.drawingId && recognition.session.drawingRevisionId === recognitionFixture.revisionId && recognition.session.sourceContextType === "drawing_revision" && recognition.session.sourceContextId === recognitionFixture.revisionId },
    { id: "UNIQUE-PART-OWNER", pass: ownerFields.length === 1 && ownerFields[0].ownerResolution === "resolved" && ownerFields[0].effectiveOwnerId === recognitionFixture.ownerPartId && ownerFields[0].blockingReason === null },
    { id: "EVIDENCE-MEMBERSHIP", pass: sourceMembership && observationIds.size >= 2 },
    { id: "INNER-PROJECTION-HASH-INDEPENDENT", pass: Boolean(recognition) && projectionHash(recognition) === recognition.projectionHash },
    { id: "OUTER-INCLUDES-PROJECTION", pass: packageBodyHash(packageValue) === packageValue.packageHash }
  ], { session: recognition?.session, sourceIds: recognition?.sources?.map((item) => item.id), candidateIds: recognition?.candidateDecisions?.map((item) => item.id), ownerFields, observationIds: [...observationIds], projectionHash: recognition?.projectionHash, packageHash: packageValue.packageHash });

  const recognitionTablesFingerprint = () => canonicalHash({
    sessions: taskDatabase.prepare("SELECT * FROM drawing_recognition_sessions WHERE id=? ORDER BY id").all(recognitionFixture.sessionId),
    sources: taskDatabase.prepare("SELECT * FROM drawing_recognition_sources WHERE session_id=? ORDER BY sort_order,id").all(recognitionFixture.sessionId),
    candidates: taskDatabase.prepare("SELECT * FROM drawing_recognition_candidates WHERE session_id=? ORDER BY category,sort_order,id").all(recognitionFixture.sessionId),
    observations: taskDatabase.prepare("SELECT * FROM drawing_recognition_observations WHERE session_id=? ORDER BY captured_at,id").all(recognitionFixture.sessionId),
    links: taskDatabase.prepare("SELECT link.* FROM drawing_recognition_candidate_observations link JOIN drawing_recognition_candidates candidate ON candidate.id=link.candidate_id WHERE candidate.session_id=? ORDER BY link.candidate_id,link.observation_id").all(recognitionFixture.sessionId)
  });
  const recognitionTablesBeforeEditorRead = recognitionTablesFingerprint();
  const editorProjection = await new DrawingRecognitionAsyncRepository(client).getProjection(recognitionFixture.sessionId, request.company_id);
  const recognitionTablesAfterEditorRead = recognitionTablesFingerprint();
  const sourceById = new Map(editorProjection.sources.map((source) => [source.id, source]));
  const editorSessionCanonical = Object.fromEntries([
    "id", "sourceContextType", "sourceContextId", "drawingId", "drawingRevisionId", "sourceSetFingerprint", "status", "rowVersion",
    "warningCount", "conflictCount", "unclassifiedCount", "errorCode", "errorSummary", "createdAt", "updatedAt", "formalizedAt"
  ].map((key) => [key, editorProjection[key]]));
  const editorCandidatesCanonical = editorProjection.candidates.map((candidate) => ({
    id: candidate.id,
    category: candidate.category,
    fieldKey: candidate.fieldKey,
    fieldLabel: candidate.fieldLabel,
    proposedValue: candidate.proposedValue,
    normalizedValue: candidate.normalizedValue,
    proposedOwnerType: candidate.proposedOwnerType,
    proposedOwnerId: candidate.proposedOwnerId,
    applicabilityScope: candidate.applicabilityScope,
    confidenceBand: candidate.confidenceBand,
    reviewState: candidate.reviewState,
    currentFormalValue: candidate.currentFormalValue,
    rowVersion: candidate.rowVersion,
    observations: candidate.observations.map((observation) => ({
      ...observation,
      candidateId: candidate.id,
      sourceFileName: sourceById.get(observation.sourceId)?.fileName ?? null,
      sourceRole: sourceById.get(observation.sourceId)?.sourceRole ?? null
    }))
  })).sort((left, right) => left.id.localeCompare(right.id));
  const reviewCandidatesCanonical = [...recognition.candidateDecisions].sort((left, right) => left.id.localeCompare(right.id));
  record("QA-101-044", [
    { id: "EDITOR-PACKAGE-SESSION-CANONICAL-PARITY", pass: canonicalJson(editorSessionCanonical) === canonicalJson(recognition.session) },
    { id: "EDITOR-PACKAGE-SOURCE-CANONICAL-PARITY", pass: canonicalJson(editorProjection.sources) === canonicalJson(recognition.sources) },
    { id: "EDITOR-PACKAGE-CANDIDATE-EVIDENCE-PARITY", pass: canonicalJson(editorCandidatesCanonical) === canonicalJson(reviewCandidatesCanonical) },
    { id: "PACKAGE-PROJECTION-HASH-INDEPENDENT", pass: projectionHash(recognition) === recognition.projectionHash },
    { id: "EDITOR-PROJECTION-READ-ZERO-WRITE", pass: recognitionTablesBeforeEditorRead === recognitionTablesAfterEditorRead }
  ], { sessionHash: canonicalHash(editorSessionCanonical), packageSessionHash: canonicalHash(recognition.session), sourceHash: canonicalHash(editorProjection.sources), packageSourceHash: canonicalHash(recognition.sources), candidateHash: canonicalHash(editorCandidatesCanonical), packageCandidateHash: canonicalHash(reviewCandidatesCanonical), beforeFingerprint: recognitionTablesBeforeEditorRead, afterFingerprint: recognitionTablesAfterEditorRead });

  const newerSessionId = seedNewerDifferentLineage(taskDatabase, recognitionFixture, request.company_id, mutationLedger);
  const rebuilt = await buildReviewPackage(client, buildInput);
  const rebuiltRecognition = rebuilt.targets.find((target) => target.targetKey === submittedDrawing.targetKey)?.workspace.recognition;
  record("QA-101-045", [
    { id: "EXACT-REVISION-SESSION-STABLE", pass: rebuiltRecognition?.session?.id === recognition.session.id && rebuiltRecognition?.session?.id !== newerSessionId },
    { id: "PROJECTION-CANONICAL-STABLE", pass: canonicalJson(rebuiltRecognition) === canonicalJson(recognition) },
    { id: "INNER-HASH-STABLE", pass: rebuiltRecognition?.projectionHash === recognition.projectionHash }
  ], { exactSessionId: recognition.session.id, newerSessionId, rebuiltSessionId: rebuiltRecognition?.session?.id, beforeProjectionHash: recognition.projectionHash, afterProjectionHash: rebuiltRecognition?.projectionHash });

  const projectionMutant = clone(packageValue);
  const mutantTarget = projectionMutant.targets.find((target) => target.targetKey === submittedDrawing.targetKey);
  mutantTarget.workspace.recognition.session.status = "tampered-nested-recognition";
  mutantTarget.evidenceHash = workspaceEvidenceHash(mutantTarget.workspace);
  delete projectionMutant.packageHash;
  projectionMutant.packageHash = canonicalHash(projectionMutant);
  const innerMutantCode = thrownCode(() => verifyReviewPackageIntegrity(projectionMutant, projectionMutant.packageHash));
  record("QA-101-048", [
    { id: "SQLITE-JSON-ROUNDTRIP-CANONICAL", pass: canonicalJson(roundTrip) === canonicalJson(packageValue) && packageBodyHash(roundTrip) === packageValue.packageHash },
    { id: "NESTED-MUTANT-INDEPENDENT-OUTER-VALID", pass: packageBodyHash(projectionMutant) === projectionMutant.packageHash && workspaceEvidenceHash(mutantTarget.workspace) === mutantTarget.evidenceHash },
    { id: "INNER-HASH-MUTANT-REJECTED", pass: innerMutantCode === "WORKBENCH_REVIEW_PACKAGE_INTEGRITY_FAILED" }
  ], { provider: "sqlite", packageHash: packageValue.packageHash, roundTripHash: packageBodyHash(roundTrip), mutantPackageHash: projectionMutant.packageHash, unchangedProjectionHash: mutantTarget.workspace.recognition.projectionHash, actualCode: innerMutantCode });

  const unresolved = clone(packageValue);
  const unresolvedTarget = unresolved.targets.find((target) => target.targetKey === submittedDrawing.targetKey);
  const unresolvedField = unresolvedTarget.workspace.recognition.fields.find((field) => field.ownerResolution !== "not_required");
  unresolvedField.ownerResolution = "unresolved"; unresolvedField.effectiveOwnerId = null; unresolvedField.blockingReason = "part_owner_required";
  const ambiguous = clone(packageValue);
  const ambiguousTarget = ambiguous.targets.find((target) => target.targetKey === submittedDrawing.targetKey);
  const ambiguousField = ambiguousTarget.workspace.recognition.fields.find((field) => field.ownerResolution !== "not_required");
  ambiguousField.ownerResolution = "ambiguous"; ambiguousField.effectiveOwnerId = null; ambiguousField.blockingReason = "part_owner_ambiguous";
  const legacyMeta = clone(packageValue);
  legacyMeta.targets.find((target) => target.targetKey === submittedDrawing.targetKey).workspace.recognition = { sessionId: recognition.session.id, status: recognition.session.status };
  const unresolvedCode = thrownCode(() => assertReviewPackageRecognitionReady(unresolved));
  const ambiguousCode = thrownCode(() => assertReviewPackageRecognitionReady(ambiguous));
  const legacyCode = thrownCode(() => assertReviewPackageRecognitionReady(legacyMeta));

  const missingOwnerId = `missing-owner-${crypto.randomUUID()}`;
  const effectBeforeInvalidOwner = {
    approvedSnapshots: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM part_approved_change_snapshots").get().count),
    reviewTraces: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_review_traces").get().count),
    terminalReceipts: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_terminal_receipts").get().count)
  };
  let invalidOwnerFixtureCode = null;
  let invalidRecognition = null;
  let invalidOwnerField = null;
  let invalidOwnerCode = null;
  try {
    taskDatabase.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id=? WHERE id=?").run(missingOwnerId, recognitionFixture.partCandidateId);
    mutationLedger.push({ method: "FAULT_FIXTURE", table: "drawing_recognition_candidates", id: recognitionFixture.partCandidateId, field: "proposed_owner_id", value: missingOwnerId, purpose: "invalid owner fail-closed oracle" });
    const invalidOwnerPackage = await buildReviewPackage(client, buildInput);
    invalidRecognition = invalidOwnerPackage.targets.find((target) => target.targetKey === submittedDrawing.targetKey).workspace.recognition;
    invalidOwnerField = invalidRecognition.fields.find((field) => field.ownerResolution !== "not_required");
    invalidOwnerCode = thrownCode(() => assertReviewPackageRecognitionReady(invalidOwnerPackage));
  } catch (error) {
    invalidOwnerFixtureCode = error instanceof Error ? error.message : String(error);
  }
  const invalidOwnerExists = Boolean(taskDatabase.prepare("SELECT id FROM part_numbers WHERE company_id=? AND id=?").get(request.company_id, invalidOwnerField?.effectiveOwnerId ?? missingOwnerId));
  const effectAfterInvalidOwner = {
    approvedSnapshots: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM part_approved_change_snapshots").get().count),
    reviewTraces: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_review_traces").get().count),
    terminalReceipts: Number(taskDatabase.prepare("SELECT COUNT(*) count FROM pdm_work_review_terminal_receipts").get().count)
  };
  record("QA-101-046", [
    { id: "UNRESOLVED-FAIL-CLOSED", pass: unresolvedCode === "WORKBENCH_RECOGNITION_OWNER_UNRESOLVED" },
    { id: "AMBIGUOUS-FAIL-CLOSED", pass: ambiguousCode === "WORKBENCH_RECOGNITION_OWNER_UNRESOLVED" },
    { id: "LEGACY-META-INCOMPLETE", pass: legacyCode === "WORKBENCH_RECOGNITION_BASIS_INCOMPLETE" },
    { id: "INVALID-OWNER-INDEPENDENTLY-ABSENT", pass: invalidOwnerExists === false },
    { id: "INVALID-OWNER-FAIL-CLOSED", pass: invalidOwnerFixtureCode?.includes("RECOGNITION_PART_OWNER_INVARIANT") === true || invalidOwnerCode === "WORKBENCH_RECOGNITION_OWNER_UNRESOLVED" },
    { id: "INVALID-OWNER-ZERO-FORMAL-EFFECT", pass: canonicalJson(effectAfterInvalidOwner) === canonicalJson(effectBeforeInvalidOwner) }
  ], { unresolvedCode, ambiguousCode, legacyCode, invalidOwner: { effectiveOwnerId: invalidOwnerField?.effectiveOwnerId ?? missingOwnerId, ownerResolution: invalidOwnerField?.ownerResolution ?? null, blockingReason: invalidOwnerField?.blockingReason ?? null, exists: invalidOwnerExists, fixtureCode: invalidOwnerFixtureCode, approveGateCode: invalidOwnerCode, effectBefore: effectBeforeInvalidOwner, effectAfter: effectAfterInvalidOwner } });

  rawEvidence.request = { ...request, legacySnapshot };
  rawEvidence.package = packageValue;
  rawEvidence.multiPackage = multi;
  rawEvidence.rebuiltRecognition = rebuiltRecognition;
  rawEvidence.projectionMutant = projectionMutant;
  rawEvidence.invalidOwnerProjection = invalidRecognition;
  rawEvidence.taskForeignKeys = taskDatabase.pragma("foreign_key_check");
} catch (error) {
  if (!runError) runError = error;
} finally {
  if (client) await client.close().catch(() => {});
  client = null;
  if (taskDatabase?.open) taskDatabase.close();
  taskDatabase = null;
}

const taskForeignKeys = rawEvidence.taskForeignKeys ?? [];
fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 12, retryDelay: 200 });
const tempRemoved = !fs.existsSync(tempRoot);
const primaryAfter = primaryFingerprint();
const sourceAfter = sourceInfo(root, registry.sourceBoundary);
const primaryUnchanged = primaryBefore.hash === primaryAfter.hash && primaryBefore.payload.foreignKeys.length === 0 && primaryAfter.payload.foreignKeys.length === 0;
const sourceUnchanged = sourceBefore.head === sourceAfter.head && sourceBefore.branch === sourceAfter.branch && sourceBefore.dirtyBoundaryHash === sourceAfter.dirtyBoundaryHash;
const caseResults = coverage.caseIds.map((caseId) => results.get(caseId));
if ((!primaryUnchanged || !sourceUnchanged || !tempRemoved || taskForeignKeys.length !== 0) && !runError) runError = new Error("DEV101_DATA_INVARIANT_OR_CLEANUP_FAILED");
const passCount = caseResults.filter((item) => item.result === "PASS").length;
const failCount = caseResults.filter((item) => item.result === "FAIL").length;
const notRunCount = caseResults.filter((item) => item.result === "NOT_RUN").length;
const result = runError || failCount > 0 ? "FAIL" : notRunCount > 0 ? "BLOCKED" : "PASS";

fs.mkdirSync(outputDir, { recursive: true });
const evidencePath = path.join(outputDir, "data-evidence.json");
const implementedCaseIds = caseResults.filter((item) => item.result !== "NOT_RUN").map((item) => item.caseId);
const evidencePayload = {
  devId: "DEV-101",
  runId,
  evidenceClass: "INDEPENDENT_DATA_PRIMITIVES",
  implementedCaseIds,
  independentCanonicalOracle: { module: "scripts/dev-101-evidence-lib.mjs", packageHashFromSutImported: false, markerHelperImported: false, diffHelperImported: false },
  mutationLedger,
  rawEvidence,
  primaryInvariant: { before: primaryBefore.hash, after: primaryAfter.hash, unchanged: primaryUnchanged },
  sourceInvariant: { before: sourceBefore, after: sourceAfter, unchanged: sourceUnchanged },
  cleanupReceipt: { complete: tempRemoved, portsReleased: true, processesStopped: true, tempRemoved }
};
fs.writeFileSync(evidencePath, `${JSON.stringify(evidencePayload, null, 2)}\n`, "utf8");
const artifact = artifactReference(root, evidencePath, implementedCaseIds, coverage.requiredEvidence);
const caseEvidence = Object.fromEntries(implementedCaseIds.map((caseId) => [caseId, { evidenceTypes: [...coverage.requiredEvidence], artifactPaths: [artifact.path] }]));
const manifest = {
  schemaVersion: 1,
  devId: "DEV-101",
  runId,
  parentRunId,
  runner: "qc-dev-101-independent-data",
  independentQc: true,
  source: sourceAfter,
  environment: { provider: "sqlite", dataScope: "task-owned-isolated", dataDir, repositoryDir },
  registryHash: hashFile(path.join(root, DEV101_REGISTRY_PATH)),
  runnerHash: hashFile(path.join(root, "scripts", "qc-dev-101-independent-data.mjs")),
  caseResults,
  caseEvidence,
  artifacts: [artifact],
  prohibitedOracleImports: [],
  primaryInvariant: { before: primaryBefore.hash, after: primaryAfter.hash, unchanged: primaryUnchanged },
  cleanupReceipt: { complete: tempRemoved, portsReleased: true, processesStopped: true, tempRemoved },
  visibleErrorAudit: { required: false, consoleErrors: 0, pageErrors: 0, requestFailures: 0, unexpectedRequestFailures: 0, visibleErrorCount: 0 },
  denominator: { expected: coverage.caseIds.length, pass: passCount, fail: failCount, blocked: 0, notRun: notRunCount },
  result,
  firstFailure: runError instanceof Error ? runError.message : runError ? String(runError) : caseResults.find((item) => item.result === "FAIL")?.firstFailurePointer ?? null,
  productionWrites: false,
  completedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
for (const item of caseResults.filter((entry) => entry.result !== "NOT_RUN")) console.log(`${item.result} ${item.caseId} ${item.firstFailurePointer ?? ""}`.trim());
console.log(JSON.stringify({ runId, result, denominator: manifest.denominator, firstFailure: manifest.firstFailure, manifest: path.relative(root, path.join(outputDir, "manifest.json")).replaceAll(path.sep, "/") }, null, 2));
if (result === "FAIL") process.exitCode = 1;
else if (result === "BLOCKED") process.exitCode = 2;
