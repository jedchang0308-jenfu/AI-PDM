#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const record = (id, passed) => checks.push({ id, passed: Boolean(passed) });

const contract = read("src/lib/pdm-workbench-contract.ts");
const resolver = read("src/lib/pdm-workbench-preview-gallery.ts");
const drawing = read("src/lib/drawing-workbench.ts");
const part = read("src/lib/part-workbench.ts");
const gallery = read("src/components/pdm-workbench-preview-gallery.tsx");
const layoutSwitch = read("src/components/pdm-workbench-layout-switch.tsx");
const feature = read("src/lib/number-state-flow-feature.ts");
const sqlite = read("db/schema.sql");
const postgres = read("db/postgres/031_workbench_preview_gallery.sql");
const { selectRepresentativeDrawing } = await import("@/lib/pdm-workbench-preview-gallery");

record("PG-001 contract exposes explicit preview states and nullable href", contract.includes('"ready" | "pending" | "delayed"') && contract.includes('"missing" | "failed" | "unavailable"') && contract.includes("href: string | null"));
record("PG-002 deterministic root selection reads sequence_no and excludes terminal drawings", resolver.includes("sequence_no IS NOT NULL") && resolver.includes("NOT IN ('obsolete', 'merged', 'cancelled')") && resolver.includes("localeCompare"));
record("PG-003 latest revision uses canonical comparator and excludes superseded/cancelled", resolver.includes("compareRevisionCodes") && resolver.includes("lifecycle_state NOT IN ('cancelled', 'superseded')"));
record("PG-004 preview integrity rejects fake generators and mismatched hashes", resolver.includes('generator_profile !== "fake_preview_worker"') && resolver.includes("source_content_hash !== source.sourceContentHash"));
record("PG-005 list/detail adapters bulk-hydrate preview only when enabled", drawing.includes("resolveDrawingWorkbenchPreviewReferences") && part.includes("resolvePartWorkbenchPreviewReferences") && drawing.includes("previewEnabled"));
record("PG-006 feature flag fails closed behind unified workbench dependencies", feature.includes("WORKBENCH_PREVIEW_GALLERY_V1_FLAG") && feature.includes("isUnifiedDrawingWorkbenchV1Enabled") && feature.includes("isUnifiedPartRelationWorkbenchV1Enabled"));
record("PG-007 switch has real buttons and pressed state", layoutSwitch.includes("aria-pressed") && layoutSwitch.includes("清單") && layoutSwitch.includes("預覽圖"));
record("PG-008 gallery supports responsive lazy PNG cards and keyboard parity", gallery.includes('loading="lazy"') && gallery.includes("PageDown") && gallery.includes("ArrowRight") && gallery.includes("navigator.clipboard"));
record("PG-009 additive index exists in SQLite and PostgreSQL artifact", sqlite.includes("idx_drawings_company_root_sequence") && postgres.includes("idx_drawings_company_root_sequence"));
const representative = selectRepresentativeDrawing([
  { id: "draw-10", drawingNumber: "A01-M10", partRootId: "root-1", workspaceId: null, sequenceNo: 10 },
  { id: "draw-2", drawingNumber: "A01-M02", partRootId: "root-1", workspaceId: null, sequenceNo: 2 },
  { id: "draw-1", drawingNumber: "A01-M01", partRootId: "root-1", workspaceId: null, sequenceNo: 1, lifecycleState: "obsolete" },
  { id: "draw-1b", drawingNumber: "A01-M01B", partRootId: "root-1", workspaceId: null, sequenceNo: 1 },
  { id: "draw-null", drawingNumber: null, partRootId: "root-1", workspaceId: null, sequenceNo: 0 }
]);
record(
  "PG-010 executable representative fixture chooses numeric minimum and natural tie-break within four projection queries",
  representative?.id === "draw-1b" && (resolver.match(/client\.query</g) ?? []).length <= 4
);

const failed = checks.filter((check) => !check.passed);
for (const check of checks) console.log(`${check.passed ? "PASS" : "FAIL"} ${check.id}`);
if (failed.length > 0) {
  console.error(`DEV-065 focused contract QC failed: ${failed.length} check(s)`);
  process.exitCode = 1;
} else {
  console.log(`DEV-065 focused contract QC passed: ${checks.length} checks`);
}
