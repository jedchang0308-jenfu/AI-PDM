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
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev048-phase1d-http-"));
const distDirRelative = `.tmp/next-qc-dev048-phase1d-http-${runId}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const password = "DEV048-Phase1D-HTTP-QC";
const results = [];
const snapshots = new Map(
  ["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")])
);
let app;

const users = [
  { id: "phase1d-http-owner", displayName: "Phase1D Owner", email: "phase1d.http.owner@example.invalid", password, role: "Engineer", companyCodes: ["JENFU"] },
  { id: "phase1d-http-reviewer", displayName: "Phase1D Reviewer", email: "phase1d.http.reviewer@example.invalid", password, role: "R&D Manager", companyCodes: ["JENFU"] },
  { id: "phase1d-http-admin", displayName: "Phase1D Admin", email: "phase1d.http.admin@example.invalid", password, role: "Admin", companyCodes: ["JENFU", "MAXIMA"] },
  { id: "phase1d-http-manufacturing", displayName: "Phase1D Manufacturing", email: "phase1d.http.manufacturing@example.invalid", password, role: "Manufacturing", companyCodes: ["JENFU"] }
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
      PDM_BOOTSTRAP_USERS: JSON.stringify(users),
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_DB_PROVIDER: "sqlite",
      PDM_PUBLICATION_EVIDENCE_MODE: "local_fake",
      PDM_NUMBER_STATE_FLOW_V1: "true",
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
  return {
    status: response.status,
    body: responseBody,
    text,
    contentType: response.headers.get("content-type") ?? "",
    cacheControl: response.headers.get("cache-control") ?? ""
  };
}

async function stopApp() {
  if (!app || app.child.exitCode !== null) return;
  app.child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => app.child.once("exit", resolve)),
    delay(4000).then(() => { if (app.child.exitCode === null) app.child.kill("SIGTERM"); })
  ]);
}

async function removeTree(target) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch {
      await delay(300);
    }
  }
}

function draftBody() {
  return {
    draftMode: "new_bundle",
    root: { coreName: "Phase1D HTTP Root", itemKind: "manufactured" },
    parts: [{ clientKey: "part-1", partName: "Phase1D HTTP Part", itemKind: "manufactured" }],
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
    owner: await login(baseUrl, users[0].email),
    reviewer: await login(baseUrl, users[1].email),
    admin: await login(baseUrl, users[2].email),
    manufacturing: await login(baseUrl, users[3].email)
  };
  const db = new Database(path.join(tempDir, "ai-pdm.sqlite"));

  const ownerPermissions = await api(baseUrl, { path: "/api/numbering/permissions", cookie: cookies.owner, company: "JENFU" });
  const adminPermissions = await api(baseUrl, { path: "/api/numbering/permissions", cookie: cookies.admin, company: "JENFU" });
  record("HTTP-D-000 permission projection separates review and publish authority", ownerPermissions.status === 200 && adminPermissions.status === 200 && ownerPermissions.body.actions?.["transfer.package.review.submit"] === true && ownerPermissions.body.actions?.["transfer.package.publish"] === false && adminPermissions.body.actions?.["transfer.package.publish"] === true, { ownerSubmit: ownerPermissions.body.actions?.["transfer.package.review.submit"], ownerPublish: ownerPermissions.body.actions?.["transfer.package.publish"], adminPublish: adminPermissions.body.actions?.["transfer.package.publish"] });

  const workspaceCreated = await api(baseUrl, {
    method: "POST", path: "/api/numbering/draft-workspaces", cookie: cookies.owner, company: "JENFU",
    key: "phase1d:http:workspace:create", body: draftBody()
  });
  const workspaceAcquired = await api(baseUrl, {
    method: "POST", path: `/api/numbering/draft-workspaces/${workspaceCreated.body.workspace.id}/candidate-numbers`,
    cookie: cookies.owner, company: "JENFU", key: "phase1d:http:workspace:acquire",
    body: { expectedRowVersion: workspaceCreated.body.workspace.rowVersion }
  });
  const workspace = workspaceAcquired.body.workspace;
  record("HTTP-D-001 owner creates a stable-ID candidate workspace", workspaceCreated.status === 201 && workspaceAcquired.status === 200 && Boolean(workspace?.id), { create: workspaceCreated.status, acquire: workspaceAcquired.status, workspaceId: workspace?.id });

  const packageCreated = await api(baseUrl, {
    method: "POST", path: "/api/transfer-packages", cookie: cookies.owner, company: "JENFU",
    key: "phase1d:http:package:create",
    body: {
      title: "Phase1D HTTP transfer package", caseType: "design_change_case", caseReason: "HTTP aggregate QC",
      sourceReferenceStatus: "not_available", sourceReferenceReason: "Disposable QC fixture"
    }
  });
  let workbench = packageCreated.body.workbench;
  record("HTTP-D-002 owner creates a transfer package", packageCreated.status === 201 && Boolean(workbench?.id), { status: packageCreated.status, packageId: workbench?.id });

  const legacyCrossOrigin = await api(baseUrl, {
    method: "PATCH", path: `/api/transfer-packages/${workbench.id}`, cookie: cookies.owner, company: "JENFU",
    headers: { origin: "https://attacker.invalid" },
    body: {
      expectedRowVersion: workbench.rowVersion, title: workbench.title, caseType: workbench.caseType,
      caseReason: workbench.caseReason, sourceReferenceStatus: workbench.sourceReferenceStatus,
      sourceReferenceReason: workbench.sourceReferenceReason
    }
  });
  const legacyPermissionDenied = await api(baseUrl, {
    method: "PATCH", path: `/api/transfer-packages/${workbench.id}`, cookie: cookies.manufacturing, company: "JENFU",
    body: {
      expectedRowVersion: workbench.rowVersion, title: workbench.title, caseType: workbench.caseType,
      caseReason: workbench.caseReason, sourceReferenceStatus: workbench.sourceReferenceStatus,
      sourceReferenceReason: workbench.sourceReferenceReason
    }
  });
  record("HTTP-D-002A legacy workbench mutations enforce same-origin and explicit permission", legacyCrossOrigin.status === 403 && legacyPermissionDenied.status === 403, { crossOrigin: legacyCrossOrigin.status, permissionDenied: legacyPermissionDenied.status });

  const unauthenticated = await api(baseUrl, {
    method: "POST", path: `/api/transfer-packages/${workbench.id}/draft-items`, company: "JENFU",
    key: "phase1d:http:scope:unauthenticated",
    body: { expectedRowVersion: workbench.rowVersion, workspaceId: workspace.id }
  });
  const deniedAdd = await api(baseUrl, {
    method: "POST", path: `/api/transfer-packages/${workbench.id}/draft-items`, cookie: cookies.manufacturing, company: "JENFU",
    key: "phase1d:http:scope:permission-denied",
    body: { expectedRowVersion: workbench.rowVersion, workspaceId: workspace.id }
  });
  record("HTTP-D-003 package scope mutation enforces authentication and explicit permission", unauthenticated.status === 401 && deniedAdd.status === 403, { unauthenticated: unauthenticated.status, denied: deniedAdd.status });

  const addInput = {
    method: "POST", path: `/api/transfer-packages/${workbench.id}/draft-items`, cookie: cookies.owner, company: "JENFU",
    key: "phase1d:http:scope:add",
    body: { expectedRowVersion: workbench.rowVersion, workspaceId: workspace.id, requiredness: "required", inclusionReason: "HTTP QC scope" }
  };
  const added = await api(baseUrl, addInput);
  const addReplay = await api(baseUrl, addInput);
  workbench = added.body.workbench;
  record("HTTP-D-004 scope add is stable-ID, versioned and idempotent", added.status === 200 && addReplay.status === 200 && addReplay.body?.idempotentReplay === true && workbench?.draftItems?.[0]?.workspaceId === workspace.id && workbench.rowVersion > packageCreated.body.workbench.rowVersion, { status: added.status, replay: addReplay.body?.idempotentReplay, rowVersion: workbench?.rowVersion });

  const draftItemId = workbench.draftItems[0].id;
  const removeInput = {
    method: "DELETE", path: `/api/transfer-packages/${workbench.id}/draft-items/${draftItemId}`, cookie: cookies.owner, company: "JENFU",
    key: "phase1d:http:scope:remove",
    body: { expectedRowVersion: workbench.rowVersion, reason: "HTTP QC remove replay" }
  };
  const removed = await api(baseUrl, removeInput);
  const removeReplay = await api(baseUrl, removeInput);
  workbench = removed.body.workbench;
  const readded = await api(baseUrl, {
    method: "POST", path: `/api/transfer-packages/${workbench.id}/draft-items`, cookie: cookies.owner, company: "JENFU",
    key: "phase1d:http:scope:readd",
    body: { expectedRowVersion: workbench.rowVersion, workspaceId: workspace.id, requiredness: "required", inclusionReason: "HTTP QC lifecycle scope" }
  });
  workbench = readded.body.workbench;
  record("HTTP-D-004A scope remove is idempotent and the workspace can be added again", removed.status === 200 && removeReplay.status === 200 && removeReplay.body?.idempotentReplay === true && removed.body.workbench.draftItems.length === 0 && readded.status === 200 && workbench.draftItems.length === 1, { removed: removed.status, replay: removeReplay.body?.idempotentReplay, readded: readded.status });

  const missingKey = await api(baseUrl, {
    method: "POST", path: `/api/transfer-packages/${workbench.id}/submit-review`, cookie: cookies.owner, company: "JENFU",
    body: { expectedRowVersion: workbench.rowVersion, reason: "missing idempotency" }
  });
  const crossOrigin = await api(baseUrl, {
    method: "POST", path: `/api/transfer-packages/${workbench.id}/submit-review`, cookie: cookies.owner, company: "JENFU",
    key: "phase1d:http:cross-origin", headers: { origin: "https://attacker.invalid" },
    body: { expectedRowVersion: workbench.rowVersion, reason: "cross origin" }
  });
  record("HTTP-D-005 submit requires idempotency and same-origin", missingKey.status === 400 && crossOrigin.status === 403, { missingKey: missingKey.status, crossOrigin: crossOrigin.status });

  const submitInput = {
    method: "POST", path: `/api/transfer-packages/${workbench.id}/submit-review`, cookie: cookies.owner, company: "JENFU",
    key: "phase1d:http:submit", body: { expectedRowVersion: workbench.rowVersion, reason: "HTTP aggregate review" }
  };
  const submitted = await api(baseUrl, submitInput);
  const submitReplay = await api(baseUrl, submitInput);
  const requestId = submitted.body.requestId;
  record("HTTP-D-006 aggregate submit and replay are atomic and idempotent", submitted.status === 200 && submitReplay.status === 200 && submitReplay.body?.idempotentReplay === true && Boolean(requestId), { submitted: submitted.status, replay: submitReplay.body?.idempotentReplay, requestId });

  const deniedDecision = await api(baseUrl, {
    method: "POST", path: `/api/approvals/requests/${encodeURIComponent(requestId)}/decisions`, cookie: cookies.manufacturing, company: "JENFU",
    key: "phase1d:http:decision:denied", body: { decision: "approved" }
  });
  const foreignDecision = await api(baseUrl, {
    method: "POST", path: `/api/approvals/requests/${encodeURIComponent(requestId)}/decisions`, cookie: cookies.admin, company: "MAXIMA",
    key: "phase1d:http:decision:foreign", body: { decision: "approved" }
  });
  record("HTTP-D-007 decision permission and company boundary fail closed", deniedDecision.status === 403 && foreignDecision.status === 404, { denied: deniedDecision.status, foreign: foreignDecision.status });

  const mastersBeforeApproval = {
    roots: db.prepare("SELECT count(*) count FROM part_roots").get().count,
    parts: db.prepare("SELECT count(*) count FROM part_numbers").get().count
  };
  const approved = await api(baseUrl, {
    method: "POST", path: `/api/approvals/requests/${encodeURIComponent(requestId)}/decisions`, cookie: cookies.reviewer, company: "JENFU",
    key: "phase1d:http:decision:approve", body: { decision: "approved", comment: "HTTP QC approved" }
  });
  const approvedPackage = db.prepare("SELECT package_status, row_version FROM transfer_packages WHERE id = ?").get(workbench.id);
  const mastersAfterApproval = {
    roots: db.prepare("SELECT count(*) count FROM part_roots").get().count,
    parts: db.prepare("SELECT count(*) count FROM part_numbers").get().count
  };
  record("HTTP-D-008 approval reaches ApprovedPendingPublish with zero master writes", approved.status === 200 && approvedPackage?.package_status === "ApprovedPendingPublish" && JSON.stringify(mastersBeforeApproval) === JSON.stringify(mastersAfterApproval), { status: approved.status, packageStatus: approvedPackage?.package_status, mastersBeforeApproval, mastersAfterApproval });

  const ownerPublish = await api(baseUrl, {
    method: "POST", path: `/api/transfer-packages/${workbench.id}/publish`, cookie: cookies.owner, company: "JENFU",
    key: "phase1d:http:publish:owner-denied", body: { expectedRowVersion: approvedPackage.row_version }
  });
  const foreignPublish = await api(baseUrl, {
    method: "POST", path: `/api/transfer-packages/${workbench.id}/publish`, cookie: cookies.admin, company: "MAXIMA",
    key: "phase1d:http:publish:foreign", body: { expectedRowVersion: approvedPackage.row_version }
  });
  record("HTTP-D-009 publication uses a separate permission and tenant boundary", ownerPublish.status === 403 && foreignPublish.status === 404, { owner: ownerPublish.status, foreign: foreignPublish.status });

  const publishInput = {
    method: "POST", path: `/api/transfer-packages/${workbench.id}/publish`, cookie: cookies.admin, company: "JENFU",
    key: "phase1d:http:publish", body: { expectedRowVersion: approvedPackage.row_version }
  };
  const published = await api(baseUrl, publishInput);
  const publishReplay = await api(baseUrl, publishInput);
  const publishedPackage = db.prepare("SELECT package_status FROM transfer_packages WHERE id = ?").get(workbench.id);
  const packageEvents = db.prepare("SELECT count(*) count FROM platform_outbox_events WHERE aggregate_id = ? AND event_type = 'pdm.transfer.package_published.v1'").get(workbench.id).count;
  record("HTTP-D-010 explicit batch publication and replay create one package event", published.status === 200 && publishReplay.status === 200 && publishReplay.body?.idempotentReplay === true && publishedPackage?.package_status === "Published" && packageEvents === 1, { published: published.status, replay: publishReplay.body?.idempotentReplay, packageStatus: publishedPackage?.package_status, packageEvents });

  const preparedDenied = await api(baseUrl, { path: "/api/technical-transfer?tab=prepared", cookie: cookies.manufacturing, company: "JENFU" });
  const publishedAllowed = await api(baseUrl, { path: "/api/technical-transfer?tab=published", cookie: cookies.manufacturing, company: "JENFU" });
  const exportAllowed = await api(baseUrl, { path: `/api/technical-transfer/${workbench.id}/export`, cookie: cookies.manufacturing, company: "JENFU" });
  record("HTTP-D-011 downstream role sees only published handoff and export", preparedDenied.status === 403 && publishedAllowed.status === 200 && publishedAllowed.body?.packages?.some((item) => item.id === workbench.id) && exportAllowed.status === 200 && exportAllowed.contentType.includes("text/csv") && exportAllowed.text.includes("UI") === false, { prepared: preparedDenied.status, published: publishedAllowed.status, export: exportAllowed.status, contentType: exportAllowed.contentType });

  const phaseResponses = [ownerPermissions, adminPermissions, legacyCrossOrigin, legacyPermissionDenied, unauthenticated, deniedAdd, added, addReplay, removed, removeReplay, readded, missingKey, crossOrigin, submitted, submitReplay, deniedDecision, foreignDecision, approved, ownerPublish, foreignPublish, published, publishReplay, preparedDenied, publishedAllowed, exportAllowed];
  record("HTTP-D-012 Phase1D responses are private/no-store", phaseResponses.every((response) => response.cacheControl.includes("no-store")), { missing: phaseResponses.map((response, index) => ({ index, cacheControl: response.cacheControl })).filter((item) => !item.cacheControl.includes("no-store")) });
  db.close();
} catch (error) {
  record("HTTP-D-RUNTIME", false, { error: String(error), stack: error instanceof Error ? error.stack : "", serverOutput: app?.output() ?? "" });
} finally {
  await stopApp();
  for (const [file, content] of snapshots) fs.writeFileSync(path.join(root, file), content, "utf8");
  await removeTree(tempDir);
  await removeTree(distDir);
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ suite: "DEV-048 Phase 1D disposable HTTP QC", passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
