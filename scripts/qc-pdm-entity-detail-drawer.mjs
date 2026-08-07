#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

const searchPage = read("src/app/numbering/search/page.tsx");
const drawingPage = read("src/app/numbering/drawings/page.tsx");
const drawingWorkbench = read("src/components/drawing-workbench.tsx");
const partPage = read("src/app/parts/page.tsx");
const attachmentPanel = read("src/components/master-attachment-panel.tsx");
const packageJson = JSON.parse(read("package.json"));

record(
  "DEV-039 package exposes focused QC script",
  packageJson.scripts?.["qc:pdm-entity-detail-drawer"] === "node scripts/qc-pdm-entity-detail-drawer.mjs",
  "package.json"
);

record(
  "Search drawer reuses drawing module shell and inline close action",
  searchPage.includes('import { PdmDetailDrawer }') &&
    searchPage.includes('className="drawing-workbench-master-drawer"') &&
    searchPage.includes('className="drawing-workbench-drawer-header"') &&
    searchPage.includes('className="drawing-workbench-drawer-header-actions"') &&
    !searchPage.includes("pdm-detail-drawer-floating-close"),
  "src/app/numbering/search/page.tsx"
);

record(
  "Search drawer preserves clicked entity identity metadata",
  searchPage.includes("data-detail-target={target.entityType}") &&
    searchPage.includes("data-detail-code={header.code}") &&
    searchPage.includes("data-entity-type={target.entityType}") &&
    searchPage.includes("data-entity-code={header.code}") &&
    searchPage.includes('data-source-context="numbering_search"'),
  "src/app/numbering/search/page.tsx"
);

record(
  "Search drawer has target-specific core sections",
    searchPage.includes("function DetailTargetCoreSections") &&
    searchPage.includes("function RootDetailHero") &&
    searchPage.includes("DrawingDetailContent") &&
    searchPage.includes("PartDetailPanel") &&
    searchPage.includes('data-entity-core-section="object-owner-hero"') &&
    searchPage.includes("function TargetDrawingCoreSections") &&
    searchPage.includes("function TargetPartCoreSections") &&
    searchPage.includes('data-entity-core-section="drawing-readiness"') &&
    searchPage.includes('data-entity-core-section="drawing-linked-parts"') &&
    searchPage.includes('data-entity-core-section="part-readiness"') &&
    searchPage.includes('data-entity-core-section="part-attributes"') &&
    searchPage.includes('data-entity-core-section="part-linked-drawings"') &&
    searchPage.includes('data-entity-core-section="part-3d-baseline"') &&
    searchPage.includes('data-entity-core-section="part-cost"'),
  "src/app/numbering/search/page.tsx"
);

record(
  "Search drawer limits root aggregate sections to root target",
    searchPage.includes('const isRootTarget = target.entityType === "part_root";') &&
    searchPage.includes("isRootTarget ? (") &&
    searchPage.includes("<RootDetailHero detail={detail} formalChildCount={formalChildCount} onChanged={onChanged} />") &&
    searchPage.includes('data-root-aggregate-section="part-list"') &&
    searchPage.includes('data-root-aggregate-section="drawing-list"') &&
    searchPage.includes("showEntrypoints={false}"),
  "src/app/numbering/search/page.tsx"
);

record(
  "Non-root search drawer uses owner-style action surface",
  searchPage.includes("DrawingDetailContent") &&
    searchPage.includes("<PartDetailPanel") &&
    searchPage.includes("/api/numbering/drawings/workbench/") &&
    searchPage.includes("/api/parts/${encodeURIComponent(targetPartNumber)}"),
  "src/app/numbering/search/page.tsx"
);

const targetDrawingCoreStart = searchPage.indexOf("function TargetDrawingCoreSections");
const targetDrawingAttachmentIndex = searchPage.indexOf('entityType="drawing_number"', targetDrawingCoreStart);
const targetDrawingReadinessIndex = searchPage.indexOf('data-entity-core-section="drawing-readiness"', targetDrawingCoreStart);
record(
  "Drawing target follows owner drawer section order",
  targetDrawingCoreStart !== -1 &&
    targetDrawingAttachmentIndex !== -1 &&
    targetDrawingReadinessIndex !== -1 &&
    targetDrawingAttachmentIndex < targetDrawingReadinessIndex,
  "src/app/numbering/search/page.tsx"
);

record(
  "Search drawer loads owner detail for part and drawing targets",
  searchPage.includes("/api/parts/${encodeURIComponent(targetPartNumber)}") &&
    searchPage.includes("/api/numbering/drawings/workbench/") &&
    searchPage.includes("owner detail 載入失敗") &&
    searchPage.includes("目前先顯示圖料關係中的可用資料"),
  "src/app/numbering/search/page.tsx"
);

record(
  "Drawing target includes canonical drawing owner sections",
  searchPage.includes("送審檢查") &&
    searchPage.includes("同主根號料號") &&
    searchPage.includes('entityType="drawing_number"') &&
    searchPage.includes("processControlled={isManufacturingDrawingPurpose(drawing.purposeCode)}"),
  "src/app/numbering/search/page.tsx"
);

record(
  "Part target includes canonical part owner sections",
  searchPage.includes("料號完整度檢查") &&
  searchPage.includes("料號屬性") &&
    searchPage.includes("圖號關聯") &&
    searchPage.includes("3D 基準") &&
    searchPage.includes("成本狀態") &&
    searchPage.includes('entityType="part_number"') &&
    searchPage.includes("/parts?detail=${encodeURIComponent(part.partNumber)}&focus=cost"),
  "src/app/numbering/search/page.tsx"
);

const targetPartCoreStart = searchPage.indexOf("function TargetPartCoreSections");
const targetPartAttachmentIndex = searchPage.indexOf('entityType="part_number"', targetPartCoreStart);
const targetPartReadinessIndex = searchPage.indexOf('data-entity-core-section="part-readiness"', targetPartCoreStart);
const targetPartLinkedDrawingsIndex = searchPage.indexOf('data-entity-core-section="part-linked-drawings"', targetPartCoreStart);
const targetPartAttributesIndex = searchPage.indexOf('data-entity-core-section="part-attributes"', targetPartCoreStart);
const targetPart3dIndex = searchPage.indexOf('data-entity-core-section="part-3d-baseline"', targetPartCoreStart);
const targetPartCostIndex = searchPage.indexOf('data-entity-core-section="part-cost"', targetPartCoreStart);
record(
  "Part target follows owner drawer information hierarchy",
  targetPartCoreStart !== -1 &&
    targetPartAttachmentIndex !== -1 &&
    targetPartReadinessIndex > targetPartAttachmentIndex &&
    targetPartLinkedDrawingsIndex > targetPartReadinessIndex &&
    targetPartAttributesIndex > targetPartLinkedDrawingsIndex &&
    targetPart3dIndex > targetPartAttributesIndex &&
    targetPartCostIndex > targetPart3dIndex,
  "src/app/numbering/search/page.tsx"
);

record(
  "Drawing module drawer publishes drawing entity metadata",
  drawingPage.includes('data-detail-target="drawing_number"') &&
    drawingPage.includes("data-detail-code={drawing.drawingNumber}") &&
    drawingPage.includes('data-entity-type="drawing_number"') &&
    drawingPage.includes("data-entity-code={drawing.drawingNumber}") &&
    drawingPage.includes('data-source-context="numbering_drawings"'),
  "src/app/numbering/drawings/page.tsx"
);

record(
  "Part module drawer publishes part entity metadata",
  partPage.includes('data-detail-target="part_number"') &&
    partPage.includes('data-entity-type="part_number"') &&
    partPage.includes('data-source-context="parts"') &&
    partPage.includes('data-detail-code={detail?.partNumber ?? ""}') &&
    partPage.includes('data-entity-code={detail?.partNumber ?? ""}'),
  "src/app/parts/page.tsx"
);

record(
  "Attachment panel remains the canonical drawing and part attachment surface",
  attachmentPanel.includes('entityType === "drawing_number" ? "圖號附件庫" : "料號附件庫"') &&
    attachmentPanel.includes("/api/numbering/drawings/${encodeURIComponent(entityCode)}/attachments") &&
    attachmentPanel.includes("/api/parts/${encodeURIComponent(entityCode)}/attachments"),
  "src/components/master-attachment-panel.tsx"
);

record(
  "Drawing pending approval projection remains visible without duplicating a focus panel",
  drawingPage.includes("PendingApprovalBadge") &&
    !drawingPage.includes("PendingApprovalPanel") &&
    !drawingPage.includes("待審焦點") &&
    drawingPage.includes("pendingRevisionReviews={drawing.pendingApproval") &&
    drawingWorkbench.includes("pendingRevisionReviews={drawing.pendingApproval") &&
    searchPage.includes("DrawingDetailContent") &&
    attachmentPanel.includes("pendingRevisionReviews") &&
    attachmentPanel.includes("approval-pending"),
  "drawing/search/master attachment pending projection"
);

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      results
    },
    null,
    2
  )
);
