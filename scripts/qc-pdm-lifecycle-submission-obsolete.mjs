#!/usr/bin/env node

import Database from "better-sqlite3";
import path from "node:path";
import { createLifecycleQcRuntime } from "./qc-pdm-lifecycle-isolated-runtime.mjs";

const root = process.cwd();
const password = "Lifecycle-Submission-Obsolete-QC-2026";
const principals = [
  {
    id: "lifecycle-submission-obsolete-engineer",
    displayName: "Lifecycle Submission Obsolete QC Engineer",
    email: "lifecycle.submission.obsolete.engineer@example.invalid",
    password,
    role: "Engineer",
    companyCodes: ["JENFU"]
  },
  {
    id: "lifecycle-submission-obsolete-manager",
    displayName: "Lifecycle Submission Obsolete QC Manager",
    email: "lifecycle.submission.obsolete.manager@example.invalid",
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

function createSubmission(suffix) {
  const drawingNumber = `SUBOBS-${token}-${suffix}`;
  const submissionId = `qc-submission-obsolete-${token}-${suffix.toLowerCase()}`;
  const itemId = `qc-submission-obsolete-item-${token}-${suffix.toLowerCase()}`;
  const now = new Date().toISOString();
  const db = new Database(dbPath);
  try {
    db.prepare(
      "INSERT INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, '1', ?, ?)"
    ).run(itemId, `P-SUBOBS-${token}-${suffix}`, `QC submission obsolete ${suffix}`, now, now);
    db.prepare(
      `INSERT INTO submissions (
        id, company_id, item_id, drawing_number, revision, material, surface_finish, document_type,
        change_description, status, submitted_by, approval_required, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?, '1', 'QC-Material', 'QC-Finish', 'Part', ?, 'Pending', ?, 1, ?, ?)`
    ).run(
      submissionId,
      itemId,
      drawingNumber,
      "QC disposable fixture for submission lifecycle obsolete",
      principals[0].id,
      now,
      now
    );
  } finally {
    db.close();
  }
  record(`Seed submission ${suffix} only in disposable database`, true, submissionId);
  createdSubmissionIds.push(submissionId);
  return submissionId;
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

function dbRecord(name, query, params, predicate) {
  const db = new Database(dbPath);
  try {
    const row = db.prepare(query).get(...params);
    record(name, predicate(row), JSON.stringify(row));
  } finally {
    db.close();
  }
}

async function run() {
  const engineerCookie = await login(principals[0].email);
  const managerCookie = await login(principals[1].email);

  const approveSubmissionId = createSubmission("APPROVE");
  const rejectSubmissionId = createSubmission("REJECT");
  markReleased(approveSubmissionId, rejectSubmissionId);

  const obsoleteRequest = await requestJson(engineerCookie, `/api/submissions/${approveSubmissionId}/obsolete-request`, {
    method: "POST",
    body: JSON.stringify({ reason: "QC approve submission obsolete request" })
  });
  record(
    "Request submission obsolete review",
    obsoleteRequest.response.status === 201 && obsoleteRequest.body.request?.request_status === "pending",
    `HTTP ${obsoleteRequest.response.status} ${JSON.stringify(obsoleteRequest.body)}`
  );
  record("Obsolete request returns review-stage policy", obsoleteRequest.body.policy?.stageLabel === "審核中", JSON.stringify(obsoleteRequest.body.policy));

  const duplicateRequest = await requestJson(engineerCookie, `/api/submissions/${approveSubmissionId}/obsolete-request`, {
    method: "POST",
    body: JSON.stringify({ reason: "QC duplicate should be blocked" })
  });
  record("Duplicate pending submission obsolete request is blocked", duplicateRequest.response.status === 409, `HTTP ${duplicateRequest.response.status}`);

  const obsoleteApproval = await requestJson(managerCookie, `/api/submission-lifecycle-requests/${obsoleteRequest.body.request.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "QC approve submission obsolete" })
  });
  record("Approve submission obsolete review", obsoleteApproval.response.ok && obsoleteApproval.body.status === "Obsolete", JSON.stringify(obsoleteApproval.body));

  dbRecord(
    "Approved submission becomes Obsolete",
    "SELECT status, obsolete_at, obsolete_by FROM submissions WHERE id = ?",
    [approveSubmissionId],
    (row) => row?.status === "Obsolete" && Boolean(row?.obsolete_at && row?.obsolete_by)
  );
  dbRecord(
    "Approved submission obsolete request is approved",
    "SELECT request_status, decided_by, decided_at FROM submission_lifecycle_requests WHERE id = ?",
    [obsoleteRequest.body.request.id],
    (row) => row?.request_status === "approved" && Boolean(row?.decided_by && row?.decided_at)
  );
  dbRecord(
    "Approved submission obsolete writes audit evidence",
    "SELECT action FROM audit_logs WHERE submission_id = ? AND action = 'lifecycle.obsolete.approved' ORDER BY created_at DESC LIMIT 1",
    [approveSubmissionId],
    (row) => row?.action === "lifecycle.obsolete.approved"
  );

  const dailyList = await requestJson(engineerCookie, "/api/submissions?limit=200");
  record(
    "Daily submission list excludes approved obsolete submission",
    dailyList.response.ok && !(dailyList.body.submissions ?? []).some((submission) => submission.id === approveSubmissionId),
    `HTTP ${dailyList.response.status} ${JSON.stringify(dailyList.body.submissions?.map((submission) => ({ id: submission.id, status: submission.status })) ?? [])}`
  );

  const explicitObsoleteList = await requestJson(engineerCookie, "/api/submissions?status=Obsolete&limit=200");
  record(
    "Explicit Obsolete submission query can still retrieve controlled record",
    explicitObsoleteList.response.ok &&
      (explicitObsoleteList.body.submissions ?? []).some((submission) => submission.id === approveSubmissionId && submission.status === "Obsolete"),
    `HTTP ${explicitObsoleteList.response.status} ${JSON.stringify(explicitObsoleteList.body.submissions ?? [])}`
  );

  const controlledHistory = await requestJson(engineerCookie, "/api/lifecycle/controlled-history?limit=100");
  const controlledEntry = (controlledHistory.body.entries ?? []).find((entry) => entry.target_id === approveSubmissionId);
  record(
    "Controlled-history API lists approved obsolete submission",
    controlledHistory.response.ok && controlledEntry?.result_label === "已作廢" && controlledEntry?.stage_label === "歷史",
    `HTTP ${controlledHistory.response.status} ${JSON.stringify(controlledHistory.body)}`
  );
  record(
    "Controlled-history entry preserves responsibility chain",
    Boolean(controlledEntry?.requested_by_name && controlledEntry?.reviewed_by_name && controlledEntry?.history_reason && controlledEntry?.decided_at),
    JSON.stringify(controlledEntry)
  );
  record(
    "Controlled-history entry does not expose delete restore or obsolete actions",
    controlledEntry?.actions?.delete === false && controlledEntry?.actions?.restore === false && controlledEntry?.actions?.obsolete === false,
    JSON.stringify(controlledEntry?.actions)
  );

  const rejectRequest = await requestJson(engineerCookie, `/api/submissions/${rejectSubmissionId}/obsolete-request`, {
    method: "POST",
    body: JSON.stringify({ reason: "QC reject submission obsolete request" })
  });
  record("Request second submission obsolete review", rejectRequest.response.status === 201, JSON.stringify(rejectRequest.body));

  const obsoleteRejection = await requestJson(managerCookie, `/api/submission-lifecycle-requests/${rejectRequest.body.request.id}/reject`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "QC reject submission obsolete" })
  });
  record("Reject submission obsolete review", obsoleteRejection.response.ok, JSON.stringify(obsoleteRejection.body));
  dbRecord(
    "Rejected submission remains Released",
    "SELECT status FROM submissions WHERE id = ?",
    [rejectSubmissionId],
    (row) => row?.status === "Released"
  );
  dbRecord(
    "Rejected submission obsolete request is rejected",
    "SELECT request_status, decided_by, decided_at FROM submission_lifecycle_requests WHERE id = ?",
    [rejectRequest.body.request.id],
    (row) => row?.request_status === "rejected" && Boolean(row?.decided_by && row?.decided_at)
  );
}

async function main() {
  const runtime = createLifecycleQcRuntime({ root, suite: "lifecycle-submission-obsolete", principals });
  let receipt = null;
  let runError = null;
  try {
    const target = await runtime.start();
    apiBaseUrl = target.baseUrl;
    dbPath = target.databasePath;
    record(
      "Lifecycle submission obsolete QC uses a disposable production-disconnected target",
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
