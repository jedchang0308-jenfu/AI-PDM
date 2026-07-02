#!/usr/bin/env node

import { chromium } from "playwright";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://localhost:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const results = [];

const pageFiles = {
  "/numbering/search": "src/app/numbering/search/page.tsx",
  "/numbering/drawings": "src/app/numbering/drawings/page.tsx",
  "/parts": "src/app/parts/page.tsx"
};
const drawerStorageKeysByRoute = {
  "/numbering/search": "pdm-search-detail-drawer-width",
  "/numbering/drawings": "pdm-drawing-detail-drawer-width",
  "/parts": "pdm-part-detail-drawer-width"
};
const copyShortcutFunctionByRoute = {
  "/numbering/search": "copySelectedRootCode",
  "/numbering/drawings": "copySelectedDrawingNumber",
  "/parts": "copySelectedPartNumber"
};
const identityHeadersByRoute = {
  "/numbering/search": ["主根號", "品名", "料號", "其他"],
  "/numbering/drawings": ["圖號", "品名", "料號", "其他"],
  "/parts": ["料號", "品名", "圖號", "其他"]
};

const read = (relativePath) => readProjectFile(root, relativePath);

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function staticChecks() {
  const css = read("src/app/globals.css");
  const packageSource = read("package.json");
  const requiredClasses = [
    "pdm-master-workbench",
    "pdm-master-toolbar",
    "pdm-master-table-panel",
    "pdm-master-detail-panel"
  ];
  const identityClasses = ["pdm-identity-table", "pdm-identity-scroll", "pdm-identity-code", "pdm-identity-name", "pdm-identity-meta", "pdm-meta-strip"];
  const drawingDrawerClasses = [
    "pdm-drawing-toolbar",
    "pdm-drawing-list-layout",
    "pdm-detail-drawer-backdrop",
    "pdm-detail-drawer",
    "pdm-detail-drawer-resize-handle"
  ];

  for (const className of requiredClasses) {
    record(`CSS defines ${className}`, css.includes(`.${className}`), "src/app/globals.css");
  }
  for (const className of identityClasses) {
    record(`CSS defines ${className}`, css.includes(`.${className}`), "src/app/globals.css");
  }
  for (const className of drawingDrawerClasses) {
    record(`CSS defines ${className}`, css.includes(`.${className}`), "src/app/globals.css");
  }
  record("Desktop list template uses full-width list layout", css.includes(".pdm-drawing-list-layout") && css.includes("grid-template-columns: minmax(0, 1fr)"), "src/app/globals.css");
  record("Mobile drawer template stacks to one column", css.includes("@media (max-width: 760px)") && css.includes(".pdm-detail-drawer") && css.includes("width: 100%"), "src/app/globals.css");
  record("Identity table has 70/22 width intent", css.includes(".pdm-identity-col-name") && css.includes("width: 36%") && css.includes(".pdm-identity-col-meta") && css.includes("width: 18%"), "src/app/globals.css");
  record("Identity list supports XY scroll on desktop", css.includes(".pdm-identity-scroll") && css.includes("overflow: scroll") && css.includes("scrollbar-gutter: stable both-edges"), "src/app/globals.css");
  record("Identity list keeps sticky desktop headers", css.includes(".pdm-identity-scroll .pdm-identity-table thead th") && css.includes("position: sticky"), "src/app/globals.css");
  record("Mobile identity table stacks rows as cards", css.includes(".pdm-identity-table tr") && css.includes("content: attr(data-label)") && css.includes(".pdm-identity-table td"), "src/app/globals.css");
  record("Drawing drawer avoids dimming the base page", css.includes(".pdm-detail-drawer-backdrop") && css.includes("background: transparent") && css.includes("pointer-events: none"), "src/app/globals.css");
  record("Drawing drawer has distinct right-rail treatment", css.includes(".pdm-detail-drawer") && css.includes("border-left: 5px solid #0ea5a4") && css.includes("-18px 0 42px"), "src/app/globals.css");
  record("Drawing drawer uses remembered CSS variable width", css.includes("--pdm-detail-drawer-width") && css.includes("body.pdm-drawer-resizing"), "src/app/globals.css");
  record("Drawer supports floating close control style", css.includes(".pdm-detail-drawer-floating-close"), "src/app/globals.css");

  for (const [route, file] of Object.entries(pageFiles)) {
    const source = read(file);
    const identityHeaders = identityHeadersByRoute[route];
    const routeRequiredClasses = [...requiredClasses, ...drawingDrawerClasses];
    for (const className of routeRequiredClasses) {
      record(`${route} uses ${className}`, source.includes(className), file);
    }
    for (const className of identityClasses) {
      record(`${route} uses ${className}`, source.includes(className), file);
    }
    for (const header of identityHeaders) {
      record(`${route} has ${header} identity header`, source.includes(`<th>${header}</th>`) && source.includes(`data-label="${header}"`), file);
    }
    record(`${route} has fixed filter row`, source.includes("pdm-master-filter-grid") && source.includes("pdm-master-filter-action"), file);
    record(`${route} rows support selection`, source.includes("selected-row") && source.includes("onClick"), file);
    record(
      `${route} persists drawer width`,
      source.includes(drawerStorageKeysByRoute[route]) &&
        source.includes("window.localStorage.setItem") &&
        (source.includes("clampDetailDrawerWidth") || source.includes("clampDrawerWidth")),
      file
    );
    record(
      `${route} implements safe keyboard shortcuts`,
      source.includes('aria-keyshortcuts="ArrowUp ArrowDown Enter Escape PageUp PageDown Home End Control+C"') &&
        source.includes("isEditableShortcutTarget") &&
        source.includes("hasSelectedText") &&
        source.includes(copyShortcutFunctionByRoute[route]),
      file
    );
    record(
      `${route} avoids browser and mutation shortcut bindings`,
      !source.includes("Ctrl+F") &&
        !source.includes("Ctrl+R") &&
        !source.includes("Ctrl+S") &&
        !source.includes("Ctrl+N") &&
        !source.includes('case "Delete"') &&
        !source.includes('case "F2"'),
      file
    );
  }

  const drawingsSource = read(pageFiles["/numbering/drawings"]);
  record("Drawing page avoids large stats grid", !drawingsSource.includes("stats-grid") && !drawingsSource.includes("MetricCard"), pageFiles["/numbering/drawings"]);
  record("Drawing table removes list action column", !drawingsSource.includes("<th>動作</th>") && !drawingsSource.includes("compact-button"), pageFiles["/numbering/drawings"]);
  record("Drawing detail preserves traceability action", drawingsSource.includes("開啟圖料追溯") && drawingsSource.includes("/numbering/search?query="), pageFiles["/numbering/drawings"]);
  record("Drawing detail preserves MA impact action", drawingsSource.includes("檢查 MA 影響文件") && drawingsSource.includes("/numbering/impact?drawingNumber="), pageFiles["/numbering/drawings"]);
  record(
    "Drawing drawer persists resized width",
    drawingsSource.includes("pdm-drawing-detail-drawer-width") && drawingsSource.includes("window.localStorage.setItem") && drawingsSource.includes("clampDrawerWidth"),
    pageFiles["/numbering/drawings"]
  );
  record("Package exposes master workbench QC script", packageSource.includes('"qc:pdm-master-workbench-layout"'), "package.json");
}

async function loginAsAdmin(context) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password })
  });
  record("Admin login succeeds", response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  record("Admin login returns session cookie", Boolean(name && valueParts.length > 0), cookie ? "cookie received" : "missing cookie");
  const url = new URL(apiBaseUrl);
  await context.addCookies([{ name, value: valueParts.join("="), domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
}

async function verifyDesktop(browser, route) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(apiBaseUrl).origin }).catch(() => {});
  const page = await context.newPage();
  await loginAsAdmin(context);
  const response = await page.goto(`${apiBaseUrl}${route}`, { waitUntil: "networkidle" });
  record(`${route} returns 200 on desktop`, response?.status() === 200, `HTTP ${response?.status()}`);
  await page.locator(".pdm-master-workbench").first().waitFor({ timeout: 15_000 });
  record(`${route} renders master workbench`, await page.locator(".pdm-master-workbench").first().isVisible());

  const listColumnCount = await page
    .locator(".pdm-drawing-list-layout")
    .first()
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length);
  record(`${route} desktop uses full-width list template`, listColumnCount === 1, `${listColumnCount} columns`);
  const tableBox = await page.locator(".pdm-master-table-panel").first().boundingBox();
  const workbenchBox = await page.locator(".pdm-master-workbench").first().boundingBox();
  record(`${route} has primary table panel`, Boolean(tableBox), JSON.stringify({ tableBox }));
  record(
    `${route} list owns the main visual width`,
    tableBox && workbenchBox && tableBox.width >= workbenchBox.width * 0.96,
    JSON.stringify({ tableWidth: tableBox?.width, workbenchWidth: workbenchBox?.width })
  );
  record(`${route} detail drawer is hidden before row selection`, (await page.locator(".pdm-detail-drawer").count()) === 0);

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${route} desktop avoids page-level horizontal overflow`, bodyOverflow <= 2, `${bodyOverflow}px`);

  const headers = await page.locator(".pdm-identity-table thead th").evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ""));
  const identityHeaders = identityHeadersByRoute[route];
  record(`${route} identity headers use required order`, JSON.stringify(headers.slice(0, 4)) === JSON.stringify(identityHeaders), JSON.stringify(headers));

  await page.locator(".pdm-identity-table tbody tr").first().waitFor({ timeout: 15_000 });
  const scrollStats = await page.locator(".pdm-identity-scroll").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      canScrollX: element.scrollWidth >= element.clientWidth,
      canScrollY: element.scrollHeight >= element.clientHeight
    };
  });
  record(`${route} desktop identity list has XY scroll container`, scrollStats.overflowX === "scroll" && scrollStats.overflowY === "scroll", JSON.stringify(scrollStats));
  const widthStats = await page.locator(".pdm-identity-table tbody tr").first().evaluate((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    const boxes = cells.map((cell) => cell.getBoundingClientRect());
    const rowWidth = row.getBoundingClientRect().width;
    const identityWidth = boxes.slice(0, 3).reduce((sum, box) => sum + box.width, 0);
    const metaWidth = boxes[3]?.width ?? 0;
    return { rowWidth, identityWidth, metaWidth, identityRatio: identityWidth / rowWidth, metaRatio: metaWidth / rowWidth };
  });
  record(`${route} desktop identity columns occupy at least 70%`, widthStats.identityRatio >= 0.7, JSON.stringify(widthStats));
  record(`${route} desktop other column stays compact`, widthStats.metaRatio <= 0.22, JSON.stringify(widthStats));

  await page.locator(".pdm-identity-table tbody tr").first().click();
  await page.locator(".pdm-detail-drawer").first().waitFor({ timeout: 5_000 });
  let drawerBox = await page.locator(".pdm-detail-drawer").first().boundingBox();
  record(`${route} row selection opens right detail drawer`, Boolean(drawerBox), JSON.stringify({ drawerBox }));
  record(`${route} detail drawer overlays from the right`, drawerBox && tableBox && drawerBox.x > tableBox.x, JSON.stringify({ drawerBox, tableBox }));

  const resizeHandle = page.locator(".pdm-detail-drawer-resize-handle").first();
  const handleBox = await resizeHandle.boundingBox();
  record(`${route} exposes drawer resize handle`, Boolean(handleBox), JSON.stringify({ handleBox }));
  if (handleBox && drawerBox) {
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 160);
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 140, handleBox.y + 160, { steps: 8 });
    await page.mouse.up();
    const resizedDrawerBox = await page.locator(".pdm-detail-drawer").first().boundingBox();
    record(
      `${route} drag handle increases drawer width`,
      resizedDrawerBox && resizedDrawerBox.width > drawerBox.width + 80,
      JSON.stringify({ before: drawerBox, after: resizedDrawerBox })
    );
    const drawerStorageKey = drawerStorageKeysByRoute[route];
    const storedWidth = await page.evaluate((key) => window.localStorage.getItem(key), drawerStorageKey);
    record(
      `${route} resized drawer width is stored`,
      Boolean(storedWidth && resizedDrawerBox && Math.abs(Number(storedWidth) - resizedDrawerBox.width) <= 8),
      JSON.stringify({ storedWidth, renderedWidth: resizedDrawerBox?.width })
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".pdm-identity-table tbody tr").first().waitFor({ timeout: 15_000 });
    await page.locator(".pdm-identity-table tbody tr").first().click();
    await page.locator(".pdm-detail-drawer").first().waitFor({ timeout: 5_000 });
    const restoredDrawerBox = await page.locator(".pdm-detail-drawer").first().boundingBox();
    record(
      `${route} drawer restores previous width after reload`,
      Boolean(storedWidth && restoredDrawerBox && Math.abs(Number(storedWidth) - restoredDrawerBox.width) <= 8),
      JSON.stringify({ storedWidth, restoredWidth: restoredDrawerBox?.width })
    );
    drawerBox = restoredDrawerBox;
  }

  const rowCount = await page.locator(".pdm-identity-table tbody tr").count();
  if (rowCount >= 2) {
    await page.locator(".pdm-identity-table tbody tr").nth(1).click({ position: { x: 24, y: 20 } });
    record(`${route} can switch rows while drawer stays open`, await page.locator(".pdm-detail-drawer").first().isVisible(), `${rowCount} rows`);
  }

  await page.keyboard.press("Escape");
  await page.locator(".pdm-detail-drawer").waitFor({ state: "hidden", timeout: 5_000 });
  record(`${route} Escape closes detail drawer`, (await page.locator(".pdm-detail-drawer").count()) === 0);

  await page.locator(".pdm-identity-table tbody tr").first().click();
  await page.locator(".pdm-detail-drawer").first().waitFor({ timeout: 5_000 });
  await page.locator(".topbar h1").first().click();
  await page.locator(".pdm-detail-drawer").waitFor({ state: "hidden", timeout: 5_000 });
  record(`${route} outside click closes detail drawer`, (await page.locator(".pdm-detail-drawer").count()) === 0);

  const list = page.locator(".pdm-identity-scroll").first();
  const primaryCodes = await page.locator(".pdm-identity-table tbody tr").evaluateAll((rows) =>
    rows.map((row) => row.querySelector(".pdm-identity-code")?.textContent?.trim() ?? "").filter(Boolean)
  );
  record(`${route} has enough rows for keyboard navigation`, primaryCodes.length >= 2, JSON.stringify({ primaryCodes }));

  async function selectedPrimaryCode() {
    return (await page.locator(".pdm-identity-table tbody tr.selected-row .pdm-identity-code").first().textContent())?.trim() ?? "";
  }

  await list.focus();
  await page.keyboard.press("Home");
  record(`${route} Home selects first row`, (await selectedPrimaryCode()) === primaryCodes[0], JSON.stringify({ selected: await selectedPrimaryCode(), first: primaryCodes[0] }));

  await page.keyboard.press("ArrowDown");
  record(`${route} ArrowDown selects next row`, (await selectedPrimaryCode()) === primaryCodes[1], JSON.stringify({ selected: await selectedPrimaryCode(), second: primaryCodes[1] }));

  await page.keyboard.press("Enter");
  await page.locator(".pdm-detail-drawer").first().waitFor({ timeout: 5_000 });
  const drawerTitle = (await page.locator(".pdm-detail-drawer h2").first().textContent())?.trim() ?? "";
  record(
    `${route} Enter opens selected row detail`,
    drawerTitle.includes(primaryCodes[1]),
    JSON.stringify({ selected: primaryCodes[1], drawerTitle })
  );

  await page.keyboard.press("Escape");
  await page.locator(".pdm-detail-drawer").waitFor({ state: "hidden", timeout: 5_000 });
  record(`${route} keyboard Escape closes detail drawer`, (await page.locator(".pdm-detail-drawer").count()) === 0);

  await list.focus();
  await page.keyboard.press("End");
  record(`${route} End selects last row`, (await selectedPrimaryCode()) === primaryCodes.at(-1), JSON.stringify({ selected: await selectedPrimaryCode(), last: primaryCodes.at(-1) }));

  await page.keyboard.press("Home");
  await page.keyboard.press("PageDown");
  record(`${route} PageDown keeps selection within list`, primaryCodes.includes(await selectedPrimaryCode()), JSON.stringify({ selected: await selectedPrimaryCode(), values: primaryCodes }));

  await page.keyboard.press("End");
  await page.keyboard.press("PageUp");
  record(`${route} PageUp keeps selection within list`, primaryCodes.includes(await selectedPrimaryCode()), JSON.stringify({ selected: await selectedPrimaryCode(), values: primaryCodes }));

  await page.keyboard.press("Home");
  await page.keyboard.press("Control+C");
  const copiedPrimaryCode = await page.evaluate(() => navigator.clipboard.readText());
  record(`${route} Ctrl+C copies selected primary identifier`, copiedPrimaryCode === primaryCodes[0], JSON.stringify({ copiedPrimaryCode, expected: primaryCodes[0] }));

  await page.locator(".pdm-master-toolbar input").first().focus();
  const selectedBeforeInputShortcut = await selectedPrimaryCode();
  await page.keyboard.press("ArrowDown");
  record(
    `${route} input focus does not intercept list ArrowDown`,
    (await selectedPrimaryCode()) === selectedBeforeInputShortcut,
    JSON.stringify({ before: selectedBeforeInputShortcut, after: await selectedPrimaryCode() })
  );

  await list.focus();
  await page.evaluate(() => {
    const textNode = document.querySelector(".pdm-identity-name");
    if (!textNode) return;
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  const selectedText = await page.evaluate(() => window.getSelection()?.toString().trim() ?? "");
  await page.keyboard.press("Control+C");
  const copiedSelectedText = await page.evaluate(() => navigator.clipboard.readText());
  record(
    `${route} selected text keeps native Ctrl+C behavior`,
    Boolean(selectedText) && copiedSelectedText.trim() === selectedText,
    JSON.stringify({ selectedText, copiedSelectedText })
  );
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await context.close();
}

async function verifyMobile(browser, route) {
  const context = await browser.newContext({ viewport: { width: 390, height: 920 }, isMobile: true });
  const page = await context.newPage();
  await loginAsAdmin(context);
  const response = await page.goto(`${apiBaseUrl}${route}`, { waitUntil: "networkidle" });
  record(`${route} returns 200 on mobile`, response?.status() === 200, `HTTP ${response?.status()}`);
  await page.locator(".pdm-master-workbench").first().waitFor({ timeout: 15_000 });

  const listColumnCount = await page
    .locator(".pdm-drawing-list-layout")
    .first()
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length);
  record(`${route} mobile uses one-column list template`, listColumnCount === 1, `${listColumnCount} columns`);
  const tableBox = await page.locator(".pdm-master-table-panel").first().boundingBox();
  record(`${route} mobile keeps table as first detail-free surface`, Boolean(tableBox) && (await page.locator(".pdm-detail-drawer").count()) === 0, JSON.stringify({ tableBox }));

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`${route} mobile avoids page-level horizontal overflow`, bodyOverflow <= 2, `${bodyOverflow}px`);

  const displayStats = await page.locator(".pdm-identity-table").first().evaluate((table) => {
    const row = table.querySelector("tbody tr");
    const cell = table.querySelector("tbody td");
    return {
      tableDisplay: getComputedStyle(table).display,
      rowDisplay: row ? getComputedStyle(row).display : "",
      cellDisplay: cell ? getComputedStyle(cell).display : ""
    };
  });
  record(`${route} mobile identity table uses card stack display`, displayStats.tableDisplay === "block" && displayStats.rowDisplay === "block" && displayStats.cellDisplay === "grid", JSON.stringify(displayStats));
  await context.close();
}

async function verifyRuntime() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    const page = await context.newPage();
    const rootResponse = await page.goto(`${apiBaseUrl}/`, { waitUntil: "domcontentloaded" });
    record("/ returns 200", rootResponse?.status() === 200, `HTTP ${rootResponse?.status()}`);
    await context.close();

    for (const route of Object.keys(pageFiles)) {
      await verifyDesktop(browser, route);
      await verifyMobile(browser, route);
    }
  } finally {
    await browser.close();
  }
}

staticChecks();
await verifyRuntime();

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      baseUrl: apiBaseUrl,
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      results
    },
    null,
    2
  )
);
