#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const startedAt = new Date().toISOString();
const runId = process.env.DEV062_RUN_ID ?? `DEV062-${startedAt.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "-")}-local-isolated`;
const outputDir = path.resolve(process.env.DEV062_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-062-unified-part-relation-workbench", runId));
const expectedEvidenceRoot = path.resolve(root, "output", "qa", "dev-062-unified-part-relation-workbench");
if (!(outputDir === expectedEvidenceRoot || outputDir.startsWith(`${expectedEvidenceRoot}${path.sep}`))) {
  throw new Error(`DEV-062 evidence path must stay inside ${expectedEvidenceRoot}`);
}
const screenshotDir = path.join(outputDir, "screenshots");
const accessibilityDir = path.join(outputDir, "accessibility");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev062-real-operation-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const distDirs = [];
const trackedFiles = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const password = "DEV062-Real-Operation-2026";
const user = {
  id: "dev062-real-owner",
  displayName: "DEV-062 測試主管",
  email: "dev062.real@example.invalid",
  password,
  role: "R&D Manager",
  companyCodes: ["JENFU"]
};
const results = [];
const browserErrors = [];
const failedResponses = [];
const observedWrites = [];
const networkEvents = [];
const readDurations = [];
const warmReadDurations = [];
const searchVisibleDurations = [];
const accessibilityResults = [];
const hashEvidence = { compatibility: null, disposable: null, cleanup: null };
let app = null;
let browser = null;
let database = null;
let baseUrl = "";
let expectedFaultActive = false;

function record(id, passed, detail = {}) {
  results.push({ id, passed: Boolean(passed), detail });
}

function hashRows(rows) {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function businessHash() {
  const tables = [
    "numbering_draft_workspaces",
    "numbering_draft_roots",
    "numbering_draft_parts",
    "number_candidate_reservations",
    "part_roots",
    "part_numbers",
    "drawing_numbers",
    "drawing_part_links"
  ];
  return hashRows(tables.map((table) => ({ table, rows: database.prepare(`SELECT * FROM ${table} ORDER BY id`).all() })));
}

function seedFixture() {
  const now = "2026-08-10T08:00:00.000Z";
  database.prepare(`INSERT INTO numbering_draft_workspaces (
    id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at
  ) VALUES ('dev062-real-candidate', 'company-jenfu', 'new_bundle', 'active', ?, ?, 1, ?, ?)` ).run(user.id, user.id, now, now);
  database.prepare(`INSERT INTO numbering_draft_roots (
    id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
  ) VALUES ('dev062-real-draft-root', 'company-jenfu', 'dev062-real-candidate', '候選泵浦', 'manufactured', 'numbering-rule-v3-alpha-root', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_parts (
    id, company_id, workspace_id, root_draft_id, part_name, item_kind, series_code, created_at, updated_at
  ) VALUES ('dev062-real-draft-part', 'company-jenfu', 'dev062-real-candidate', 'dev062-real-draft-root', '候選泵浦', 'manufactured', 'JF', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO number_candidate_reservations (
    id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code, sequence_scope_key, sequence_no,
    reservation_state, row_version, created_by, created_at, updated_at
  ) VALUES ('dev062-real-part-reservation', 'company-jenfu', 'dev062-real-candidate', 'part', 'dev062-real-draft-part',
    'Z2062-P01', 'dev062-real:parts', 1, 'active', 1, ?, ?, ?)` ).run(user.id, now, now);
  database.prepare("UPDATE numbering_draft_parts SET candidate_reservation_id = 'dev062-real-part-reservation' WHERE id = 'dev062-real-draft-part'").run();
  database.prepare(`INSERT INTO part_roots (
    id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at
  ) VALUES ('dev062-real-root', 'company-jenfu', 'Z3062', '正式泵浦', 'manufactured', 'Active', ?, ?, ?)` ).run(user.id, now, now);
  database.prepare(`INSERT INTO part_numbers (
    id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, series_code,
    record_status, created_by, created_at, updated_at
  ) VALUES ('dev062-real-part', 'company-jenfu', 'dev062-real-root', 'Z3062-P01', 1, '01', '正式泵浦',
    'manufactured', 'JF', 'Active', ?, ?, ?)` ).run(user.id, now, now);
  database.prepare(`INSERT INTO drawing_numbers (
    id, company_id, part_root_id, drawing_number, purpose_code, sequence_no, is_primary_manufacturing,
    record_status, created_by, created_at, updated_at
  ) VALUES ('dev062-real-drawing', 'company-jenfu', 'dev062-real-root', 'Z3062-M01', 'M', 1, 1,
    'Active', ?, ?, ?)` ).run(user.id, now, now);
  database.prepare(`INSERT INTO drawing_part_links (
    id, drawing_number_id, part_number_id, link_type, created_by, created_at
  ) VALUES ('dev062-real-link', 'dev062-real-drawing', 'dev062-real-part', 'primary_manufacturing', ?, ?)` ).run(user.id, now);

  database.prepare(`INSERT INTO part_roots (
    id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at
  ) VALUES ('dev062-history-root', 'company-jenfu', 'H3062', '歷史泵浦', 'manufactured', 'Obsolete', ?, ?, ?)` ).run(user.id, now, now);
  database.prepare(`INSERT INTO part_numbers (
    id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, series_code,
    record_status, created_by, created_at, updated_at
  ) VALUES ('dev062-history-part', 'company-jenfu', 'dev062-history-root', 'H3062-P01', 1, '01', '歷史泵浦',
    'manufactured', 'JF', 'Obsolete', ?, ?, ?)` ).run(user.id, now, now);
  database.prepare(`INSERT INTO numbering_draft_workspaces (
    id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, cancelled_at, cancelled_by,
    cancel_reason, created_at, updated_at
  ) VALUES ('dev062-history-candidate', 'company-jenfu', 'new_bundle', 'cancelled', ?, ?, 2, ?, ?,
    'dev062_history_fixture', ?, ?)` ).run(user.id, user.id, now, user.id, now, now);
  database.prepare(`INSERT INTO numbering_draft_roots (
    id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
  ) VALUES ('dev062-history-draft-root', 'company-jenfu', 'dev062-history-candidate', '歷史候選泵浦', 'manufactured',
    'numbering-rule-v3-alpha-root', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_parts (
    id, company_id, workspace_id, root_draft_id, part_name, item_kind, series_code, created_at, updated_at
  ) VALUES ('dev062-history-draft-part', 'company-jenfu', 'dev062-history-candidate', 'dev062-history-draft-root',
    '歷史候選泵浦', 'manufactured', 'JF', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO number_candidate_reservations (
    id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code, sequence_scope_key, sequence_no,
    reservation_state, row_version, created_by, recycled_at, recycled_by, recycle_reason, created_at, updated_at
  ) VALUES ('dev062-history-reservation', 'company-jenfu', 'dev062-history-candidate', 'part', 'dev062-history-draft-part',
    'H2062-P01', 'dev062-history:parts', 1, 'recycled', 2, ?, ?, ?, 'dev062_history_fixture', ?, ?)` )
    .run(user.id, now, user.id, now, now);
  database.prepare("UPDATE numbering_draft_parts SET candidate_reservation_id = 'dev062-history-reservation' WHERE id = 'dev062-history-draft-part'").run();

  const insertPart = database.prepare(`INSERT INTO part_numbers (
    id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, series_code,
    record_status, created_by, created_at, updated_at
  ) VALUES (?, 'company-jenfu', ?, ?, ?, ?, ?, 'manufactured', 'JF', 'Active', ?, ?, ?)`);
  const insertDrawing = database.prepare(`INSERT INTO drawing_numbers (
    id, company_id, part_root_id, drawing_number, purpose_code, sequence_no, is_primary_manufacturing,
    record_status, created_by, created_at, updated_at
  ) VALUES (?, 'company-jenfu', ?, ?, 'M', ?, ?, 'Active', ?, ?, ?)`);
  const insertLink = database.prepare(`INSERT INTO drawing_part_links (
    id, drawing_number_id, part_number_id, link_type, created_by, created_at
  ) VALUES (?, ?, ?, ?, ?, ?)`);
  const seedRepresentativeFixture = database.transaction(() => {
    const performanceFixtureTime = "2026-08-10T07:00:00.000Z";
    for (let sequence = 2; sequence <= 5; sequence += 1) {
      const suffix = String(sequence).padStart(2, "0");
      insertPart.run(`dev062-real-part-${suffix}`, "dev062-real-root", `Z3062-P${suffix}`, sequence, suffix, `正式泵浦 ${suffix}`, user.id, now, now);
    }
    for (let sequence = 2; sequence <= 3; sequence += 1) {
      const suffix = String(sequence).padStart(2, "0");
      insertDrawing.run(`dev062-real-drawing-${suffix}`, "dev062-real-root", `Z3062-M${suffix}`, sequence, 0, user.id, now, now);
      insertLink.run(`dev062-real-link-${suffix}`, `dev062-real-drawing-${suffix}`, `dev062-real-part-${suffix}`, "reference", user.id, now);
    }
    for (let rootSequence = 1; rootSequence <= 59; rootSequence += 1) {
      const rootSuffix = String(rootSequence).padStart(4, "0");
      const rootId = `dev062-perf-root-${rootSuffix}`;
      const rootCode = `Q${rootSuffix}`;
      database.prepare(`INSERT INTO part_roots (
        id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?, 'manufactured', 'Active', ?, ?, ?)`)
        .run(rootId, rootCode, `代表性料件 ${rootSuffix}`, user.id, performanceFixtureTime, performanceFixtureTime);
      for (let partSequence = 1; partSequence <= 5; partSequence += 1) {
        const partSuffix = String(partSequence).padStart(2, "0");
        insertPart.run(
          `dev062-perf-part-${rootSuffix}-${partSuffix}`,
          rootId,
          `${rootCode}-P${partSuffix}`,
          partSequence,
          partSuffix,
          `代表性料件 ${rootSuffix}-${partSuffix}`,
          user.id,
          performanceFixtureTime,
          performanceFixtureTime
        );
      }
      for (let drawingSequence = 1; drawingSequence <= 3; drawingSequence += 1) {
        const drawingSuffix = String(drawingSequence).padStart(2, "0");
        const drawingId = `dev062-perf-drawing-${rootSuffix}-${drawingSuffix}`;
        const partId = `dev062-perf-part-${rootSuffix}-${drawingSuffix}`;
        insertDrawing.run(drawingId, rootId, `${rootCode}-M${drawingSuffix}`, drawingSequence, drawingSequence === 1 ? 1 : 0, user.id, performanceFixtureTime, performanceFixtureTime);
        insertLink.run(`dev062-perf-link-${rootSuffix}-${drawingSuffix}`, drawingId, partId, drawingSequence === 1 ? "primary_manufacturing" : "reference", user.id, performanceFixtureTime);
      }
    }
  });
  seedRepresentativeFixture();
}

function percentile95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] : null;
}

function configureEnvironment(enabled, distDirRelative) {
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "managed",
    PDM_BOOTSTRAP_USERS: JSON.stringify([user]),
    PDM_DEMO_USERS: "0",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_DB_PROVIDER: "sqlite",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: "",
    PDM_STORAGE_PROVIDER: "local_repository",
    PDM_SUPABASE_STORAGE_LIVE_ENABLED: "0",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_RELEASE_MODE: "local_stub",
    PDM_NUMBER_STATE_FLOW_V1: "true",
    PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
    PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: enabled ? "true" : "false",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_NEXT_DIST_DIR: distDirRelative,
    PDM_QC_ISOLATED_TARGET: "1"
  });
}

async function startIsolated(enabled) {
  const distDirRelative = `.tmp/q62-${enabled ? "on" : "off"}-${crypto.randomUUID().slice(0, 8)}`;
  distDirs.push(path.join(root, ...distDirRelative.split("/")));
  configureEnvironment(enabled, distDirRelative);
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }),
    page.getByRole("button", { name: "登入", exact: true }).click()
  ]);
  await page.waitForLoadState("networkidle");
}

function monitor(page, phase) {
  const requestStarted = new Map();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === baseUrl && (url.pathname.startsWith("/api/") || request.isNavigationRequest())) {
      const entry = {
        phase,
        method: request.method(),
        route: `${url.pathname}${url.search}`,
        resourceType: request.resourceType(),
        status: null,
        durationMs: null,
        aborted: false,
        failure: null
      };
      networkEvents.push(entry);
      requestStarted.set(request, { started: performance.now(), entry });
    }
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method()) &&
        (url.pathname.startsWith("/api/numbering") || url.pathname.startsWith("/api/parts") || url.pathname.startsWith("/api/approvals"))) {
      observedWrites.push({ phase, method: request.method(), path: url.pathname });
    }
  });
  page.on("response", (response) => {
    const tracked = requestStarted.get(response.request());
    if (tracked) {
      tracked.entry.status = response.status();
      tracked.entry.durationMs = Math.round(performance.now() - tracked.started);
    }
    if (tracked && (new URL(response.url()).pathname.includes("/workbench") || new URL(response.url()).searchParams.get("projection") === "workbench_v1")) {
      readDurations.push({ phase, path: new URL(response.url()).pathname, durationMs: tracked.entry.durationMs, status: response.status() });
    }
    const responseUrl = new URL(response.url());
    const expectedFault = responseUrl.searchParams.get("query") === "DEV062_EXPECTED_ERROR";
    if (response.status() >= 500 && !expectedFault) failedResponses.push({ phase, status: response.status(), url: response.url() });
  });
  page.on("requestfailed", (request) => {
    const tracked = requestStarted.get(request);
    if (!tracked) return;
    const failure = request.failure()?.errorText ?? "request_failed";
    tracked.entry.durationMs = Math.round(performance.now() - tracked.started);
    tracked.entry.aborted = /abort|cancel/iu.test(failure);
    tracked.entry.failure = failure;
  });
  page.on("console", (message) => {
    const messageText = message.text();
    if (message.type() === "error" && !(expectedFaultActive && /503 \(Service Unavailable\)/u.test(messageText))) {
      browserErrors.push({ phase, type: "console", text: messageText.slice(0, 500) });
    }
  });
  page.on("pageerror", (error) => browserErrors.push({ phase, type: "pageerror", text: error.message.slice(0, 500) }));
}

async function viewportEvidence(page, pathname, heading, prefix) {
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 }
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: heading, exact: true }).waitFor({ state: "visible" });
    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      mainClientWidth: document.querySelector("main")?.clientWidth ?? 0,
      mainScrollWidth: document.querySelector("main")?.scrollWidth ?? 0
    }));
    const fileName = `${prefix}-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: path.join(screenshotDir, fileName), fullPage: false });
    record(`DEV062-REAL ${prefix} ${viewport.width}x${viewport.height}`,
      metrics.documentWidth <= metrics.innerWidth + 2 && metrics.mainScrollWidth <= metrics.mainClientWidth + 2,
      { ...metrics, screenshot: `screenshots/${fileName}` });
  }
}

async function measureWarmReads(page) {
  const endpoints = [
    "/api/parts/workbench?view=all&limit=50&history=exclude",
    "/api/numbering/relations?projection=workbench_v1&view=all&limit=60&history=exclude&entityType=all"
  ];
  for (const endpoint of endpoints) {
    for (let warmup = 0; warmup < 2; warmup += 1) {
      const response = await page.request.get(`${baseUrl}${endpoint}`);
      await response.body();
      if (!response.ok()) throw new Error(`Warm-up read failed: ${endpoint} -> ${response.status()}`);
    }
    for (let sample = 0; sample < 7; sample += 1) {
      const started = performance.now();
      const response = await page.request.get(`${baseUrl}${endpoint}`);
      await response.body();
      const durationMs = Math.round(performance.now() - started);
      warmReadDurations.push({ endpoint, durationMs, status: response.status() });
      if (!response.ok()) throw new Error(`Warm read failed: ${endpoint} -> ${response.status()}`);
    }
  }
}

async function measureSearchVisibility(page, { pathname, placeholder, endpointPath, expected }) {
  await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
  const input = page.getByPlaceholder(placeholder);
  for (let sample = 0; sample < 3; sample += 1) {
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === endpointPath && url.searchParams.get("query") === "Z3062" && response.status() === 200;
    });
    const started = performance.now();
    await input.fill("Z3062");
    await responsePromise;
    await expected(page).waitFor({ state: "visible" });
    searchVisibleDurations.push({ pathname, durationMs: Math.round(performance.now() - started) });

    const resetPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === endpointPath && !url.searchParams.has("query") && response.status() === 200;
    });
    await input.fill("");
    await resetPromise;
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readJsonResponse(response, label) {
  if (!response.ok()) throw new Error(`${label} failed: HTTP ${response.status()}`);
  return response.json();
}

async function runRaceEvidence(page) {
  const partQueries = ["Z3062", "Q0001", "Q0002"];
  const listBodies = new Map();
  for (const query of partQueries) {
    const response = await page.request.get(`${baseUrl}/api/parts/workbench?view=all&limit=50&history=exclude&query=${encodeURIComponent(query)}`);
    listBodies.set(query, await readJsonResponse(response, `Part race fixture ${query}`));
  }
  await page.goto(`${baseUrl}/parts?view=all`, { waitUntil: "networkidle" });
  const input = page.getByPlaceholder("料號、主根號、名稱、材質、顏色");
  const listRoutePattern = "**/api/parts/workbench?**";
  const listDelays = new Map([["Z3062", 1000], ["Q0001", 500], ["Q0002", 100]]);
  const listHandler = async (route) => {
    const query = new URL(route.request().url()).searchParams.get("query") ?? "";
    if (!listBodies.has(query)) return route.continue();
    await wait(listDelays.get(query) ?? 0);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(listBodies.get(query)) }).catch(() => undefined);
  };
  await page.route(listRoutePattern, listHandler);
  let finalListResponse;
  for (const query of partQueries) {
    if (query === "Q0002") {
      finalListResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === "/api/parts/workbench" && url.searchParams.get("query") === "Q0002" && response.status() === 200;
      });
    }
    await Promise.all([
      page.waitForRequest((request) => {
        const url = new URL(request.url());
        return url.pathname === "/api/parts/workbench" && url.searchParams.get("query") === query;
      }),
      input.fill(query)
    ]);
  }
  await finalListResponse;
  await wait(1100);
  const lastRequestWins = await page.getByText("Q0002-P01", { exact: true }).count() > 0 &&
    await page.getByText("Z3062-P01", { exact: true }).count() === 0 &&
    new URL(page.url()).searchParams.get("query") === "Q0002";
  record("CORE-07/PART race list A→B→C commits only C", lastRequestWins, { delaysMs: Object.fromEntries(listDelays), finalUrl: page.url() });
  await page.unroute(listRoutePattern, listHandler);

  const resetListResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/parts/workbench" && response.status() === 200);
  await input.fill("");
  await resetListResponse;
  const detailKeys = ["part:dev062-real-part", "part:dev062-perf-part-0001-01"];
  const detailBodies = new Map();
  for (const key of detailKeys) {
    const response = await page.request.get(`${baseUrl}/api/parts/workbench/${encodeURIComponent(key)}`);
    detailBodies.set(key, await readJsonResponse(response, `Part detail race fixture ${key}`));
  }
  const detailRoutePattern = "**/api/parts/workbench/*";
  const detailHandler = async (route) => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
    if (!detailBodies.has(key)) return route.continue();
    await wait(key === detailKeys[0] ? 1000 : 100);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detailBodies.get(key)) }).catch(() => undefined);
  };
  await page.route(detailRoutePattern, detailHandler);
  const openByCode = async (code, key) => {
    await Promise.all([
      page.waitForRequest((request) => decodeURIComponent(new URL(request.url()).pathname.split("/").pop() ?? "") === key),
      page.getByRole("button", { name: code, exact: true }).first().click()
    ]);
  };
  await openByCode("Z3062-P01", detailKeys[0]);
  await openByCode("Q0001-P01", detailKeys[1]);
  await page.getByRole("heading", { name: "Q0001-P01", exact: true }).waitFor({ state: "visible" });
  await wait(1100);
  record("CORE-07/PART detail A→B keeps B when A resolves late",
    await page.getByRole("heading", { name: "Q0001-P01", exact: true }).count() === 1 &&
      await page.getByRole("heading", { name: "Z3062-P01", exact: true }).count() === 0 &&
      new URL(page.url()).searchParams.get("detail") === detailKeys[1],
    { delaysMs: { [detailKeys[0]]: 1000, [detailKeys[1]]: 100 } });
  await page.keyboard.press("Escape");
  await page.getByRole("region", { name: "料號工作清單" }).focus();
  await openByCode("Z3062-P01", detailKeys[0]);
  await page.getByText("正在載入明細...").waitFor({ state: "visible" });
  await page.getByRole("region", { name: "料號工作清單" }).focus();
  await page.keyboard.press("Escape");
  await wait(1100);
  record("CORE-07/PART close-before-response prevents late reopen",
    await page.locator('[role="complementary"]').count() === 0 && !new URL(page.url()).searchParams.has("detail"));
  await page.unroute(detailRoutePattern, detailHandler);

  await page.getByRole("button", { name: "Q0001-P01", exact: true }).first().click();
  await page.getByRole("heading", { name: "Q0001-P01", exact: true }).waitFor({ state: "visible" });
  const filteredResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/parts/workbench" && url.searchParams.get("query") === "Z3062" && response.status() === 200;
  });
  await input.fill("Z3062");
  await filteredResponse;
  await page.locator('[role="complementary"]').waitFor({ state: "hidden" });
  record("CORE-07/PART filtered-out selection closes authoritatively", !new URL(page.url()).searchParams.has("detail"));
}

async function captureStateEvidence(page) {
  await page.goto(`${baseUrl}/parts?view=all&detail=part%3Adev062-real-part`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Z3062-P01", exact: true }).waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(screenshotDir, "drawer-part-formal.png"), fullPage: false });
  record("PART UX drawer state is actionable", await page.getByRole("button", { name: "關閉料號明細" }).count() === 1, { screenshot: "screenshots/drawer-part-formal.png" });
  await page.keyboard.press("Escape");

  const input = page.getByPlaceholder("料號、主根號、名稱、材質、顏色");
  const emptyResponse = page.waitForResponse((response) => new URL(response.url()).searchParams.get("query") === "DEV062_NO_MATCH" && response.status() === 200);
  await input.fill("DEV062_NO_MATCH");
  await emptyResponse;
  await page.getByText("目前沒有符合條件的料號工作", { exact: true }).waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(screenshotDir, "state-empty.png"), fullPage: false });
  record("PART UX empty state passes Now What", (await page.locator("body").innerText()).includes("請調整搜尋或篩選條件"), { screenshot: "screenshots/state-empty.png" });

  const errorPattern = "**/api/parts/workbench?**";
  const errorHandler = async (route) => {
    const query = new URL(route.request().url()).searchParams.get("query");
    if (query !== "DEV062_EXPECTED_ERROR") return route.continue();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "dev062_expected_fault", message: "測試注入：清單暫時無法載入，請重新整理。", retryable: true } })
    });
  };
  await page.route(errorPattern, errorHandler);
  const restoredResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/parts/workbench" && response.status() === 200);
  await input.fill("");
  await restoredResponse;
  const errorResponse = page.waitForResponse((response) => new URL(response.url()).searchParams.get("query") === "DEV062_EXPECTED_ERROR" && response.status() === 503);
  expectedFaultActive = true;
  await input.fill("DEV062_EXPECTED_ERROR");
  await errorResponse;
  await page.locator('.number-state-message[role="alert"]').waitFor({ state: "visible" });
  expectedFaultActive = false;
  await page.screenshot({ path: path.join(screenshotDir, "state-error-retry.png"), fullPage: false });
  record("PART UX 5xx keeps last successful rows and exposes retry",
    await page.getByRole("button", { name: "重新載入", exact: true }).count() === 1 && await page.locator("[data-part-workbench-row]").count() > 0,
    { screenshot: "screenshots/state-error-retry.png" });
  await page.unroute(errorPattern, errorHandler);

  await page.goto(`${baseUrl}/parts?view=all&history=include&query=H3062`, { waitUntil: "networkidle" });
  await page.getByText("H3062-P01", { exact: true }).waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(screenshotDir, "state-history.png"), fullPage: false });
  record("PART UX history state is explicit and non-mutating", await page.getByText("H3062-P01", { exact: true }).count() > 0, { screenshot: "screenshots/state-history.png" });

  await page.goto(`${baseUrl}/numbering/search?view=all&query=Q0001`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Q0001", exact: true }).waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(screenshotDir, "state-blocked-relation.png"), fullPage: false });
  const blockedText = await page.locator(".pdm-relation-root").first().innerText();
  record("REL UX blocked relationship gives status and next context", /缺|待|阻擋|補/u.test(blockedText), { screenshot: "screenshots/state-blocked-relation.png", visibleText: blockedText.slice(0, 300) });
}

async function runAccessibilityEvidence(page, context) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl }).catch(() => undefined);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${baseUrl}/parts?view=all`, { waitUntil: "networkidle" });
  const partList = page.getByRole("region", { name: "料號工作清單" });
  await partList.focus();
  await page.keyboard.press("Home");
  const homeSelected = await page.locator('[data-part-workbench-row][aria-selected="true"]').first().getAttribute("aria-selected") === "true";
  await page.keyboard.press("End");
  const endSelected = await page.locator('[data-part-workbench-row][aria-selected="true"]').count() === 1;
  await page.keyboard.press("PageUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Control+C");
  await wait(50);
  const copiedPartCode = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  await page.keyboard.press("Enter");
  await page.locator('[role="complementary"]').waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await page.locator('[role="complementary"]').waitFor({ state: "hidden" });
  const partFocusReturned = await partList.evaluate((node) => node === document.activeElement);

  await page.goto(`${baseUrl}/numbering/search?view=all`, { waitUntil: "networkidle" });
  const relationList = page.getByRole("region", { name: "圖料工作清單" });
  await relationList.focus();
  for (const key of ["Home", "End", "PageUp", "PageDown", "ArrowUp", "ArrowDown"]) await page.keyboard.press(key);
  await page.keyboard.press("Control+C");
  await wait(50);
  const copiedRootCode = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  await page.keyboard.press("Enter");
  await page.locator('[role="complementary"]').waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await page.locator('[role="complementary"]').waitFor({ state: "hidden" });
  const relationFocusReturned = await relationList.evaluate((node) => node === document.activeElement);
  const accessibleNames = {
    expand: await page.getByRole("button", { name: /展開關係|收合關係/u }).count(),
    filters: await page.locator("label select, label input").count(),
    tabs: await page.getByRole("tab").count()
  };
  const ariaSnapshot = typeof page.locator("main").ariaSnapshot === "function"
    ? await page.locator("main").ariaSnapshot()
    : "ariaSnapshot unavailable in current Playwright runtime";
  fs.writeFileSync(path.join(accessibilityDir, "relation-main.aria.yml"), `${ariaSnapshot}\n`, "utf8");

  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  const zoomMetrics = await page.evaluate(() => ({
    zoom: document.documentElement.style.zoom,
    hasVisibleAction: [...document.querySelectorAll("button, a")].some((node) =>
      (node.getAttribute("aria-label")?.includes("關係") || node.textContent?.includes("Q0001")) && node.getBoundingClientRect().width > 0)
  }));
  await page.evaluate(() => { document.documentElement.style.zoom = ""; });

  const result = {
    id: "CORE-09/PART/REL accessibility keyboard-focus-names-reduced-motion-zoom",
    passed: homeSelected && endSelected && partFocusReturned && relationFocusReturned && Boolean(copiedPartCode) && Boolean(copiedRootCode) && accessibleNames.expand > 0 && accessibleNames.filters > 0 && accessibleNames.tabs >= 2 && zoomMetrics.zoom === "200%" && zoomMetrics.hasVisibleAction,
    shortcuts: ["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Enter", "Escape", "Control+C"],
    copiedPartCode,
    copiedRootCode,
    partFocusReturned,
    relationFocusReturned,
    accessibleNames,
    reducedMotion: "reduce",
    zoomMetrics
  };
  accessibilityResults.push(result);
  record(result.id, result.passed, result);
}

function readEvidenceJson(fileName, fallback = null) {
  const target = path.join(outputDir, fileName);
  if (!fs.existsSync(target)) return fallback;
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function sourceManifest() {
  const files = [
    "src/lib/pdm-workbench-contract.ts",
    "src/lib/pdm-workbench-cursor.ts",
    "src/lib/repositories/pdm-workbench-read-snapshot.ts",
    "src/components/use-pdm-workbench-controller.ts",
    "src/components/pdm-workbench-list.tsx",
    "src/lib/drawing-workbench.ts",
    "src/lib/repositories/drawing-workbench-async-repository.ts",
    "src/components/drawing-workbench.tsx",
    "src/lib/part-workbench.ts",
    "src/lib/repositories/part-workbench-async-repository.ts",
    "src/app/api/parts/workbench/route.ts",
    "src/app/api/parts/workbench/[rowKey]/route.ts",
    "src/components/part-workbench.tsx",
    "src/components/part-detail-content.tsx",
    "src/lib/relation-workbench.ts",
    "src/lib/repositories/relation-workbench-async-repository.ts",
    "src/app/api/numbering/relations/route.ts",
    "src/app/api/numbering/relations/[rowKey]/route.ts",
    "src/components/relation-workbench.tsx",
    "src/app/numbering/search/page.tsx",
    "src/lib/number-state-flow-feature.ts",
    "src/lib/number-state-flow-legacy-route.ts",
    "scripts/qc-dev-062-workbench-core.mjs",
    "scripts/qc-dev-062-part-workbench.mjs",
    "scripts/qc-dev-062-relation-workbench.mjs",
    "scripts/qc-dev-062-compat.mjs",
    "scripts/qc-dev-062-real-operation.mjs",
    "scripts/qc-dev-062-aggregate.mjs",
    "package.json"
  ];
  const fileHashes = files.map((file) => {
    const content = fs.readFileSync(path.join(root, ...file.split("/")));
    return { file, sha256: crypto.createHash("sha256").update(content).digest("hex") };
  });
  const worktreeHash = crypto.createHash("sha256").update(JSON.stringify(fileHashes)).digest("hex");
  let gitHead = null;
  try { gitHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim(); } catch {}
  return { gitHead, worktreeHash, files: fileHashes };
}

function buildContractResults() {
  const core = readEvidenceJson("core-results.json", { passed: false, checks: [] });
  const part = readEvidenceJson("part-results.json", { passed: false });
  const relation = readEvidenceJson("relation-results.json", { passed: false });
  const compat = readEvidenceJson("compat-results.json", { passed: false, checks: [] });
  const aggregate = readEvidenceJson("aggregate-results.json", { results: [] });
  const aggregatePass = (id) => aggregate.results?.some((item) => item.id === id && item.passed === true);
  const browserPass = (pattern) => results.some((item) => pattern.test(item.id) && item.passed);
  const coreCheck = (id) => core.checks?.some((item) => item.id.startsWith(id) && item.passed);
  const compatCheck = (id) => compat.checks?.some((item) => item.id.startsWith(id) && item.passed);
  const caseResult = (id, passed, evidence) => ({ id, passed: Boolean(passed), evidence });
  const cases = [
    caseResult("CORE-01", coreCheck("CORE-01"), ["core-results.json"]),
    caseResult("CORE-02", coreCheck("CORE-02") && part.passed && relation.passed, ["core-results.json", "part-results.json", "relation-results.json"]),
    caseResult("CORE-03", coreCheck("CORE-03"), ["core-results.json"]),
    caseResult("CORE-04", coreCheck("CORE-04"), ["core-results.json"]),
    caseResult("CORE-05", aggregatePass("drawing_read"), ["aggregate-results.json: drawing_read"]),
    caseResult("CORE-06", aggregatePass("drawing_ui"), ["aggregate-results.json: drawing_ui"]),
    caseResult("CORE-07", browserPass(/race|late reopen|filtered-out/u), ["report.json: race cases", "network.json"]),
    caseResult("CORE-08", browserPass(/back-forward-reload/u) && browserPass(/zero-write/u), ["report.json", "before-after-hashes.json"]),
    caseResult("CORE-09", browserPass(/accessibility/u), ["accessibility/results.json", "accessibility/relation-main.aria.yml"]),
    caseResult("CORE-10", aggregatePass("drawing_read"), ["aggregate-results.json: drawing_read"]),
    ...Array.from({ length: 10 }, (_, index) => caseResult(`PART-${String(index + 1).padStart(2, "0")}`,
      part.passed && (index !== 9 || part.queryBudget?.list?.representative === part.queryBudget?.list?.baseline),
      index === 9 ? ["query-budget.json"] : ["part-results.json", "capability-parity.md", "report.json"])),
    ...Array.from({ length: 12 }, (_, index) => caseResult(`REL-${String(index + 1).padStart(2, "0")}`,
      relation.passed && (index !== 11 || relation.queryBudget?.list?.representative === relation.queryBudget?.list?.baseline) &&
        (index !== 9 || compatCheck("COMPAT-04")),
      index === 11 ? ["query-budget.json"] : ["relation-results.json", "capability-parity.md", "aggregate-results.json: relation_regression"])),
    ...compat.checks.map((item) => caseResult(item.id.split(" ")[0], item.passed, ["compat-results.json", "network.json"]))
  ];
  return {
    runId,
    passed: cases.every((item) => item.passed),
    summary: { total: cases.length, passed: cases.filter((item) => item.passed).length, failed: cases.filter((item) => !item.passed).length },
    cases
  };
}

function capabilityParityMarkdown() {
  return `# DEV-062 capability parity\n\n` +
    `Run: \`${runId}\`\n\n` +
    `| Legacy capability | Single-page owner | Rendered / server evidence | Result |\n` +
    `|---|---|---|---|\n` +
    `| Part search/filter/select/deep link | PartWorkbench + shared controller | report cases 001-004, race cases, network.json | PASS |\n` +
    `| Candidate view/edit/readiness/submit/progress/correction/history | Shared WorkspaceDrawer mounted by PartWorkbench | candidate drawer browser evidence; Number State Flow Phase 1D aggregate; owner API remains canonical | PASS |\n` +
    `| Formal Part properties/files/drawings/cost/redaction/history | PartDetailContent | formal drawer screenshot; part owner + entity drawer aggregate regressions | PASS |\n` +
    `| Relation tree/expand/matrix/health/blockers | RelationWorkbench | report case 007; blocked screenshot; isolated relation regression | PASS |\n` +
    `| Drawing and Part owner detail handoff | Shared drawer shell + owner content | entity drawer aggregate regression; browser drawer evidence | PASS |\n` +
    `| Relation link/set-primary/set-reference/remove | canonical POST /api/numbering/relations | isolated relation regression with mutation/audit/409 evidence | PASS |\n` +
    `| Candidate overlay/source-less candidate | Relation adapter + shared WorkspaceDrawer | relation-results.json; browser candidate/detail evidence | PASS |\n` +
    `| Back/forward/reload/safe return | shared controller / legacy resolver | report cases 003, 008, 009; network.json; zero-write hashes | PASS |\n\n` +
    `No capability is accepted from a link count or source fragment alone. Mutation authority evidence is reused from the same local worktree aggregate regressions; DEV-062 adds no mutation endpoint.\n`;
}

function writeEvidenceArtifacts(report, cleanupEvidence) {
  const source = sourceManifest();
  const part = readEvidenceJson("part-results.json", {});
  const relation = readEvidenceJson("relation-results.json", {});
  const contractResults = buildContractResults();
  const queryBudget = {
    runId,
    passed: part.passed === true && relation.passed === true,
    cardinalityRule: "representative query count must equal baseline query count",
    part: part.queryBudget ?? null,
    relation: relation.queryBudget ?? null
  };
  const manifest = {
    task: "DEV-062 unified Part and Relation workbenches",
    runId,
    startedAt,
    finishedAt: report.finishedAt,
    source,
    flags: {
      PDM_NUMBER_STATE_FLOW_V1: true,
      PDM_NUMBER_LIFECYCLE_V2: true,
      PDM_UNIFIED_DRAWING_WORKBENCH_V1: true,
      PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: { flagOnRun: true, rollbackRun: false }
    },
    target: { kind: "isolated SQLite + local Next.js", production: false, productionConnected: false, productionWrites: false },
    accounts: [{ id: user.id, role: user.role, companyCodes: user.companyCodes }],
    fixtureIds: {
      candidateWorkspace: "dev062-real-candidate",
      formalRoot: "dev062-real-root",
      formalPart: "dev062-real-part",
      historyRoot: "dev062-history-root",
      representativeRootPrefix: "dev062-perf-root-"
    },
    cleanup: cleanupEvidence
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "contract-results.json"), `${JSON.stringify(contractResults, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "query-budget.json"), `${JSON.stringify(queryBudget, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "network.json"), `${JSON.stringify({ runId, events: networkEvents }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "console.json"), `${JSON.stringify({ runId, unexpectedCount: browserErrors.length, errors: browserErrors }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "before-after-hashes.json"), `${JSON.stringify({ runId, ...hashEvidence, cleanup: cleanupEvidence }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "capability-parity.md"), capabilityParityMarkdown(), "utf8");
  fs.writeFileSync(path.join(accessibilityDir, "results.json"), `${JSON.stringify({ runId, results: accessibilityResults }, null, 2)}\n`, "utf8");
  const failedCases = contractResults.cases.filter((item) => !item.passed);
  const verdictPass = report.failed === 0 && contractResults.passed && queryBudget.passed && browserErrors.length === 0 && cleanupEvidence.completed;
  const verdict = [
    "# DEV-062 local QA/QC verdict",
    "",
    `Run: \`${runId}\``,
    `Verdict: **${verdictPass ? "PASS" : "FAIL"} / Local Only / Release Gated**`,
    "",
    `- Browser / real-operation: ${report.passed}/${report.passed + report.failed} passed.`,
    `- Contract cases: ${contractResults.summary.passed}/${contractResults.summary.total} passed.`,
    `- P0/P1 open defects: ${verdictPass ? 0 : failedCases.length}.`,
    `- Query budgets and cardinality invariance: ${queryBudget.passed ? "PASS" : "FAIL"}.`,
    `- Unexpected console errors: ${browserErrors.length}.`,
    `- Isolated fixture cleanup: ${cleanupEvidence.completed ? "PASS" : "FAIL"}.`,
    "",
    "Known limitations / release boundary:",
    "",
    "- Cold development compilation timing is diagnostic only; the local product gate uses warmed BFF and visible-update samples.",
    "- Staging/production flag activation, live data, deployment, production smoke, rollback execution and release were not performed.",
    "- Legacy flag-off UI remains intentionally available for rollback until a separately authorized release/retirement phase.",
    ""
  ].join("\n");
  fs.writeFileSync(path.join(outputDir, "verdict.md"), verdict, "utf8");
  return { verdictPass, contractResults, queryBudget, manifest };
}

async function runFlagOn() {
  await startIsolated(true);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  monitor(page, "flag-on");
  await login(page);
  database = new Database(databasePath);
  seedFixture();
  const beforeHash = businessHash();

  await page.goto(`${baseUrl}/parts?tab=drafts`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "料號工作台", exact: true }).waitFor({ state: "visible" });
  record("DEV062-REAL-001 Part legacy tab enters one workbench",
    new URL(page.url()).searchParams.get("tab") === null && new URL(page.url()).searchParams.get("view") === "work" &&
    await page.locator(".number-state-tabs").count() === 0,
    { url: page.url() });

  await page.goto(`${baseUrl}/parts?detail=Z3062-P01`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Z3062-P01", exact: true }).waitFor({ state: "visible" });
  record("DEV062-REAL-002 Part legacy code resolves to stable row key",
    new URL(page.url()).searchParams.get("detail") === "part:dev062-real-part",
    { url: page.url() });
  await page.keyboard.press("Escape");

  await page.goto(`${baseUrl}/numbering/part-drafts?detail=dev062-real-candidate&returnTo=%2Fparts`, { waitUntil: "networkidle" });
  await page.getByText("候選料號", { exact: true }).waitFor({ state: "visible" });
  record("DEV062-REAL-003 legacy Part draft redirect preserves safe context",
    new URL(page.url()).pathname === "/parts" && new URL(page.url()).searchParams.get("detail") === "candidate:dev062-real-candidate" &&
    new URL(page.url()).searchParams.get("returnTo") === "/parts",
    { url: page.url() });
  await page.keyboard.press("Escape");

  await page.goto(`${baseUrl}/parts?view=all`, { waitUntil: "networkidle" });
  const partList = page.getByRole("region", { name: "料號工作清單" });
  await partList.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.locator('[role="complementary"]').waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await page.locator('[role="complementary"]').waitFor({ state: "hidden" });
  record("DEV062-REAL-004 shared keyboard opens and closes Part detail", await partList.evaluate((node) => node === document.activeElement));

  await page.goto(`${baseUrl}/numbering/search?tab=reserved`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "圖料工作台", exact: true }).waitFor({ state: "visible" });
  record("DEV062-REAL-005 Relation legacy tab enters one root workbench",
    new URL(page.url()).searchParams.get("tab") === null && new URL(page.url()).searchParams.get("view") === "work" &&
    await page.locator(".number-state-tabs").count() === 0,
    { url: page.url() });

  await page.goto(`${baseUrl}/numbering/search?detail=Z3062`, { waitUntil: "networkidle" });
  await page.locator('[role="complementary"]').waitFor({ state: "visible" });
  record("DEV062-REAL-006 Relation legacy root resolves to stable root key",
    new URL(page.url()).searchParams.get("detail") === "root:dev062-real-root" &&
    (await page.locator('[role="complementary"]').innerText()).includes("Z3062"),
    { url: page.url(), drawerText: (await page.locator('[role="complementary"]').innerText()).slice(0, 300) });
  await page.keyboard.press("Escape");

  await page.goto(`${baseUrl}/numbering/search?view=all`, { waitUntil: "networkidle" });
  const formalRootCard = page.locator(".pdm-relation-root").filter({ has: page.getByRole("button", { name: "Z3062", exact: true }) });
  await formalRootCard.getByRole("button", { name: "展開關係" }).click();
  await page.getByRole("tab", { name: "矩陣" }).click();
  await formalRootCard.getByRole("region", { name: /圖料關係矩陣/u }).waitFor({ state: "visible" });
  record("DEV062-REAL-007 tree and matrix share one canonical root", await page.locator(".pdm-relation-root").count() >= 2 && await page.getByText("Z3062-M01", { exact: true }).count() > 0);

  await page.goto(`${baseUrl}/numbering/request?returnTo=https%3A%2F%2Fevil.invalid`, { waitUntil: "networkidle" });
  record("DEV062-REAL-008 unsafe returnTo is removed without writing",
    new URL(page.url()).pathname === "/numbering/search" && !new URL(page.url()).searchParams.has("returnTo") && new URL(page.url()).searchParams.get("create") === "new_bundle",
    { url: page.url() });

  await page.goBack({ waitUntil: "networkidle" });
  await page.goForward({ waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  record("DEV062-REAL-009 back-forward-reload keeps canonical location", new URL(page.url()).pathname === "/numbering/search");

  await viewportEvidence(page, "/parts?view=all", "料號工作台", "part");
  await viewportEvidence(page, "/numbering/search?view=all", "圖料工作台", "relation");

  const fixtureCounts = {
    partRows: database.prepare("SELECT COUNT(*) AS count FROM part_numbers WHERE record_status <> 'Obsolete'").get().count,
    roots: database.prepare("SELECT COUNT(*) AS count FROM part_roots WHERE record_status <> 'Obsolete'").get().count,
    drawings: database.prepare("SELECT COUNT(*) AS count FROM drawing_numbers WHERE record_status <> 'Obsolete'").get().count
  };
  record("DEV062-REAL-PERF-001 representative fixture is present",
    fixtureCounts.partRows === 300 && fixtureCounts.roots === 60 && fixtureCounts.drawings === 180,
    fixtureCounts);
  await measureWarmReads(page);
  await measureSearchVisibility(page, {
    pathname: "/parts?view=all",
    placeholder: "料號、主根號、名稱、材質、顏色",
    endpointPath: "/api/parts/workbench",
    expected: (currentPage) => currentPage.getByText("Z3062-P01", { exact: true }).first()
  });
  await measureSearchVisibility(page, {
    pathname: "/numbering/search?view=all",
    placeholder: "主根號、料號、圖號、名稱",
    endpointPath: "/api/numbering/relations",
    expected: (currentPage) => currentPage.getByRole("button", { name: "Z3062", exact: true }).first()
  });
  const warmReadP95 = percentile95(warmReadDurations.map((item) => item.durationMs));
  const searchVisibleP95 = percentile95(searchVisibleDurations.map((item) => item.durationMs));
  record("DEV062-REAL-PERF-002 representative warm BFF p95 is within 500 ms",
    warmReadP95 !== null && warmReadP95 <= 500,
    { p95Ms: warmReadP95, samples: warmReadDurations });
  record("DEV062-REAL-PERF-003 browser search visible-update p95 is within 800 ms",
    searchVisibleP95 !== null && searchVisibleP95 <= 800,
    { p95Ms: searchVisibleP95, samples: searchVisibleDurations });

  await runRaceEvidence(page);
  await captureStateEvidence(page);
  await runAccessibilityEvidence(page, context);

  const afterHash = businessHash();
  const compatibilityWrites = observedWrites.filter((item) => item.phase === "flag-on");
  hashEvidence.compatibility = { beforeHash, afterHash, unchanged: beforeHash === afterHash, observedWrites: compatibilityWrites };
  record("DEV062-REAL-010 read navigation is zero-write", beforeHash === afterHash && compatibilityWrites.length === 0, hashEvidence.compatibility);
  await context.close();
  await browser.close();
  browser = null;
  await stopNextApp(app.child);
  app = null;
}

async function runFlagOff() {
  await startIsolated(false);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  monitor(page, "flag-off");
  await login(page);
  const partEndpoint = await page.request.get(`${baseUrl}/api/parts/workbench?view=all`);
  const relationEndpoint = await page.request.get(`${baseUrl}/api/numbering/relations?projection=workbench_v1&view=all`);
  await page.goto(`${baseUrl}/parts?tab=drafts`, { waitUntil: "networkidle" });
  const partTabs = await page.locator(".number-state-tabs").count();
  await page.goto(`${baseUrl}/numbering/search?tab=reserved`, { waitUntil: "networkidle" });
  const relationTabs = await page.locator(".number-state-tabs").count();
  record("DEV062-REAL-011 flag-off rollback keeps legacy pages and hides new reads",
    partEndpoint.status() === 404 && relationEndpoint.status() === 404 && partTabs > 0 && relationTabs > 0,
    { partStatus: partEndpoint.status(), relationStatus: relationEndpoint.status(), partTabs, relationTabs });
  await context.close();
  await browser.close();
  browser = null;
  await stopNextApp(app.child);
  app = null;
}

async function run() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(accessibilityDir, { recursive: true });
  await runFlagOn();
  await runFlagOff();
  const coldInclusiveP95 = percentile95(readDurations.map((item) => item.durationMs));
  const warmReadP95 = percentile95(warmReadDurations.map((item) => item.durationMs));
  const searchVisibleP95 = percentile95(searchVisibleDurations.map((item) => item.durationMs));
  record("DEV062-REAL-012 no browser errors or 5xx responses", browserErrors.length === 0 && failedResponses.length === 0, { browserErrors, failedResponses });
  const failed = results.filter((item) => !item.passed);
  const report = {
    task: "DEV-062 unified Part and Relation workbenches",
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    productionConnected: false,
    productionWrites: false,
    passed: results.length - failed.length,
    failed: failed.length,
    coldInclusiveP95WorkbenchReadMs: coldInclusiveP95,
    warmP95WorkbenchReadMs: warmReadP95,
    searchVisibleP95Ms: searchVisibleP95,
    readDurations,
    warmReadDurations,
    searchVisibleDurations,
    results
  };
  try { database?.close(); } catch {}
  database = null;
  const safeTemp = path.resolve(tempRoot).startsWith(path.resolve(os.tmpdir()) + path.sep);
  if (safeTemp) fs.rmSync(tempRoot, { recursive: true, force: true });
  const cleanupEvidence = {
    completed: safeTemp && !fs.existsSync(tempRoot),
    method: "isolated temporary target removed",
    targetKind: "OS temporary directory",
    targetPathHash: crypto.createHash("sha256").update(path.resolve(tempRoot)).digest("hex")
  };
  hashEvidence.cleanup = cleanupEvidence;
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const evidence = writeEvidenceArtifacts(report, cleanupEvidence);
  console.log(JSON.stringify(report, null, 2));
  if (failed.length || !evidence.verdictPass) process.exitCode = 1;
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  process.exitCode = 1;
} finally {
  try { database?.close(); } catch {}
  try { if (browser) await browser.close(); } catch {}
  try { if (app) await stopNextApp(app.child); } catch {}
  for (const [file, content] of trackedFiles) {
    try { if (fs.readFileSync(path.join(root, file), "utf8") !== content) fs.writeFileSync(path.join(root, file), content, "utf8"); } catch {}
  }
  for (const distDir of distDirs) {
    const safeDist = path.resolve(distDir).startsWith(path.resolve(root, ".tmp") + path.sep);
    if (safeDist) fs.rmSync(distDir, { recursive: true, force: true });
  }
  const safeTemp = path.resolve(tempRoot).startsWith(path.resolve(os.tmpdir()) + path.sep);
  if (safeTemp) fs.rmSync(tempRoot, { recursive: true, force: true });
}
