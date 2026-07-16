#!/usr/bin/env node

import Database from "better-sqlite3";
import path from "node:path";

const root = process.cwd();
const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const dbPath = path.join(root, "data", "ai-pdm.sqlite");
const token = Date.now().toString().slice(-7);
const results = [];
const createdSubmissionIds = [];

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

async function createSubmission(cookie, suffix) {
  const drawingNumber = `SUBOBS-${token}-${suffix}`;
  const form = new FormData();
  form.set("drawing_number", drawingNumber);
  form.set("part_number", `P-SUBOBS-${token}-${suffix}`);
  form.set("part_name", `QC submission obsolete ${suffix}`);
  form.set("revision", "1");
  form.set("material", "QC-Material");
  form.set("surface_finish", "QC-Finish");
  form.set("document_type", "Part");
  form.set("change_description", "QC seed for submission lifecycle obsolete");
  form.append("files", new File([Buffer.from("submission lifecycle obsolete qc")], `${drawingNumber}.pdf`, { type: "application/pdf" }));

  const { response, body } = await requestJson(cookie, "/api/submissions", { method: "POST", body: form });
  record(`Create submission ${suffix}`, response.status === 201, `HTTP ${response.status} ${JSON.stringify(body)}`);
  createdSubmissionIds.push(body.submissionId);
  return body.submissionId;
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

function cleanup() {
  if (!createdSubmissionIds.length) return;
  const db = new Database(dbPath);
  try {
    const placeholders = createdSubmissionIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM submission_lifecycle_requests WHERE submission_id IN (${placeholders})`).run(...createdSubmissionIds);
    db.prepare(`DELETE FROM file_references WHERE submission_id IN (${placeholders})`).run(...createdSubmissionIds);
    db.prepare(`DELETE FROM submission_files WHERE submission_id IN (${placeholders})`).run(...createdSubmissionIds);
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
  const engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");

  const approveSubmissionId = await createSubmission(engineerCookie, "APPROVE");
  const rejectSubmissionId = await createSubmission(engineerCookie, "REJECT");
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

run()
  .then(() => {
    cleanup();
    console.log(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          total: results.length,
          passed: results.filter((result) => result.passed).length,
          failed: results.filter((result) => !result.passed).length,
          results
        },
        null,
        2
      )
    );
  })
  .catch((error) => {
    try {
      cleanup();
    } catch (cleanupError) {
      results.push({ name: "Cleanup", passed: false, detail: cleanupError.message });
    }
    console.error(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          total: results.length,
          passed: results.filter((result) => result.passed).length,
          failed: results.filter((result) => !result.passed).length || 1,
          results,
          error: error.message
        },
        null,
        2
      )
    );
    process.exit(1);
  });
