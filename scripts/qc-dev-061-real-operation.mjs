import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = (process.env.PDM_DEV_061_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/u, "");
if (process.env.PDM_DEV_061_ISOLATED !== "1") {
  throw new Error("DEV061_REAL_OPERATION_REQUIRES_ISOLATED_RUNTIME");
}

const checks = [];
function check(id, ok, detail) {
  checks.push({ id, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`${id}: ${detail}`);
}
function safeScreenshotName(viewport) {
  return path.join("output", "qa", "dev-061-real-operation", `20260810-${viewport.width}x${viewport.height}.png`);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/api/auth/login?account=Admin`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.goto(`${baseUrl}/numbering/drawings`, { waitUntil: "networkidle", timeout: 30000 });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/numbering/drawings`, { waitUntil: "networkidle", timeout: 30000 });
    const drawingButton = page.locator("button.pdm-identity-code", { hasText: "A0005-M01" }).first();
    await drawingButton.click();
    await page.getByText("圖面與附件", { exact: true }).waitFor({ state: "visible", timeout: 15000 });
    await page.getByText("檔案清單", { exact: true }).waitFor({ state: "visible", timeout: 15000 });
    const body = await page.locator("body").innerText();
    check(`drawing-detail-${viewport.width}`, body.includes("圖面與附件") && body.includes("檔案清單"), "authenticated drawing detail renders controlled previews and compact file list");
    check(`drawing-no-loose-manager-${viewport.width}`, !body.includes("附件管理"), "drawing detail has no loose attachment manager section");
    check(`drawing-no-standalone-preview-${viewport.width}`, !body.includes("開啟預覽") && !body.includes("預覽 PDF"), "drawing detail has no standalone preview-open action");
    check(`drawing-no-horizontal-overflow-${viewport.width}`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), "drawing detail fits viewport width");
    fs.mkdirSync(path.dirname(safeScreenshotName(viewport)), { recursive: true });
    await page.screenshot({ path: safeScreenshotName(viewport), fullPage: true });
  }

  await page.goto(`${baseUrl}/numbering/revisions?drawingNumber=A0005-M01&revision=0.2`, { waitUntil: "networkidle", timeout: 30000 });
  const revisionBody = await page.locator("body").innerText();
  const accept = await page.locator('input[type="file"]').first().getAttribute("accept");
  check("revision-single-controlled-intake", revisionBody.includes("加入受控進版包"), "revision workbench exposes one controlled intake CTA");
  check("revision-required-extensions", accept === ".SLDDRW,.SLDPRT,.SLDASM", `file picker accept=${accept}`);

  console.log(JSON.stringify({ script: "qc-dev-061-real-operation", baseUrl, isolated: true, passed: checks.length, checks }, null, 2));
} finally {
  await browser.close();
}
