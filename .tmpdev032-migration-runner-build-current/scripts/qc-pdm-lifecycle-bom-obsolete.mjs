#!/usr/bin/env node

import Database from "better-sqlite3";
import path from "node:path";
import { createLifecycleQcRuntime } from "./qc-pdm-lifecycle-isolated-runtime.mjs";

const root = process.cwd();
const password = "Lifecycle-BOM-Obsolete-QC-2026";
const principals = [
  {
    id: "lifecycle-bom-obsolete-engineer",
    displayName: "Lifecycle BOM Obsolete QC Engineer",
    email: "lifecycle.bom.obsolete.engineer@example.invalid",
    password,
    role: "Engineer",
    companyCodes: ["JENFU"]
  },
  {
    id: "lifecycle-bom-obsolete-manager",
    displayName: "Lifecycle BOM Obsolete QC Manager",
    email: "lifecycle.bom.obsolete.manager@example.invalid",
    password,
    role: "R&D Manager",
    companyCodes: ["JENFU"]
  }
];
const token = Date.now().toString().slice(-7);
const results = [];
const createdSubmissionIds = [];
let apiBaseUrl = "";
let dbPath = "";

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function login(email) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`Login ${email}`, response.ok, `HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function requestJson(cookie, route, init = {}) {
  const response = await fetch(`${apiBaseUrl}${route}`, {
    ...init,
    headers: {
      cookie,
      ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function createSubmission(input) {
  const submissionId = `qc-bom-obsolete-submission-${token}-${createdSubmissionIds.length + 1}`;
  const itemId = `qc-bom-obsolete-item-${token}-${createdSubmissionIds.length + 1}`;
  const now = new Date().toISOString();
  const db = new Database(dbPath);
  try {
    db.prepare(
      "INSERT INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, '1', ?, ?)"
    ).run(itemId, input.partNumber, input.partName, now, now);
    db.prepare(
      `INSERT INTO submissions (
        id, company_id, item_id, drawing_number, revision, material, surface_finish, document_type,
        change_description, status, submitted_by, approval_required, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?, '1', 'QC-Material', 'QC-Finish', ?, ?, 'Pending', ?, 1, ?, ?)`
    ).run(
      submissionId,
      itemId,
      input.drawingNumber,
      input.documentType ?? "Part",
      "QC disposable fixture for BOM lifecycle obsolete",
      principals[0].id,
      now,
      now
    );
    for (const [index, reference] of (input.references ?? []).entries()) {
      db.prepare(
        `INSERT INTO file_references (
          id, submission_id, source_file_id, source_filename, source_file_role, referenced_filename,
          referenced_part_number, referenced_drawing_number, referenced_revision, reference_type,
          quantity, extraction_method, confidence, created_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        `qc-bom-obsolete-reference-${token}-${index + 1}`,
        submissionId,
        reference.sourceFilename,
        reference.sourceFileRole,
        reference.referencedFilename,
        reference.referencedPartNumber ?? null,
        reference.referencedDrawingNumber ?? null,
        reference.referencedRevision ?? null,
        reference.referenceType,
        reference.quantity,
        reference.extractionMethod,
        reference.confidence,
        now
      );
    }
  } finally {
    db.close();
  }
  createdSubmissionIds.push(submissionId);
  record(`Seed ${input.partNumber} only in disposable database`, true, submissionId);
  return { submissionId, revision: "1", ...input };
}

function markReleased(...submissionIds) {
  const db = new Database(dbPath);
  try {
    const now = new Date().toISOString();
    const update = db.prepare("UPDATE submissions SET status = 'Released', released_at = ?, updated_at = ? WHERE id = ?");
    for (const submissionId of submissionIds) update.run(now, now, submissionId);
  } finally {
    db.close();
  }
}

async function run() {
  const engineerCookie = await login(principals[0].email);
  const managerCookie = await login(principals[1].email);

  const child = createSubmission({
    drawingNumber: `BOMOBS-${token}-A`,
    partNumber: `P-BOMOBS-${token}-A`,
    partName: "QC BOM obsolete child",
    documentType: "Part"
  });
  markReleased(child.submissionId);

  const parent = createSubmission({
    drawingNumber: `BOMOBS-${token}-ASM`,
    partNumber: `P-BOMOBS-${token}-ASM`,
    partName: "QC BOM obsolete assembly",
    documentType: "Assembly",
    references: [
      {
        sourceFilename: `BOMOBS-${token}-ASM.sldasm`,
        sourceFileRole: "sldasm",
        referencedFilename: `${child.drawingNumber}.sldprt`,
        referencedPartNumber: child.partNumber,
        referencedDrawingNumber: child.drawingNumber,
        referencedRevision: child.revision,
        referenceType: "assembly_component",
        quantity: 1,
        extractionMethod: "qc-pdm-lifecycle-bom-obsolete",
        confidence: "high"
      }
    ]
  });

  const draft = (await requestJson(engineerCookie, "/api/bom/drafts/from-assembly", {
    method: "POST",
    body: JSON.stringify({ submissionId: parent.submissionId, draftName: "QC BOM obsolete release", setActive: true })
  })).body.draft;
  record("Create BOM draft for obsolete flow", Boolean(draft?.id), JSON.stringify(draft));

  const releaseReview = (await requestJson(engineerCookie, `/api/bom/drafts/${draft.id}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: "QC release before obsolete" })
  })).body.review;
  record("Submit release review before obsolete", releaseReview?.lifecycle_action === "release", JSON.stringify(releaseReview));

  const releaseApproval = await requestJson(managerCookie, `/api/bom/reviews/${releaseReview.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "QC approve release before obsolete" })
  });
  record("Approve release before obsolete", releaseApproval.response.ok && Boolean(releaseApproval.body.result?.snapshotId), JSON.stringify(releaseApproval.body));

  const obsoleteRequest = await requestJson(engineerCookie, `/api/bom/drafts/${draft.id}/obsolete-request`, {
    method: "POST",
    body: JSON.stringify({ reason: "QC lifecycle obsolete request" })
  });
  record("Request BOM obsolete review", obsoleteRequest.response.status === 201, `HTTP ${obsoleteRequest.response.status} ${JSON.stringify(obsoleteRequest.body)}`);
  record("Obsolete review uses obsolete lifecycle action", obsoleteRequest.body.review?.lifecycle_action === "obsolete", JSON.stringify(obsoleteRequest.body.review));
  record("Obsolete request returns review-stage policy", obsoleteRequest.body.policy?.stageLabel === "審核中", JSON.stringify(obsoleteRequest.body.policy));

  const pending = await requestJson(managerCookie, "/api/bom/reviews/pending");
  record(
    "Pending BOM reviews include obsolete request",
    pending.body.reviews?.some((review) => review.id === obsoleteRequest.body.review.id && review.lifecycle_action === "obsolete"),
    `${pending.body.reviews?.length ?? 0} pending`
  );

  const obsoleteApproval = await requestJson(managerCookie, `/api/bom/reviews/${obsoleteRequest.body.review.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "QC approve lifecycle obsolete" })
  });
  record("Approve BOM obsolete review", obsoleteApproval.response.ok && obsoleteApproval.body.result?.snapshotId === null, JSON.stringify(obsoleteApproval.body));

  const db = new Database(dbPath);
  try {
    const draftRow = db.prepare("SELECT status, is_active FROM bom_drafts WHERE id = ?").get(draft.id);
    const snapshotRow = db.prepare("SELECT obsolete_at, obsolete_by FROM bom_release_snapshots WHERE bom_draft_id = ?").get(draft.id);
    const auditRow = db
      .prepare("SELECT action FROM audit_logs WHERE submission_id = ? AND action = 'lifecycle.obsolete.approved' ORDER BY created_at DESC LIMIT 1")
      .get(parent.submissionId);
    record("Approved BOM draft becomes Obsolete", draftRow?.status === "Obsolete" && draftRow?.is_active === 0, JSON.stringify(draftRow));
    record("Approved BOM release snapshot is marked obsolete", Boolean(snapshotRow?.obsolete_at && snapshotRow?.obsolete_by), JSON.stringify(snapshotRow));
    record("Approved BOM obsolete writes audit evidence", auditRow?.action === "lifecycle.obsolete.approved", JSON.stringify(auditRow));
  } finally {
    db.close();
  }
}

async function main() {
  const runtime = createLifecycleQcRuntime({ root, suite: "lifecycle-bom-obsolete", principals });
  let receipt = null;
  let runError = null;
  try {
    const target = await runtime.start();
    apiBaseUrl = target.baseUrl;
    dbPath = target.databasePath;
    record(
      "Lifecycle BOM obsolete QC uses a disposable production-disconnected target",
      target.productionConnected === false && target.productionWrites === false && apiBaseUrl !== "http://127.0.0.1:3000",
      JSON.stringify(target)
    );
    await run();
  } catch (error) {
    runError = error;
  } finally {
    try {
      receipt = await runtime.cleanup({ createdSubmissionCount: createdSubmissionIds.length, runPassedBeforeCleanup: runError === null });
    } catch (cleanupError) {
      results.push({ name: "Disposable runtime cleanup", passed: false, detail: cleanupError.message });
      if (!runError) runError = cleanupError;
    }
  }

  if (receipt) {
    results.push({
      name: "Disposable runtime cleanup is proven",
      passed: receipt.cleanupStatus === "removed" && receipt.productionDataUnchanged === true,
      detail: JSON.stringify(receipt)
    });
  }
  const failed = results.filter((result) => !result.passed);
  const report = {
    checkedAt: new Date().toISOString(),
    target: "local-isolated",
    productionConnected: false,
    productionWrites: false,
    cleanupStatus: receipt?.cleanupStatus ?? "failed",
    isolationReceipt: receipt ? path.join(runtime.evidenceDir, "isolation-receipt.json") : null,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length || (runError ? 1 : 0),
    results,
    ...(runError ? { error: runError.message } : {})
  };
  const serialized = JSON.stringify(report, null, 2);
  if (runError || failed.length > 0) {
    console.error(serialized);
    process.exitCode = 1;
  } else {
    console.log(serialized);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ target: "local-isolated", productionConnected: false, productionWrites: false, error: error.message }, null, 2));
  process.exit(1);
});
