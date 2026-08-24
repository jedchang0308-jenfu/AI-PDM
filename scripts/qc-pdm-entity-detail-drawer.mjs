#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

const drawingPage = read("src/app/numbering/drawings/page.tsx");
const partPage = read("src/components/part-detail-content.tsx");
const relationPage = read("src/app/numbering/search/page.tsx");
const workbench = read("src/components/canonical-pdm-workbench.tsx");
const detailService = read("src/lib/pdm-entity-detail.ts");
const fileReadContract = read("src/lib/pdm-file-read-contract.ts");
const fileReadRoute = read("src/app/api/pdm/file-assets/[fileAssetId]/route.ts");
const preview = read("src/components/drawing-detail-preview.tsx");
const drawerWidth = read("src/components/pdm-detail-drawer.tsx");
const keyboard = read("src/components/use-list-keyboard-shortcuts.ts");
const packageJson = JSON.parse(read("package.json"));

record(
  "Focused entity-detail QC command remains registered",
  packageJson.scripts?.["qc:pdm-entity-detail-drawer"]?.startsWith("node scripts/qc-pdm-entity-detail-drawer.mjs")
);
record(
  "Drawing, Part, and Relation pages share the canonical workbench",
  drawingPage.includes('<CanonicalPdmWorkbench entityType="drawing"') &&
    partPage.includes('<CanonicalPdmWorkbench entityType="part"') &&
    relationPage.includes('<CanonicalPdmWorkbench entityType="relation"')
);
record(
  "One canonical drawer shell serves all three workbenches",
  workbench.includes("function Drawer(") &&
    workbench.includes("{detailKey ? <Drawer") &&
    workbench.includes("detailEndpoint: \"/api/numbering/drawings/workbench\"") &&
    workbench.includes("detailEndpoint: \"/api/parts/workbench\"") &&
    workbench.includes("detailEndpoint: \"/api/numbering/relations\"")
);
record(
  "Drawer keeps the approved minimal information hierarchy",
  ["目前資料", "自動預覽", "圖面檔案", "附件", "直接關聯", "受阻資訊", "歷史版次清單"].every((label) => workbench.includes(label)) &&
    workbench.includes('detail.data.row.entityType === "drawing" ? <section><h3>歷史版次清單</h3>')
);
record(
  "Part and Relation remain explicitly versionless",
  workbench.includes("料號沒有版次") &&
    workbench.includes("圖料根號沒有版次") &&
    workbench.includes('{ value: "formal", label: "正式資料" }') &&
    workbench.includes('{ value: "work", label: "修改中" }') &&
    workbench.includes('{ value: "formal", label: "正式關聯" }') &&
    workbench.includes('{ value: "work", label: "調整中" }')
);
record(
  "All three drawers reuse the shared 2D and 3D preview renderer",
  workbench.includes("DrawingDetailPreview") &&
    workbench.includes("function CanonicalPreview") &&
    workbench.includes('preview.kind === "three-d" ? "image" : "document"') &&
    preview.includes("data-drawing-detail-section={dataSection}")
);
record(
  "Candidate and released media use one canonical file-read contract",
  detailService.includes("pdmFileReadHref") &&
    fileReadContract.includes("candidate_revision") &&
    fileReadContract.includes("drawing_revision_package") &&
    fileReadContract.includes("/api/pdm/file-assets/") &&
    fileReadRoute.includes("isPdmFileReadContext")
);
record(
  "Retired candidate file GET route is physically absent",
  !exists("src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/[fileId]/route.ts")
);
record(
  "File read remains protected and fail-closed",
  fileReadRoute.includes("requireAuthAsync") &&
    fileReadRoute.includes("resolveNumberingCompanyContextAsync") &&
    fileReadRoute.includes("resolvePdmReviewScopeReceiptAsync") &&
    fileReadRoute.includes("PDM_FILE_NOT_FOUND") &&
    fileReadRoute.includes('"cache-control": "private, no-store"')
);
record(
  "Drawer width is resizable and remembered per workbench",
  workbench.includes("useRememberedDrawerWidth") &&
    workbench.includes('drawing: "pdm-drawing-detail-drawer-width"') &&
    workbench.includes('part: "pdm-part-detail-drawer-width"') &&
    workbench.includes('relation: "pdm-search-detail-drawer-width"') &&
    workbench.includes('aria-label="調整明細欄寬度"') &&
    drawerWidth.includes("window.localStorage.setItem")
);
record(
  "List keyboard selection does not intercept editable controls",
  workbench.includes("useListKeyboardShortcuts") &&
    workbench.includes('rowSelector: "[data-canonical-workbench-row=\'true\']"') &&
    keyboard.includes('event.key === "ArrowDown"') &&
    keyboard.includes('event.key === "ArrowUp"') &&
    keyboard.includes('event.key === "Enter"') &&
    keyboard.includes("isEditableShortcutTarget")
);
record(
  "Open drawer supports ArrowUp and ArrowDown record switching",
  workbench.includes("handleDrawerNavigation") &&
    workbench.includes('event.key !== "ArrowDown" && event.key !== "ArrowUp"') &&
    workbench.includes("selectDetail(nextRow.rowKey)") &&
    workbench.includes("input, textarea, select, [contenteditable='true']")
);
record(
  "Escape closes detail and restores list focus",
  workbench.includes('if (event.key === "Escape") onClose()') &&
    workbench.includes("listRef.current?.focus({ preventScroll: true })")
);
record(
  "Outside click closes the drawer without hiding the list contract",
  workbench.includes('className="canonical-drawer-backdrop"') &&
    workbench.includes("if (event.target === event.currentTarget) onClose()") &&
    workbench.includes('aria-label="工作台資料清單"')
);
record(
  "Record switching resets drawer scroll to the top",
  workbench.includes("bodyRef.current?.scrollTo({ top: 0 })") &&
    workbench.includes("[detail?.data.row.rowKey]") &&
    workbench.includes('<div ref={bodyRef} className="canonical-drawer-body">')
);
record(
  "Canonical UI only exposes Search, Data, and Handling filters",
  workbench.includes('aria-label="清單篩選"') &&
    workbench.includes("<span>搜尋</span>") &&
    workbench.includes("<span>資料</span>") &&
    workbench.includes("<span>處理</span>") &&
    !workbench.includes("資料狀態") &&
    !workbench.includes("版本列")
);
record(
  "Server-derived actions stay in the drawer footer",
  workbench.includes("detail.data.row.actions.map") &&
    workbench.includes("onAction(detail.data.row, action)") &&
    workbench.includes('className="canonical-drawer-actions"')
);
record(
  "Loading, error, empty, and no-preview states remain explicit",
  workbench.includes("正在載入明細") &&
    workbench.includes('role="alert"') &&
    workbench.includes("沒有符合條件的資料") &&
    preview.includes("尚無可預覽圖面")
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
