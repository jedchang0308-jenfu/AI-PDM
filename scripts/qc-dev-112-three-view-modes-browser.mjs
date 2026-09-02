#!/usr/bin/env node

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import { chromium } from "playwright";

import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepository = path.join(root, "data", "repository");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev112-browser-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const fixtureRepository = path.join(fixtureDataDir, "repository");
const runId = `DEV112-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-112-three-view-modes", runId);
const checks = [];
const seenIds = new Set();
const screenshots = [];
const securityProbes = [];
let app = null;
let browser = null;
let port = null;
let primaryBefore = null;
let primaryAfter = null;
let fixtureBefore = null;
let fixtureAfter = null;
let fixtureLedger = [];
const ownedDistDirs = [];

const candidateRelevantFiles = [
  "src/lib/pdm-canonical-preview.ts",
  "src/components/pdm-workbench-layout-switch.tsx",
  "src/components/canonical-pdm-preview-gallery.tsx",
  "src/components/canonical-pdm-workbench.tsx",
  "src/app/globals.css",
  "scripts/qc-dev-065-canonical-preview-contract.mjs",
  "scripts/qc-dev-065-canonical-preview-gallery.mjs",
  "scripts/qc-dev-112-three-view-modes-contract.mjs",
  "scripts/qc-dev-112-three-view-modes-browser.mjs",
  "scripts/qc-dev-112-three-view-modes-aggregate.mjs",
  "package.json"
];

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function snapshotDb(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  db.pragma("foreign_keys = ON");
  const tables = db.prepare("select name, sql from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").all();
  const tableCounts = Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`select count(*) as count from "${name.replaceAll('"', '""')}"`).get().count]));
  const canonicalIdentities = {
    partRoots: db.prepare("select id, company_id, root_code from part_roots order by id").all(),
    parts: db.prepare("select id, company_id, part_root_id, part_number from part_numbers order by id").all(),
    drawings: db.prepare("select id, company_id, part_root_id, drawing_number from drawings order by id").all(),
    drawingNumbers: db.prepare("select id, company_id, part_root_id, drawing_number from drawing_numbers order by id").all()
  };
  const migrationResidue = tables
    .filter(({ name }) => /migration|legacy|_old/iu.test(name))
    .map(({ name }) => ({ name, count: tableCounts[name] }));
  const rootCounts = {};
  for (const table of ["part_roots", "numbering_draft_roots", "drawing_numbers", "drawings", "drawing_revisions", "canonical_workbench_states"]) {
    if (tableCounts[table] !== undefined) rootCounts[table] = tableCounts[table];
  }
  const orphanQueries = [
    ["drawings.part_root_id", "drawings", "part_roots", "part_root_id"],
    ["drawing_numbers.part_root_id", "drawing_numbers", "part_roots", "part_root_id"],
    ["part_numbers.part_root_id", "part_numbers", "part_roots", "part_root_id"]
  ];
  const rootReferenceOrphans = {};
  for (const [label, child, parent, column] of orphanQueries) {
    if (tableCounts[child] === undefined || tableCounts[parent] === undefined) continue;
    const childColumns = db.prepare(`pragma table_info("${child}")`).all().map((row) => row.name);
    if (!childColumns.includes(column)) continue;
    rootReferenceOrphans[label] = db.prepare(`select count(*) as count from "${child}" child left join "${parent}" parent on parent.id=child."${column}" and parent.company_id=child.company_id where child."${column}" is not null and parent.id is null`).get().count;
  }
  const schemaHash = crypto.createHash("sha256").update(tables.map((row) => `${row.name}:${row.sql}`).join("\n")).digest("hex");
  const canonicalIdentityHash = crypto.createHash("sha256").update(JSON.stringify(canonicalIdentities)).digest("hex");
  const foreignKeys = db.prepare("pragma foreign_key_check").all();
  db.close();
  return { fileHash: sha256File(file), schemaHash, tableCounts, rootCounts, rootReferenceOrphans, canonicalIdentities, canonicalIdentityHash, migrationResidue, foreignKeys };
}

function record(id, scenario, pass, detail = "") {
  if (seenIds.has(id)) { checks.push({ id: `${id}-DUPLICATE`, scenario, pass: false, detail: "duplicate final result" }); return; }
  seenIds.add(id);
  checks.push({ id, scenario, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${scenario}${detail ? ` — ${detail}` : ""}`);
}

async function login(page, baseUrl) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "以系統管理員角色快速登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
}

async function waitForList(page) {
  await page.locator(".canonical-list").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false");
}

async function fetchList(page, api) {
  const response = await page.request.get(`${api}&limit=100`, { headers: { accept: "application/json" } });
  let body = null;
  try { body = await response.json(); } catch { /* recorded by caller */ }
  if (response.status() >= 400) console.log(`DEV-112 API probe ${response.status()}: ${JSON.stringify(body)}`);
  return { status: response.status(), body };
}

async function captureMode(page, routeName, viewportName, mode) {
  const dir = path.join(outputDir, "screenshots", routeName, viewportName);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${mode}.png`);
  await page.screenshot({ path: file, fullPage: true });
  screenshots.push(path.relative(root, file));
}

async function runRoute(page, baseUrl, viewportName, input) {
  await page.goto(`${baseUrl}${input.path}?query=A0005`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: input.title, exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await waitForList(page);
  const api = await fetchList(page, `${baseUrl}${input.api}`);
  const rows = page.locator("[data-canonical-workbench-row='true']");
  const rowKeys = await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-row-key")));
  const map = api.body?.data?.previewByRowKey;
  const switcher = page.getByRole("radiogroup", { name: "顯示方式" });
  if (viewportName === "desktop") {
    record(input.entity === "drawing" ? "TVM-001" : "TVM-002", `${input.entity} controls in result region`, api.status === 200 && await switcher.count() === 1 && await page.locator("[data-canonical-result-display-bar]").count() === 1 && await switcher.getByRole("radio").count() === 3);
  }
  if (input.entity === "drawing" && viewportName === "desktop") {
    record("TVM-003", "first visit is text list and modes are mutually exclusive", await switcher.getByRole("radio", { name: "文字清單", exact: true }).getAttribute("aria-checked") === "true" && await switcher.locator('[aria-checked="true"]').count() === 1);
  }
  if (viewportName === "desktop" && input.entity === "drawing") {
    await page.evaluate(() => localStorage.setItem("pdm-canonical-drawing-layout-v1", "preview"));
    await page.goto(`${baseUrl}${input.path}?query=A0005`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForList(page);
    const missingUsesStored = await page.getByRole("radio", { name: "預覽圖", exact: true }).getAttribute("aria-checked") === "true";
    await page.goto(`${baseUrl}${input.path}?query=A0005&layout=invalid`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForList(page);
    const invalidUsesList = await page.getByRole("radio", { name: "文字清單", exact: true }).getAttribute("aria-checked") === "true" && new URL(page.url()).searchParams.get("layout") === "list";
    record("TVM-004", "missing URL uses stored preference while invalid URL falls back to text list", missingUsesStored && invalidUsesList);

    const capabilityRoute = async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      if (body?.data && typeof body.data === "object") delete body.data.previewByRowKey;
      await route.fulfill({ response, body: JSON.stringify(body) });
    };
    await page.route("**/api/numbering/drawings/workbench*", capabilityRoute);
    await page.goto(`${baseUrl}${input.path}?query=A0005&layout=list`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForList(page);
    record("TVM-005", "preview capability absent keeps text list and hides mode controls", await page.getByRole("radiogroup", { name: "顯示方式" }).count() === 0 && await page.locator("[data-canonical-workbench-row='true']").count() > 0);
    await page.unroute("**/api/numbering/drawings/workbench*", capabilityRoute);
    await page.evaluate(() => localStorage.removeItem("pdm-canonical-drawing-layout-v1"));
    await page.goto(`${baseUrl}${input.path}?query=A0005&layout=list`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForList(page);
  }
  if (viewportName === "desktop" && input.entity === "drawing") {
    record("TVM-006", "same rows and map keys across modes", map && Object.keys(map).sort().join(",") === rowKeys.slice().sort().join(","));
  }
  if (viewportName === "desktop" && input.entity === "drawing") {
    const requestUrls = [];
    const requestHandler = (request) => { if (request.resourceType() === "fetch" || request.resourceType() === "xhr") requestUrls.push(request.url()); };
    page.on("request", requestHandler);
    const mediaBefore3d = requestUrls.filter((url) => url.includes("/api/pdm/file-assets/")).length;
    await page.getByRole("radio", { name: "3D 清單", exact: true }).click();
    await page.locator(".canonical-table-wrap").waitFor({ state: "visible" });
    await captureMode(page, input.entity, viewportName, "list_3d");
    const switchIdentityRequests = requestUrls.filter((url) => url.includes("/workbench") && !url.includes("file-assets"));
    record("TVM-007", "mode switch does not refetch identity list", switchIdentityRequests.length === 0, JSON.stringify(switchIdentityRequests));
    const initialMedia = requestUrls.filter((url) => url.includes("/api/pdm/file-assets/")).length;
    const uniqueInitialMedia = new Set(requestUrls.filter((url) => url.includes("/api/pdm/file-assets/"))).size;
    const readyRows = Object.values(map ?? {}).filter((preview) => preview?.state === "ready").length;
    record("TVM-008", "3D list logical media URLs are bounded by current page ready rows", uniqueInitialMedia <= readyRows && await page.locator("[data-canonical-inline-preview='true']").count() === rowKeys.length, JSON.stringify({ rawRequests: initialMedia, uniqueUrls: uniqueInitialMedia, readyRows }));
    record("TVM-009", "inline preview stays inside code cell", await page.locator(".canonical-code-cell").count() === rowKeys.length && await page.locator(".canonical-code-cell button").count() === rowKeys.length && await page.locator("table th").evaluateAll((headers) => !headers.some((header) => /3D/u.test(header.textContent ?? ""))));
    await page.getByRole("radio", { name: "預覽圖", exact: true }).click();
    await page.locator(".canonical-preview-gallery").waitFor({ state: "visible", timeout: 30_000 });
    await captureMode(page, input.entity, viewportName, "preview");
    const mediaAfter3d = requestUrls.filter((url) => url.includes("/api/pdm/file-assets/")).length;
    record("TVM-010", "ready source parity", map && await page.locator("[data-canonical-preview-card='true']").count() === rowKeys.length);
    await page.getByRole("radio", { name: "文字清單", exact: true }).click();
    await captureMode(page, input.entity, viewportName, "list");
    const mediaAfterText = requestUrls.filter((url) => url.includes("/api/pdm/file-assets/")).length;
    record("TVM-011", "text list has no media component", await page.locator("[data-canonical-inline-preview='true'], .canonical-preview-gallery").count() === 0);
    page.off("request", requestHandler);
    record("TVM-012", "text list does not mount or request preview media", mediaBefore3d === 0 && mediaAfterText === mediaAfter3d);
  }
  if (viewportName === "desktop" && input.entity === "part") {
    await page.getByRole("radio", { name: "3D 清單", exact: true }).click();
    await page.locator(".canonical-table-wrap").waitFor({ state: "visible" });
    await page.getByRole("radio", { name: "預覽圖", exact: true }).click();
    await page.locator(".canonical-preview-gallery").waitFor({ state: "visible", timeout: 30_000 });
    record("TVM-013", "Part shares one image-bearing poll lifecycle", await page.getByRole("radiogroup", { name: "顯示方式" }).locator('[aria-checked="true"]').getAttribute("data-layout-mode") === "preview");
    const nonReady = await page.locator("[data-preview-state='pending'], [data-preview-state='delayed'], [data-preview-state='missing'], [data-preview-state='failed'], [data-preview-state='unavailable']").count();
    record("TVM-014", "non-ready state retains card and placeholder", nonReady >= 0 && await page.locator(".canonical-preview-gallery").count() === 1);
    await page.getByRole("radio", { name: "文字清單", exact: true }).click();
    record("TVM-015", "cross-mode terminal stop returns to text list", await page.getByRole("radio", { name: "文字清單", exact: true }).getAttribute("aria-checked") === "true");
  }
  if (viewportName === "desktop" && input.entity === "drawing") {
    const firstRow = page.locator("[data-canonical-workbench-row='true']").first();
    const firstKey = await firstRow.getAttribute("data-row-key");
    await firstRow.click();
    await page.getByRole("button", { name: "關閉明細", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("button", { name: "關閉明細", exact: true }).click();
    const activeKey = await page.evaluate(() => document.activeElement?.getAttribute("data-row-key"));
    record("TVM-016", "drawer close restores selected row focus", activeKey === firstKey);
    await page.locator(".canonical-search input").fill("A0005");
    await page.waitForTimeout(350);
    record("TVM-017", "filter keeps canonical result region", await page.locator(".canonical-list").count() === 1 && await page.locator("[data-canonical-workbench-row='true']").count() > 0);
    const currentRadio = page.getByRole("radio", { name: "文字清單", exact: true });
    await currentRadio.focus();
    await currentRadio.press("ArrowRight");
    const moved = await page.evaluate(() => document.activeElement?.getAttribute("data-layout-mode"));
    await currentRadio.press("End");
    const ended = await page.evaluate(() => document.activeElement?.getAttribute("data-layout-mode"));
    record("TVM-018", "mode group keyboard navigation", moved === "list_3d" && ended === "preview");
    record("TVM-019", "mode and row accessible names", await page.getByRole("radiogroup", { name: "顯示方式" }).getByRole("radio").allTextContents().then((labels) => labels.join("/") === "文字清單/3D 清單/預覽圖") && await page.locator("[data-row-key]").first().getAttribute("data-row-key") !== null);
  }
  if (viewportName === "desktop" && input.entity === "part") {
    const readyHref = Object.values(map ?? {}).find((preview) => preview?.state === "ready" && preview.media)?.media?.href;
    await runSecurityProbes(baseUrl, readyHref, page);
    record("TVM-020", "protected file-read security probes are fail-closed", securityProbes.length === 5 && securityProbes.every((probe) => [401, 403, 404].includes(probe.status) && probe.responseByteCount === 0 && probe.rawAuthorityLeakCount === 0), JSON.stringify(securityProbes));
  }
  if (viewportName === "desktop" && input.entity === "drawing") {
    await page.route("**/api/pdm/file-assets/**", async (route) => route.fulfill({ status: 200, contentType: "image/png", body: "not-an-image" }));
    await page.getByRole("radio", { name: "3D 清單", exact: true }).click();
    await page.waitForTimeout(4000);
    const unavailableCount = await page.locator("[data-canonical-inline-preview='true'][data-preview-state='unavailable'], [data-canonical-preview-card='true'][data-preview-state='unavailable']").count();
    record("TVM-021", "non-image media becomes unavailable placeholder", unavailableCount > 0, JSON.stringify({ unavailableCount }));
    await page.unroute("**/api/pdm/file-assets/**");
  }
  if (!(viewportName === "desktop" && input.entity === "drawing")) {
    await page.getByRole("radio", { name: "3D 清單", exact: true }).click();
    await page.locator(".canonical-table-wrap").waitFor({ state: "visible", timeout: 30_000 });
    await captureMode(page, input.entity, viewportName, "list_3d");
    await page.getByRole("radio", { name: "預覽圖", exact: true }).click();
    await page.locator(".canonical-preview-gallery").waitFor({ state: "visible", timeout: 30_000 });
    await captureMode(page, input.entity, viewportName, "preview");
    await page.getByRole("radio", { name: "文字清單", exact: true }).click();
    await captureMode(page, input.entity, viewportName, "list");
  }
  return { rowKeys, map };
}

async function runSecurityProbes(baseUrl, readyHref, page) {
  const probeHref = readyHref ?? "/api/pdm/file-assets/dev112-preview-asset-b?context=candidate_revision&contextId=dev112-preview-context-b&bindingId=dev112-preview-binding-b";
  const protectedByteCount = (response, body) => response.status() >= 400 ? 0 : body.length;
  const unauthContext = await browser.newContext();
  try {
    const unauthResponse = await unauthContext.request.get(`${baseUrl}${probeHref}`);
    const body = await unauthResponse.body();
    securityProbes.push({ probeType: "no-cookie", actor: "none", company: "none", redactedUrl: probeHref.replace(/\/[^/]+(?=\?)/u, "/<asset>"), status: unauthResponse.status(), responseByteCount: protectedByteCount(unauthResponse, body), responseBodyLength: body.length, rawAuthorityLeakCount: /storage|hash|asset|binding|context/iu.test(body.toString("utf8")) ? 1 : 0 });
  } finally { await unauthContext.close(); }
  const crossHref = "/api/pdm/file-assets/dev112-preview-asset-b?context=candidate_revision&contextId=dev112-preview-context-b&bindingId=dev112-preview-binding-b";
  const crossResponse = await page.request.get(`${baseUrl}${crossHref}`);
  const crossBody = await crossResponse.body();
  securityProbes.push({ probeType: "cross-company", actor: "user-admin-local-quick", company: "company-jenfu", redactedUrl: crossHref, status: crossResponse.status(), responseByteCount: protectedByteCount(crossResponse, crossBody), responseBodyLength: crossBody.length, rawAuthorityLeakCount: /dev112-preview|storage|hash/iu.test(crossBody.toString("utf8")) ? 1 : 0 });
  for (const field of ["fileAssetId", "bindingId", "contextId"]) {
    const tampered = crossHref.replace(field === "fileAssetId" ? "dev112-preview-asset-b" : field === "bindingId" ? "dev112-preview-binding-b" : "dev112-preview-context-b", `${field}-tampered`);
    const response = await page.request.get(`${baseUrl}${tampered}`);
    const body = await response.body();
    securityProbes.push({ probeType: `tampered-${field}`, actor: "user-admin-local-quick", company: "company-jenfu", redactedUrl: tampered, status: response.status(), responseByteCount: protectedByteCount(response, body), responseBodyLength: body.length, rawAuthorityLeakCount: /storage|hash|dev112-preview/iu.test(body.toString("utf8")) ? 1 : 0 });
  }
}

function seedSecurityFixture() {
  const db = new Database(fixtureDb);
  db.pragma("foreign_keys = ON");
  const base = db.prepare("select id, drawing_id from drawing_revisions where lifecycle_state = 'preparing' limit 1").get();
  if (!base) throw new Error("No preparing drawing revision available for security fixture");
  const a0005Drawing = db.prepare("select d.id drawing_id, r.id revision_id from drawings d join drawing_revisions r on r.drawing_id=d.id and r.company_id=d.company_id where d.company_id='company-jenfu' and d.drawing_number='A0005-M01' and r.lifecycle_state='preparing' order by r.created_at limit 1").get();
  const a0005Part = db.prepare("select id from part_numbers where company_id='company-jenfu' and part_number='A0005-P01' limit 1").get();
  if (!a0005Drawing || !a0005Part) throw new Error("Missing A0005 fixture identities for DEV-112 preview QA");
  const now = new Date().toISOString();
  const previewBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const previewHash = crypto.createHash("sha256").update(previewBytes).digest("hex");
  const sourceBytes = Buffer.from("dev112-drawing-source-a");
  const sourceHash = crypto.createHash("sha256").update(sourceBytes).digest("hex");
  const ledger = [];
  const tx = db.transaction(() => {
    db.prepare("insert or ignore into file_assets(id,storage_provider,storage_key,file_name,file_ext,mime_type,file_size,content_hash,linked_entity_type,linked_entity_id,document_category,display_name,description,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("dev112-preview-asset-a", "local_repository", "dev112/company-jenfu/A0005-M01.SLDPRT", "A0005-M01.SLDPRT", "sldprt", "application/octet-stream", sourceBytes.length, sourceHash, "drawing_revision", a0005Drawing.revision_id, "cad_3d", "DEV-112 A0005 drawing source", "task-owned preview fixture", now, now);
    db.prepare("insert or ignore into drawing_revision_files(id,company_id,drawing_revision_id,source_file_asset_id,role,role_source,display_name,description,sort_order,is_primary,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?)").run("dev112-preview-binding-a", "company-jenfu", a0005Drawing.revision_id, "dev112-preview-asset-a", "cad_3d", "system", "A0005-M01.SLDPRT", "task-owned preview fixture", 0, 1, now, now);
    db.prepare("insert or ignore into file_derivatives(id,company_id,source_file_asset_id,source_content_hash,derivative_kind,storage_provider,storage_key,file_name,mime_type,file_size,content_hash,generator_profile,generator_version,status,created_at,metadata_json) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("dev112-preview-derivative-a", "company-jenfu", "dev112-preview-asset-a", sourceHash, "model_preview_png", "local_repository", "dev112/company-jenfu/A0005-M01.preview.png", "A0005-M01.preview.png", "image/png", previewBytes.length, previewHash, "dev112-fixture", "dev112-local", "ready", now, "{}");
    db.prepare("insert or ignore into file_assets(id,storage_provider,storage_key,file_name,file_ext,mime_type,file_size,content_hash,linked_entity_type,linked_entity_id,document_category,display_name,description,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("dev112-preview-part-asset-a", "local_repository", "dev112/company-jenfu/A0005-P01.png", "A0005-P01.png", "png", "image/png", previewBytes.length, previewHash, "part_number", a0005Part.id, "part_preview_image", "DEV-112 A0005 part preview", "task-owned preview fixture", now, now);
    db.prepare("insert or ignore into part_preview_settings(id,company_id,part_number_id,source_mode,file_asset_id,row_version,created_at,updated_at) values (?,?,?,?,?,?,?,?)").run("dev112-preview-setting-a", "company-jenfu", a0005Part.id, "custom_image", "dev112-preview-part-asset-a", 1, now, now);
    db.prepare("insert or ignore into companies(id,company_code,display_name,created_at,updated_at) values (?,?,?,?,?)").run("dev112-company-b", "DEV112-B", "DEV-112 第二公司 fixture", now, now);
    db.prepare("insert or ignore into drawing_revisions(id,company_id,drawing_id,revision,lifecycle_state,policy_snapshot_json,row_version,created_at,updated_at) values (?,?,?,?,?,?,?,?,?)").run("dev112-preview-context-b", "dev112-company-b", base.drawing_id, "0.1", "preparing", "{}", 1, now, now);
    db.prepare("insert or ignore into file_assets(id,storage_provider,storage_key,file_name,file_ext,mime_type,file_size,content_hash,linked_entity_type,linked_entity_id,document_category,display_name,description,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("dev112-preview-asset-b", "local_repository", "dev112/company-b/dev112-preview-asset-b.bin", "dev112-preview-asset-b.bin", "bin", "application/octet-stream", 17, "dev112-security-hash", "drawing_revision", "dev112-preview-context-b", "cad_3d", "DEV-112 company-B fixture", "security negative probe only", now, now);
    db.prepare("insert or ignore into drawing_revision_files(id,company_id,drawing_revision_id,source_file_asset_id,role,role_source,display_name,description,sort_order,is_primary,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?)").run("dev112-preview-binding-b", "dev112-company-b", "dev112-preview-context-b", "dev112-preview-asset-b", "cad_3d", "system", "dev112-preview-asset-b.bin", "security negative probe only", 0, 1, now, now);
    ledger.push({ intent: "insert security fixture", identities: { companyId: "dev112-company-b", contextId: "dev112-preview-context-b", fileAssetId: "dev112-preview-asset-b", bindingId: "dev112-preview-binding-b" }, cleanup: "remove task-owned tempRoot" });
  });
  tx();
  db.close();
  const sourceFile = path.join(fixtureRepository, "dev112", "company-jenfu", "A0005-M01.SLDPRT");
  const derivativeFile = path.join(fixtureRepository, "dev112", "company-jenfu", "A0005-M01.preview.png");
  const partPreviewFile = path.join(fixtureRepository, "dev112", "company-jenfu", "A0005-P01.png");
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  fs.writeFileSync(sourceFile, sourceBytes);
  fs.writeFileSync(derivativeFile, previewBytes);
  fs.writeFileSync(partPreviewFile, previewBytes);
  ledger.push({ intent: "seed A0005 ready Drawing and Part preview source", identities: { drawingRevisionId: a0005Drawing.revision_id, drawingAssetId: "dev112-preview-asset-a", drawingBindingId: "dev112-preview-binding-a", derivativeId: "dev112-preview-derivative-a", partId: a0005Part.id, partAssetId: "dev112-preview-part-asset-a", partSettingId: "dev112-preview-setting-a" }, cleanup: "remove task-owned tempRoot" });
  const fixtureFile = path.join(fixtureRepository, "dev112", "company-b", "dev112-preview-asset-b.bin");
  fs.mkdirSync(path.dirname(fixtureFile), { recursive: true });
  fs.writeFileSync(fixtureFile, Buffer.from("dev112-fixture-01"));
  ledger.push({ intent: "write protected repository bytes", path: path.relative(fixtureRepository, fixtureFile), byteCount: 17, cleanup: "remove task-owned tempRoot" });
  return ledger;
}

function canConnect(portNumber) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: portNumber });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

async function stopOwnedRuntime() {
  if (app?.child) await stopNextApp(app.child).catch(() => {});
  let released = port === null;
  if (port !== null) for (let attempt = 0; attempt < 20 && !released; attempt += 1) { released = !(await canConnect(port)); if (!released) await new Promise((resolve) => setTimeout(resolve, 250)); }
  return released;
}

try {
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  primaryBefore = snapshotDb(sourceDb);
  fs.copyFileSync(sourceDb, fixtureDb);
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });
  fixtureLedger = seedSecurityFixture();
  fixtureBefore = snapshotDb(fixtureDb);
  port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const distDir = `.tmp/qc-dev112-browser-${port}`;
  ownedDistDirs.push(distDir);
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "local",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository,
    PDM_NEXT_DIST_DIR: distDir,
    PDM_BUILD_COMMIT: "local-dev",
    PDM_RELEASE_MODE: "local_stub",
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_PUBLIC_BASE_URL: baseUrl,
    PDM_NUMBER_STATE_FLOW_V1: "true",
    PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
    PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
    PDM_WORKBENCH_PREVIEW_GALLERY_V1: "true",
    PDM_PART_PREVIEW_V1: "true",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: ""
  });
  console.log(`QC DEV-112 runtime: project=${root}; purpose=three-view-modes browser QA; port=${port}; owner=current process tree; PDM_DATA_DIR=${fixtureDataDir}; PDM_REPOSITORY_DIR=${fixtureRepository}; cleanup=finally`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "laptop", width: 1024, height: 768 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 }
  ];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
    const errors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await login(page, baseUrl);
    await runRoute(page, baseUrl, viewport.name, { entity: "drawing", title: "圖號工作台", path: "/numbering/drawings", api: "/api/numbering/drawings/workbench?query=A0005" });
    await runRoute(page, baseUrl, viewport.name, { entity: "part", title: "料號工作台", path: "/parts", api: "/api/parts/workbench?query=A0005" });
    if (viewport.name === "desktop") record("TVM-022", "reduced-motion and no page errors", errors.length === 0, JSON.stringify(errors));
    if (viewport.name === "tablet") record("TVM-023", "1024x768 and 768x1024 Drawing and Part screenshots captured", screenshots.filter((file) => file.includes("laptop")).length === 6 && screenshots.filter((file) => file.includes("tablet")).length === 6, JSON.stringify({ laptop: screenshots.filter((file) => file.includes("laptop")).length, tablet: screenshots.filter((file) => file.includes("tablet")).length }));
    if (viewport.name === "mobile") record("TVM-024", "390x844 Drawing and Part screenshots captured", screenshots.filter((file) => file.includes("mobile")).length === 6);
    await context.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  const portReleased = await stopOwnedRuntime();
  if (fs.existsSync(fixtureDb)) fixtureAfter = snapshotDb(fixtureDb);
  if (fs.existsSync(sourceDb)) primaryAfter = snapshotDb(sourceDb);
  const sameCanonicalInvariants = (before, after) => before && after
    && before.schemaHash === after.schemaHash
    && before.canonicalIdentityHash === after.canonicalIdentityHash
    && JSON.stringify(before.rootCounts) === JSON.stringify(after.rootCounts)
    && JSON.stringify(before.rootReferenceOrphans) === JSON.stringify(after.rootReferenceOrphans)
    && JSON.stringify(before.migrationResidue) === JSON.stringify(after.migrationResidue)
    && JSON.stringify(before.foreignKeys) === JSON.stringify(after.foreignKeys)
    && after.foreignKeys.length === 0;
  const primaryInvariant = sameCanonicalInvariants(primaryBefore, primaryAfter);
  const fixtureInvariant = sameCanonicalInvariants(fixtureBefore, fixtureAfter);
  const supportingChecks = [
    { id: "SUP-PRIMARY-DB", scenario: "primary SQLite invariant unchanged", pass: Boolean(primaryInvariant), detail: JSON.stringify({ primaryBefore, primaryAfter }) },
    { id: "SUP-FIXTURE-DB", scenario: "task-owned fixture schema/root/FK invariant unchanged", pass: Boolean(fixtureInvariant), detail: JSON.stringify({ fixtureBefore, fixtureAfter }) }
  ];
  const cleanupTemp = (() => { try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); return !fs.existsSync(tempRoot); } catch { return false; } })();
  for (const distDir of ownedDistDirs) { const removed = removeTaskOwnedWorkspaceTempDir(root, distDir); supportingChecks.push({ id: `SUP-NEXT-DIST-${distDir}`, scenario: "task-owned Next dist removed", pass: removed.removed, detail: removed.error ?? removed.path }); }
  supportingChecks.push({ id: "SUP-CLEANUP", scenario: "task-owned runtime port released and temp fixture removed", pass: portReleased && cleanupTemp, detail: JSON.stringify({ port, portReleased, cleanupTemp }) });
  const expectedIds = Array.from({ length: 24 }, (_, index) => `TVM-${String(index + 1).padStart(3, "0")}`);
  const caseResultsPass = expectedIds.length === seenIds.size && expectedIds.every((id) => seenIds.has(id)) && checks.length === expectedIds.length && checks.every((item) => item.pass);
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const gitSha = (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { return null; } })();
  const branch = (() => { try { return execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim(); } catch { return null; } })();
  const dirtyFileSha256 = Object.fromEntries(candidateRelevantFiles.map((file) => [file, sha256File(path.join(root, file))]));
  const manifest = { devId: "DEV-112", runId, gitSha, branch, dirtyFileSha256, nextVersion: packageJson.dependencies?.next ?? packageJson.devDependencies?.next ?? null, nodeVersion: process.version, playwrightVersion: packageJson.devDependencies?.playwright ?? packageJson.dependencies?.playwright ?? null, flags: { productionConnected: false, productionWrites: false }, runtimeDeclaration: { project: root, purpose: "DEV-112 browser QA", port, owningProcessTree: process.pid, PDM_DATA_DIR: fixtureDataDir, PDM_REPOSITORY_DIR: fixtureRepository, PDM_NEXT_DIST_DIR: ownedDistDirs[0] ?? null, mutationScope: "task-owned fixture data/repository and output/qa only", cleanup: "finally" }, sourceInvariant: { before: primaryBefore, after: primaryAfter }, fixtureInvariant: { before: fixtureBefore, after: fixtureAfter }, fixtureLedger, securityProbes, screenshots, caseResults: checks, supportingChecks, p0Count: 0, p1Count: checks.filter((item) => !item.pass).length, cleanup: { portReleased, tempRootRemoved: cleanupTemp, nextDistRemoved: ownedDistDirs.length > 0 && ownedDistDirs.every((dir) => fs.existsSync(path.join(root, dir)) === false) }, passed: caseResultsPass && supportingChecks.every((item) => item.pass) };
  fs.writeFileSync(path.join(outputDir, "browser-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`DEV-112 browser manifest: ${path.relative(root, path.join(outputDir, "browser-manifest.json"))}`);
  if (!manifest.passed) process.exitCode = 1;
}
