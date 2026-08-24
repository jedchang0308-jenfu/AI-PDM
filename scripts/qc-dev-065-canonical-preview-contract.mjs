#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = (id, condition, detail = "") => checks.push({ id, passed: Boolean(condition), detail });

const contract = read("src/lib/pdm-canonical-workbench-contract.ts");
const preview = read("src/lib/pdm-canonical-preview.ts");
const repository = read("src/lib/repositories/pdm-canonical-workbench-async-repository.ts");
const partRepository = read("src/lib/repositories/pdm-part-preview-async-repository.ts");
const service = read("src/lib/pdm-canonical-workbench.ts");
const partService = read("src/lib/pdm-part-preview.ts");
const component = read("src/components/canonical-pdm-workbench.tsx");
const gallery = read("src/components/canonical-pdm-preview-gallery.tsx");
const media = read("src/components/canonical-preview-media.tsx");
const panel = read("src/components/canonical-preview-panel.tsx");
const drawingAdapter = read("src/components/drawing-detail-preview.tsx");
const partControl = read("src/components/part-preview-source-control.tsx");
const css = read("src/app/globals.css");
const layoutSwitch = read("src/components/pdm-workbench-layout-switch.tsx");
const feature = read("src/lib/number-state-flow-feature.ts");
const packageJson = JSON.parse(read("package.json"));

const { buildCanonicalDrawingPreviewMap, resolveCanonicalDrawingPreview, selectCanonicalThreeDSource } = await import("../src/lib/pdm-canonical-preview.ts");

check("CPG-001 neutral DTO atomically uses previewByRowKey", contract.includes("previewByRowKey?") && !contract.includes("preview3dByRowKey") && preview.includes("CanonicalPreviewProjection"));
check("CPG-002 exact canonical row keys are preserved", preview.includes("result[`cw_${row.id}`]") && component.includes("previewByRowKey"));
check("CPG-003 Drawing source and derivative reads remain bounded", repository.includes("withPdmWorkbenchReadSnapshot") && repository.includes("drawing_revision_files binding") && repository.includes("UNION ALL") && repository.includes("preview_jobs"));

const source = (overrides = {}) => ({ rowId: "state-1", revisionId: "rev-1", dataLayer: "drawing_production", reviewRequestId: null, bindingId: "binding-1", assetId: "asset-1", role: "cad_3d", displayName: "A0002-M01.SLDPRT", fileName: "A0002-M01.SLDPRT", fileExt: "sldprt", mimeType: "application/octet-stream", contentHash: "hash-1", isPrimary: 1, sortOrder: 0, ...overrides });
const readyDerivative = (overrides = {}) => ({ recordKind: "derivative", id: "derivative-1", sourceFileAssetId: "asset-1", sourceContentHash: "hash-1", derivativeKind: "thumbnail_png", storageKey: "preview/derivative-1.png", mimeType: "image/png", generatorProfile: "windows_solidworks_preview_worker", generatorVersion: "1", status: "ready", createdAt: "2026-08-23T00:00:00Z", lastHeartbeatAt: null, ...overrides });
check("CPG-004 role and deterministic binding precedence", selectCanonicalThreeDSource([source({ bindingId: "extension", role: "model", isPrimary: 1 }), source({ bindingId: "cad", role: "cad_3d", isPrimary: 0 })], "rev-1")?.bindingId === "cad");
check("CPG-005 exact revision without source is explicit missing", resolveCanonicalDrawingPreview({ source: null, derivativeJobs: [] }).state === "missing" && resolveCanonicalDrawingPreview({ source: null, derivativeJobs: [] }).sourceType === "none");
check("CPG-006 ready/pending/failed states map", resolveCanonicalDrawingPreview({ source: source(), derivativeJobs: [readyDerivative()] }).state === "ready"
  && resolveCanonicalDrawingPreview({ source: source(), derivativeJobs: [{ ...readyDerivative(), recordKind: "job", id: null, derivativeKind: null, storageKey: null, mimeType: null, generatorProfile: null, generatorVersion: null, status: "queued", lastHeartbeatAt: new Date().toISOString() }] }).state === "pending"
  && resolveCanonicalDrawingPreview({ source: source(), derivativeJobs: [{ ...readyDerivative(), recordKind: "job", id: null, derivativeKind: null, storageKey: null, mimeType: null, generatorProfile: null, generatorVersion: null, status: "failed", lastHeartbeatAt: new Date().toISOString() }] }).state === "failed");
check("CPG-007 hash and fake generator fail closed", resolveCanonicalDrawingPreview({ source: source({ contentHash: "" }), derivativeJobs: [readyDerivative()] }).state === "unavailable"
  && resolveCanonicalDrawingPreview({ source: source(), derivativeJobs: [readyDerivative({ generatorProfile: "fake_preview_worker" })] }).state === "unavailable");
const map = buildCanonicalDrawingPreviewMap({ rows: [{ id: "state-1", code: "A0002-M01", revisionId: "rev-1", revision: "A", dataLayer: "drawing_production" }, { id: "state-2", code: "A0002-M01", revisionId: null, revision: null, dataLayer: "drawing_rd" }], sources: [source()], derivativeJobs: [readyDerivative()] });
check("CPG-008 visible rows and preview key set are equal", Object.keys(map).sort().join(",") === "cw_state-1,cw_state-2");
check("CPG-009 ready media uses canonical file read only", map["cw_state-1"].media?.href.startsWith("/api/pdm/file-assets/asset-1?") === true && !map["cw_state-1"].media?.href.includes("/preview/"));
check("CPG-010 Part resolver is three bulk statements without row loops", partRepository.includes("listSettingsAndCustomAssets") && partRepository.includes("listPrimaryDrawingSources") && partRepository.includes("listDerivativeJobs") && !partRepository.includes("for (const part"));
check("CPG-011 gallery has no per-card preview endpoint", gallery.includes("CanonicalPreviewMedia") && !gallery.includes("/workbench/") && !gallery.includes("fetch("));
check("CPG-012 current caller is entity-neutral", component.includes("CanonicalEntityPreviewGallery") && component.includes("previewByRowKey") && !component.includes("preview3dByRowKey"));
check("CPG-013 Drawing/Part URL-storage precedence is explicit", component.includes("urlLayout ?? storedLayout ?? \"list\"") && preview.includes("pdm-canonical-drawing-layout-v1") && preview.includes("pdm-canonical-part-layout-v1"));
check("CPG-014 layout switch uses replaceState and pressed buttons", component.includes("replaceLocation({ layout: next })") && layoutSwitch.includes("aria-pressed"));
check("CPG-015 pagination appends one neutral map", component.includes("append ? { ...current, ...(result.data.previewByRowKey ?? {}) }"));
check("CPG-016 list response race is guarded", component.includes("listAbortRef.current?.abort()") && component.includes("listRequestRef.current"));
check("CPG-017 media failure is owned by shared loader", media.includes("setLoadState(\"failed\")") && media.includes("重新整理預覽") && !gallery.includes("failedImages"));
check("CPG-018 gallery keyboard navigation is roving", gallery.includes("ArrowRight") && gallery.includes("PageDown") && gallery.includes("aria-pressed") && gallery.includes("tabIndex"));
check("CPG-019 focus and accessible state do not rely on color", gallery.includes("aria-label={accessibleName}") && gallery.includes("aria-keyshortcuts"));
check("CPG-020 cards expose identity, source, layer and handling", gallery.includes("row.code") && gallery.includes("row.name") && gallery.includes("preview.sourceLabel") && gallery.includes("row.layerLabel") && gallery.includes("row.handlingLabel"));
check("CPG-021 loading/empty/error remain local", gallery.includes("正在載入預覽圖") && gallery.includes("沒有符合條件的資料") && component.includes("清單載入失敗"));
check("CPG-022 responsive contain media exists", css.includes("canonical-preview-gallery") && css.includes("object-fit: contain") && css.includes("@media (max-width: 560px)"));
check("CPG-023 list/detail Part share one resolver", service.match(/resolvePartPreviewsAsync/g)?.length === 3 && partService.includes("export async function resolvePartPreviewsAsync"));
check("CPG-024 feature is default-off and dependency-gated", feature.includes("PDM_PART_PREVIEW_V1") && feature.includes("WORKBENCH_PREVIEW_GALLERY_V1_FLAG") && feature.includes("UNIFIED_PART_RELATION_WORKBENCH_V1_FLAG"));
check("CPG-025 direct sharp and focused scripts are registered", packageJson.dependencies?.sharp === "0.35.3" && packageJson.scripts?.["qc:dev-065:part-preview"] && packageJson.scripts?.["qc:dev-065:postgres"]);
check("CPG-026 Drawing adapter is thin and loader-free", drawingAdapter.includes("CanonicalPreviewPanel") && !drawingAdapter.includes("useEffect") && !drawingAdapter.includes("fetch("));
check("CPG-027 shared component layering is one-way", panel.includes("CanonicalPreviewMedia") && gallery.includes("CanonicalPreviewMedia") && partControl.includes("/preview-image/reset"));
check("CPG-028 provisional override flag has zero callers", ![feature, service, partService, component, gallery].some((text) => text.includes("PDM_PART_PREVIEW_OVERRIDE_V1")));

const failed = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.id}${item.detail ? ` ${item.detail}` : ""}`);
if (failed.length) {
  console.error(`DEV-065 canonical preview contract QC failed: ${failed.length} check(s)`);
  process.exitCode = 1;
} else {
  console.log(`DEV-065 canonical preview contract QC passed: ${checks.length} checks`);
}
