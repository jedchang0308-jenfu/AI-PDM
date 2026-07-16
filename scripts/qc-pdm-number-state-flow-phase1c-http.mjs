import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";

const root = process.cwd();
const runId = crypto.randomUUID();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev048-phase1c-http-"));
const distDirRelative = `.tmp/next-qc-dev048-phase1c-${runId}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const password = "DEV048-Phase1C-QC-Password";
const results = [];
const generatedConfigSnapshots = new Map(
  ["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")])
);
let app;

const bootstrapUsers = [
  { id: "phase1c-http-owner", displayName: "Phase1C Owner", email: "phase1c.owner@example.invalid", password, role: "Engineer", companyCodes: ["JENFU"] },
  { id: "phase1c-http-reviewer", displayName: "Phase1C Reviewer", email: "phase1c.reviewer@example.invalid", password, role: "R&D Manager", companyCodes: ["JENFU"] },
  { id: "phase1c-http-admin", displayName: "Phase1C Admin", email: "phase1c.admin@example.invalid", password, role: "Admin", companyCodes: ["JENFU", "MAXIMA"] },
  { id: "phase1c-http-denied", displayName: "Phase1C Denied", email: "phase1c.denied@example.invalid", password, role: "Manufacturing", companyCodes: ["JENFU"] },
  { id: "phase1c-http-denied-maxima", displayName: "Phase1C Denied Maxima", email: "phase1c.denied.maxima@example.invalid", password, role: "Manufacturing", companyCodes: ["MAXIMA"] }
];

function record(id, passed, detail = {}) {
  results.push({ id, passed: Boolean(passed), detail });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("PORT_UNAVAILABLE")));
    });
  });
}

function startApp(port) {
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "managed",
      PDM_BOOTSTRAP_USERS: JSON.stringify(bootstrapUsers),
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_DB_PROVIDER: "sqlite",
      PDM_RELEASE_MODE: "local_stub",
      PDM_PUBLICATION_EVIDENCE_MODE: "local_fake",
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output = (output + chunk.toString()).slice(-30000); });
  child.stderr.on("data", (chunk) => { output = (output + chunk.toString()).slice(-30000); });
  return { child, output: () => output };
}

async function waitForApp(baseUrl) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch {}
    await delay(400);
  }
  throw new Error(`SERVER_START_TIMEOUT\n${app?.output() ?? ""}`);
}

async function stopApp() {
  if (!app || app.child.exitCode !== null) return;
  app.child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => app.child.once("exit", resolve)),
    delay(4000).then(() => { if (app.child.exitCode === null) app.child.kill("SIGTERM"); })
  ]);
}

async function removeTempDir(target) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch {
      await delay(300);
    }
  }
}

async function login(baseUrl, email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const cookie = (response.headers.get("set-cookie") ?? "").split(";", 1)[0];
  if (!response.ok || !cookie) throw new Error(`LOGIN_FAILED:${email}:${response.status}`);
  return cookie;
}

async function api(baseUrl, input) {
  const headers = { ...(input.headers ?? {}) };
  if (input.cookie) headers.cookie = input.cookie;
  if (input.company) headers["x-pdm-company-code"] = input.company;
  if (input.key) headers["Idempotency-Key"] = input.key;
  let body;
  if (Object.prototype.hasOwnProperty.call(input, "body")) {
    if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) headers["content-type"] = "application/json";
    body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
  }
  const response = await fetch(`${baseUrl}${input.path}`, { method: input.method ?? "GET", headers, body });
  const text = await response.text();
  let responseBody = {};
  try { responseBody = text ? JSON.parse(text) : {}; } catch { responseBody = { raw: text }; }
  return { status: response.status, body: responseBody, cacheControl: response.headers.get("cache-control") ?? "" };
}

function rootPartBody(label) {
  return {
    draftMode: "new_bundle",
    root: { coreName: `${label} Root`, itemKind: "manufactured" },
    parts: [{ clientKey: "part-1", partName: `${label} Part`, itemKind: "manufactured" }],
    drawings: [],
    relations: []
  };
}

try {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  app = startApp(port);
  await waitForApp(baseUrl);
  const cookies = {
    owner: await login(baseUrl, "phase1c.owner@example.invalid"),
    reviewer: await login(baseUrl, "phase1c.reviewer@example.invalid"),
    admin: await login(baseUrl, "phase1c.admin@example.invalid"),
    denied: await login(baseUrl, "phase1c.denied@example.invalid"),
    deniedMaxima: await login(baseUrl, "phase1c.denied.maxima@example.invalid")
  };
  const db = new Database(path.join(tempDir, "ai-pdm.sqlite"));

  const created = await api(baseUrl, {
    method: "POST", path: "/api/numbering/draft-workspaces", cookie: cookies.owner, company: "JENFU",
    key: "phase1c:http:create", body: rootPartBody("HTTP approval")
  });
  const workspace = created.body.workspace;
  const acquired = await api(baseUrl, {
    method: "POST", path: `/api/numbering/draft-workspaces/${workspace.id}/candidate-numbers`, cookie: cookies.owner, company: "JENFU",
    key: "phase1c:http:acquire", body: { expectedRowVersion: workspace.rowVersion }
  });
  record("HTTP-C-001 owner can create and acquire candidates", created.status === 201 && acquired.status === 200, { create: created.status, acquire: acquired.status });

  const genericSubmit = await api(baseUrl, {
    method: "POST", path: "/api/approvals/requests", cookie: cookies.owner,
    body: { actionCode: "numbering.candidate_publication_review", reason: "must be rejected", targets: [{ type: "workspace", targetId: workspace.id }] }
  });
  record("HTTP-C-002 generic approval submission cannot bypass the numbering transaction", genericSubmit.status === 400 && genericSubmit.body?.error === "APPROVAL_DOMAIN_SUBMIT_REQUIRED", { genericSubmit });

  const deniedSubmit = await api(baseUrl, {
    method: "POST", path: `/api/numbering/draft-workspaces/${workspace.id}/submit-review`, cookie: cookies.denied, company: "JENFU",
    key: "phase1c:http:denied-submit", body: { expectedRowVersion: acquired.body.workspace.rowVersion, reason: "denied" }
  });
  record("HTTP-C-003 explicit review-submit permission is enforced", deniedSubmit.status === 403 && deniedSubmit.body?.error?.code === "numbering_permission_denied", { deniedSubmit });

  const crossOriginSubmit = await api(baseUrl, {
    method: "POST", path: `/api/numbering/draft-workspaces/${workspace.id}/submit-review`, cookie: cookies.owner, company: "JENFU",
    key: "phase1c:http:cross-origin", headers: { origin: "https://attacker.invalid" },
    body: { expectedRowVersion: acquired.body.workspace.rowVersion, reason: "cross origin" }
  });
  record("HTTP-C-004 review submission is same-origin only", crossOriginSubmit.status === 403 && crossOriginSubmit.body?.error?.code === "same_origin_required", { crossOriginSubmit });

  const submitInput = {
    method: "POST", path: `/api/numbering/draft-workspaces/${workspace.id}/submit-review`, cookie: cookies.owner, company: "JENFU",
    key: "phase1c:http:submit", body: { expectedRowVersion: acquired.body.workspace.rowVersion, reason: "ready for candidate publication review" }
  };
  const submitted = await api(baseUrl, submitInput);
  const submitReplay = await api(baseUrl, submitInput);
  const requestId = submitted.body.requestId;
  record(
    "HTTP-C-005 domain submission is atomic and idempotent",
    submitted.status === 200 && submitReplay.status === 200 && submitReplay.body?.idempotentReplay === true &&
      submitted.body?.workspace?.reservations?.every((item) => item.state === "review_locked") && requestId,
    { submitted: submitted.status, replay: submitReplay.body?.idempotentReplay, requestId }
  );

  const mastersBeforeDecision = {
    roots: db.prepare("SELECT count(*) count FROM part_roots").get().count,
    parts: db.prepare("SELECT count(*) count FROM part_numbers").get().count
  };
  const missingKeyDecision = await api(baseUrl, {
    method: "POST", path: `/api/approvals/requests/${encodeURIComponent(requestId)}/decisions`, cookie: cookies.reviewer, company: "JENFU",
    body: { decision: "approved", comment: "missing key" }
  });
  const deniedDecision = await api(baseUrl, {
    method: "POST", path: `/api/approvals/requests/${encodeURIComponent(requestId)}/decisions`, cookie: cookies.denied, company: "JENFU",
    key: "phase1c:http:denied-decision", body: { decision: "approved" }
  });
  const wrongCompanyDecision = await api(baseUrl, {
    method: "POST", path: `/api/approvals/requests/${encodeURIComponent(requestId)}/decisions`, cookie: cookies.admin, company: "MAXIMA",
    key: "phase1c:http:wrong-company", body: { decision: "approved" }
  });
  record(
    "HTTP-C-006 decision requires key, explicit permission, and matching company",
    missingKeyDecision.status === 400 && deniedDecision.status === 403 && wrongCompanyDecision.status === 404,
    { missingKey: missingKeyDecision.status, denied: deniedDecision.status, wrongCompany: wrongCompanyDecision.status }
  );

  const foreignValidDecision = await api(baseUrl, {
    method: "POST", path: `/api/approvals/requests/${encodeURIComponent(requestId)}/decisions`, cookie: cookies.deniedMaxima, company: "MAXIMA",
    key: "phase1c:http:foreign-valid-decision", body: { decision: "approved" }
  });
  const foreignMissingDecision = await api(baseUrl, {
    method: "POST", path: `/api/approvals/requests/APR-does-not-exist/decisions`, cookie: cookies.deniedMaxima, company: "MAXIMA",
    key: "phase1c:http:foreign-missing-decision", body: { decision: "approved" }
  });
  const foreignValidApply = await api(baseUrl, {
    method: "POST", path: `/api/approvals/requests/${encodeURIComponent(requestId)}/apply`, cookie: cookies.deniedMaxima, company: "MAXIMA",
    key: "phase1c:http:foreign-valid-apply", body: {}
  });
  const foreignMissingApply = await api(baseUrl, {
    method: "POST", path: `/api/approvals/requests/APR-does-not-exist/apply`, cookie: cookies.deniedMaxima, company: "MAXIMA",
    key: "phase1c:http:foreign-missing-apply", body: {}
  });
  record(
    "HTTP-C-006B cross-company decision and apply hide request existence before permission checks",
    [foreignValidDecision, foreignMissingDecision, foreignValidApply, foreignMissingApply]
      .every((response) => response.status === 404 && response.body?.error === "APPROVAL_REQUEST_NOT_FOUND"),
    { foreignValidDecision, foreignMissingDecision, foreignValidApply, foreignMissingApply }
  );

  const decisionInput = {
    method: "POST", path: `/api/approvals/requests/${encodeURIComponent(requestId)}/decisions`, cookie: cookies.reviewer, company: "JENFU",
    key: "phase1c:http:approve", body: { decision: "approved", comment: "approved for explicit publication" }
  };
  const decided = await api(baseUrl, decisionInput);
  const decisionReplay = await api(baseUrl, decisionInput);
  const mastersAfterDecision = {
    roots: db.prepare("SELECT count(*) count FROM part_roots").get().count,
    parts: db.prepare("SELECT count(*) count FROM part_numbers").get().count
  };
  const approvalRow = db.prepare("SELECT request_status, apply_status FROM approval_platform_requests WHERE id = ?").get(requestId);
  record(
    "HTTP-C-007 approval is idempotent and does not publish masters",
    decided.status === 200 && decisionReplay.status === 200 && approvalRow?.request_status === "approved" && approvalRow?.apply_status === "applied" &&
      JSON.stringify(mastersBeforeDecision) === JSON.stringify(mastersAfterDecision),
    { decided: decided.status, replay: decisionReplay.status, approvalRow, mastersBeforeDecision, mastersAfterDecision }
  );

  const ownerPublish = await api(baseUrl, {
    method: "POST", path: `/api/numbering/draft-workspaces/${workspace.id}/publish`, cookie: cookies.owner, company: "JENFU",
    key: "phase1c:http:owner-publish", body: {}
  });
  record("HTTP-C-008 publication uses a separate explicit permission", ownerPublish.status === 403 && ownerPublish.body?.error?.code === "numbering_permission_denied", { ownerPublish });

  const publishInput = {
    method: "POST", path: `/api/numbering/draft-workspaces/${workspace.id}/publish`, cookie: cookies.admin, company: "JENFU",
    key: "phase1c:http:publish", body: {}
  };
  const published = await api(baseUrl, publishInput);
  const publishReplay = await api(baseUrl, publishInput);
  const officialRows = {
    root: db.prepare("SELECT development_phase, record_status FROM part_roots WHERE id = ?").get(published.body?.masters?.rootId),
    part: db.prepare("SELECT development_phase, record_status FROM part_numbers WHERE id = ?").get(published.body?.masters?.partIds?.[0]),
    eventCount: db.prepare("SELECT count(*) count FROM platform_outbox_events WHERE event_type = 'pdm.numbering.official_number_published.v1' AND idempotency_key = 'phase1c:http:publish'").get().count
  };
  record(
    "HTTP-C-009 explicit publish creates Active EVT masters once",
    published.status === 200 && publishReplay.status === 200 && publishReplay.body?.idempotentReplay === true &&
      officialRows.root?.record_status === "Active" && officialRows.root?.development_phase === "EVT" &&
      officialRows.part?.record_status === "Active" && officialRows.part?.development_phase === "EVT" && officialRows.eventCount === 1,
    { published: published.status, replay: publishReplay.body?.idempotentReplay, officialRows }
  );

  const noStoreResponses = [
    deniedSubmit,
    crossOriginSubmit,
    submitted,
    submitReplay,
    foreignValidDecision,
    foreignMissingDecision,
    foreignValidApply,
    foreignMissingApply,
    ownerPublish,
    published,
    publishReplay
  ];
  record("HTTP-C-010 number-state review and publication responses are no-store", noStoreResponses.every((response) => response.cacheControl.includes("no-store")), { headers: noStoreResponses.map((response) => response.cacheControl) });
  db.close();
} catch (error) {
  record("HTTP-C-FIXTURE", false, { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined, serverTail: app?.output() ?? "" });
} finally {
  await stopApp();
  for (const [file, content] of generatedConfigSnapshots) fs.writeFileSync(path.join(root, file), content, "utf8");
  await removeTempDir(distDir);
  await removeTempDir(tempDir);
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ suite: "DEV-048 Phase 1C disposable HTTP QC", passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
