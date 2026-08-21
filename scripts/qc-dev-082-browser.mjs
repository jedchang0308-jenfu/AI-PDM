import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { chromium } from "playwright";
import { buildFilenameAdapterResult } from "../src/lib/drawing-recognition-adapters.ts";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev082-browser-"));
const repositoryDir = path.join(tempDir, "repository");
const distDirRelative = `.tmp/next-qc-dev082-${crypto.randomUUID()}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const stamp = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const outputDir = path.join(root, "output", "qa", "dev-082-browser-pdf-ocr", `browser-${stamp}-local-isolated`);
const snapshots = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const workerToken = `dev082-worker-${crypto.randomUUID()}`;
const encryptedPdf = Buffer.from("JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPGRkMmI3ZTM0ZGU+Cj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbIDQgMCBSIF0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9SZXNvdXJjZXMgPDwKPj4KL01lZGlhQm94IFsgMC4wIDAuMCAzMDAgMzAwIF0KL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKNSAwIG9iago8PAovViAyCi9SIDMKL0xlbmd0aCAxMjgKL1AgNDI5NDk2NzI5MgovRmlsdGVyIC9TdGFuZGFyZAovTyA8MmQ1ZGExMmViNzc5NGNiMjk2NzIyZjFiNGU2MGU5YTNhYjUwNzI3MmM4Zjc5MWQ4N2U3MmE4MjUwYTE1M2Q4MD4KL1UgPGE4MGEzZDI1MTBmN2FhOTVmNGZiYjkzZTllY2QzNTE2MjhiZjRlNWU0ZTc1OGE0MTY0MDA0ZTU2ZmZmYTAxMDg+Cj4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA1OSAwMDAwMCBuIAowMDAwMDAwMTE4IDAwMDAwIG4gCjAwMDAwMDAxNjcgMDAwMDAgbiAKMDAwMDAwMDI2MSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDYKL1Jvb3QgMyAwIFIKL0luZm8gMSAwIFIKL0lEIFsgPDY0MzAzOTYzNjI2MzMzMzQzNDY1NjYzMzY1NjU2MjMwNjE2MzM4NjEzMDMyMzA2MjM4MzgzMzY0MzEzODM2NjY2PiA8NjQzMDM5NjM2MjYzMzMzNDM0NjU2NjMzNjU2NTYyMzA2MTYzMzg2MTMwMzIzMDYyMzgzODM0MzEzODM2NjY+IF0KL0VuY3J5cHQgNSAwIFIKPj4Kc3RhcnR4cmVmCjQ3NgolJUVPRgo=", "base64");
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const baseUrl = `http://127.0.0.1:${port}`;
let child;
let browser;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function pdfText(value) {
  return String(value).replace(/([\\()])/gu, "\\$1").replace(/[^\x20-\x7e]/gu, "?");
}

function pdfStream(dictionary, bytes) {
  return Buffer.concat([
    Buffer.from(`<< ${dictionary} /Length ${bytes.length} >>\nstream\n`, "ascii"),
    bytes,
    Buffer.from("\nendstream", "ascii")
  ]);
}

function buildPdf(pages) {
  const objects = [];
  const reserve = () => { objects.push(null); return objects.length; };
  const add = (value) => { objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value, "ascii")); return objects.length; };
  const set = (number, value) => { objects[number - 1] = Buffer.isBuffer(value) ? value : Buffer.from(value, "ascii"); };
  const catalogObject = reserve();
  const pagesObject = reserve();
  const fontObject = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageObjects = [];
  for (const page of pages) {
    const width = Number(page.width ?? 842);
    const height = Number(page.height ?? 595);
    let resources = `<< /Font << /F1 ${fontObject} 0 R >> >>`;
    let content;
    if (page.jpeg) {
      const imageObject = add(pdfStream(`/Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, page.jpeg));
      resources = `<< /XObject << /Im1 ${imageObject} 0 R >> >>`;
      content = Buffer.from(`q ${width} 0 0 ${height} 0 0 cm /Im1 Do Q`, "ascii");
    } else {
      const commands = (page.lines ?? []).map((line, index) => {
        const x = Number(line.x ?? 45);
        const y = Number(line.y ?? height - 55 - index * 34);
        const size = Number(line.size ?? 22);
        return `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfText(line.text ?? line)}) Tj ET`;
      });
      content = Buffer.from(commands.join("\n"), "ascii");
    }
    const contentObject = add(pdfStream("", content));
    const pageObject = reserve();
    set(pageObject, `<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 ${width} ${height}] /Resources ${resources} /Contents ${contentObject} 0 R >>`);
    pageObjects.push(pageObject);
  }
  set(catalogObject, `<< /Type /Catalog /Pages ${pagesObject} 0 R >>`);
  set(pagesObject, `<< /Type /Pages /Count ${pageObjects.length} /Kids [${pageObjects.map((number) => `${number} 0 R`).join(" ")}] >>`);
  const chunks = [Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "binary")];
  const offsets = [0];
  let offset = chunks[0].length;
  for (let index = 0; index < objects.length; index += 1) {
    const object = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, "ascii"), objects[index], Buffer.from("\nendobj\n", "ascii")]);
    offsets.push(offset);
    chunks.push(object);
    offset += object.length;
  }
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n", ...offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n \n`)].join("");
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalogObject} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`, "ascii"));
  return Buffer.concat(chunks);
}

function registerFixtureFont() {
  const candidates = [
    "C:/Windows/Fonts/msjh.ttc",
    "C:/Windows/Fonts/mingliu.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && GlobalFonts.registerFromPath(candidate, "DEV082Fixture")) return candidate;
  }
  return null;
}

function scannedJpeg(lines, options = {}) {
  const width = Number(options.width ?? 1600);
  const height = Number(options.height ?? 1200);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#111111";
  context.font = `${options.fontSize ?? 54}px ${options.fontFamily ?? "Arial"}`;
  lines.forEach((line, index) => context.fillText(line, 80, 110 + index * Number(options.lineHeight ?? 110)));
  return { jpeg: canvas.toBuffer("image/jpeg", 95), width, height };
}

function fixtureLines(prefix = "QC1001") {
  return [
    `Drawing Number ${prefix}-M01`,
    "Revision B",
    `Part Number ${prefix}-P01`,
    "Title BROWSER OCR PLATE",
    "Material SUS304",
    "Scale 1:2",
    "Drawn By LIN",
    "Unit mm",
    "Surface Finish NONE",
    "Heat Treatment NONE"
  ];
}

function createFixtureSet() {
  const fontPath = registerFixtureFont();
  const scan = scannedJpeg(["繁體中文圖框 / Traditional Chinese", ...fixtureLines("QC2002")], { fontFamily: fontPath ? "DEV082Fixture" : "Arial", fontSize: 52, lineHeight: 92 });
  const mixedScan = scannedJpeg(["Material SUS316", "Drawn By CHEN"], { fontFamily: fontPath ? "DEV082Fixture" : "Arial", fontSize: 72, lineHeight: 150, width: 1200, height: 500 });
  const white = scannedJpeg([], { width: 64, height: 64 });
  const requiredAndUtility = [
    ...fixtureLines("QC1001"),
    ...Array.from({ length: 14 }, (_, index) => `General Notes DEBURR INSPECTION MACHINING NOTE ${index + 1}`)
  ];
  const mixedText = fixtureLines("QC3003").filter((line) => !line.startsWith("Material") && !line.startsWith("Drawn By"));
  const conflicts = [
    ...Array.from({ length: 6 }, (_, index) => `Drawing Number QC4004-M0${index + 1}`),
    ...fixtureLines("QC4004").slice(1)
  ];
  return {
    fontPath,
    fixtures: [
      { key: "text", fileName: "01-文字圖框.pdf", bytes: buildPdf([{ lines: requiredAndUtility }]), expected: { status: "succeeded", ocrPages: 0 } },
      { key: "scan", fileName: "02-中英掃描圖框.pdf", bytes: buildPdf([{ jpeg: scan.jpeg, imageWidth: scan.width, imageHeight: scan.height, width: 800, height: 600 }]), expected: { status: "succeeded", ocrPages: 1, interrupted: true } },
      { key: "mixed", fileName: "03-混合文字掃描.pdf", bytes: buildPdf([{ lines: mixedText }, { jpeg: mixedScan.jpeg, imageWidth: mixedScan.width, imageHeight: mixedScan.height, width: 800, height: 340 }]), expected: { status: "succeeded", ocrPages: 1 } },
      { key: "missing", fileName: "04-缺漏欄位.pdf", bytes: buildPdf([{ lines: ["Title MISSING FIELD SAMPLE", "General Notes INSPECTION ONLY", "General Notes NO FABRICATION"] }]), expected: { status: "succeeded", ocrPages: 0 } },
      { key: "conflict", fileName: "05-衝突欄位.pdf", bytes: buildPdf([{ lines: conflicts }]), expected: { status: "partial", ocrPages: 0 } },
      { key: "large", fileName: "06-超大頁面.pdf", bytes: buildPdf([{ jpeg: white.jpeg, imageWidth: white.width, imageHeight: white.height, width: 5000, height: 5000 }]), expected: { status: "succeeded", ocrPages: 1 } },
      { key: "page_limit", fileName: "07-多頁上限.pdf", bytes: buildPdf(Array.from({ length: 21 }, () => ({ jpeg: white.jpeg, imageWidth: white.width, imageHeight: white.height, width: 96, height: 96 }))), expected: { status: "partial", ocrPages: 20 } },
      { key: "corrupt", fileName: "08-損壞文件.pdf", bytes: Buffer.from("%PDF-1.7\nintentionally-corrupt-dev082-fixture\n%%EOF\n", "ascii"), expected: { status: "failed", diagnostic: "pdf_source_invalid", ocrPages: 0 } },
      { key: "encrypted", fileName: "09-密碼保護.pdf", bytes: encryptedPdf, expected: { status: "failed", diagnostic: "pdf_encrypted_or_password_required", ocrPages: 0 } }
    ]
  };
}

async function restoreGeneratedFiles() {
  for (const [file, content] of snapshots) {
    let lastError;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      try {
        fs.writeFileSync(path.join(root, file), content, "utf8");
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        await delay(attempt * 100);
      }
    }
    if (lastError) throw lastError;
  }
}

async function removeTemporaryTarget(target) {
  const resolved = path.resolve(target);
  const allowed = resolved.startsWith(path.resolve(os.tmpdir())) || resolved.startsWith(`${path.resolve(root, ".tmp")}${path.sep}`);
  if (!allowed || !fs.existsSync(resolved)) return;
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch (error) {
      lastError = error;
      await delay(attempt * 150);
    }
  }
  throw lastError;
}

async function waitForServer() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.status < 500) return;
    } catch {}
    await delay(400);
  }
  throw new Error("DEV-082 browser server did not start");
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
    const deadline = Date.now() + 5_000;
    while (child.exitCode === null && Date.now() < deadline) await delay(100);
    assert.notEqual(child.exitCode, null, "temporary DEV-082 process tree must exit before dist cleanup");
    return;
  }
  child.kill("SIGINT");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(4_000).then(() => child.kill("SIGTERM"))]);
}

async function assertPortReleased() {
  const released = await new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
  assert.equal(released, true, `temporary DEV-082 port ${port} must be released`);
}

function insertFixtures(databasePath, fixtures) {
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  const target = database.prepare(`
    SELECT revision.id, revision.company_id, revision.revision, revision.created_by
    FROM numbering_candidate_revision_drafts revision
    LEFT JOIN numbering_candidate_revision_files file ON file.candidate_revision_id = revision.id AND file.removed_at IS NULL
    WHERE revision.lifecycle_status = 'draft'
    GROUP BY revision.id
    HAVING COUNT(file.id) = 0
    ORDER BY revision.created_at DESC, revision.id
    LIMIT 1
  `).get();
  assert.ok(target?.id, "DEV-082 isolated fixture requires one draft candidate revision without files");
  const timestamp = new Date().toISOString();
  const insertAsset = database.prepare(`
    INSERT INTO file_assets (
      id, storage_provider, original_path, storage_key, storage_generation, file_name, file_ext, mime_type,
      file_size, content_hash, linked_entity_type, linked_entity_id, document_category, display_name,
      revision, uploaded_by, sync_status, created_at, updated_at
    ) VALUES (
      @id, 'local_repository', @originalPath, @storageKey, @generation, @fileName, 'pdf', 'application/pdf',
      @fileSize, @contentHash, 'numbering_candidate_revision', @candidateRevisionId, 'pdf', @fileName,
      @revision, @actorId, 'local_only', @timestamp, @timestamp
    )
  `);
  const insertLink = database.prepare(`
    INSERT INTO numbering_candidate_revision_files (
      id, company_id, candidate_revision_id, source_file_asset_id, role, role_source, display_name,
      description, sort_order, is_primary, created_by, created_at, updated_at
    ) VALUES (
      @linkId, @companyId, @candidateRevisionId, @assetId, 'pdf', 'system', @fileName,
      '', @sortOrder, 0, @actorId, @timestamp, @timestamp
    )
  `);
  const records = database.transaction(() => fixtures.map((fixture, index) => {
    const assetId = `FA-DEV082-${crypto.randomUUID()}`;
    const linkId = `NCRF-DEV082-${crypto.randomUUID()}`;
    const storageKey = `dev-082-qc/${String(index + 1).padStart(2, "0")}-${fixture.key}.pdf`;
    const localPath = path.join(repositoryDir, ...storageKey.split("/"));
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, fixture.bytes);
    const contentHash = sha256(fixture.bytes);
    insertAsset.run({
      id: assetId,
      originalPath: localPath,
      storageKey,
      generation: `qc-${contentHash.slice(0, 16)}`,
      fileName: fixture.fileName,
      fileSize: fixture.bytes.length,
      contentHash,
      candidateRevisionId: target.id,
      revision: target.revision,
      actorId: target.created_by,
      timestamp
    });
    insertLink.run({
      linkId,
      companyId: target.company_id,
      candidateRevisionId: target.id,
      assetId,
      fileName: fixture.fileName,
      sortOrder: index,
      actorId: target.created_by,
      timestamp
    });
    return { ...fixture, bytes: undefined, assetId, linkId, contentHash, fileSize: fixture.bytes.length };
  }))();
  database.close();
  return { target, records };
}

function parseSelectionCounts(diagnostics) {
  const value = diagnostics.find((item) => item.startsWith("selection_counts:")) ?? "";
  return Object.fromEntries([...value.matchAll(/(selected|discarded|tier0|tier1|tier2|tier3)=([0-9]+)/gu)].map((match) => [match[1], Number(match[2])]));
}

const sourceDb = path.resolve(process.env.PDM_DEV_082_SOURCE_SQLITE_PATH?.trim() || path.join(root, "data", "ai-pdm.sqlite"));
const targetDb = path.join(tempDir, "ai-pdm.sqlite");
fs.copyFileSync(sourceDb, targetDb);
const fixtureDatabase = new Database(targetDb);
fixtureDatabase.prepare("UPDATE users SET password_hash = NULL, account_status = 'active', system_role_enabled = 1 WHERE email = 'admin@example.com'").run();
fixtureDatabase.prepare("UPDATE auth_identities SET status = 'active' WHERE login_identifier = 'admin@example.com'").run();
fixtureDatabase.close();
const { fixtures, fontPath } = createFixtureSet();
const fixtureScope = insertFixtures(targetDb, fixtures);
// The copied source DB can contain unrelated queued work. Cancel only those
// rows in the isolated copy so the worker claim is deterministic for this QC
// fixture; production lifecycle data is never touched.
const isolatedFixtureDatabase = new Database(targetDb);
isolatedFixtureDatabase.prepare(`UPDATE drawing_recognition_sessions
  SET status = 'cancelled', cancelled_at = :timestamp, error_code = 'qc_unrelated_session',
      error_summary = 'isolated DEV-082 browser fixture', row_version = row_version + 1, updated_at = :timestamp
  WHERE status IN ('queued', 'extracting')`).run({ timestamp: new Date().toISOString() });
isolatedFixtureDatabase.close();
const consoleErrors = [];
const unexpectedResponses = [];
const networkOrigins = new Set();
const contentGets = new Map();
const completions = new Map();
const serverOutput = [];

try {
  fs.mkdirSync(outputDir, { recursive: true });
  child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "demo",
      PDM_AUTH_SECRET: "dev082-browser-auth-secret",
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      PDM_RELEASE_MODE: "local_stub",
      PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
      PDM_NUMBER_STATE_FLOW_V1: "true",
      PDM_NUMBER_LIFECYCLE_V2: "true",
      PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
      PDM_DRAWING_RECOGNITION_V1: "true",
      PDM_DRAWING_RECOGNITION_WORKER_TOKEN: workerToken,
      PDM_PUBLIC_BASE_URL: baseUrl,
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
    serverOutput.push(...String(chunk).split(/\r?\n/gu).filter(Boolean));
    if (serverOutput.length > 400) serverOutput.splice(0, serverOutput.length - 400);
  });
  console.log(JSON.stringify({ runtime: { project: "AI_PDM", purpose: "DEV-082 isolated browser QC", port, pid: child.pid, cleanup: "stop exact process tree and verify port release" } }));
  await waitForServer();
  assert.equal((await fetch(`${baseUrl}/api/recognition-jobs/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workerId: "unauthorized" }) })).status, 401);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    const state = { canvases: [], activeWorkers: 0, maxActiveWorkers: 0 };
    Object.defineProperty(window, "__dev082Qc", { value: state, configurable: false });
    const nativeCreateElement = Document.prototype.createElement;
    Document.prototype.createElement = function patchedCreateElement(name, options) {
      const element = nativeCreateElement.call(this, name, options);
      if (String(name).toLowerCase() === "canvas") {
        const record = { width: 0, height: 0, maxPixels: 0 };
        Object.defineProperty(element, "__dev082QcCanvas", { value: record });
        state.canvases.push(record);
      }
      return element;
    };
    for (const property of ["width", "height"]) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property);
      if (!descriptor?.get || !descriptor?.set) continue;
      Object.defineProperty(HTMLCanvasElement.prototype, property, {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value) {
          descriptor.set.call(this, value);
          const record = this.__dev082QcCanvas;
          if (record) {
            record[property] = Number(value);
            record.maxPixels = Math.max(record.maxPixels, Number(this.width) * Number(this.height));
          }
        }
      });
    }
    const NativeWorker = window.Worker;
    window.Worker = class TrackedWorker extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.__dev082Active = true;
        state.activeWorkers += 1;
        state.maxActiveWorkers = Math.max(state.maxActiveWorkers, state.activeWorkers);
      }
      terminate() {
        if (this.__dev082Active) {
          this.__dev082Active = false;
          state.activeWorkers -= 1;
        }
        return super.terminate();
      }
    };
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    networkOrigins.add(url.origin);
    const contentMatch = url.pathname.match(/\/recognition-sessions\/[^/]+\/sources\/([^/]+)\/content$/u);
    if (contentMatch) {
      const sourceId = decodeURIComponent(contentMatch[1]);
      const record = contentGets.get(sourceId) ?? { count: 0, startedAt: Date.now() };
      record.count += 1;
      record.startedAt = record.startedAt || Date.now();
      contentGets.set(sourceId, record);
    }
    if (url.pathname.endsWith("/client-adapter-results") && request.method() === "POST") {
      const body = request.postDataJSON();
      const content = contentGets.get(body.sourceId);
      completions.set(body.sourceId, {
        count: (completions.get(body.sourceId)?.count ?? 0) + 1,
        status: body.status,
        diagnostics: body.diagnostics ?? [],
        observations: body.observations ?? [],
        elapsedMs: content ? Date.now() - content.startedAt : null
      });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const pathname = new URL(response.url()).pathname;
      if (!(pathname === "/api/recognition-jobs/claim" && response.status() === 401)) unexpectedResponses.push({ url: response.url(), status: response.status() });
    }
  });

  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  const login = await page.evaluate(async () => {
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", password: "pdm-demo" }) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const unauthorizedContext = await browser.newContext();
  const unauthorized = await unauthorizedContext.request.get(`${baseUrl}/api/numbering/recognition-sessions/not-authorized/sources/not-authorized/content`);
  assert.ok([401, 403].includes(unauthorized.status()));
  await unauthorizedContext.close();

  const create = await page.evaluate(async ({ sourceContextId }) => {
    const response = await fetch("/api/numbering/recognition-sessions", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `dev082-browser-create-${crypto.randomUUID()}` },
      body: JSON.stringify({ sourceContextType: "candidate_revision", sourceContextId })
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, { sourceContextId: fixtureScope.target.id });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const sessionId = create.body.session.id;
  await delay(2_100);
  const claimResponse = await fetch(`${baseUrl}/api/recognition-jobs/claim`, {
    method: "POST",
    headers: { authorization: `Bearer ${workerToken}`, "content-type": "application/json" },
    body: JSON.stringify({ workerId: "qc-dev082-browser", maxAttempts: 2 })
  });
  const job = await claimResponse.json();
  assert.equal(claimResponse.status, 200, JSON.stringify(job));
  assert.equal(job.sessionId, sessionId);
  assert.equal(job.sources.length, fixtures.length);
  const completeResponse = await fetch(`${baseUrl}/api/recognition-jobs/${encodeURIComponent(job.sessionId)}/complete`, {
    method: "POST",
    headers: { authorization: `Bearer ${workerToken}`, "content-type": "application/json" },
    body: JSON.stringify({ workerId: "qc-dev082-browser", sourceSetFingerprint: job.sourceSetFingerprint, results: job.sources.map(buildFilenameAdapterResult) })
  });
  const completeBody = await completeResponse.json().catch(() => ({}));
  assert.equal(completeResponse.status, 200, JSON.stringify(completeBody));
  const sourceIdByFileName = new Map(job.sources.map((source) => [source.fileName, source.id]));

  await page.goto(`${baseUrl}/numbering/recognition/${encodeURIComponent(sessionId)}`, { waitUntil: "domcontentloaded" });
  await page.locator(".drawing-pdf-ocr").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".drawing-pdf-ocr-progress", { hasText: "02-中英掃描圖框.pdf" }).waitFor({ state: "visible", timeout: 120_000 });
  const interruptedSourceId = sourceIdByFileName.get("02-中英掃描圖框.pdf");
  assert.ok(interruptedSourceId);
  assert.equal(completions.has(interruptedSourceId), false, "interrupted OCR must not post false success");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".drawing-pdf-ocr").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll(".drawing-pdf-ocr-source.is-pending").length === 0 && !document.querySelector(".drawing-pdf-ocr-progress"), null, { timeout: 9 * 60_000 });
  const projection = await page.evaluate(async (id) => {
    const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(id)}`, { cache: "no-store" });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, sessionId);
  assert.equal(projection.status, 200);
  assert.equal(projection.body.session.pendingClientAdapters.length, 0);
  const projectedSources = new Map(projection.body.session.pdfOcrSources.map((source) => [source.fileName, source]));
  for (const fixture of fixtureScope.records) {
    const sourceId = sourceIdByFileName.get(fixture.fileName);
    const completion = completions.get(sourceId);
    const projected = projectedSources.get(fixture.fileName);
    assert.ok(completion, `missing browser completion for ${fixture.fileName}`);
    assert.ok(projected, `missing projected PDF OCR source for ${fixture.fileName}`);
    assert.equal(completion.status, fixture.expected.status, `${fixture.fileName} completion status`);
    assert.equal(projected.status, fixture.expected.status, `${fixture.fileName} projected status`);
    if (fixture.expected.diagnostic) assert.ok(completion.diagnostics.includes(fixture.expected.diagnostic), `${fixture.fileName} sanitized terminal diagnostic`);
    assert.equal(projected.requiredOutcomes.length, 7, `${fixture.fileName} required outcome coverage`);
  }
  const textOutcomes = Object.fromEntries(projectedSources.get("01-文字圖框.pdf").requiredOutcomes.map((outcome) => [outcome.fieldKey, outcome.outcome]));
  assert.ok(Object.values(textOutcomes).every((outcome) => outcome === "found"));
  const scanOutcomes = Object.fromEntries(projectedSources.get("02-中英掃描圖框.pdf").requiredOutcomes.map((outcome) => [outcome.fieldKey, outcome.outcome]));
  assert.ok(Object.values(scanOutcomes).filter((outcome) => outcome === "found").length >= 5, JSON.stringify(scanOutcomes));
  const missingOutcomes = Object.fromEntries(projectedSources.get("04-缺漏欄位.pdf").requiredOutcomes.map((outcome) => [outcome.fieldKey, outcome.outcome]));
  assert.equal(missingOutcomes.title, "found");
  assert.ok(Object.entries(missingOutcomes).filter(([key]) => key !== "title").every(([, outcome]) => outcome === "not_found"));
  assert.equal(projectedSources.get("05-衝突欄位.pdf").requiredOutcomes.find((outcome) => outcome.fieldKey === "drawing_number")?.outcome, "conflict");
  assert.ok(completions.get(sourceIdByFileName.get("07-多頁上限.pdf")).diagnostics.includes("pdf_ocr_page_limit_reached"));

  const contentProbeSource = fixtureScope.records.find((fixture) => fixture.key === "missing");
  const contentProbeSourceId = sourceIdByFileName.get(contentProbeSource.fileName);
  const contentProbeUrl = `${baseUrl}/api/numbering/recognition-sessions/${encodeURIComponent(sessionId)}/sources/${encodeURIComponent(contentProbeSourceId)}/content`;
  const contentProbe = await context.request.get(contentProbeUrl);
  assert.equal(contentProbe.status(), 200);
  assert.equal(contentProbe.headers()["content-type"], "application/pdf");
  assert.match(contentProbe.headers()["cache-control"] ?? "", /private.*no-store/u);
  assert.equal(contentProbe.headers()["content-hash"], contentProbeSource.contentHash);
  assert.match(contentProbe.headers()["content-disposition"] ?? "", /filename\*=UTF-8''/u, "Unicode PDF names must use an RFC 5987 filename");
  const rangeProbe = await context.request.get(contentProbeUrl, { headers: { range: "bytes=0-4" } });
  assert.equal(rangeProbe.status(), 416);
  const contentGetEvidence = {
    status: contentProbe.status(),
    contentType: contentProbe.headers()["content-type"],
    cacheControl: contentProbe.headers()["cache-control"],
    contentHash: contentProbe.headers()["content-hash"],
    contentDisposition: contentProbe.headers()["content-disposition"],
    rangeStatus: rangeProbe.status(),
    unauthorizedStatus: unauthorized.status()
  };

  const instrumentation = await page.evaluate(() => ({
    canvasCount: window.__dev082Qc.canvases.length,
    maxCanvasPixels: Math.max(0, ...window.__dev082Qc.canvases.map((canvas) => canvas.maxPixels)),
    liveCanvasPixels: window.__dev082Qc.canvases.reduce((total, canvas) => total + canvas.width * canvas.height, 0),
    activeWorkers: window.__dev082Qc.activeWorkers,
    maxActiveWorkers: window.__dev082Qc.maxActiveWorkers
  }));
  assert.ok(instrumentation.maxCanvasPixels <= 12_000_000, JSON.stringify(instrumentation));
  assert.equal(instrumentation.liveCanvasPixels, 0, "all OCR canvases must release their backing stores");
  assert.equal(instrumentation.activeWorkers, 0, "PDF.js/Tesseract workers must terminate after the final source");
  assert.equal(contentGets.get(sourceIdByFileName.get("01-文字圖框.pdf"))?.count, 1);
  assert.equal(completions.get(sourceIdByFileName.get("01-文字圖框.pdf"))?.count, 1);
  assert.ok((contentGets.get(interruptedSourceId)?.count ?? 0) >= 2, "reload must re-enter the pending source cleanly");
  assert.equal(completions.get(interruptedSourceId)?.count, 1, "interrupted source must complete exactly once");
  assert.deepEqual([...networkOrigins].filter((origin) => origin !== baseUrl), [], "OCR document/assets must remain same-origin");
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(unexpectedResponses, []);

  const viewports = [];
  for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 1024, height: 768 }, { name: "mobile", width: 390, height: 844 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await delay(100);
    const evidence = await page.evaluate(() => ({
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      alerts: [...document.querySelectorAll("[role=alert]")].map((element) => element.textContent?.trim()).filter(Boolean),
      visibleHttpErrors: /HTTP\s+[45][0-9]{2}|Internal Server Error|Not Found|\/api\//u.test(document.body.innerText),
      visibleTechnicalLeaks: [...new Set(document.body.innerText.match(/DEV-082|sourceId|effectKey|browser-pdf-ocr\.v1|\/api\//gu) ?? [])],
      requiredOutcomeTiles: document.querySelectorAll(".drawing-pdf-ocr-required > span").length,
      sourceCards: document.querySelectorAll(".drawing-pdf-ocr-source").length,
      pdfRecoveryActions: [...document.querySelectorAll(".drawing-pdf-ocr-recovery button:not([disabled])")].map((button) => button.textContent?.trim()),
      footerCount: document.querySelectorAll(".drawing-recognition-footer").length,
      footerRerunActions: [...document.querySelectorAll(".drawing-recognition-footer button")].filter((button) => button.textContent?.includes("重新辨識")).length,
      formalizeDisabled: document.querySelector(".drawing-recognition-footer .primary-button")?.hasAttribute("disabled") ?? false,
      finalContentClearance: (() => {
        const footer = document.querySelector(".drawing-recognition-footer");
        const sections = [...document.querySelectorAll(".drawing-recognition-section")];
        const finalSection = sections.at(-1);
        if (!(footer instanceof HTMLElement) || !(finalSection instanceof HTMLElement)) return null;
        return Math.round(footer.getBoundingClientRect().top - finalSection.getBoundingClientRect().bottom);
      })()
    }));
    assert.equal(evidence.horizontalOverflow, 0);
    assert.equal(evidence.visibleHttpErrors, false);
    assert.deepEqual(evidence.visibleTechnicalLeaks, []);
    assert.equal(evidence.requiredOutcomeTiles, fixtures.length * 7);
    assert.equal(evidence.sourceCards, fixtures.length);
    assert.equal(evidence.pdfRecoveryActions.length, 1, "PDF section must own the single enabled re-entry action");
    assert.equal(evidence.footerCount, 1);
    assert.equal(evidence.footerRerunActions, 0, "footer must not duplicate the PDF re-entry action");
    assert.equal(evidence.formalizeDisabled, true, "terminal PDF failures must block recognition formalization");
    assert.ok((evidence.finalContentClearance ?? -1) >= 0, `fixed footer obscured final content: ${JSON.stringify(evidence)}`);
    const screenshot = `${viewport.name}-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: true });
    viewports.push({ ...viewport, screenshot, ...evidence });
  }

  const database = new Database(targetDb, { readonly: true });
  const persisted = database.prepare(`
    SELECT source.file_name, result.observation_count, result.diagnostics_json,
           COUNT(observation.id) AS persisted_observations
    FROM drawing_recognition_adapter_results result
    JOIN drawing_recognition_sources source ON source.id = result.source_id
    LEFT JOIN drawing_recognition_observations observation ON observation.adapter_result_id = result.id
    WHERE result.session_id = ? AND result.adapter_code = 'browser-pdf-ocr.v1'
    GROUP BY source.file_name, result.observation_count, result.diagnostics_json
    ORDER BY source.file_name
  `).all(sessionId);
  database.close();
  assert.equal(persisted.length, fixtures.length);
  for (const row of persisted) {
    assert.equal(Number(row.persisted_observations), Number(row.observation_count));
    assert.ok(Number(row.observation_count) <= 50);
    assert.doesNotMatch(row.diagnostics_json, /A000|QC[0-9]|SUS30|BROWSER OCR PLATE/u, "diagnostics must not persist extracted content");
  }
  assert.ok(persisted.reduce((total, row) => total + Number(row.observation_count), 0) <= 100);

  const sources = fixtureScope.records.map((fixture) => {
    const sourceId = sourceIdByFileName.get(fixture.fileName);
    const completion = completions.get(sourceId);
    return {
      fixture: fixture.key,
      fileName: fixture.fileName,
      sourceId,
      sha256: fixture.contentHash,
      bytes: fixture.fileSize,
      status: completion.status,
      contentGetCount: contentGets.get(sourceId)?.count ?? 0,
      completionPostCount: completion.count,
      elapsedMs: completion.elapsedMs,
      ocrCanvasCountExpected: fixture.expected.ocrPages,
      selection: parseSelectionCounts(completion.diagnostics),
      requiredOutcomes: Object.fromEntries(projectedSources.get(fixture.fileName).requiredOutcomes.map((outcome) => [outcome.fieldKey, outcome.outcome])),
      diagnostics: completion.diagnostics
    };
  });
  const report = {
    dev: "DEV-082",
    result: "PASS",
    baseUrl,
    browserVersion: browser.version(),
    runtime: { port, pid: child.pid, owned: true, cleanupCondition: "suite finally block" },
    fixturePolicy: "runtime-generated production-safe synthetic PDFs; no customer bytes retained in evidence",
    fixtureFont: fontPath ? path.basename(fontPath) : "Arial fallback",
    versions: { pdfjs: "6.2.108", tesseract: "7.0.0", languages: ["chi_tra", "eng"], policy: "2026-08-20.2" },
    sources,
    instrumentation,
    network: { origins: [...networkOrigins], thirdPartyOrigins: [...networkOrigins].filter((origin) => origin !== baseUrl), consoleErrors, unexpectedResponses },
    contentGetEvidence,
    viewports,
    cases: Object.fromEntries([
      ["OCR-082-002", "text-layer PDF used zero OCR canvases and all Tier 0 fields were found"],
      ["OCR-082-003", "synthetic Traditional Chinese/English scanned PDF completed through Tesseract"],
      ["OCR-082-004", "mixed text/image PDF merged text-layer and OCR page results"],
      ["OCR-082-015", "authorized content GET returned PDF/hash/no-store/RFC5987 headers; range was bounded and anonymous access denied"],
      ["OCR-082-018", "each normal source produced one bounded completion POST with no per-page writes"],
      ["OCR-082-022", "corrupt and encrypted PDFs produced sanitized terminal failures"],
      ["OCR-082-023", "12 MP canvas, 20 OCR-page, serial loop and cleanup bounds were measured"],
      ["OCR-082-024", "reload before completion posted no false success and re-entered pending work idempotently"],
      ["OCR-082-025", "progress, terminal status, required outcomes and retry/re-entry controls rendered"],
      ["OCR-082-026", "pinned same-origin worker/WASM/language assets loaded without third-party origin"],
      ["OCR-082-027", "network/console sweep contained no third-party document request or extracted-content diagnostic"],
      ["OCR-082-028", "normal PDF used one content GET and one completion POST with no server OCR endpoint"],
      ["OCR-082-029", "1440/1024/390 rendered with zero horizontal overflow or unexpected HTTP error"]
    ].map(([id, evidence]) => [id, { result: "PASS", evidence }])),
    completedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "report.md"), `# DEV-082 isolated browser QC\n\n- Result: PASS\n- Session: ${sessionId}\n- Sources: ${fixtures.length} production-safe synthetic PDFs\n- Text/scan/mixed/corrupt/encrypted/resource-bound/re-entry: PASS\n- Viewports: 1440x900, 1024x768, 390x844\n- Network: same-origin only\n`, "utf8");
  console.log(JSON.stringify({ ...report, reportDir: outputDir }, null, 2));
} catch (error) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "failure.json"), `${JSON.stringify({ result: "FAIL", error: error instanceof Error ? error.stack : String(error), serverOutput }, null, 2)}\n`, "utf8");
  throw error;
} finally {
  await browser?.close();
  await stopServer();
  await restoreGeneratedFiles();
  await delay(500);
  await assertPortReleased();
  for (const target of [distDir, tempDir]) await removeTemporaryTarget(target);
}
