#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV088-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-088", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev088-browser-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const fixtureDb = path.join(dataDir, "ai-pdm.sqlite");
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepository = path.join(root, "data", "repository");
const nextEnvPath = path.join(root, "next-env.d.ts");
const nextEnvSnapshot = fs.readFileSync(nextEnvPath, "utf8");
const checks = [];
const runtimeErrors = [];
let browser = null;
let app = null;
let port = null;
let baseUrl = "";
let distDir = "";

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function restoreNextEnv() {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      fs.writeFileSync(nextEnvPath, nextEnvSnapshot, "utf8");
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
  return false;
}

async function login(context) {
  const response = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "Admin" } });
  check("local admin login", response.status() === 200, await response.text());
}

function monitor(page, label) {
  page.on("pageerror", (error) => runtimeErrors.push({ label, kind: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push({ label, kind: "console", message: message.text() });
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (!failure.includes("ERR_ABORTED")) runtimeErrors.push({ label, kind: "requestfailed", message: `${request.method()} ${request.url()} ${failure}` });
  });
  page.on("response", (response) => {
    if (response.status() >= 500) runtimeErrors.push({ label, kind: "http", message: `${response.status()} ${response.url()}` });
  });
}

try {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDb);
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, repositoryDir, { recursive: true, force: true });

  const fixture = new Database(fixtureDb);
  const source = fixture.prepare(`
    SELECT part.id AS partId, drawing.id AS drawingId
    FROM part_numbers part
    JOIN drawing_part_links link ON link.part_number_id = part.id AND link.link_type = 'primary_manufacturing'
    JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
    WHERE part.part_number = 'A0002-P01' AND drawing.drawing_number = 'A0002-M01'
    LIMIT 1
  `).get();
  check("fixture has A0002 source part", source?.partId && source?.drawingId, JSON.stringify(source));
  fixture.prepare(`DELETE FROM drawing_part_links WHERE drawing_number_id = ? AND part_number_id <> ?`).run(source.drawingId, source.partId);
  fixture.prepare(`DELETE FROM file_assets WHERE id IN ('dev088-browser-manual', 'dev088-browser-2d', 'dev088-browser-deleted')`).run();
  const insert = fixture.prepare(`
    INSERT INTO file_assets (
      id, storage_provider, storage_key, file_name, file_ext, mime_type, file_size,
      content_hash, linked_entity_type, linked_entity_id, document_category,
      display_name, uploaded_by, deleted_at, created_at, updated_at
    ) VALUES (?, 'local_repository', ?, ?, ?, ?, ?, ?, 'part_number', ?, ?, ?, NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  insert.run("dev088-browser-manual", "dev088/browser/manual.pdf", "manual.pdf", "pdf", "application/pdf", 128, "e".repeat(64), source.partId, "other", "組裝說明", null);
  insert.run("dev088-browser-2d", "dev088/browser/A0002-M01.slddrw", "A0002-M01.slddrw", "slddrw", "application/octet-stream", 256, "f".repeat(64), source.partId, "drawing_2d", "2D 圖面", null);
  insert.run("dev088-browser-deleted", "dev088/browser/deleted.txt", "deleted.txt", "txt", "text/plain", 16, "1".repeat(64), source.partId, "other", "已刪除", new Date().toISOString());
  fixture.close();

  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  distDir = `.tmp/qc-dev088-browser-${port}`;
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "local",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_BUILD_COMMIT: "local-dev088",
    PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_NUMBER_LIFECYCLE_V2: "",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: "",
    PDM_NEXT_DIST_DIR: distDir,
    PDM_PUBLIC_BASE_URL: baseUrl
  });
  console.log(`QC DEV-088 runtime: project=${root}; purpose=replacement attachment UI/API QA; port=${port}; owner=current QC process tree; cleanup=after browser assertions`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });

  const anonymous = await browser.newContext();
  const anonymousResponse = await anonymous.request.get(`${baseUrl}/api/parts/A0002-P01/replacement-attachment-candidates`);
  check("anonymous candidate read denied", [401, 403].includes(anonymousResponse.status()), `${anonymousResponse.status()}`);
  await anonymous.close();

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 1024, height: 768 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    const context = await browser.newContext({ viewport });
    await login(context);
    const apiResponse = await context.request.get(`${baseUrl}/api/parts/A0002-P01/replacement-attachment-candidates`);
    const apiBody = await apiResponse.json();
    check(`${viewport.name} candidate API succeeds`, apiResponse.status() === 200, JSON.stringify(apiBody));
    check(`${viewport.name} only direct active part attachment returned`, apiBody.candidates?.length === 1 && apiBody.candidates[0].id === "dev088-browser-manual", JSON.stringify(apiBody.candidates));
    check(`${viewport.name} candidate response hides storage/hash`, !JSON.stringify(apiBody).match(/storage|contentHash|selectionFingerprint/u));

    const page = await context.newPage();
    monitor(page, viewport.name);
    await page.goto(`${baseUrl}/numbering/revisions?drawingNumber=A0002-M01&revision=1.2`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByRole("heading", { name: /圖面進版/u }).waitFor({ state: "visible", timeout: 30_000 });
    await page.getByText("Form", { exact: true }).locator("..").getByRole("button", { name: "確認影響" }).click();
    await page.getByText("料號附件", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    const sourceCheckbox = page.locator("label").filter({ hasText: "組裝說明" }).locator('input[type="checkbox"]');
    await sourceCheckbox.waitFor({ state: "attached" });
    check(`${viewport.name} source attachment defaults selected`, await sourceCheckbox.isChecked());
    check(`${viewport.name} drawing file absent`, await page.getByText("2D 圖面", { exact: true }).count() === 0);

    await sourceCheckbox.focus();
    await page.keyboard.press("Space");
    check(`${viewport.name} keyboard can deselect source`, !(await sourceCheckbox.isChecked()));
    await page.keyboard.press("Space");
    check(`${viewport.name} keyboard can reselect source`, await sourceCheckbox.isChecked());

    if (viewport.name === "desktop") {
      const upload = page.locator('input[type="file"][multiple]').last();
      await upload.setInputFiles({ name: "new-note.txt", mimeType: "text/plain", buffer: Buffer.from("DEV-088") });
      await page.getByText("new-note.txt", { exact: true }).waitFor({ state: "visible" });
      check("new attachment appears in same flat section", await page.getByText("new-note.txt", { exact: true }).count() === 1);
      await page.getByRole("button", { name: "移除", exact: true }).last().click();
      check("new attachment can be removed", await page.getByText("new-note.txt", { exact: true }).count() === 0);
    }

    const sectionText = await page.getByText("料號附件", { exact: true }).locator("..").locator("..").innerText();
    check(`${viewport.name} UI remains quiet`, !/沿用件數|排除件數|新增件數|sourceToken|fingerprint|DEV-088/u.test(sectionText), sectionText);
    const geometry = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    check(`${viewport.name} no page horizontal overflow`, geometry.scrollWidth <= geometry.clientWidth + 1, JSON.stringify(geometry));
    await page.screenshot({ path: path.join(screenshotDir, `replacement-attachments-${viewport.name}.png`), fullPage: true });
    await page.close();
    await context.close();
  }
  check("browser console/network has no unexpected failure", runtimeErrors.length === 0, JSON.stringify(runtimeErrors));
} catch (error) {
  checks.push({ name: "browser execution", pass: false, detail: error instanceof Error ? error.stack ?? error.message : String(error) });
} finally {
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  if (port) {
    const released = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    checks.push({ name: "temporary runtime port released", pass: released, detail: `port=${port}` });
  }
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
  if (distDir) {
    const resolvedDist = path.resolve(root, distDir);
    const allowedRoot = `${path.resolve(root, ".tmp")}${path.sep}`;
    if (resolvedDist.startsWith(allowedRoot)) {
      try { fs.rmSync(resolvedDist, { recursive: true, force: true }); } catch {}
    }
  }
  checks.push({ name: "tracked Next type entry restored", pass: await restoreNextEnv(), detail: "next-env.d.ts" });
}

const failed = checks.filter((item) => !item.pass);
const manifest = {
  devId: "DEV-088",
  runId,
  status: failed.length ? "FAIL" : "PASS",
  port,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  runtimeErrors
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length) process.exitCode = 1;
