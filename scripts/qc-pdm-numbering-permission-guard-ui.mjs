#!/usr/bin/env node
// DEV-126: real application rendering + browser-owned deterministic API fixtures.
// No demo login, real credentials, SQL mutation or production identity is used here.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

assertNumberingQcRuntimeIsIsolated({ scriptName: "DEV-126 permission projection UI" });
const base = new URL(process.env.PDM_BASE_URL || "http://localhost:12020");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname) && ["1020", "12020"].includes(base.port), "Task-owned loopback runtime required");
const source = fs.readFileSync(path.resolve("src/lib/numbering-permission-codes.ts"), "utf8");
const codes = name => [...source.match(new RegExp("export const " + name + " = \\[([\\s\\S]*?)\\] as const"))[1].matchAll(/"([^"]+)"/gu)].map(match => match[1]);
const pages = codes("NUMBERING_PAGE_PERMISSION_CODES");
const actions = codes("NUMBERING_ACTION_PERMISSION_CODES");
const output = path.resolve("output/playwright/dev126", base.port);
fs.mkdirSync(output, { recursive: true });
const git = args => execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const untracked = git(["ls-files", "--others", "--exclude-standard", "-z", "--", "src", "scripts"]).split("\0").filter(Boolean);
const sourceEvidence = { commit: git(["rev-parse", "HEAD"]).trim(),
  trackedDiffSha256: digest(git(["diff", "--binary", "HEAD", "--", "."])),
  untrackedSourceSha256: digest(untracked.map(file => `${file}:${digest(fs.readFileSync(file))}`).join("\n")) };
const results = [];
const browser = await chromium.launch({ headless: process.env.PDM_BROWSER_HEADED !== "true" });
try {
  for (const scenario of ["loading-navigation", "allow-navigation", "denied", "unavailable-retry", "unauthenticated", "transfer-denied", "transfer-403"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    let permissionRequests = 0, mutationRequests = 0, mutationRejected = false, unavailable = scenario === "unavailable-retry";
    let releaseProjection;
    const projectionReady = new Promise(resolve => { releaseProjection = resolve; });
    const exchanges = [], routeSequence = [];
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) routeSequence.push(new URL(frame.url()).pathname); });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      let status = 200, body;
      if (url.pathname === "/api/numbering/permissions") {
        permissionRequests++;
        if (scenario === "loading-navigation" && permissionRequests === 1) await projectionReady;
        status = scenario === "unauthenticated" ? 401 : unavailable ? 503 : 200;
        const allowed = !scenario.includes("denied") && !mutationRejected;
        body = status === 200 ? {
          contractVersion: "ai-pdm.frontend-permission-projection.v1", applicationId: "ai-pdm",
          generatedAt: new Date().toISOString(),
          pages: Object.fromEntries(pages.map(code => [code, allowed])),
          actions: Object.fromEntries(actions.map(code => [code, allowed]))
        } : { code: status === 401 ? "auth_session_invalid" : "principal_dependency_unavailable" };
      } else if (url.pathname === "/api/transfer-packages" && route.request().method() === "POST") {
        mutationRequests++; mutationRejected = true; status = 403;
        body = { code: "permission_not_granted", message: "DEV-126 fixture: operation denied" };
      } else if (url.pathname === "/api/transfer-packages/workbench-context") body = {
        context: { mode: "unsaved", caseType: "development_case", sourceItem: null, sourceRequested: false, sourceResolved: false }
      };
      else if (url.pathname === "/api/auth/me") body = { user: { display_name: "DEV-126 fixture A" } };
      else if (url.pathname === "/api/production-slice/status") body = { configured: false, active: false, openPagePaths: [] };
      else if (url.pathname === "/api/numbering/series-codes") body = { seriesCodeOptions: [] };
      else body = {
        data: { groups: [], rows: [], items: [], previewByRowKey: {}, nextCursor: null, previousCursor: null, filters: {} },
        meta: { contractToken: "dev126-test-fixture" }, groups: [], rows: [], items: [], summary: { pending: 0 }, filters: {}
      };
      const correlationId = `dev126-${scenario}-${exchanges.length + 1}`;
      exchanges.push({ path: url.pathname, method: route.request().method(), status, code: body.code ?? null, correlationId });
      await route.fulfill({ status, contentType: "application/json", headers: { "x-correlation-id": correlationId }, body: JSON.stringify(body) });
    });
    try {
      await page.goto(new URL(scenario.startsWith("transfer-") ? "/transfer-packages/new" : "/parts", base).href,
        { waitUntil: scenario === "loading-navigation" ? "domcontentloaded" : "networkidle" });
      if (scenario === "loading-navigation") {
        const placeholder = page.locator('[data-permission-placeholder="/parts"]');
        await placeholder.waitFor();
        assert.equal(await page.locator('a[href="/parts"]').count(), 0);
        const action = page.locator('[data-canonical-numbering-create-loading="true"]');
        await action.waitFor(); await page.evaluate(() => document.fonts.ready);
        const before = await action.boundingBox();
        releaseProjection();
        const ready = page.locator('[data-canonical-numbering-create="true"]');
        await ready.waitFor(); const after = await ready.boundingBox();
        assert.ok(before && after && Math.abs(before.height - after.height) < 1 && Math.abs(before.width - after.width) < 1, "Create action keeps its dimensions while loading");
        assert.equal(permissionRequests, 1);
      } else if (scenario === "allow-navigation") {
        await page.locator("[data-canonical-numbering-create=true]").waitFor();
        for (const route of ["/numbering/drawings", "/approvals", "/parts"]) {
          await page.locator('a[href="' + route + '"]').first().click();
          await page.waitForURL(url => url.pathname === route);
          await page.waitForLoadState("networkidle");
        }
        assert.equal(permissionRequests, 1, "Route navigation must reuse the shell projection");
        assert.equal(await page.getByText("確認權限中…", { exact: true }).count(), 0);
        await page.screenshot({ path: path.join(output, "allow-navigation.png"), fullPage: true });
      } else if (scenario === "denied") {
        await page.locator("[data-canonical-numbering-create-denied=true]").waitFor();
        assert.equal(await page.locator("[data-canonical-numbering-create=true]").count(), 0);
      } else if (scenario === "unavailable-retry") {
        await page.getByRole("alert").filter({ hasText: "無法確認" }).first().waitFor();
        assert.equal(await page.locator("[data-canonical-numbering-create-denied=true]").count(), 0);
        unavailable = false;
        await page.getByRole("button", { name: "重試權限", exact: true }).first().click();
        await page.locator("[data-canonical-numbering-create=true]").waitFor();
        assert.equal(permissionRequests, 2);
      } else if (scenario === "unauthenticated") {
        await page.getByRole("alert").filter({ hasText: "登入已失效" }).waitFor();
        assert.equal(await page.locator("[data-canonical-numbering-create=true]").count(), 0);
      } else {
        const create = page.getByRole("button", { name: "建立技轉包", exact: true });
        await create.waitFor();
        if (scenario === "transfer-403") {
          await page.getByLabel("技轉包名稱", { exact: true }).fill("DEV-126 fixture");
          await page.getByLabel("案件或變更原因", { exact: true }).fill("DEV-126 fixture reason");
          await page.getByLabel("無來源編號原因", { exact: true }).fill("DEV-126 fixture reference");
          const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/numbering/permissions");
          await create.click(); await refreshed;
          await page.getByText("DEV-126 fixture: operation denied", { exact: true }).waitFor();
          await page.waitForLoadState("networkidle");
          assert.equal(mutationRequests, 1, "A denied mutation is never replayed");
          assert.equal(permissionRequests, 2, "A stale grant is invalidated after the actual consumer receives 403");
        }
        assert.equal(await create.isDisabled(), true);
        assert.equal(await create.getAttribute("title"), "目前帳號沒有建立技轉包權限");
      }
      assert.deepEqual(errors, [], "Unexpected browser runtime errors");
      await page.screenshot({ path: path.join(output, scenario + ".png"), fullPage: true });
      results.push({ scenario, fixture: `dev126-${scenario}`, result: "PASS", permissionRequests, mutationRequests, routeSequence, exchanges });
    } catch (error) {
      results.push({ scenario, fixture: `dev126-${scenario}`, result: "FAIL", permissionRequests, mutationRequests, routeSequence, exchanges, error: String(error.message), pageErrors: errors });
      process.exitCode = 1;
      await page.screenshot({ path: path.join(output, scenario + "-failure.png"), fullPage: true }).catch(() => {});
    } finally { releaseProjection(); await context.close(); }
  }
} finally {
  await browser.close();
  const result = { environment: "local-browser-api-fixtures", realSso: "DEFERRED", serverAuthorization: "NOT_EXERCISED_BY_BROWSER_FIXTURES", sourceEvidence, baseUrl: base.origin, results };
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
