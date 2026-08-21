async (page) => {
  const base = "http://127.0.0.1:3000";
  const routes = [
    { name: "drawing", path: "/numbering/drawings", requiredFilters: ["工作狀態", "系列代號", "圖面用途", "資料狀態"] },
    { name: "part", path: "/parts", requiredFilters: ["工作狀態", "系列代號", "類型", "資料狀態"] },
    { name: "relation", path: "/numbering/search", requiredFilters: ["工作狀態", "系列代號", "類型", "資料狀態"] }
  ];
  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet-landscape", width: 1024, height: 768 },
    { name: "tablet-portrait", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 }
  ];
  const results = [];
  const consoleErrors = [];
  const badResponses = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push({ url: page.url(), text: message.text() }); });
  page.on("response", (response) => { if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() }); });
  const waitReady = async () => {
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.locator(".pdm-workbench-multi-select-filter").first().waitFor({ state: "visible", timeout: 7000 });
    await page.waitForTimeout(500);
  };
  const navigate = async (href) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await page.goto(href, { waitUntil: "domcontentloaded" });
        await waitReady();
        return;
      } catch (error) {
        if (attempt === 2 || !String(error).includes("ERR_ABORTED")) throw error;
        await page.waitForTimeout(800);
      }
    }
  };
  const getButton = (label) => page.getByRole("button", { name: label, exact: true });
  const visibleAlertCount = async () => page.evaluate(() => Array.from(document.querySelectorAll('[role="alert"]')).filter((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }).length);
  const evaluateWithRetry = async (callback, argument) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { return await page.evaluate(callback, argument); } catch (error) {
        if (!String(error).includes("Execution context was destroyed") || attempt === 4) throw error;
        await page.waitForTimeout(500);
      }
    }
    return null;
  };
  const queryParamValues = async (key) => evaluateWithRetry((name) => Array.from(new window.URL(location.href).searchParams.getAll(name)), key);
  const hasQueryParam = async (key) => evaluateWithRetry((name) => new window.URL(location.href).searchParams.has(name), key);
  for (const route of routes) {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await navigate(`${base}${route.path}?view=all`);
      const beforeUrl = page.url();
      const filterLabels = await page.locator(".pdm-workbench-multi-select-filter .pdm-workbench-multi-select-label").allTextContents();
      const gridMetrics = await page.locator(".drawing-workbench-filter-grid").evaluate((element) => {
        const style = getComputedStyle(element);
        return { columns: style.gridTemplateColumns, columnCount: style.gridTemplateColumns.split(" ").length, scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
      });
      const noOverflow = gridMetrics.scrollWidth <= gridMetrics.viewportWidth + 1;
      const routeResult = {
        route: route.path,
        viewport: `${viewport.width}x${viewport.height}`,
        labels: filterLabels,
        requiredLabelsPresent: route.requiredFilters.every((label) => filterLabels.includes(label)),
        noHorizontalOverflow: noOverflow,
        grid: gridMetrics,
        visibleAlertCount: await visibleAlertCount(),
        interactions: {}
      };

      const getStatusButton = () => page.locator(".pdm-workbench-multi-select-filter").filter({ hasText: "工作狀態" }).first().locator("button").first();
      const statusButton = getStatusButton();
      await statusButton.waitFor({ state: "visible", timeout: 7000 });
      await statusButton.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "工作狀態篩選" });
      const allCheckbox = dialog.locator('input[type="checkbox"]').first();
      routeResult.interactions.keyboardOpen = await dialog.count() === 1 && await allCheckbox.isChecked() && await allCheckbox.getAttribute("aria-checked") === "true";
      await page.keyboard.press("Escape");
      routeResult.interactions.escapeClosesAndReturnsFocus = await dialog.count() === 0 && await statusButton.evaluate((element) => document.activeElement === element);

      await getStatusButton().click();
      const option = page.getByRole("dialog", { name: "工作狀態篩選" }).locator('input[type="checkbox"]').nth(1);
      await option.uncheck();
      const mixed = await page.getByRole("dialog", { name: "工作狀態篩選" }).locator('input[type="checkbox"]').first().getAttribute("aria-checked");
      const urlBeforeApply = page.url();
      routeResult.interactions.mixedStateAndDraftNoUrlChange = mixed === "mixed" && urlBeforeApply === beforeUrl;
      await page.getByRole("dialog", { name: "工作狀態篩選" }).getByRole("button", { name: "取消", exact: true }).click();
      routeResult.interactions.cancelKeepsUrlAndFocus = page.url() === beforeUrl && await statusButton.evaluate((element) => document.activeElement === element);

      await getStatusButton().click();
      await page.getByRole("dialog", { name: "工作狀態篩選" }).locator('input[type="checkbox"]').nth(1).uncheck();
      await page.getByRole("dialog", { name: "工作狀態篩選" }).getByRole("button", { name: "確定", exact: true }).click();
      await waitReady();
      const partialValues = await queryParamValues("humanStatus");
      routeResult.interactions.applyUsesRepeatedKeys = partialValues.length > 1 && !partialValues.includes("__none__");

      const seriesContainer = page.locator(".pdm-workbench-multi-select-filter").filter({ hasText: "系列代號" }).first();
      const seriesButton = seriesContainer.getByRole("button").first();
      await seriesButton.click();
      const searchBox = page.getByRole("dialog", { name: "系列代號篩選" }).getByRole("textbox", { name: "系列代號選項搜尋" });
      await searchBox.fill("不存在的選項");
      routeResult.interactions.optionSearchShowsEmptyWithoutAppliedMutation = await page.getByText("沒有符合的選項", { exact: true }).count() === 1;
      await page.getByRole("dialog", { name: "系列代號篩選" }).getByRole("button", { name: "取消", exact: true }).click();

      await getStatusButton().click();
      const noneDialog = page.getByRole("dialog", { name: "工作狀態篩選" });
      const noneAll = noneDialog.locator('input[type="checkbox"]').first();
      if (await noneAll.getAttribute("aria-checked") === "mixed") await noneAll.click();
      if (await noneAll.isChecked()) await noneAll.click();
      await noneDialog.getByRole("button", { name: "確定", exact: true }).click();
      await waitReady();
      const noneValues = await queryParamValues("humanStatus");
      routeResult.interactions.noneUsesSentinelAndNoAlert = noneValues.length === 1 && noneValues[0] === "__none__" && await visibleAlertCount() === 0;

      await getStatusButton().click();
      const recoveryDialog = page.getByRole("dialog", { name: "工作狀態篩選" });
      const recoveryAll = recoveryDialog.locator('input[type="checkbox"]').first();
      await recoveryAll.check();
      await recoveryDialog.getByRole("button", { name: "確定", exact: true }).click();
      await waitReady();
      routeResult.interactions.selectAllRecoversAndOmitsKey = !(await hasQueryParam("humanStatus"));

      if (viewport.name === "mobile") {
        await getStatusButton().click();
        const mobileDialog = page.getByRole("dialog", { name: "工作狀態篩選" });
        const bounds = await mobileDialog.evaluate((element) => { const rect = element.getBoundingClientRect(); const options = element.querySelector(".pdm-workbench-multi-select-options"); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, optionsOverflowY: options ? getComputedStyle(options).overflowY : "" }; });
        routeResult.interactions.mobilePopoverSafeBounds = bounds.left >= 12 && bounds.right <= viewport.width - 12 && bounds.top >= 12 && bounds.bottom <= viewport.height - 12;
        routeResult.mobilePopoverBounds = bounds;
        await page.screenshot({ path: `output/playwright/dev085-${route.name}-mobile-full-matrix.png`, fullPage: false });
        await page.keyboard.press("Escape");
      }
      await page.screenshot({ path: `output/playwright/dev085-${route.name}-${viewport.name}.png`, fullPage: false });
      routeResult.consoleErrors = consoleErrors.splice(0, consoleErrors.length);
      routeResult.badResponses = badResponses.splice(0, badResponses.length);
      routeResult.cleanRuntimeSignals = routeResult.consoleErrors.length === 0 && routeResult.badResponses.length === 0;
      results.push(routeResult);
    }
  }
  const failed = results.filter((item) => !item.requiredLabelsPresent || !item.noHorizontalOverflow || !item.cleanRuntimeSignals || Object.values(item.interactions).some((value) => value === false)).length;
  return { status: failed === 0 ? "PASS" : "FAIL", results, summary: { cases: results.length, failed } };
}
