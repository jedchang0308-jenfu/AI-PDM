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
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev048-http-"));
const distDirRelative = `.tmp/next-qc-dev048-${runId}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const password = "DEV048-QC-Password-2026";
const results = [];
let app;

const bootstrapUsers = [
  { id: "dev048-owner-a", displayName: "Owner A", email: "owner.a.dev048@example.invalid", password, role: "Engineer", companyCodes: ["JENFU"] },
  { id: "dev048-peer-a", displayName: "Peer A", email: "peer.a.dev048@example.invalid", password, role: "Engineer", companyCodes: ["JENFU"] },
  { id: "dev048-manager-a", displayName: "Manager A", email: "manager.a.dev048@example.invalid", password, role: "R&D Manager", companyCodes: ["JENFU"] },
  { id: "dev048-admin", displayName: "Admin", email: "admin.dev048@example.invalid", password, role: "Admin", companyCodes: ["JENFU", "MAXIMA"] },
  { id: "dev048-owner-b", displayName: "Owner B", email: "owner.b.dev048@example.invalid", password, role: "Engineer", companyCodes: ["MAXIMA"] },
  { id: "dev048-denied-a", displayName: "Denied A", email: "denied.a.dev048@example.invalid", password, role: "Manufacturing", companyCodes: ["JENFU"] }
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
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => port ? resolve(port) : reject(new Error("Unable to allocate a local port")));
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
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-30000);
  });
  child.stderr.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-30000);
  });
  return { child, getOutput: () => output };
}

async function waitForApp(baseUrl) {
  const deadline = Date.now() + 60000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`App did not become ready: ${lastError}\n${app?.getOutput() ?? ""}`);
}

async function stopApp() {
  if (!app || app.child.exitCode !== null) return;
  app.child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => app.child.once("exit", resolve)),
    delay(4000).then(() => {
      if (app.child.exitCode === null) app.child.kill("SIGTERM");
    })
  ]);
}

async function removeTempDir(dir) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch (error) {
      if (attempt === 5) {
        console.warn(`DEV-048 HTTP QC cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      await delay(500);
    }
  }
}

async function login(baseUrl, email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const body = await response.json().catch(() => ({}));
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
  if (response.status !== 200 || !cookie) {
    throw new Error(`Login failed for ${email}: ${response.status} ${JSON.stringify(body)}`);
  }
  return cookie;
}

async function api(baseUrl, input) {
  const headers = { ...(input.headers ?? {}) };
  if (input.cookie) headers.cookie = input.cookie;
  if (input.company) headers["x-pdm-company-code"] = input.company;
  if (input.key) headers["Idempotency-Key"] = input.key;
  let body;
  if (Object.prototype.hasOwnProperty.call(input, "body")) {
    if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
      headers["content-type"] = "application/json";
    }
    body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
  }
  const response = await fetch(`${baseUrl}${input.path}`, {
    method: input.method ?? "GET",
    headers,
    body
  });
  const text = await response.text();
  let responseBody;
  try {
    responseBody = text ? JSON.parse(text) : {};
  } catch {
    responseBody = { raw: text };
  }
  return {
    status: response.status,
    body: responseBody,
    cacheControl: response.headers.get("cache-control") ?? ""
  };
}

function workspaceBody(name) {
  return {
    draftMode: "new_bundle",
    root: { coreName: `${name} Root`, itemKind: "manufactured" },
    parts: [{ clientKey: "part-1", partName: `${name} Part`, itemKind: "manufactured" }],
    drawings: [{ clientKey: "drawing-1", purposeCode: "M", purposeDescription: `${name} Drawing`, isPrimaryManufacturing: true }],
    relations: [{ drawingClientKey: "drawing-1", partClientKey: "part-1", linkType: "primary_manufacturing", isPrimary: true }]
  };
}

function createWorkspace(baseUrl, cookie, key, name, company = "JENFU") {
  return api(baseUrl, {
    method: "POST",
    path: "/api/numbering/draft-workspaces",
    cookie,
    company,
    key,
    body: workspaceBody(name)
  });
}

function acquire(baseUrl, cookie, workspace, key, company = "JENFU", version = workspace.rowVersion) {
  return api(baseUrl, {
    method: "POST",
    path: `/api/numbering/draft-workspaces/${workspace.id}/candidate-numbers`,
    cookie,
    company,
    key,
    body: { expectedRowVersion: version }
  });
}

function cancel(baseUrl, cookie, workspace, key, reason, company = "JENFU", version = workspace.rowVersion) {
  return api(baseUrl, {
    method: "POST",
    path: `/api/numbering/draft-workspaces/${workspace.id}/cancel`,
    cookie,
    company,
    key,
    body: { expectedRowVersion: version, reason }
  });
}

function rootCode(response) {
  return response.body?.workspace?.reservations?.find((item) => item.itemType === "root")?.candidateCode ?? null;
}

try {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  app = startApp(port);
  await waitForApp(baseUrl);

  const cookies = {
    ownerA: await login(baseUrl, "owner.a.dev048@example.invalid"),
    peerA: await login(baseUrl, "peer.a.dev048@example.invalid"),
    managerA: await login(baseUrl, "manager.a.dev048@example.invalid"),
    admin: await login(baseUrl, "admin.dev048@example.invalid"),
    ownerB: await login(baseUrl, "owner.b.dev048@example.invalid"),
    deniedA: await login(baseUrl, "denied.a.dev048@example.invalid")
  };
  const db = new Database(path.join(tempDir, "ai-pdm.sqlite"));
  const officialTables = ["part_roots", "part_numbers", "drawing_numbers"];
  const officialBefore = Object.fromEntries(officialTables.map((table) => [
    table,
    Number(db.prepare(`SELECT count(*) count FROM ${table}`).get().count)
  ]));

  const unauthenticated = await api(baseUrl, { path: "/api/numbering/draft-workspaces" });
  record(
    "HTTP-001 unauthenticated request is 401 with no-store",
    unauthenticated.status === 401 &&
      unauthenticated.body?.error?.code === "authentication_required" &&
      unauthenticated.cacheControl.includes("no-store"),
    { status: unauthenticated.status, code: unauthenticated.body?.error?.code }
  );

  const wrongContentType = await api(baseUrl, {
    method: "POST",
    path: "/api/numbering/draft-workspaces",
    cookie: cookies.ownerA,
    company: "JENFU",
    key: "dev048:wrong-content-type",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify(workspaceBody("Wrong Content Type"))
  });
  record(
    "HTTP-002 non-JSON mutation is 415",
    wrongContentType.status === 415 && wrongContentType.body?.error?.code === "json_request_required",
    { status: wrongContentType.status, code: wrongContentType.body?.error?.code }
  );

  const crossOrigin = await api(baseUrl, {
    method: "POST",
    path: "/api/numbering/draft-workspaces",
    cookie: cookies.ownerA,
    company: "JENFU",
    key: "dev048:cross-origin",
    headers: { origin: "https://attacker.invalid" },
    body: workspaceBody("Cross Origin")
  });
  record(
    "HTTP-003 cross-origin mutation is 403",
    crossOrigin.status === 403 && crossOrigin.body?.error?.code === "same_origin_required",
    { status: crossOrigin.status, code: crossOrigin.body?.error?.code }
  );

  const sameOrigin = await api(baseUrl, {
    method: "POST",
    path: "/api/numbering/draft-workspaces",
    cookie: cookies.ownerA,
    company: "JENFU",
    key: "dev048:same-origin",
    headers: { origin: baseUrl },
    body: workspaceBody("Same Origin")
  });
  record(
    "HTTP-003A browser same-origin mutation is accepted",
    sameOrigin.status === 201 && sameOrigin.body?.workspace?.lifecycleStatus === "active",
    { status: sameOrigin.status, code: sameOrigin.body?.error?.code }
  );

  const missingKey = await api(baseUrl, {
    method: "POST",
    path: "/api/numbering/draft-workspaces",
    cookie: cookies.ownerA,
    company: "JENFU",
    body: workspaceBody("Missing Key")
  });
  record(
    "HTTP-004 missing idempotency key is 400",
    missingKey.status === 400 && missingKey.body?.error?.code === "idempotency_key_required",
    { status: missingKey.status, code: missingKey.body?.error?.code }
  );

  const denied = await createWorkspace(baseUrl, cookies.deniedA, "dev048:denied", "Denied");
  record(
    "HTTP-005 denied role cannot create",
    denied.status === 403 && denied.body?.error?.code === "numbering_permission_denied",
    { status: denied.status, code: denied.body?.error?.code }
  );

  const primaryBodyA = workspaceBody("Tenant A Primary");
  const createdA = await api(baseUrl, {
    method: "POST",
    path: "/api/numbering/draft-workspaces",
    cookie: cookies.ownerA,
    company: "JENFU",
    key: "dev048:create:a-primary",
    body: primaryBodyA
  });
  const replayA = await api(baseUrl, {
    method: "POST",
    path: "/api/numbering/draft-workspaces",
    cookie: cookies.ownerA,
    company: "JENFU",
    key: "dev048:create:a-primary",
    body: primaryBodyA
  });
  record(
    "HTTP-006 create and same-key replay are stable",
    createdA.status === 201 &&
      replayA.status === 200 &&
      createdA.body?.workspace?.id === replayA.body?.workspace?.id &&
      replayA.body?.idempotentReplay === true &&
      createdA.body?.workspace?.reservations?.length === 0,
    { createdStatus: createdA.status, replayStatus: replayA.status, replay: replayA.body?.idempotentReplay }
  );

  const workspaceA = createdA.body.workspace;
  const peerRead = await api(baseUrl, { path: `/api/numbering/draft-workspaces/${workspaceA.id}`, cookie: cookies.peerA, company: "JENFU" });
  const managerRead = await api(baseUrl, { path: `/api/numbering/draft-workspaces/${workspaceA.id}`, cookie: cookies.managerA, company: "JENFU" });
  const adminRead = await api(baseUrl, { path: `/api/numbering/draft-workspaces/${workspaceA.id}`, cookie: cookies.admin, company: "JENFU" });
  record(
    "HTTP-007 ownership and privileged read boundaries",
    peerRead.status === 404 && managerRead.status === 200 && adminRead.status === 200,
    { peer: peerRead.status, manager: managerRead.status, admin: adminRead.status }
  );

  const wrongTenantAdmin = await api(baseUrl, { path: `/api/numbering/draft-workspaces/${workspaceA.id}`, cookie: cookies.admin, company: "MAXIMA" });
  const ownerWrongMembership = await api(baseUrl, { path: "/api/numbering/draft-workspaces", cookie: cookies.ownerA, company: "MAXIMA" });
  record(
    "HTTP-008 company scope fails closed without target disclosure",
    wrongTenantAdmin.status === 404 &&
      wrongTenantAdmin.body?.error?.code === "workspace_not_found" &&
      ownerWrongMembership.status === 403 &&
      ownerWrongMembership.body?.error?.code === "numbering_permission_denied",
    {
      wrongTenantAdmin: { status: wrongTenantAdmin.status, code: wrongTenantAdmin.body?.error?.code },
      wrongMembership: { status: ownerWrongMembership.status, code: ownerWrongMembership.body?.error?.code }
    }
  );

  const managerAll = await api(baseUrl, { path: "/api/numbering/draft-workspaces?owner=all", cookie: cookies.managerA, company: "JENFU" });
  const peerMine = await api(baseUrl, { path: "/api/numbering/draft-workspaces?owner=mine", cookie: cookies.peerA, company: "JENFU" });
  record(
    "HTTP-009 owner list filtering and manager all-view",
    managerAll.status === 200 &&
      managerAll.body?.workspaces?.some((item) => item.id === workspaceA.id) &&
      peerMine.status === 200 &&
      !peerMine.body?.workspaces?.some((item) => item.id === workspaceA.id),
    { managerCount: managerAll.body?.workspaces?.length, peerCount: peerMine.body?.workspaces?.length }
  );

  const acquiredA = await acquire(baseUrl, cookies.ownerA, workspaceA, "dev048:acquire:a-primary");
  const replayAcquireA = await acquire(baseUrl, cookies.ownerA, workspaceA, "dev048:acquire:a-primary");
  record(
    "HTTP-010 acquire and same-key replay are stable",
    acquiredA.status === 200 &&
      replayAcquireA.status === 200 &&
      replayAcquireA.body?.idempotentReplay === true &&
      rootCode(acquiredA) === rootCode(replayAcquireA),
    { statuses: [acquiredA.status, replayAcquireA.status], code: rootCode(acquiredA), replay: replayAcquireA.body?.idempotentReplay }
  );

  const staleAcquire = await acquire(baseUrl, cookies.ownerA, workspaceA, "dev048:acquire:a-stale", "JENFU", 1);
  record(
    "HTTP-011 stale row version is 409",
    staleAcquire.status === 409 && staleAcquire.body?.error?.code === "workspace_version_conflict",
    { status: staleAcquire.status, code: staleAcquire.body?.error?.code }
  );

  const createdB = await createWorkspace(baseUrl, cookies.ownerB, "dev048:create:b-primary", "Tenant B Primary", "MAXIMA");
  const acquiredB = await acquire(baseUrl, cookies.ownerB, createdB.body.workspace, "dev048:acquire:b-primary", "MAXIMA");
  record(
    "HTTP-012 tenant sequences are independently scoped",
    createdB.status === 201 && acquiredB.status === 200 && rootCode(acquiredA) === "A0001" && rootCode(acquiredB) === "A0001",
    { tenantA: rootCode(acquiredA), tenantB: rootCode(acquiredB) }
  );

  const parallelCreated = [];
  for (let index = 0; index < 20; index += 1) {
    parallelCreated.push(await createWorkspace(baseUrl, cookies.ownerA, `dev048:create:parallel:${index}`, `Parallel ${index}`));
  }
  const createsPassed = parallelCreated.every((response) => response.status === 201);
  const parallelAcquired = createsPassed
    ? await Promise.all(parallelCreated.map((response, index) => acquire(baseUrl, cookies.ownerA, response.body.workspace, `dev048:acquire:parallel:${index}`)))
    : [];
  const parallelRootCodes = parallelAcquired.map(rootCode).filter(Boolean);
  record(
    "HTTP-013 20-way distinct-key acquire is atomic and collision-free",
    createsPassed &&
      parallelAcquired.every((response) => response.status === 200) &&
      parallelRootCodes.length === 20 &&
      new Set(parallelRootCodes).size === 20,
    {
      createStatuses: parallelCreated.map((item) => item.status),
      acquireStatuses: parallelAcquired.map((item) => item.status),
      rootCodes: parallelRootCodes
    }
  );

  const sameKeyCreated = await createWorkspace(baseUrl, cookies.ownerA, "dev048:create:same-key-parallel", "Same Key Parallel");
  const sameKeyResponses = await Promise.all(Array.from(
    { length: 20 },
    () => acquire(baseUrl, cookies.ownerA, sameKeyCreated.body.workspace, "dev048:acquire:same-key-parallel")
  ));
  const sameKeyCodes = sameKeyResponses.map(rootCode).filter(Boolean);
  const sameKeyReservationSets = sameKeyResponses.map((item) => JSON.stringify(
    item.body?.workspace?.reservations?.map((reservation) => [reservation.id, reservation.candidateCode]) ?? null
  ));
  record(
    "HTTP-014 20-way same-key acquire resolves one stable result",
    sameKeyResponses.every((response) => response.status === 200) &&
      sameKeyCodes.length === 20 &&
      new Set(sameKeyCodes).size === 1 &&
      new Set(sameKeyReservationSets).size === 1,
    { statuses: sameKeyResponses.map((item) => item.status), codes: sameKeyCodes }
  );

  const cancelledA = await cancel(baseUrl, cookies.ownerA, acquiredA.body.workspace, "dev048:cancel:a-primary", "qc_recycle");
  const replayCancelledA = await cancel(baseUrl, cookies.ownerA, acquiredA.body.workspace, "dev048:cancel:a-primary", "qc_recycle");
  const reuseCreated = await createWorkspace(baseUrl, cookies.ownerA, "dev048:create:reuse", "Reuse Gap");
  const reuseAcquired = await acquire(baseUrl, cookies.ownerA, reuseCreated.body.workspace, "dev048:acquire:reuse");
  record(
    "HTTP-015 cancel replay recycles and lowest gap is reused",
    cancelledA.status === 200 &&
      replayCancelledA.status === 200 &&
      replayCancelledA.body?.idempotentReplay === true &&
      cancelledA.body?.workspace?.reservations?.every((item) => item.state === "recycled") &&
      rootCode(reuseAcquired) === "A0001",
    {
      statuses: [cancelledA.status, replayCancelledA.status, reuseAcquired.status],
      replay: replayCancelledA.body?.idempotentReplay,
      reusedCode: rootCode(reuseAcquired)
    }
  );

  const lockCreated = await createWorkspace(baseUrl, cookies.ownerA, "dev048:create:lock", "Reference Lock");
  const lockAcquired = await acquire(baseUrl, cookies.ownerA, lockCreated.body.workspace, "dev048:acquire:lock");
  db.prepare(`
    UPDATE number_candidate_reservations
    SET reservation_state = 'review_locked', approval_request_id = 'dev048-qc-review', row_version = row_version + 1
    WHERE workspace_id = ?
  `).run(lockCreated.body.workspace.id);
  const blockedCancel = await cancel(baseUrl, cookies.ownerA, lockAcquired.body.workspace, "dev048:cancel:blocked", "must_block");
  const lockedFacts = db.prepare(`
    SELECT reservation_state state, approval_request_id approvalRequestId
    FROM number_candidate_reservations
    WHERE workspace_id = ?
  `).all(lockCreated.body.workspace.id);
  const lockedWorkspace = db.prepare(`
    SELECT lifecycle_status lifecycleStatus, cancelled_at cancelledAt
    FROM numbering_draft_workspaces
    WHERE id = ?
  `).get(lockCreated.body.workspace.id);
  record(
    "HTTP-016 review reference blocks recycle with no partial mutation",
    blockedCancel.status === 409 &&
      blockedCancel.body?.error?.code === "candidate_recycle_blocked" &&
      lockedFacts.every((item) => item.state === "review_locked" && item.approvalRequestId === "dev048-qc-review") &&
      lockedWorkspace.lifecycleStatus === "active" &&
      lockedWorkspace.cancelledAt === null,
    { status: blockedCancel.status, code: blockedCancel.body?.error?.code, lockedFacts, lockedWorkspace }
  );

  const officialAfter = Object.fromEntries(officialTables.map((table) => [
    table,
    Number(db.prepare(`SELECT count(*) count FROM ${table}`).get().count)
  ]));
  const duplicateActive = db.prepare(`
    SELECT company_id, candidate_code, count(*) count
    FROM number_candidate_reservations
    WHERE reservation_state IN ('active', 'review_locked', 'approved_locked', 'promoted')
    GROUP BY company_id, candidate_code
    HAVING count(*) > 1
  `).all();
  const evidence = {
    audits: Number(db.prepare("SELECT count(*) count FROM audit_logs WHERE action LIKE 'pdm.numbering.%'").get().count),
    receipts: Number(db.prepare("SELECT count(*) count FROM platform_command_receipts WHERE command_status = 'completed'").get().count),
    outbox: Number(db.prepare("SELECT count(*) count FROM platform_outbox_events").get().count),
    workspacesA: Number(db.prepare("SELECT count(*) count FROM numbering_draft_workspaces WHERE company_id = 'company-jenfu'").get().count),
    workspacesB: Number(db.prepare("SELECT count(*) count FROM numbering_draft_workspaces WHERE company_id = 'company-maxima'").get().count)
  };
  record(
    "HTTP-017 official masters remain untouched",
    JSON.stringify(officialBefore) === JSON.stringify(officialAfter),
    { officialBefore, officialAfter }
  );
  record("HTTP-018 active candidates stay unique per tenant", duplicateActive.length === 0, { duplicateActive });
  record(
    "HTTP-019 successful commands persist audit receipt and outbox evidence",
    evidence.audits > 0 && evidence.receipts > 0 && evidence.outbox > 0 && evidence.workspacesA > 0 && evidence.workspacesB > 0,
    evidence
  );
  record(
    "HTTP-020 all number-state responses are no-store",
    [
      unauthenticated,
      wrongContentType,
      crossOrigin,
      sameOrigin,
      missingKey,
      denied,
      createdA,
      replayA,
      acquiredA,
      staleAcquire,
      createdB,
      acquiredB,
      cancelledA,
      blockedCancel
    ].every((item) => item.cacheControl.includes("no-store"))
  );
  db.close();
} catch (error) {
  record("HTTP-FIXTURE", false, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    serverTail: app?.getOutput() ?? ""
  });
} finally {
  await stopApp();
  await removeTempDir(distDir);
  await removeTempDir(tempDir);
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({
  suite: "DEV-048 Phase 1A disposable HTTP QC",
  passed: results.length - failed.length,
  failed: failed.length,
  results
}, null, 2));
if (failed.length > 0) process.exit(1);
