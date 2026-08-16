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
const relationRoute = read("src/app/api/numbering/relations/route.ts");
const rootDetailRoute = read("src/app/api/numbering/roots/[rootCode]/route.ts");
const drawingPage = read("src/app/numbering/drawings/page.tsx");
const drawingWorkbench = read("src/components/drawing-workbench.tsx");
const drawingWorkbenchProjection = read("src/lib/drawing-workbench.ts");
const drawingPartRelationStatus = read("src/lib/drawing-part-relation-status.ts");
const keyboardLinkActivation = read("src/lib/keyboard-link-activation.ts");
const numberingAsync = read("src/lib/numbering-async.ts");
const numberingSearchTarget = read("src/lib/numbering-search-target.ts");
const partPage = [
  read("src/app/parts/page.tsx"),
  read("src/components/part-module.tsx"),
  read("src/components/part-workbench.tsx"),
  read("src/components/part-detail-content.tsx")
].join("\n");
const numberStateWorkspace = read("src/components/number-state-workspace.tsx");
const candidateRevisionEditor = read("src/components/numbering-candidate-revision-editor.tsx");
const drawingWorkspaceDrawer = read("src/components/drawing-workspace-drawer.tsx");
const entityDrawer = read("src/components/pdm-entity-detail-drawer.tsx");
const detailDrawer = read("src/components/pdm-detail-drawer.tsx");
const contextualEntrypoints = read("src/components/numbering-contextual-entrypoints.tsx");
const humanStatusBadge = read("src/components/human-status-badge.tsx");
const humanStatusFilter = read("src/components/human-status-filter.tsx");
const humanStatusProjection = read("src/lib/human-status-projection.ts");
const globalCss = read("src/app/globals.css");
const attachmentPanel = read("src/components/master-attachment-panel.tsx");
const sharedDetailContent = read("src/components/drawing-detail-content.tsx");
const sharedDetailPreview = read("src/components/drawing-detail-preview.tsx");
const workbenchController = read("src/components/use-pdm-workbench-controller.ts");
const workbenchList = read("src/components/pdm-workbench-list.tsx");
const packageJson = JSON.parse(read("package.json"));

record(
  "DEV-039 package exposes focused QC script",
  packageJson.scripts?.["qc:pdm-entity-detail-drawer"] === "node scripts/qc-pdm-entity-detail-drawer.mjs && npm run qc:pdm-numbering-search-target" &&
    packageJson.scripts?.["qc:pdm-numbering-search-target"] === "node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-pdm-numbering-search-target-runtime.mjs",
  "package.json"
);

record(
  "Owner modules reuse one entity detail drawer shell",
  searchPage.includes('import { PdmEntityDetailDrawer }') &&
    partPage.includes('import { PdmEntityDetailDrawer }') &&
    drawingWorkspaceDrawer.includes('import { PdmEntityDetailDrawer }') &&
    [searchPage, partPage, drawingWorkspaceDrawer].every((source) => source.includes("<PdmEntityDetailDrawer")) &&
    drawingWorkbench.includes("DrawingWorkspaceDrawer") &&
    numberStateWorkspace.includes("DrawingWorkspaceDrawer") &&
    [drawingWorkbench, numberStateWorkspace].every((source) => source.includes("<DrawingWorkspaceDrawer")) &&
    !drawingWorkbench.includes('import { PdmEntityDetailDrawer }') &&
    !numberStateWorkspace.includes('import { PdmEntityDetailDrawer }'),
  "shared entity drawer consumers"
);

record(
  "Candidate and formal drawings directly use one drawing workspace component",
  drawingWorkspaceDrawer.includes('dataComponent="drawing-workspace-drawer"') &&
    drawingWorkspaceDrawer.includes('data-drawing-primary-action-slot="true"') &&
    drawingWorkbench.includes("<DrawingWorkspaceDrawer") &&
    numberStateWorkspace.includes("<DrawingWorkspaceDrawer"),
  "src/components/drawing-workspace-drawer.tsx"
);

record(
  "Entity detail drawer is non-modal and keeps the underlying list interactive",
  entityDrawer.includes('role="complementary"') &&
    !entityDrawer.includes('aria-modal="true"') &&
    globalCss.includes(".pdm-detail-drawer-backdrop") &&
    globalCss.includes("pointer-events: none") &&
    detailDrawer.includes("document.querySelector('[aria-modal=\"true\"]')"),
  "src/components/pdm-entity-detail-drawer.tsx"
);

record(
  "Shared shell owns outside close, row switching, and detail scroll reset",
  entityDrawer.includes("keepOpenSelector") &&
    entityDrawer.includes("target.closest(keepOpenSelector)") &&
    entityDrawer.includes('querySelector<HTMLElement>(".pdm-entity-drawer-body, .number-state-drawer-body")') &&
    entityDrawer.includes("scrollTo({ top: 0 })") &&
    drawingWorkbench.includes('rowDataAttribute="data-drawing-workbench-row"') &&
    drawingWorkbench.includes('keepOpenSelector="[data-drawing-workbench-row=\'true\']"') &&
    partPage.includes('keepOpenSelector="[data-part-row=\'true\']"') &&
    searchPage.includes('keepOpenSelector="[data-search-row=\'true\']"') &&
    numberStateWorkspace.includes('keepOpenSelector="[data-number-state-row=\'true\']"'),
  "shared browse interaction contract"
);

record(
  "Candidate workspace no longer uses a blocking drawer backdrop",
  numberStateWorkspace.includes('entityType="candidate_bundle"') &&
    !numberStateWorkspace.slice(numberStateWorkspace.indexOf("export function WorkspaceDrawer"), numberStateWorkspace.indexOf("function WorkspaceHeaderStatus")).includes("number-state-drawer-backdrop") &&
    !numberStateWorkspace.slice(numberStateWorkspace.indexOf("export function WorkspaceDrawer"), numberStateWorkspace.indexOf("function WorkspaceHeaderStatus")).includes('aria-modal="true"'),
  "src/components/number-state-workspace.tsx"
);

record(
  "Candidate and formal drawing drawers declare one drawing detail family",
  numberStateWorkspace.includes('entityType="candidate_bundle"') &&
    drawingWorkbench.includes('entityType="drawing_number"') &&
    drawingWorkspaceDrawer.includes('detailFamily = "drawing_number"') &&
    drawingWorkspaceDrawer.includes("drawingDetailSkeleton") &&
    entityDrawer.includes("dataDetailFamily={detailFamily}") &&
    detailDrawer.includes('data-drawing-detail-skeleton={dataDrawingDetailSkeleton ? "true" : undefined}'),
  "shared drawing detail family metadata"
);

const candidateDrawerStart = numberStateWorkspace.indexOf("export function WorkspaceDrawer");
const candidateDrawerEnd = numberStateWorkspace.indexOf("function WorkspaceHeaderStatus", candidateDrawerStart);
const candidateDrawerSource = numberStateWorkspace.slice(candidateDrawerStart, candidateDrawerEnd);
const candidatePreviewStart = numberStateWorkspace.indexOf("function CandidateDrawingPreview");
const candidatePreviewEnd = numberStateWorkspace.indexOf("function shouldRenderLifecycleV2Pending", candidatePreviewStart);
const candidatePreviewSource = numberStateWorkspace.slice(candidatePreviewStart, candidatePreviewEnd);
const sharedSectionOrder = [
  sharedDetailContent.indexOf('data-drawing-detail-section="drawing-overview"'),
  sharedDetailContent.indexOf('dataSection="drawing-revision-files"'),
  sharedDetailContent.indexOf('dataSection="drawing-pending"'),
  sharedDetailContent.indexOf('dataSection="drawing-more"')
];
const candidateBodyOrder = [candidateDrawerSource.indexOf('data-drawing-detail-section="drawing-revision-files"'), candidateDrawerSource.indexOf("<CandidateDrawingPreview")];
const formalDetailStart = drawingWorkbench.indexOf("export function DrawingDetailContent");
const formalDetailEnd = drawingWorkbench.indexOf("function DrawingMoreMenu", formalDetailStart);
const formalDetailSource = drawingWorkbench.slice(formalDetailStart, formalDetailEnd);
record(
  "Candidate and formal drawings follow the same shared detail skeleton",
  sharedSectionOrder.every((index) => index >= 0) &&
    sharedSectionOrder.every((index, position) => position === 0 || sharedSectionOrder[position - 1] < index) &&
    candidateBodyOrder.every((index) => index >= 0) && candidateBodyOrder[0] < candidateBodyOrder[1] &&
    drawingWorkbench.includes("content={{") &&
    formalDetailSource.includes("<MasterAttachmentPanel compact drawingDetailSkeleton") &&
    (attachmentPanel.includes('data-drawing-detail-section={drawingDetailSkeleton ? "drawing-preview" : undefined}') ||
      attachmentPanel.includes('dataSection={drawingDetailSkeleton ? "drawing-preview" : undefined}')) &&
    sharedDetailPreview.includes('dataSection = "drawing-preview"'),
  "drawing-overview -> drawing-revision-files (contains shared 3D/2D preview) -> drawing-pending -> drawing-more"
);

record(
  "Candidate and formal drawers share the header identity contract",
  candidateDrawerSource.includes('const entityLabel = presentation?.entityLabel ?? "圖號"') &&
    candidateDrawerSource.includes('const entityTitle = presentation?.title ?? drawingCode ?? "尚未產生圖號"') &&
    candidateDrawerSource.includes("eyebrow={entityLabel}") &&
    candidateDrawerSource.includes("title={entityTitle}") &&
    candidateDrawerSource.includes("subtitle={workspaceTitle(workspace)}") &&
    candidateDrawerSource.includes("status={<WorkspaceHeaderStatus") &&
    candidateDrawerSource.includes("primaryAction={primaryAction}") &&
    drawingWorkbench.includes("title={drawing.drawingNumber}") &&
    drawingWorkbench.includes("subtitle={drawing.coreName}") &&
    drawingWorkbench.includes("<HumanStatusBadge status={row.humanStatus}") &&
    drawingWorkbench.includes('primaryAction={<div data-capability="drawing-revision"') &&
    entityDrawer.includes('data-pdm-drawer-close="true"'),
  "candidate context label, code, name, status, primary action, close"
);

record(
  "Candidate identity is not replaced by root code or repeated as a dominant body card",
  candidateDrawerSource.includes("const drawingCode = getPrimaryReservedDrawingCode(workspace)") &&
    !candidateDrawerSource.includes("workspace.root?.candidateCode") &&
    !numberStateWorkspace.includes("<h3>保留號內容</h3>") &&
    !numberStateWorkspace.includes("number-state-candidate-watermark") &&
    numberStateWorkspace.includes("WorkspaceRelationsDetails") &&
    numberStateWorkspace.includes('title="圖料根號"') &&
    numberStateWorkspace.includes("primaryDrawingCode={drawingCode}"),
  "candidate header identity and secondary relations"
);

record(
  "Candidate and formal drawing lifecycle mutation authorities remain separate",
  candidateDrawerSource.includes("<NumberingCandidateRevisionEditor") &&
    formalDetailSource.includes('authorityMode="controlled_summary"') &&
    formalDetailSource.includes("readOnly") &&
    !candidateDrawerSource.includes("MasterAttachmentPanel"),
  "candidate revision editor versus formal controlled attachment summary"
);

record(
  "Candidate first-drawing action stays on the same page with one concise label",
  candidateDrawerSource.includes("<NumberingCandidateRevisionEditor") &&
    candidateDrawerSource.includes("content={{") &&
    !candidateDrawerSource.includes('href="#candidate-revision-files"') &&
    candidateRevisionEditor.includes(': "建立首版"}</button>') &&
    !numberStateWorkspace.includes("準備首版圖面") &&
    !candidateRevisionEditor.includes("準備首版圖面") &&
    !candidateRevisionEditor.includes("完成首版圖面"),
  "no second-layer navigation or duplicated preparation CTA"
);

record(
  "Candidate missing-file guidance appears once beside the upload control",
  candidateRevisionEditor.includes("主要 2D 圖面與 3D 模型需重新上傳。") &&
    candidateRevisionEditor.includes("主要 2D 圖面與 3D 模型都已就緒，現在可送交審核。") &&
    sharedDetailPreview.includes("尚無可預覽圖面") &&
    !candidatePreviewSource.includes("先在上方加入") &&
    candidateDrawerSource.includes("shouldRenderLifecycleV2Pending(projectNumberLifecycleUserView(workspace.lifecycleV2).stage)") &&
    numberStateWorkspace.includes('!["drawing_preparation", "drawing_addendum_required", "bundle_ready"].includes(stage)') &&
    sharedDetailContent.includes('dataSection="drawing-pending"'),
  "preparation stages keep the shared detail contract and hide empty guidance"
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
    searchPage.includes('data-entity-core-section="part-linked-drawings"'),
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
    searchPage.includes("明細載入失敗") &&
    searchPage.includes("目前先顯示圖料關係中的可用資料"),
  "src/app/numbering/search/page.tsx"
);

record(
  "Search drawer header waits for canonical owner status projection",
  searchPage.includes("type OwnerHeaderProjection") &&
    searchPage.includes("onOwnerHeaderProjection({") &&
    searchPage.includes("humanStatus: ownerPart.humanStatus") &&
    searchPage.includes("humanStatus: body.row.humanStatus") &&
    searchPage.includes("const visibleHeaderStatus = isRootTarget ? headerStatus : canonicalHeader?.humanStatus") &&
    !searchPage.includes("status={detail ? <HumanStatusBadge status={headerStatus ?? detail.humanStatus}"),
  "same entity status must come from its owner detail payload"
);

record(
  "Search results receive canonical drawing status before any drawer opens",
  relationRoute.includes("listDrawingModuleRecordsByIdsAsync(") &&
    relationRoute.includes("projectDrawingWorkbenchRecord(drawing, projectionActor)") &&
    relationRoute.includes("canonicalDrawingRows.get(drawing.id)") &&
    relationRoute.includes("const humanStatus = canonicalRow?.humanStatus ?? fallbackHumanStatus") &&
    relationRoute.includes("canonicalRow?.viewerStatus ?? projectRoleViewerHumanStatus(fallbackHumanStatus, viewerCapabilities)") &&
    relationRoute.includes("availabilityScope: projectDrawingRecordAvailability(drawing)") &&
    relationRoute.includes("revision candidate may be in review") &&
    numberingAsync.includes("export async function listDrawingModuleRecordsByIdsAsync") &&
    drawingWorkbenchProjection.includes("export function projectDrawingWorkbenchRecord"),
  "batch owner read model with workflow overlay and effective master availability"
);

record(
  "Root list and drawer share one canonical first-layer status",
  drawingPartRelationStatus.includes("export function projectNumberingRootStatus(") &&
    drawingPartRelationStatus.includes("humanStatus: projectRelationHumanStatus") &&
    relationRoute.includes("projectNumberingRootStatus") &&
    rootDetailRoute.includes("projectNumberingRootStatus") &&
    relationRoute.includes("const rootStatus = projectNumberingRootStatus(detail)") &&
    rootDetailRoute.includes("const rootStatus = projectNumberingRootStatus(detail)") &&
    relationRoute.includes("relationshipHealth: health") &&
    rootDetailRoute.includes("relationshipHealth: rootStatus.relationshipHealth") &&
    !relationRoute.includes("function relationshipHealth("),
  "action-required conflicts must outrank usable availability before list and detail render"
);

record(
  "Owner lists adopt the same canonical projection returned to the drawer",
  workbenchController.includes("getRowKey(row) === canonicalKey") &&
    workbenchController.includes('(body as { row?: Row }).row ?? row') &&
    drawingWorkbench.includes("usePdmWorkbenchController") &&
    partPage.includes("const canonicalPart = body.part as PartDetail") &&
    partPage.includes("part.partNumber === partNumber ? { ...part, ...canonicalPart } : part") &&
    partPage.includes("usePdmWorkbenchController") &&
    read("src/components/relation-workbench.tsx").includes("usePdmWorkbenchController") &&
    searchPage.includes("const syncCanonicalOwnerProjection = useCallback") &&
    searchPage.includes("setRelationRoots((currentRoots)") &&
    searchPage.includes("onCanonicalOwnerProjection={syncCanonicalOwnerProjection}"),
  "list and shared drawer must not show competing status truths"
);

record(
  "Search drawer identity uses canonical owner names without root context",
  searchPage.includes("name: ownerPart.partName") &&
    searchPage.includes("name: body.drawing.coreName") &&
    searchPage.includes("subtitle={isRootTarget ? header.subtitle : canonicalHeader?.name}") &&
    !searchPage.includes("subtitle={header.subtitle}"),
  "drawing and part subtitles must match their owner modules"
);

record(
  "Focused owner-list records activate with Enter or Space",
  drawingWorkbench.includes('if (event.key === "Enter" || event.key === " ")') &&
    drawingWorkbench.includes("onContainerKeyDown={listKeyboard.handleKeyDown}") &&
    drawingWorkbench.includes("onOpenRow={(row) => void openDetail(row.rowKey)}") &&
    workbenchList.includes("aria-keyshortcuts={rowAriaKeyShortcuts}") &&
    partPage.includes('event.key !== "Enter" && event.key !== " "') &&
    partPage.includes('aria-keyshortcuts="Enter Space"') &&
    partPage.includes("onSelect(part.partNumber)"),
  "keyboard activation must match mouse row switching"
);

record(
  "Search keyboard activation preserves the exact root, drawing, or part target",
  searchPage.includes("resolveNumberingSearchDetailTarget({ entityType: \"drawing_number\"") &&
    searchPage.includes("resolveNumberingSearchDetailTarget({ entityType: \"part_number\"") &&
    searchPage.includes("shouldDeferShortcutToFocusedControl(event.target)") &&
    searchPage.includes("input, textarea, select, button, a, [role='button'], [role='link']") &&
    searchPage.includes("function openDetailTargetFromKeyboard(") &&
    searchPage.includes('if (event.key !== "Enter" && event.key !== " ") return;') &&
    searchPage.includes("event.stopPropagation();") &&
    (searchPage.match(/onKeyDown=\{\(event\) => openDetailTargetFromKeyboard\(/g)?.length ?? 0) >= 6 &&
    (searchPage.match(/aria-keyshortcuts="Enter Space"/g)?.length ?? 0) >= 6 &&
    numberingSearchTarget.includes("export function resolveNumberingSearchDetailTarget") &&
    numberingSearchTarget.includes("export function shouldDeferNumberingSearchShortcut"),
  "exact entity buttons own Enter/Space; runtime mapper assertions are included by qc:pdm-numbering-search-target"
);

const searchGlobalShortcutStart = searchPage.indexOf("function handleShortcut(event: KeyboardEvent)");
const searchGlobalShortcutEnd = searchPage.indexOf('window.addEventListener("keydown", handleShortcut)', searchGlobalShortcutStart);
const searchGlobalShortcut = searchPage.slice(searchGlobalShortcutStart, searchGlobalShortcutEnd);
const searchAnchorCount = searchPage.match(/<a\b/g)?.length ?? 0;
const searchAnchorKeyboardCount = searchPage.match(/onKeyDown=\{activateSearchLinkFromKeyboard\}/g)?.length ?? 0;
const searchLinkHandlerStart = searchPage.indexOf("function activateSearchLinkFromKeyboard");
const searchLinkHandlerEnd = searchPage.indexOf("function hasSelectedText", searchLinkHandlerStart);
const searchLinkHandler = searchPage.slice(searchLinkHandlerStart, searchLinkHandlerEnd);
record(
  "Search links preserve native semantics and support unmodified Enter",
  searchGlobalShortcutStart !== -1 &&
    searchGlobalShortcutEnd > searchGlobalShortcutStart &&
    searchGlobalShortcut.indexOf("shouldDeferShortcutToFocusedControl(event.target)") < searchGlobalShortcut.indexOf("event.preventDefault()") &&
    searchPage.includes("function activateSearchLinkFromKeyboard(event: ReactKeyboardEvent<HTMLAnchorElement>)") &&
    searchPage.includes("if (!shouldActivateLinkFromKeyboard(event)) return;") &&
    searchPage.includes("event.currentTarget.click();") &&
    searchAnchorCount > 0 &&
    searchAnchorKeyboardCount === searchAnchorCount &&
    keyboardLinkActivation.includes("export function shouldActivateLinkFromKeyboard") &&
    !numberingSearchTarget.includes("shouldActivateLinkFromKeyboard") &&
    !searchLinkHandler.includes("window.location") &&
    !searchLinkHandler.includes("setTimeout"),
  "all search anchors share one Enter bridge; Space and modifier behavior stays native"
);

const numberStateTabsStart = numberStateWorkspace.indexOf("export function NumberStateModuleTabs");
const numberStateTabsEnd = numberStateWorkspace.indexOf("export function NumberStatePartsTabs", numberStateTabsStart);
const numberStateTabs = numberStateWorkspace.slice(numberStateTabsStart, numberStateTabsEnd);
record(
  "Shared number-state tabs apply the same keyboard link rule to every module",
  numberStateWorkspace.includes('reservedHref: "/numbering/search?tab=reserved"') &&
    numberStateWorkspace.includes('reservedHref: "/numbering/drawings?tab=reserved"') &&
    numberStateWorkspace.includes('reservedHref: "/parts?tab=drafts"') &&
    numberStateWorkspace.includes("function activateNumberStateTabLinkFromKeyboard(event: ReactKeyboardEvent<HTMLAnchorElement>)") &&
    numberStateWorkspace.includes("if (!shouldActivateLinkFromKeyboard(event)) return;") &&
    numberStateTabsStart !== -1 &&
    numberStateTabsEnd > numberStateTabsStart &&
    numberStateTabs.includes("href={config.officialHref}") &&
    numberStateTabs.includes("href={config.reservedHref}") &&
    (numberStateTabs.match(/onKeyDown=\{activateNumberStateTabLinkFromKeyboard\}/g)?.length ?? 0) === 2 &&
    numberStateTabs.includes('className={active === "official" ? "is-active" : undefined}') &&
    numberStateTabs.includes('className={active === "reserved" ? "is-active" : undefined}'),
  "search/drawings/parts official and reserved links share one renderer without changing href or active state"
);

const previewPresentationStart = attachmentPanel.indexOf("function attachmentPreviewPlaceholder");
const previewPresentationEnd = attachmentPanel.indexOf("function isControlledRevisionAttachment", previewPresentationStart);
const previewPresentation = attachmentPanel.slice(previewPresentationStart, previewPresentationEnd);
record(
  "Preview failures show a human next step without runtime internals",
  previewPresentationStart !== -1 &&
    previewPresentationEnd > previewPresentationStart &&
    previewPresentation.includes('title: slot.kind === "two-d" ? "2D 預覽尚未產生" : "3D 預覽尚未產生"') &&
    previewPresentation.includes('text: "可先下載原始檔查看；系統產生後重新整理即可。"') &&
    previewPresentation.includes("action: null") &&
    !previewPresentation.includes("稍後重試") &&
    attachmentPanel.includes('aria-label={`下載${slot.title}附件`}') &&
    !/Document Manager|PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY|Vault|環境變數|worker 可讀取/iu.test(previewPresentation),
  "src/components/master-attachment-panel.tsx"
);

record(
  "Human status popover clamps to the viewport",
  humanStatusBadge.includes("useLayoutEffect") &&
    humanStatusBadge.includes("window.innerWidth - popoverRect.width - viewportPadding") &&
    humanStatusBadge.includes("window.innerHeight - viewportPadding") &&
    humanStatusBadge.includes('window.addEventListener("scroll", positionPopover, true)') &&
    globalCss.includes(".human-status-detail-popover") &&
    globalCss.includes("position: fixed"),
  "src/components/human-status-badge.tsx"
);

record(
  "Root reminders are deduplicated and hide internal codes",
  searchPage.includes("function displayNumberingWarnings") &&
    searchPage.includes('key: "similar-numbering"') &&
    searchPage.includes('title: "找到相似編號"') &&
    searchPage.includes("displayWarnings.map((warning) =>") &&
    !searchPage.includes("warnings.map((warning) =>") &&
    !searchPage.includes("{warning.warningCode}</small>") &&
    searchPage.includes("humanizeAuditAction(audit.action)") &&
    !searchPage.includes("<span>{audit.action}</span>"),
  "human-facing warning and audit presentation"
);

record(
  "Root drawer keeps exactly one emphasized next action",
  searchPage.includes('actionEmphasis="secondary"') &&
    contextualEntrypoints.includes('actionEmphasis = "primary"') &&
    contextualEntrypoints.includes('actionEmphasis?: "primary" | "secondary"') &&
    contextualEntrypoints.includes('const emphasizedActionClass = actionEmphasis === "secondary" ? "secondary-button" : "primary-button"') &&
    contextualEntrypoints.includes("className={emphasizedActionClass}"),
  "contextual entrypoints preserve primary emphasis by default"
);

record(
  "Shared drawer close supports keyboard and a 44px touch target",
  entityDrawer.includes("function closeFromKeyboard") &&
    entityDrawer.includes('event.key !== "Enter" && event.key !== " "') &&
    entityDrawer.includes("onKeyDown={closeFromKeyboard}") &&
    entityDrawer.includes('data-pdm-drawer-close="true"') &&
    globalCss.includes(".pdm-entity-drawer-actions .pdm-entity-drawer-close") &&
    globalCss.includes("min-width: 44px") &&
    globalCss.includes("min-height: 44px"),
  "src/components/pdm-entity-detail-drawer.tsx"
);

record(
  "Part owner drawer does not repeat header identity in its first body panel",
  partPage.includes("<PartDetailPanel") &&
    partPage.includes("showIdentityHeader={false}") &&
    searchPage.includes("showIdentityHeader={false}"),
  "owner and search part drawers share the compact identity hierarchy"
);

record(
  "Drawing target includes canonical drawing owner sections",
  searchPage.includes("送審檢查") &&
    searchPage.includes("同根料號") &&
    searchPage.includes('entityType="drawing_number"') &&
    searchPage.includes("processControlled={isManufacturingDrawingPurpose(drawing.purposeCode)}"),
  "src/app/numbering/search/page.tsx"
);

record(
  "Part target includes canonical part owner sections",
  searchPage.includes("料號完整度檢查") &&
  searchPage.includes("料號屬性") &&
    searchPage.includes("圖號關聯") &&
    searchPage.includes('entityType="part_number"'),
  "src/app/numbering/search/page.tsx"
);

const targetPartCoreStart = searchPage.indexOf("function TargetPartCoreSections");
const targetPartAttachmentIndex = searchPage.indexOf('entityType="part_number"', targetPartCoreStart);
const targetPartReadinessIndex = searchPage.indexOf('data-entity-core-section="part-readiness"', targetPartCoreStart);
const targetPartLinkedDrawingsIndex = searchPage.indexOf('data-entity-core-section="part-linked-drawings"', targetPartCoreStart);
const targetPartAttributesIndex = searchPage.indexOf('data-entity-core-section="part-attributes"', targetPartCoreStart);
record(
  "Part target follows owner drawer information hierarchy",
  targetPartCoreStart !== -1 &&
    targetPartAttachmentIndex !== -1 &&
    targetPartReadinessIndex > targetPartAttachmentIndex &&
    targetPartLinkedDrawingsIndex > targetPartReadinessIndex &&
    targetPartAttributesIndex > targetPartLinkedDrawingsIndex,
  "src/app/numbering/search/page.tsx"
);

record(
  "Drawing module drawer publishes drawing entity metadata",
  drawingWorkbench.includes('entityType="drawing_number"') &&
    drawingWorkbench.includes("entityCode={drawing.drawingNumber}") &&
    drawingWorkbench.includes('sourceContext="numbering_drawings"'),
  "src/components/drawing-workbench.tsx"
);

record(
  "Part module drawer publishes part entity metadata",
  partPage.includes('entityType="part_number"') &&
    partPage.includes('entityCode={detail?.partNumber ?? ""}') &&
    partPage.includes('sourceContext="parts"'),
  "src/app/parts/page.tsx"
);

record(
  "Drawer width and human-status filters have one shared source",
  searchPage.includes("useRememberedDrawerWidth") &&
    partPage.includes("useRememberedDrawerWidth") &&
    !searchPage.includes("clampDetailDrawerWidth") &&
    !partPage.includes("clampDetailDrawerWidth") &&
    searchPage.includes("HumanStatusFilterSelect") &&
    drawingWorkbench.includes("HumanStatusFilterSelect") &&
    partPage.includes("HumanStatusFilterSelect") &&
    humanStatusFilter.includes("export function HumanStatusFilterSelect") &&
    humanStatusProjection.includes("export const HUMAN_STATUS_FILTER_OPTIONS"),
  "shared width and status contracts"
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
