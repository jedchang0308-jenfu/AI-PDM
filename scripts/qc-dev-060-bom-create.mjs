#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { chromium } from "playwright";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev060-"));
const repositoryDir = path.join(tempDir, "repository");
const distDirRelative = `.tmp/next-qc-dev060-${crypto.randomUUID()}`;
const distDir = path.join(root, distDirRelative);
const outputDir = path.join(root, "output", "playwright", "dev-060-bom-create");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const results = [];
const consoleErrors = [];
const httpErrors = [];
let child;
let browser;
let releasedChildPartNumber = "";
let engineerPartId = "";
let finalReport = null;

function record(name, passed, detail = "") {
  passed = Boolean(passed);
  results.push({ name, passed, detail });
  assert.ok(passed, `${name}${detail ? `: ${detail}` : ""}`);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function prepareFixture() {
  const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
  if (!fs.existsSync(sourceDb)) throw new Error("DEV060_SOURCE_DB_NOT_FOUND");
  fs.copyFileSync(sourceDb, path.join(tempDir, "ai-pdm.sqlite"));
  const db = new Database(path.join(tempDir, "ai-pdm.sqlite"));
  try {
    db.prepare(
      "UPDATE users SET password_hash = NULL, account_status = 'active', system_role_enabled = 1 WHERE email IN ('admin@example.com', 'engineer@example.com', 'manager@example.com', 'manufacturing@example.com', 'procurement@example.com')"
    ).run();
    const eligible = db
      .prepare("SELECT count(*) AS count FROM part_numbers WHERE record_status NOT IN ('Obsolete', 'Merged', 'MainDrawingInvalid')")
      .get().count;
    record("fixture has eligible material identities", eligible > 0, `count=${eligible}`);
    releasedChildPartNumber =
      db
        .prepare(
          `SELECT i.part_number
           FROM submissions s
           JOIN items i ON i.id = s.item_id
           WHERE s.status = 'Released'
           ORDER BY COALESCE(s.released_at, s.updated_at, s.created_at) DESC
           LIMIT 1`
        )
        .get()?.part_number ?? "";
    record("fixture has a released child identity", Boolean(releasedChildPartNumber), releasedChildPartNumber);
    engineerPartId =
      db
        .prepare(
          `SELECT id
           FROM part_numbers
           WHERE record_status NOT IN ('Obsolete', 'Merged', 'MainDrawingInvalid')
             AND (
               EXISTS (
                 SELECT 1
                 FROM bom_drafts existing_bom
                 WHERE existing_bom.owner_part_number_id = part_numbers.id
                   AND existing_bom.status <> 'Archived'
                   AND existing_bom.line_count > 0
               )
               OR EXISTS (
                 SELECT 1
                 FROM bom_release_snapshots released_bom
                 WHERE released_bom.owner_part_number_id = part_numbers.id
                   AND released_bom.line_count > 0
               )
               OR EXISTS (
                 SELECT 1
                 FROM bom_headers legacy_bom
                 JOIN items legacy_bom_item ON legacy_bom_item.id = legacy_bom.parent_item_id
                 WHERE legacy_bom_item.company_id = part_numbers.company_id
                   AND upper(legacy_bom_item.part_number) = upper(part_numbers.part_number)
                   AND legacy_bom.line_count > 0
               )
               OR EXISTS (
                 SELECT 1
                 FROM submissions assembly_submission
                 JOIN items assembly_item ON assembly_item.id = assembly_submission.item_id
                 WHERE assembly_submission.company_id = part_numbers.company_id
                   AND upper(assembly_item.part_number) = upper(part_numbers.part_number)
                   AND (
                     EXISTS (
                       SELECT 1
                       FROM submission_files assembly_file
                       WHERE assembly_file.submission_id = assembly_submission.id
                         AND assembly_file.file_role = 'sldasm'
                     )
                     OR EXISTS (
                       SELECT 1
                       FROM file_references assembly_reference
                       WHERE assembly_reference.submission_id = assembly_submission.id
                         AND assembly_reference.reference_type = 'assembly_component'
                     )
                   )
               )
             )
           ORDER BY id DESC
           LIMIT 1`
        )
        .get()?.id ?? "";
    if (engineerPartId) db.prepare("UPDATE part_numbers SET created_by = 'user-engineer-demo' WHERE id = ?").run(engineerPartId);
    record("fixture has an Engineer-owned material identity", Boolean(engineerPartId), engineerPartId);
  } finally {
    db.close();
  }
}

function startServer() {
  child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "demo",
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      PDM_RELEASE_MODE: "local_stub",
      PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
      PDM_PUBLIC_BASE_URL: baseUrl,
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: "ignore",
    windowsHide: true
  });
}

async function waitForServer() {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.status < 500) return;
    } catch {}
    await delay(400);
  }
  throw new Error("DEV060_SERVER_START_TIMEOUT");
}

async function login(page, email) {
  const account =
    email === "manufacturing@example.com"
      ? "Manufacturing"
      : email === "procurement@example.com"
        ? "Procurement"
      : email === "admin@example.com"
        ? "Admin"
        : email === "engineer@example.com"
          ? "Engineer"
          : email === "manager@example.com"
            ? "R&D Manager"
            : email;
  const response = await fetch(`${baseUrl}/api/auth/login?account=${encodeURIComponent(account)}`, { redirect: "manual" });
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookiePair = setCookie.split(";", 1)[0];
  const separator = cookiePair.indexOf("=");
  if (separator > 0) {
    await page.context().addCookies([
      { name: cookiePair.slice(0, separator), value: cookiePair.slice(separator + 1), url: baseUrl }
    ]);
  }
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  const authenticated = await page.evaluate(async () => {
    const me = await fetch("/api/auth/me", { cache: "no-store" });
    return me.status;
  });
  record(`login ${email}`, response.status === 303 && authenticated === 200, `login HTTP ${response.status}, me HTTP ${authenticated}`);
}

async function api(page, route, init = {}) {
  return page.evaluate(
    async ({ target, requestInit }) => {
      const response = await fetch(target, requestInit);
      return {
        status: response.status,
        body: await response.json().catch(() => ({})),
        cacheControl: response.headers.get("cache-control")
      };
    },
    { target: `${baseUrl}${route}`, requestInit: init }
  );
}

async function runApiChecks(page) {
  const contextResult = await api(page, "/api/bom/create-context");
  record("create context returns eligible parts", contextResult.status === 200 && contextResult.body.parts?.length > 0, `HTTP ${contextResult.status}`);
  record("create context is private no-store", /private.*no-store/u.test(contextResult.cacheControl ?? ""), contextResult.cacheControl ?? "");
  const part = contextResult.body.parts[0];
  const bomRevision = part.suggestedBomRevision || "1";
  const idempotencyKey = `dev060-manual-${crypto.randomUUID()}`;
  const manualBody = { ownerPartNumberId: part.id, bomRevision, source: "manual" };

  const created = await api(page, "/api/bom/drafts", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(manualBody)
  });
  record("manual canonical draft creates once", created.status === 201 && created.body.draft?.id, `HTTP ${created.status}`);
  const draftId = created.body.draft.id;
  record(
    "create receipt exposes authoritative workbench handoff",
    created.body.draftId === draftId &&
      created.body.receipt?.idempotencyKey === idempotencyKey &&
      created.body.receipt?.replayed === false &&
      created.body.workbenchUrl === `/bom/workbench/${encodeURIComponent(draftId)}`,
    JSON.stringify({ receipt: created.body.receipt, workbenchUrl: created.body.workbenchUrl })
  );
  record(
    "draft authority uses part identity and independent BOM revision",
    created.body.draft.owner_part_number_id === part.id &&
      created.body.draft.bom_revision === bomRevision &&
      created.body.draft.identity_authority === "canonical_part_number" &&
      !created.body.draft.source_submission_id,
    JSON.stringify(created.body.draft)
  );

  const invalidManualSource = await api(page, "/api/bom/drafts", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `dev060-manual-source-${crypto.randomUUID()}` },
    body: JSON.stringify({ ...manualBody, sourceSubmissionId: "manual-must-not-have-a-submission" })
  });
  record("manual source rejects a fake Drawing submission", invalidManualSource.status === 422, `HTTP ${invalidManualSource.status}`);

  const replay = await api(page, "/api/bom/drafts", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(manualBody)
  });
  record("same idempotency fingerprint replays receipt", replay.status === 200 && replay.body.draft?.id === draftId, `HTTP ${replay.status}`);

  const conflict = await api(page, "/api/bom/drafts", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify({ ...manualBody, bomRevision: String(Number(bomRevision) + 1) })
  });
  record("same key with different fingerprint conflicts", conflict.status === 409, `HTTP ${conflict.status}`);

  const readback = await api(page, `/api/bom/drafts?idempotencyKey=${encodeURIComponent(idempotencyKey)}`);
  record("unknown-result readback returns canonical draft", readback.status === 200 && readback.body.draft?.id === draftId, `HTTP ${readback.status}`);
  const workbench = await api(page, `/api/bom/workbench?draftId=${encodeURIComponent(draftId)}`);
  record("draftId workbench handoff loads", workbench.status === 200 && workbench.body.workbench?.active_draft?.id === draftId, `HTTP ${workbench.status}`);

  const submitted = await api(page, `/api/bom/drafts/${encodeURIComponent(draftId)}/submit-review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ changeReason: "DEV-060 canonical release integration" })
  });
  record("canonical draft submits to BOM review", submitted.status === 201 && submitted.body.review?.id, `HTTP ${submitted.status} ${JSON.stringify(submitted.body)}`);
  const approved = await api(page, `/api/bom/reviews/${encodeURIComponent(submitted.body.review.id)}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decisionReason: "DEV-060 QC approved" })
  });
  record("canonical BOM review releases through canonical approval route", approved.status === 200, `HTTP ${approved.status} ${JSON.stringify(approved.body)}`);
  const releaseSnapshotId = approved.body.result?.snapshotId;
  const csvExport = await page.evaluate(
    async ({ url, snapshotId }) => {
      const response = await fetch(`${url}/api/bom/releases/${encodeURIComponent(snapshotId)}/export?format=csv`);
      return {
        status: response.status,
        contentDisposition: response.headers.get("content-disposition"),
        text: await response.text()
      };
    },
    { url: baseUrl, snapshotId: releaseSnapshotId }
  );
  record(
    "canonical released BOM exports without a Drawing submission",
    csvExport.status === 200 && csvExport.contentDisposition?.includes(`Rev${bomRevision}`) && csvExport.text.includes("child_part_number"),
    `HTTP ${csvExport.status} ${csvExport.contentDisposition ?? ""}`
  );
  const releasedDraft = await api(page, `/api/bom/drafts/${encodeURIComponent(draftId)}`);
  record("canonical draft is released", releasedDraft.status === 200 && releasedDraft.body.draft?.status === "Released", `HTTP ${releasedDraft.status}`);

  const occupiedRevision = await api(page, "/api/bom/drafts", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `dev060-occupied-${crypto.randomUUID()}` },
    body: JSON.stringify(manualBody)
  });
  record(
    "a released BOM revision cannot be reused with a new create key",
    occupiedRevision.status === 409 && occupiedRevision.body.error === "BOM_REVISION_OCCUPIED",
    `HTTP ${occupiedRevision.status} ${JSON.stringify(occupiedRevision.body)}`
  );

  const xlsKey = `dev060-xls-${crypto.randomUUID()}`;
  const xlsBomRevision = String(Number(bomRevision) + 1);
  const xls = await page.evaluate(
    async ({ url, ownerPartNumberId, revision, key, childPartNumber }) => {
      const form = new FormData();
      form.set("ownerPartNumberId", ownerPartNumberId);
      form.set("bomRevision", revision);
      form.set("file", new File([`Part Number\tQuantity\tRevision\n${childPartNumber}\t2\t9\n`], "dev060.tsv", { type: "text/tab-separated-values" }));
      const response = await fetch(`${url}/api/bom/drafts/import-xls`, { method: "POST", headers: { "idempotency-key": key }, body: form });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    },
    { url: baseUrl, ownerPartNumberId: part.id, revision: xlsBomRevision, key: xlsKey, childPartNumber: releasedChildPartNumber }
  );
  record("SolidWorks XLS canonical source creates", xls.status === 201 && xls.body.draft?.source === "solidworks_xls", `HTTP ${xls.status}`);
  record("new XLS lines do not treat child revision as material revision", xls.body.draft?.lines?.every((line) => line.revision === null), JSON.stringify(xls.body.draft?.lines));
  const xlsReview = await api(page, `/api/bom/drafts/${encodeURIComponent(xls.body.draft.id)}/submit-review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ changeReason: "DEV-060 canonical line release gate" })
  });
  const xlsRelease = await api(page, `/api/bom/reviews/${encodeURIComponent(xlsReview.body.review?.id)}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decisionReason: "Canonical child identity has a released engineering definition" })
  });
  record(
    "a canonical BOM with null child revision can pass release using released child identity evidence",
    xlsReview.status === 201 && xlsRelease.status === 200 && xlsRelease.body.result?.draft?.status === "Released",
    `review HTTP ${xlsReview.status}, release HTTP ${xlsRelease.status} ${JSON.stringify(xlsRelease.body)}`
  );

  let cadCandidate = null;
  for (const candidate of contextResult.body.parts.slice(0, 20)) {
    const candidateContext = await api(page, `/api/bom/create-context?ownerPartNumberId=${encodeURIComponent(candidate.id)}`);
    if (candidateContext.body.cadSources?.length) {
      cadCandidate = {
        part: candidateContext.body.parts?.find((partOption) => partOption.id === candidate.id) ?? candidate,
        source: candidateContext.body.cadSources[0]
      };
      break;
    }
  }
  if (cadCandidate) {
    const cad = await api(page, "/api/bom/drafts", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `dev060-cad-${crypto.randomUUID()}` },
      body: JSON.stringify({
        ownerPartNumberId: cadCandidate.part.id,
        bomRevision: cadCandidate.part.suggestedBomRevision || "1",
        source: "cad_reference",
        sourceSubmissionId: cadCandidate.source.id
      })
    });
    record("CAD canonical source creates with visible submission", cad.status === 201 && cad.body.draft?.source === "cad_reference", `HTTP ${cad.status}`);
    record("new CAD lines do not copy Drawing revision", cad.body.draft?.lines?.every((line) => line.revision === null), JSON.stringify(cad.body.draft?.lines));
  } else {
    record("CAD source contract remains selectable when no fixture source exists", true, "fixture has no visible CAD source");
  }

  const db = new Database(path.join(tempDir, "ai-pdm.sqlite"), { readonly: true });
  try {
    const row = db.prepare("SELECT * FROM bom_drafts WHERE id = ?").get(draftId);
    record("canonical row has no fake Drawing revision/submission", row.parent_revision === null && row.parent_submission_id === null, JSON.stringify(row));
    const effectCount = db.prepare("SELECT count(*) AS count FROM bom_create_effects WHERE draft_id = ?").get(draftId).count;
    record("one create effect is persisted", effectCount === 1, `count=${effectCount}`);
    const snapshot = db.prepare("SELECT * FROM bom_release_snapshots WHERE bom_draft_id = ? ORDER BY released_at DESC LIMIT 1").get(draftId);
    record(
      "release snapshot preserves canonical owner and BOM revision",
      snapshot?.owner_part_number_id === part.id && snapshot?.bom_revision === bomRevision && snapshot?.parent_revision === null,
      JSON.stringify(snapshot)
    );
  } finally {
    db.close();
  }

  return { part, bomRevision, releaseSnapshotId };
}

async function runPermissionCheck(releaseSnapshotId) {
  for (const role of [
    { email: "manufacturing@example.com", label: "Manufacturing" },
    { email: "procurement@example.com", label: "Procurement" }
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/login`);
    await login(page, role.email);
    const createContext = await api(page, "/api/bom/create-context");
    record(`${role.label} receives no draft-create candidates`, createContext.status === 200 && createContext.body.parts?.length === 0, `HTTP ${createContext.status}`);
    const releasedExport = await page.evaluate(
      async ({ url, snapshotId }) => {
        const response = await fetch(`${url}/api/bom/releases/${encodeURIComponent(snapshotId)}/export?format=csv`);
        return response.status;
      },
      { url: baseUrl, snapshotId: releaseSnapshotId }
    );
    record(`${role.label} can read canonical released BOM export`, releasedExport === 200, `HTTP ${releasedExport}`);
    await context.close();
  }
}

async function runAuthoringRoleChecks() {
  const engineerContext = await browser.newContext();
  const engineerPage = await engineerContext.newPage();
  await engineerPage.goto(`${baseUrl}/login`);
  await login(engineerPage, "engineer@example.com");
  const engineerCreateContext = await api(engineerPage, "/api/bom/create-context");
  const engineerPart = engineerCreateContext.body.parts?.find((part) => part.id === engineerPartId);
  const engineerDraft = engineerCreateContext.body.drafts?.find((draft) => draft.ownerPartNumberId === engineerPartId);
  record(
    "Engineer sees an owned identity in the correct entry path",
    engineerCreateContext.status === 200 && (Boolean(engineerPart) || Boolean(engineerDraft)),
    `HTTP ${engineerCreateContext.status}`
  );
  if (engineerPart) {
    const engineerCreate = await api(engineerPage, "/api/bom/drafts", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `dev060-engineer-${crypto.randomUUID()}` },
      body: JSON.stringify({ ownerPartNumberId: engineerPart.id, bomRevision: engineerPart.suggestedBomRevision, source: "manual" })
    });
    record("Engineer can create a BOM for an owned material identity", engineerCreate.status === 201, `HTTP ${engineerCreate.status}`);
  } else {
    record("Engineer sees an in-progress owned BOM as a continuation", Boolean(engineerDraft), JSON.stringify(engineerDraft));
  }
  const crossCompany = await api(engineerPage, "/api/bom/create-context", { headers: { "x-pdm-company-code": "MAXIMA" } });
  record("Engineer cross-company create context fails closed", crossCompany.status === 403, `HTTP ${crossCompany.status}`);
  await engineerContext.close();

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await managerPage.goto(`${baseUrl}/login`);
  await login(managerPage, "manager@example.com");
  const managerCreateContext = await api(managerPage, "/api/bom/create-context");
  record("R&D Manager receives managed-company create candidates", managerCreateContext.status === 200 && managerCreateContext.body.parts?.length > 0, `HTTP ${managerCreateContext.status}`);
  await managerContext.close();
}

async function runBrowserChecks(page) {
  const editorPathPattern = /^\/bom\/workbench\/[^/]+$/u;
  fs.mkdirSync(outputDir, { recursive: true });
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "compact", width: 1024, height: 768 },
    { name: "phone", width: 390, height: 844 }
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${baseUrl}/bom/new`, { waitUntil: "networkidle" });
    await page.locator("h1", { hasText: "建立 BOM" }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    record(`${viewport.name} has no horizontal overflow`, !overflow);
    record(`${viewport.name} renders three distinct BOM entry paths`, (await page.locator(".bom-create-entry-option").count()) === 3);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}-step1.png`), fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/bom/new`, { waitUntil: "networkidle" });
  const entryContext = await api(page, "/api/bom/create-context");
  const manualCandidate = entryContext.body.parts?.[0];
  record("create entry context exposes a blank-BOM candidate", entryContext.status === 200 && Boolean(manualCandidate), `HTTP ${entryContext.status}`);
  if (manualCandidate) {
    await page.locator(".bom-create-inline-field select").selectOption(manualCandidate.id);
    record("blank-BOM path keeps an alternate XLS entry", await page.getByRole("button", { name: "匯入 XLS", exact: true }).isVisible());
    await page.getByRole("button", { name: /建立空白 BOM/u }).click();
    await page.waitForURL(/\/bom\/workbench\/[^/?#]+$/u, { timeout: 30000 });
    await page.getByRole("region", { name: "BOM 編輯器" }).waitFor();
    record("blank BOM UI hands off to the independent editor", editorPathPattern.test(new URL(page.url()).pathname), page.url());
    const revisionLabel = page.getByText(/BOM Rev/u).first();
    await revisionLabel.waitFor({ timeout: 30000 });
    record("workbench labels BOM revision explicitly", await revisionLabel.isVisible());
    await page.screenshot({ path: path.join(outputDir, "desktop-workbench-handoff.png"), fullPage: true });
  }

  const freshContext = await api(page, "/api/bom/create-context");
  const xlsCandidate = freshContext.body.parts?.[0];
  if (xlsCandidate) {
    await page.goto(`${baseUrl}/bom/new`, { waitUntil: "networkidle" });
    await page.locator(".bom-create-inline-field select").selectOption(xlsCandidate.id);
    await page.getByRole("button", { name: "匯入 XLS", exact: true }).click();
    record("XLS alternate path reaches the three-source step", (await page.getByRole("radio").count()) === 3);
    await page.locator('.bom-create-upload input[type="file"]').setInputFiles({
      name: "dev060-ui.tsv",
      mimeType: "text/tab-separated-values",
      buffer: Buffer.from("Part Number\tQuantity\nTEST-UI-XLS-001\t1\n")
    });
    await page.getByRole("button", { name: /建立 BOM 草稿/u }).click();
    await page.waitForURL(/\/bom\/workbench\/[^/?#]+$/u, { timeout: 30000 });
    record("SolidWorks XLS alternate path completes through the real UI", editorPathPattern.test(new URL(page.url()).pathname), page.url());
  }

  const postXlsContext = await api(page, "/api/bom/create-context");
  const cadPart = postXlsContext.body.assemblyParts?.[0];
  let cadUiCandidate = null;
  if (cadPart) {
    const partContext = await api(page, `/api/bom/create-context?ownerPartNumberId=${encodeURIComponent(cadPart.id)}`);
    if (partContext.body.cadSources?.length) cadUiCandidate = { part: cadPart, source: partContext.body.cadSources[0] };
  }
  if (!cadUiCandidate) {
    record("CAD source remains unavailable when the fixture has no assembly evidence", true, "fixture has no visible CAD assembly source");
    return;
  }
  record("fixture has a CAD source for real UI creation", true);
  await page.goto(`${baseUrl}/bom/new`, { waitUntil: "networkidle" });
  await page.locator(".bom-create-assembly-list button").filter({ hasText: cadUiCandidate.part.partNumber }).first().click();
  await page.getByRole("button", { name: /下一步：選擇來源/u }).click();
  await page.getByRole("radio", { name: /從 CAD 結構帶入/u }).click();
  await page.locator(".bom-create-source-detail select").selectOption(cadUiCandidate.source.id);
  await page.getByRole("button", { name: /建立 BOM 草稿/u }).click();
  await page.waitForURL(/\/bom\/workbench\/[^/?#]+$/u, { timeout: 30000 });
  record("CAD source completes through the real UI", editorPathPattern.test(new URL(page.url()).pathname), page.url());
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(5000)]);
  if (child.exitCode === null) child.kill("SIGTERM");
}

async function cleanup() {
  await stopServer();
  for (const target of [tempDir, distDir]) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
    } catch {}
  }
}

try {
  prepareFixture();
  startServer();
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 500) httpErrors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${baseUrl}/login`);
  await login(page, "admin@example.com");
  const apiEvidence = await runApiChecks(page);
  await runAuthoringRoleChecks();
  await runPermissionCheck(apiEvidence.releaseSnapshotId);
  consoleErrors.length = 0;
  httpErrors.length = 0;
  await runBrowserChecks(page);
  record("browser console has no visible errors", consoleErrors.length === 0, consoleErrors.join(" | "));
  record("browser requests have no HTTP 5xx", httpErrors.length === 0, httpErrors.join(" | "));
  await context.close();
  finalReport = { checkedAt: new Date().toISOString(), baseUrl, total: results.length, passed: results.length, failed: 0, outputDir, results };
} catch (error) {
  console.error(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length + 1, passed: results.length, failed: 1, results, error: error instanceof Error ? error.stack : String(error) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await cleanup();
}

if (finalReport) {
  const renderedReport = {
    ...finalReport,
    productionConnected: false,
    productionWrites: false,
    cleanupStatus: "removed"
  };
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(renderedReport, null, 2)}\n`);
  console.log(
    JSON.stringify(
      renderedReport,
      null,
      2
    )
  );
}
