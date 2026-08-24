#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const sourceDb = path.join(root, "data", "ai-pdm.sqlite");
const sourceRepository = path.join(root, "data", "repository");
const runId = `DEV093-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-093", runId);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev093-browser-"));
const fixtureData = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureData, "ai-pdm.sqlite");
const fixtureRepository = path.join(fixtureData, "repository");
const checks = [];
const responseLedger = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const envKeys = [
  "NODE_ENV", "PDM_AUTH_MODE", "PDM_DB_PROVIDER", "PDM_DATA_DIR", "PDM_REPOSITORY_DIR", "PDM_RELEASE_MODE",
  "PDM_LOCAL_FULL_FUNCTION_VALIDATION", "PDM_ENABLE_LOCAL_QUICK_LOGIN", "PDM_PRODUCTION_SLICE_MODE",
  "PDM_POSTGRES_URL", "DATABASE_URL", "PDM_NEXT_DIST_DIR", "PDM_PUBLIC_BASE_URL", "PDM_BUILD_COMMIT"
];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
let app = null;
let browser = null;
let baseUrl = "";
let port = null;

function check(id, passed, detail = "") {
  const row = { id, passed: Boolean(passed), detail };
  checks.push(row);
  if (!passed) throw new Error(`${id}: ${detail}`);
}

function restoreEnvironment() {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function monitor(page, label) {
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push({ label, message: message.text() }); });
  page.on("pageerror", (error) => pageErrors.push({ label, message: error.message }));
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "unknown";
    if (error !== "net::ERR_ABORTED") failedRequests.push({ label, url: request.url(), error });
  });
  page.on("response", (response) => responseLedger.push({ label, status: response.status(), url: response.url() }));
}

function tableCount(db, table) {
  try { return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count); }
  catch { return 0; }
}

function domainSnapshot() {
  const db = new Database(fixtureDb, { readonly: true });
  const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  const rows = {
    roots: count("part_roots"), parts: count("part_numbers"), drawings: count("drawing_numbers"), links: count("drawing_part_links"),
    partFormalStates: Number(db.prepare("SELECT COUNT(*) AS count FROM canonical_workbench_states WHERE entity_type = 'part' AND data_layer = 'part_formal'").get().count),
    initialDrawingWorks: Number(db.prepare(`SELECT COUNT(*) AS count
      FROM canonical_workbench_states state
      JOIN drawing_revisions revision ON revision.id = state.revision_id
      JOIN drawing_revision_works work ON work.id = state.work_id
      JOIN drawing_revision_claims claim ON claim.id = work.target_claim_id
      WHERE state.entity_type = 'drawing' AND state.data_layer = 'drawing_rd' AND state.handling = 'owner'
        AND revision.revision = '0.1' AND revision.lifecycle_state = 'preparing'
        AND claim.target_major = 0 AND claim.target_minor = 1 AND claim.predecessor_revision_id IS NULL`).get().count),
    candidates: tableCount(db, "number_candidate_reservations"), recovery: tableCount(db, "numbering_recovery_reservations")
  };
  db.close();
  return rows;
}

function dbRows(sql, params = {}) {
  const db = new Database(fixtureDb, { readonly: true });
  const rows = db.prepare(sql).all(params);
  db.close();
  return rows;
}

function expectedWorkbenchCommit() {
  const db = new Database(fixtureDb, { readonly: true });
  const row = db.prepare("SELECT mode, expected_commit, schema_hash FROM pdm_workbench_state_authority_control WHERE id = 1").get();
  db.close();
  if (!row || row.mode !== "canonical_only" || !String(row.expected_commit ?? "").trim()) {
    throw new Error(`DEV-093 fixture is not canonical-only: ${JSON.stringify(row ?? null)}`);
  }
  return String(row.expected_commit).trim();
}

function findRoot(coreName) {
  return dbRows("SELECT id, root_code, core_name, record_status FROM part_roots WHERE company_id = :companyId AND core_name = :coreName ORDER BY created_at DESC LIMIT 1", { companyId: "company-jenfu", coreName })[0] ?? null;
}

function findPart(partName, rootId) {
  return dbRows("SELECT id, part_number, part_root_id, part_name, item_kind, series_code, is_universal, universal_reason, custom_specification, record_status FROM part_numbers WHERE company_id = :companyId AND part_root_id = :rootId AND part_name = :partName ORDER BY created_at DESC LIMIT 1", { companyId: "company-jenfu", rootId, partName })[0] ?? null;
}

function findDrawing(rootId, purposeCode, createdBy = "user-admin-local-quick") {
  return dbRows("SELECT id, drawing_number, part_root_id, purpose_code, record_status FROM drawing_numbers WHERE company_id = :companyId AND part_root_id = :rootId AND purpose_code = :purposeCode AND created_by = :createdBy ORDER BY created_at DESC LIMIT 1", { companyId: "company-jenfu", rootId, purposeCode, createdBy })[0] ?? null;
}

function linkFor(drawingId, partId) {
  return dbRows("SELECT id, link_type FROM drawing_part_links WHERE drawing_number_id = :drawingId AND part_number_id = :partId", { drawingId, partId })[0] ?? null;
}

function partWorkbenchState(partId) {
  return dbRows(
    `SELECT state.data_layer, state.handling, state.branch_id, state.revision_id, state.work_id,
            aggregate.open_branch_count
     FROM canonical_workbench_states state
     JOIN pdm_workbench_aggregates aggregate
       ON aggregate.company_id = state.company_id
      AND aggregate.entity_type = state.entity_type
      AND aggregate.canonical_entity_id = state.canonical_entity_id
     WHERE state.company_id = :companyId AND state.entity_type = 'part'
       AND state.canonical_entity_id = :partId`,
    { companyId: "company-jenfu", partId },
  )[0] ?? null;
}

function drawingInitialWorkState(drawingNumberId) {
  return dbRows(
    `SELECT state.data_layer, state.handling, state.work_id, state.branch_id, state.revision_id,
            aggregate.open_branch_count, revision.revision, revision.lifecycle_state,
            claim.target_major, claim.target_minor, claim.target_label, claim.predecessor_revision_id,
            branch.base_production_revision_id, branch.latest_approved_revision_id, branch.status AS branch_status,
            work.owner_user_id
     FROM drawing_numbers number
     JOIN drawings drawing
       ON drawing.company_id = number.company_id AND drawing.formal_drawing_number_id = number.id
     JOIN canonical_workbench_states state
       ON state.company_id = drawing.company_id AND state.entity_type = 'drawing'
      AND state.canonical_entity_id = drawing.id
     JOIN pdm_workbench_aggregates aggregate
       ON aggregate.company_id = state.company_id AND aggregate.entity_type = state.entity_type
      AND aggregate.canonical_entity_id = state.canonical_entity_id
     JOIN drawing_revisions revision ON revision.id = state.revision_id
     JOIN drawing_rd_branches branch ON branch.id = state.branch_id
     JOIN drawing_revision_works work ON work.id = state.work_id
     JOIN drawing_revision_claims claim ON claim.id = work.target_claim_id
     WHERE number.company_id = :companyId AND number.id = :drawingNumberId`,
    { companyId: "company-jenfu", drawingNumberId },
  )[0] ?? null;
}

function isCanonicalInitialPartState(state) {
  return Boolean(state && state.data_layer === "part_formal" && state.handling === "none" && state.branch_id === null && state.revision_id === null && state.work_id === null && state.open_branch_count === 0);
}

function isCanonicalInitialDrawingState(state) {
  return Boolean(state && state.data_layer === "drawing_rd" && state.handling === "owner" && state.open_branch_count === 1 && state.revision === "0.1" && state.lifecycle_state === "preparing" && state.target_major === 0 && state.target_minor === 1 && state.target_label === "0.1" && state.predecessor_revision_id === null && state.base_production_revision_id === null && state.latest_approved_revision_id === null && state.branch_status === "open" && state.owner_user_id === "user-admin-local-quick");
}

function receiptCount(keys) {
  if (!keys.length) return 0;
  const db = new Database(fixtureDb, { readonly: true });
  const placeholders = keys.map(() => "?").join(",");
  const count = Number(db.prepare(`SELECT COUNT(*) AS count FROM platform_command_receipts WHERE idempotency_key IN (${placeholders})`).get(...keys).count);
  db.close();
  return count;
}

async function login(context) {
  const response = await context.request.post(`${baseUrl}/api/auth/local-quick-login`, { data: { role: "Admin" } });
  check("QA-093-000", response.status() === 200, `quick login status=${response.status()}`);
}

async function createPage(context, from, rootCode = "") {
  const params = new URLSearchParams({ from });
  if (rootCode) params.set("root", rootCode);
  const page = await context.newPage();
  monitor(page, `${from}:${rootCode || "new"}`);
  await page.goto(`${baseUrl}/numbering/create?${params.toString()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "建立編號", exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
  return page;
}

async function submitCreate(page, {
  coreName,
  content = null,
  purpose = null,
  itemKind = "manufactured",
  seriesCode = "",
  feature = "",
  serialIdentifier = "",
  brand = "",
  specificationModel = "",
  existingSpecification = "",
  includeReferenceDrawing = false,
  referencePurpose = "",
  isUniversal = false,
  confirmedName = "",
  doubleClick = false,
  label,
}) {
  const requestKeys = [];
  const requestBodies = [];
  const requestHandler = (request) => {
    if (request.method() !== "POST" || !request.url().includes("/api/numbering/")) return;
    const key = request.headers()["idempotency-key"];
    if (key) requestKeys.push(key);
    if (!request.url().includes("duplicate-check")) {
      try { requestBodies.push({ url: request.url(), body: request.postDataJSON() }); }
      catch { requestBodies.push({ url: request.url(), body: null }); }
    }
  };
  page.on("request", requestHandler);
  if (content && await page.getByLabel(content, { exact: true }).count()) await page.getByLabel(content, { exact: true }).check();
  if (await page.getByLabel("主要名詞", { exact: true }).count()) {
    await page.getByLabel("料件類型").selectOption(itemKind);
    if (includeReferenceDrawing) await page.getByLabel("同時建立參考圖 R", { exact: true }).check();
    await page.getByLabel("主要名詞", { exact: true }).fill(coreName);
    if (seriesCode && await page.getByLabel("系列代號（選填）", { exact: true }).count()) await page.getByLabel("系列代號（選填）", { exact: true }).fill(seriesCode);
    if (feature && await page.getByLabel("規格／特性（選填）", { exact: true }).count()) await page.getByLabel("規格／特性（選填）", { exact: true }).fill(feature);
    if (serialIdentifier && await page.getByLabel("流水識別（選填）", { exact: true }).count()) await page.getByLabel("流水識別（選填）", { exact: true }).fill(serialIdentifier);
    if (brand && await page.getByLabel("品牌（選填）", { exact: true }).count()) await page.getByLabel("品牌（選填）", { exact: true }).fill(brand);
    if (specificationModel && await page.getByLabel("規格／型號（選填）", { exact: true }).count()) await page.getByLabel("規格／型號（選填）", { exact: true }).fill(specificationModel);
    if (isUniversal) {
      await page.getByLabel("共用件", { exact: true }).check();
    }
    await page.getByRole("button", { name: "套用建議品名", exact: true }).click();
    if (confirmedName) await page.getByLabel("確定品名", { exact: true }).fill(confirmedName);
  } else {
    await page.locator('.canonical-create-readonly').first().waitFor({ state: "visible", timeout: 30000 });
    if (existingSpecification && await page.getByLabel("規格／特性（選填）", { exact: true }).count()) await page.getByLabel("規格／特性（選填）", { exact: true }).fill(existingSpecification);
  }
  if (purpose && await page.getByLabel("圖面用途").count()) await page.getByLabel("圖面用途").selectOption(purpose);
  if (referencePurpose && await page.getByLabel("參考圖用途", { exact: true }).count()) await page.getByLabel("參考圖用途", { exact: true }).fill(referencePurpose);
  if (!(await page.getByLabel("主要名詞", { exact: true }).count())) {
    await page.locator(".canonical-create-number-list").waitFor({ state: "visible", timeout: 30000 });
  }
  await page.waitForTimeout(550);
  const submit = page.getByRole("button", { name: "建立編號", exact: true });
  check(`${label}-single-primary`, await submit.count() === 1, "one primary submit action");
  if (!(await submit.isEnabled())) {
    throw new Error(`submit disabled; body=${(await page.locator("body").innerText()).slice(-1200)}`);
  }
  if (doubleClick) await submit.dblclick({ delay: 25 });
  else await submit.click();
  try {
    await page.getByRole("heading", { name: "編號已建立", exact: true }).waitFor({ state: "visible", timeout: 30000 });
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}; button=${await submit.evaluate((element) => element.outerHTML)}; tail=${(await page.locator("body").innerText()).slice(-1400)}`);
  }
  const href = await page.getByRole("link", { name: "查看建立結果", exact: true }).getAttribute("href");
  page.off("request", requestHandler);
  return { href: href ?? "", requestKeys: [...new Set(requestKeys)], requestBodies, text: await page.locator(".canonical-create-result").innerText() };
}

async function runRound(round) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(context);
  const suffix = `${Date.now()}_${round}`;
  const created = {};
  try {
    const beforeInvalidMatrix = domainSnapshot();
    const invalidMatrix = [
      { label: "manufactured-part", body: { coreName: `INVALID_M_PART_${suffix}`, itemKind: "manufactured", drawingRequested: false } },
      { label: "manufactured-reference", body: { coreName: `INVALID_M_R_${suffix}`, itemKind: "manufactured", drawingRequested: true, drawingPurposeCode: "R", drawingPurposeDescription: "不合法組合" } },
      { label: "purchased-manufacturing", body: { coreName: `INVALID_P_M_${suffix}`, itemKind: "purchased", drawingRequested: true, drawingPurposeCode: "M" } },
    ];
    for (const invalid of invalidMatrix) {
      const response = await context.request.post(`${baseUrl}/api/numbering/records`, {
        data: invalid.body,
        headers: { "Idempotency-Key": `qa-093-invalid-${invalid.label}-${suffix}` },
      });
      check(`QA-093-103-${invalid.label}-r${round}`, response.status() === 400, `status=${response.status()} body=${await response.text()}`);
    }
    check(`QA-093-103-delta-r${round}`, JSON.stringify(domainSnapshot()) === JSON.stringify(beforeInvalidMatrix), "invalid new-root combinations leave every canonical count unchanged");

    const newPartNoun = `DEV093_UI_NEW_PART_${suffix}`;
    const newPartName = `${newPartNoun}_JF_伺服_400W_A`;
    const newPartPage = await createPage(context, "part");
    check(`QA-093-100-ui-r${round}`, await newPartPage.getByText("建立內容", { exact: true }).count() === 0, "new-root UI has no redundant content chooser");
    const itemKindOptions = await newPartPage.getByLabel("料件類型").evaluate((select) =>
      Array.from(select.options).map((option) => option.textContent?.trim() ?? ""),
    );
    check(
      `QA-093-009-r${round}`,
      itemKindOptions.length === 2 &&
        itemKindOptions.includes("依圖製作件") &&
        itemKindOptions.includes("外購標準件") &&
        !itemKindOptions.some((label) => ["自製件", "外購件", "委外件", "共用件"].includes(label)),
      `item kind options=${itemKindOptions.join(" / ")}`,
    );
    const checkboxBox = await newPartPage.getByLabel("共用件", { exact: true }).boundingBox();
    check(`QA-093-094-r${round}`, Boolean(checkboxBox && checkboxBox.width <= 24 && checkboxBox.height <= 24), `checkbox=${JSON.stringify(checkboxBox)}`);
    const itemKindBox = await newPartPage.getByLabel("料件類型").boundingBox();
    const seriesBox = await newPartPage.getByLabel("系列代號（選填）", { exact: true }).boundingBox();
    const primaryNounBox = await newPartPage.getByLabel("主要名詞", { exact: true }).boundingBox();
    check(
      `QA-093-098-order-r${round}`,
      Boolean(itemKindBox && seriesBox && primaryNounBox && Math.max(itemKindBox.y, seriesBox.y) < primaryNounBox.y),
      `itemKind=${JSON.stringify(itemKindBox)} series=${JSON.stringify(seriesBox)} primaryNoun=${JSON.stringify(primaryNounBox)}`,
    );
    await newPartPage.getByLabel("系列代號（選填）", { exact: true }).fill("JF");
    check(`QA-093-098-gate-r${round}`, (await newPartPage.locator(".canonical-create-suggestion strong").innerText()) === "—", "no partial suggestion before primary noun");
    await newPartPage.getByLabel("主要名詞", { exact: true }).fill(" 馬達 ");
    await newPartPage.getByLabel("規格／特性（選填）", { exact: true }).fill("伺服  400W");
    await newPartPage.getByLabel("流水識別（選填）", { exact: true }).fill("A");
    const unifiedSpecificationBox = await newPartPage.getByLabel("規格／特性（選填）", { exact: true }).boundingBox();
    const suggestionBeforeSubmitBox = await newPartPage.locator(".canonical-create-suggestion").boundingBox();
    check(`QA-093-105-layout-r${round}`, Boolean(primaryNounBox && unifiedSpecificationBox && suggestionBeforeSubmitBox && primaryNounBox.y < unifiedSpecificationBox.y && unifiedSpecificationBox.y < suggestionBeforeSubmitBox.y), `primary=${JSON.stringify(primaryNounBox)} specification=${JSON.stringify(unifiedSpecificationBox)} suggestion=${JSON.stringify(suggestionBeforeSubmitBox)}`);
    check(`QA-093-074-r${round}`, (await newPartPage.locator(".canonical-create-suggestion strong").innerText()) === "馬達_JF_伺服_400W_A", "manufactured suggestion formula");
    const noSimilarName = newPartPage.getByText("未找到相似品名。", { exact: true });
    await noSimilarName.waitFor({ state: "visible", timeout: 30000 });
    const suggestionBox = await newPartPage.locator(".canonical-create-suggestion").boundingBox();
    const noSimilarNameBox = await noSimilarName.boundingBox();
    check(`QA-093-099-r${round}`, Boolean(suggestionBox && noSimilarNameBox && noSimilarNameBox.y >= suggestionBox.y && noSimilarNameBox.y <= suggestionBox.y + suggestionBox.height), `suggestion=${JSON.stringify(suggestionBox)} noSimilar=${JSON.stringify(noSimilarNameBox)}`);
    await newPartPage.screenshot({ path: path.join(outputDir, `new-root-naming-round-${round}.png`), fullPage: true });
    await newPartPage.getByLabel("主要名詞", { exact: true }).fill("");
    await newPartPage.getByLabel("系列代號（選填）", { exact: true }).fill("");
    await newPartPage.getByLabel("規格／特性（選填）", { exact: true }).fill("");
    await newPartPage.getByLabel("流水識別（選填）", { exact: true }).fill("");
    const beforeNewPart = domainSnapshot();
    const newPartResult = await submitCreate(newPartPage, { coreName: newPartNoun, seriesCode: "JF", feature: "伺服 400W", serialIdentifier: "A", doubleClick: true, label: `QA-093-013-r${round}` });
    created.newPart = findRoot(newPartName);
    const createdNewPart = created.newPart && findPart(newPartName, created.newPart.id);
    const createdManufacturingDrawing = created.newPart && findDrawing(created.newPart.id, "M");
    check(`QA-093-013-r${round}`, Boolean(created.newPart && createdNewPart && createdManufacturingDrawing && linkFor(createdManufacturingDrawing.id, createdNewPart.id)?.link_type === "primary_manufacturing"), `${newPartResult.text}; href=${newPartResult.href}`);
    check(`QA-093-096-r${round}`, isCanonicalInitialPartState(createdNewPart && partWorkbenchState(createdNewPart.id)), "new part and part_formal workbench state commit atomically");
    check(`QA-093-100-state-r${round}`, isCanonicalInitialDrawingState(createdManufacturingDrawing && drawingInitialWorkState(createdManufacturingDrawing.id)), "manufactured new root automatically creates M drawing 0.1 work");
    check(`QA-093-080-r${round}`, Boolean(createdNewPart?.series_code === "JF" && newPartResult.requestBodies[0]?.body?.seriesCode === "JF"), `series db=${createdNewPart?.series_code}; request=${JSON.stringify(newPartResult.requestBodies[0]?.body)}`);
    check(`QA-093-105-manufactured-r${round}`, Boolean(createdNewPart?.custom_specification === "伺服 400W" && newPartResult.requestBodies[0]?.body?.customSpecification === "伺服 400W"), `db=${createdNewPart?.custom_specification}; request=${JSON.stringify(newPartResult.requestBodies[0]?.body)}`);
    const partWorkbenchPage = await context.newPage();
    monitor(partWorkbenchPage, `part-workbench:${createdNewPart?.part_number ?? "missing"}`);
    const partWorkbenchApiPromise = partWorkbenchPage.waitForResponse((response) => response.url().includes("/api/parts/workbench"), { timeout: 30000 });
    const partWorkbenchNavigation = await partWorkbenchPage.goto(`${baseUrl}${newPartResult.href}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (!partWorkbenchNavigation?.ok()) throw new Error(`part workbench page status=${partWorkbenchNavigation?.status()}`);
    const partWorkbenchApi = await partWorkbenchApiPromise;
    if (!partWorkbenchApi.ok()) throw new Error(`part workbench API status=${partWorkbenchApi.status()} body=${await partWorkbenchApi.text()}`);
    await partWorkbenchPage.getByText(newPartName, { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
    check(`QA-093-079-r${round}`, await partWorkbenchPage.getByText(createdNewPart?.part_number ?? "__missing__", { exact: true }).count() > 0, "DB identity and part workbench UI agree");
    await partWorkbenchPage.close();
    const afterNewPart = domainSnapshot();
    check(`QA-093-036-r${round}`, newPartResult.requestKeys.length === 1 && afterNewPart.roots === beforeNewPart.roots + 1 && afterNewPart.parts === beforeNewPart.parts + 1 && afterNewPart.drawings === beforeNewPart.drawings + 1 && afterNewPart.links === beforeNewPart.links + 1, `requests=${newPartResult.requestKeys.length}; before=${JSON.stringify(beforeNewPart)} after=${JSON.stringify(afterNewPart)}`);
    check(`QA-093-037-r${round}`, receiptCount(newPartResult.requestKeys) === 1, "exactly one command receipt for double click");
    await newPartPage.close();

    const purchasedNoun = `DEV093_UI_PURCHASED_${suffix}`;
    const purchasedName = `${purchasedNoun}_東元_1HP_4P_220VAC`;
    const purchasedPage = await createPage(context, "part");
    const beforePurchased = domainSnapshot();
    const purchasedResult = await submitCreate(purchasedPage, { coreName: purchasedNoun, itemKind: "purchased", brand: "東元", specificationModel: "1HP 4P 220VAC", label: `QA-093-075-r${round}` });
    const purchasedRoot = findRoot(purchasedName);
    const purchasedPart = purchasedRoot && findPart(purchasedName, purchasedRoot.id);
    const afterPurchased = domainSnapshot();
    check(`QA-093-075-r${round}`, Boolean(purchasedPart?.item_kind === "purchased" && !purchasedPart?.series_code), `${purchasedResult.text}; request=${JSON.stringify(purchasedResult.requestBodies[0]?.body)}`);
    check(`QA-093-082-r${round}`, !Object.hasOwn(purchasedResult.requestBodies[0]?.body ?? {}, "brand") && !Object.hasOwn(purchasedResult.requestBodies[0]?.body ?? {}, "seriesCode"), "brand remains naming-only and purchased payload excludes hidden series value");
    check(`QA-093-105-purchased-r${round}`, Boolean(purchasedPart?.custom_specification === "1HP 4P 220VAC" && purchasedResult.requestBodies[0]?.body?.customSpecification === "1HP 4P 220VAC"), `db=${purchasedPart?.custom_specification}; request=${JSON.stringify(purchasedResult.requestBodies[0]?.body)}`);
    check(`QA-093-101-r${round}`, Boolean(purchasedRoot && afterPurchased.roots === beforePurchased.roots + 1 && afterPurchased.parts === beforePurchased.parts + 1 && afterPurchased.drawings === beforePurchased.drawings && purchasedResult.requestBodies[0]?.body?.drawingRequested === false), "purchased new root creates part only by default");
    await purchasedPage.close();

    const purchasedReferenceNoun = `DEV093_UI_PURCHASED_REFERENCE_${suffix}`;
    const purchasedReferenceName = `${purchasedReferenceNoun}_台達_VFD-E`;
    const purchasedReferencePage = await createPage(context, "part");
    await purchasedReferencePage.getByLabel("料件類型").selectOption("purchased");
    check(`QA-093-102-hidden-r${round}`, await purchasedReferencePage.getByLabel("參考圖用途", { exact: true }).count() === 0, "reference purpose is hidden before opting in");
    await purchasedReferencePage.getByLabel("同時建立參考圖 R", { exact: true }).check();
    check(`QA-093-102-visible-r${round}`, await purchasedReferencePage.getByLabel("參考圖用途", { exact: true }).count() === 1, "reference purpose appears only after opting in");
    await purchasedReferencePage.screenshot({ path: path.join(outputDir, `purchased-reference-round-${round}.png`), fullPage: true });
    const beforePurchasedReference = domainSnapshot();
    const purchasedReferenceResult = await submitCreate(purchasedReferencePage, {
      coreName: purchasedReferenceNoun,
      itemKind: "purchased",
      brand: "台達",
      specificationModel: "VFD-E",
      includeReferenceDrawing: true,
      referencePurpose: "安裝尺寸參考",
      label: `QA-093-102-r${round}`,
    });
    const purchasedReferenceRoot = findRoot(purchasedReferenceName);
    const purchasedReferencePart = purchasedReferenceRoot && findPart(purchasedReferenceName, purchasedReferenceRoot.id);
    const purchasedReferenceDrawing = purchasedReferenceRoot && findDrawing(purchasedReferenceRoot.id, "R");
    const afterPurchasedReference = domainSnapshot();
    check(`QA-093-102-r${round}`, Boolean(
      purchasedReferenceRoot && purchasedReferencePart && purchasedReferenceDrawing &&
      linkFor(purchasedReferenceDrawing.id, purchasedReferencePart.id)?.link_type === "reference" &&
      afterPurchasedReference.roots === beforePurchasedReference.roots + 1 &&
      afterPurchasedReference.parts === beforePurchasedReference.parts + 1 &&
      afterPurchasedReference.drawings === beforePurchasedReference.drawings + 1 &&
      purchasedReferenceResult.requestBodies[0]?.body?.drawingPurposeCode === "R"
    ), `${purchasedReferenceResult.text}; request=${JSON.stringify(purchasedReferenceResult.requestBodies[0]?.body)}`);
    await purchasedReferencePage.close();

    const universalNoun = `DEV093_UI_UNIVERSAL_${suffix}`;
    const universalName = `${universalNoun}_共用規格`;
    const universalPage = await createPage(context, "part");
    check(`QA-093-106-r${round}`, await universalPage.getByLabel("共用原因", { exact: true }).count() === 0, "shared checkbox does not reveal a reason field");
    const universalResult = await submitCreate(universalPage, { coreName: universalNoun, seriesCode: "SHOULD_CLEAR", feature: "共用規格", isUniversal: true, label: `QA-093-083-r${round}` });
    const universalRoot = findRoot(universalName);
    const universalPart = universalRoot && findPart(universalName, universalRoot.id);
    check(`QA-093-083-r${round}`, Boolean(universalPart?.is_universal === 1 && !universalPart?.series_code && !Object.hasOwn(universalResult.requestBodies[0]?.body ?? {}, "universalReason") && !Object.hasOwn(universalResult.requestBodies[0]?.body ?? {}, "seriesCode")), `universal db=${JSON.stringify(universalPart)} request=${JSON.stringify(universalResult.requestBodies[0]?.body)}`);
    await universalPage.close();

    const newBundleName = `DEV093_UI_NEW_BUNDLE_${suffix}`;
    const newBundlePage = await createPage(context, "drawing");
    const beforeBundle = domainSnapshot();
    const bundleResult = await submitCreate(newBundlePage, { coreName: newBundleName, label: `QA-093-014-r${round}` });
    created.bundle = findRoot(newBundleName);
    const bundlePart = created.bundle && findPart(newBundleName, created.bundle.id);
    const bundleDrawing = created.bundle && findDrawing(created.bundle.id, "M");
    check(`QA-093-014-r${round}`, Boolean(created.bundle && bundlePart && bundleDrawing && linkFor(bundleDrawing.id, bundlePart.id)?.link_type === "primary_manufacturing"), `${bundleResult.text}; href=${bundleResult.href}`);
    check(`QA-093-097-r${round}`, isCanonicalInitialDrawingState(bundleDrawing && drawingInitialWorkState(bundleDrawing.id)), "new drawing and canonical 0.1 RD work commit atomically");
    const drawingWorkbenchPage = await context.newPage();
    monitor(drawingWorkbenchPage, `drawing-workbench:${bundleDrawing?.drawing_number ?? "missing"}`);
    const drawingWorkbenchApiPromise = drawingWorkbenchPage.waitForResponse((response) => response.url().includes("/api/numbering/drawings/workbench"), { timeout: 30000 });
    const drawingWorkbenchNavigation = await drawingWorkbenchPage.goto(`${baseUrl}${bundleResult.href}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (!drawingWorkbenchNavigation?.ok()) throw new Error(`drawing workbench page status=${drawingWorkbenchNavigation?.status()}`);
    const drawingWorkbenchApi = await drawingWorkbenchApiPromise;
    if (!drawingWorkbenchApi.ok()) throw new Error(`drawing workbench API status=${drawingWorkbenchApi.status()} body=${await drawingWorkbenchApi.text()}`);
    await drawingWorkbenchPage.getByText(newBundleName, { exact: true }).first().waitFor({ state: "visible", timeout: 30000 });
    check(`QA-093-050-r${round}`, await drawingWorkbenchPage.getByText(bundleDrawing?.drawing_number ?? "__missing__", { exact: true }).count() > 0 && await drawingWorkbenchPage.getByText("研發版 0.1", { exact: true }).count() > 0, "DB identity, initial revision and drawing workbench UI agree");
    await drawingWorkbenchPage.close();
    const afterBundle = domainSnapshot();
    check(`QA-093-041-r${round}`, Boolean(created.bundle && bundlePart && bundleDrawing && afterBundle.roots === beforeBundle.roots + 1 && afterBundle.parts === beforeBundle.parts + 1 && afterBundle.drawings === beforeBundle.drawings + 1 && afterBundle.links === beforeBundle.links + 1), "atomic new bundle delta");
    await newBundlePage.close();

    const appendRoot = purchasedRoot;
    const rootCode = appendRoot?.root_code;
    check(`QA-093-006-r${round}`, Boolean(rootCode), "new root is available for existing-root context");
    const appendPartName = `DEV093_UI_APPEND_PART_${suffix}`;
    const duplicateCallsBeforeAppend = responseLedger.filter((item) => item.url.includes("duplicate-check")).length;
    const appendPartPage = await createPage(context, "part", rootCode);
    check(`QA-093-086-ui-r${round}`, await appendPartPage.getByLabel("主要名詞", { exact: true }).count() === 0 && await appendPartPage.getByText("建議品名", { exact: true }).count() === 0, "existing root shows no naming builder");
    await appendPartPage.getByText("沿用既有料件設定", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
    const inheritedProfileText = await appendPartPage.locator('[aria-label="根號料件設定"]').innerText();
    check(`QA-093-108-r${round}`, inheritedProfileText.includes("沿用既有料件設定") && await appendPartPage.locator("select").count() === 0 && await appendPartPage.locator('input[type="checkbox"]').count() === 0 && await appendPartPage.getByLabel("系列代號（選填）", { exact: true }).count() === 0 && await appendPartPage.getByLabel("規格／特性（選填）", { exact: true }).count() === 0 && appendPartPage.url().includes(`root=${encodeURIComponent(rootCode)}`), `existing root inherited profile=${inheritedProfileText}`);
    const beforeAppendPart = domainSnapshot();
    const appendPartResult = await submitCreate(appendPartPage, { coreName: appendPartName, existingSpecification: "追加規格", label: `QA-093-021-r${round}` });
    const appendPart = rootCode && appendRoot && dbRows("SELECT id, custom_specification, series_code, is_universal FROM part_numbers WHERE part_root_id = :rootId ORDER BY created_at DESC LIMIT 1", { rootId: appendRoot.id })[0];
    const afterAppendPart = domainSnapshot();
    check(`QA-093-021-r${round}`, Boolean(appendPart && afterAppendPart.roots === beforeAppendPart.roots && afterAppendPart.parts === beforeAppendPart.parts + 1), `${appendPartResult.text}; href=${appendPartResult.href}`);
    check(`QA-093-096-append-r${round}`, isCanonicalInitialPartState(appendPart && partWorkbenchState(appendPart.id)), "appended part and part_formal workbench state commit atomically");
    check(`QA-093-105-existing-r${round}`, appendPart?.custom_specification === purchasedPart?.custom_specification && appendPartResult.requestBodies[0]?.body?.customSpecification === purchasedPart?.custom_specification && appendPartResult.requestBodies[0]?.body?.isUniversal === Boolean(purchasedPart?.is_universal), `inherited db=${appendPart?.custom_specification}; source=${purchasedPart?.custom_specification}; request=${JSON.stringify(appendPartResult.requestBodies[0]?.body)}`);
    check(`QA-093-109-r${round}`, appendPart?.custom_specification === purchasedPart?.custom_specification && appendPart?.series_code === purchasedPart?.series_code && appendPart?.is_universal === purchasedPart?.is_universal, `existing root profile source=${JSON.stringify({ isUniversal: purchasedPart?.is_universal, seriesCode: purchasedPart?.series_code, customSpecification: purchasedPart?.custom_specification })} append=${JSON.stringify(appendPart)}`);
    check(`QA-093-086-network-r${round}`, responseLedger.filter((item) => item.url.includes("duplicate-check")).length === duplicateCallsBeforeAppend, "existing root issued no self-duplicate request");
    await appendPartPage.close();

    const appendDrawingPage = await createPage(context, "drawing", rootCode);
    await appendDrawingPage.getByLabel("圖號", { exact: true }).check();
    const beforeAppendDrawing = domainSnapshot();
    const appendDrawingResult = await submitCreate(appendDrawingPage, { coreName: `DEV093_UI_APPEND_DRAWING_${suffix}`, purpose: "M", label: `QA-093-022-r${round}` });
    const appendDrawing = rootCode && appendRoot && findDrawing(appendRoot.id, "M");
    const afterAppendDrawing = domainSnapshot();
    check(`QA-093-022-r${round}`, Boolean(appendDrawing && afterAppendDrawing.drawings === beforeAppendDrawing.drawings + 1), `${appendDrawingResult.text}; href=${appendDrawingResult.href}`);
    check(`QA-093-097-append-r${round}`, isCanonicalInitialDrawingState(appendDrawing && drawingInitialWorkState(appendDrawing.id)), "appended drawing and canonical 0.1 RD work commit atomically");
    const drawingBody = appendDrawingResult.requestBodies[0]?.body ?? {};
    check(`QA-093-088-r${round}`, ["coreName", "itemKind", "isUniversal", "seriesCode", "universalReason", "customSpecification"].every((key) => !Object.hasOwn(drawingBody, key)), `drawing-only body=${JSON.stringify(drawingBody)}`);
    await appendDrawingPage.close();

    const appendBundlePage = await createPage(context, "part", rootCode);
    const beforeAppendBundle = domainSnapshot();
    const appendBundleResult = await submitCreate(appendBundlePage, { coreName: `DEV093_UI_APPEND_BUNDLE_${suffix}`, content: "圖號與料號", purpose: "M", label: `QA-093-023-r${round}` });
    const bundlePartRows = rootCode ? dbRows("SELECT id FROM part_numbers WHERE part_root_id = (SELECT id FROM part_roots WHERE root_code = :rootCode) ORDER BY created_at DESC LIMIT 8", { rootCode }) : [];
    const bundleDrawingRows = rootCode ? dbRows("SELECT id FROM drawing_numbers WHERE part_root_id = (SELECT id FROM part_roots WHERE root_code = :rootCode) ORDER BY created_at DESC LIMIT 8", { rootCode }) : [];
    const hasNewLink = bundlePartRows.some((part) => bundleDrawingRows.some((drawing) => linkFor(drawing.id, part.id)?.link_type === "primary_manufacturing"));
    const afterAppendBundle = domainSnapshot();
    check(`QA-093-023-r${round}`, Boolean(hasNewLink && afterAppendBundle.parts === beforeAppendBundle.parts + 1 && afterAppendBundle.drawings === beforeAppendBundle.drawings + 1 && afterAppendBundle.links === beforeAppendBundle.links + 1), `${appendBundleResult.text}; href=${appendBundleResult.href}`);
    await appendBundlePage.close();

    if (round === 1) {
      const narrowPage = await createPage(context, "part");
      await narrowPage.setViewportSize({ width: 320, height: 800 });
      await narrowPage.getByLabel("主要名詞", { exact: true }).fill("窄版馬達");
      const narrowCheckbox = await narrowPage.getByLabel("共用件", { exact: true }).boundingBox();
      const createPageBox = await narrowPage.locator(".canonical-create-page").boundingBox();
      check("QA-093-094-narrow", Boolean(narrowCheckbox && narrowCheckbox.width <= 24 && narrowCheckbox.height <= 24 && createPageBox && createPageBox.width <= 320), `checkbox=${JSON.stringify(narrowCheckbox)} page=${JSON.stringify(createPageBox)}`);
      await narrowPage.screenshot({ path: path.join(outputDir, "new-root-naming-320px.png"), fullPage: true });
      await narrowPage.close();
    }
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(fixtureData, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(sourceDb, fixtureDb);
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });
  const buildCommit = expectedWorkbenchCommit();
  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: fixtureData,
    PDM_REPOSITORY_DIR: fixtureRepository, PDM_RELEASE_MODE: "local_stub", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "", PDM_POSTGRES_URL: "", DATABASE_URL: "",
    PDM_NEXT_DIST_DIR: `.tmp/qc-dev093-browser-${port}`, PDM_PUBLIC_BASE_URL: baseUrl, PDM_BUILD_COMMIT: buildCommit
  });
  console.log(`QC DEV-093 runtime: project=${root}; purpose=UI-only number creation; port=${port}; owner=current QC process tree; cleanup=after two fresh-session rounds`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });
  const before = domainSnapshot();
  await runRound(1);
  await runRound(2);
  const after = domainSnapshot();
  check("QA-093-063", after.candidates === before.candidates && after.recovery === before.recovery, `reservation tables stable: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  check("QA-093-096", after.partFormalStates - before.partFormalStates === after.parts - before.parts, "every UI-created part has exactly one canonical part_formal state");
  check("QA-093-097", after.initialDrawingWorks - before.initialDrawingWorks === after.drawings - before.drawings, "every UI-created drawing has exactly one canonical 0.1 RD work state");
  check("QA-093-067", !responseLedger.some((item) => item.url.includes("draft-workspaces")), "no legacy draft workspace network caller");
  check("QA-093-068", !failedRequests.length, JSON.stringify(failedRequests));
  check("QA-093-062", !consoleErrors.length && !pageErrors.length, JSON.stringify({ consoleErrors, pageErrors }));
  const manifest = {
    task: "DEV-093", runId, provider: "sqlite", database: fixtureDb, appUrl: baseUrl, buildCommit,
    rounds: 2, before, after, checks, responseCount: responseLedger.length,
    legacyCallerCount: responseLedger.filter((item) => item.url.includes("draft-workspaces")).length,
    consoleErrors, pageErrors, failedRequests,
    note: "All domain mutations in this runner were performed through rendered UI; SQLite reads are post-operation evidence only."
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outputDir, "data-reconciliation.json"), JSON.stringify({ before, after }, null, 2));
  fs.writeFileSync(path.join(outputDir, "network.json"), JSON.stringify(responseLedger, null, 2));
  console.log(JSON.stringify({ task: "DEV-093", runId, passed: checks.every((item) => item.passed), checks, outputDir }, null, 2));
  if (checks.some((item) => !item.passed)) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (app) await stopNextApp(app.child).catch(() => undefined);
  restoreEnvironment();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
