#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidenceDir = path.resolve(process.env.DEV108_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-108", "contract"));
fs.mkdirSync(evidenceDir, { recursive: true });
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function check(id, label, fn) {
  try { fn(); checks.push({ id, label, status: "PASS" }); console.log(`PASS ${id} ${label}`); }
  catch (error) { checks.push({ id, label, status: "FAIL", message: error instanceof Error ? error.message : String(error) }); throw error; }
}

const spec = read(".ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md");
const component = read("src/components/part-number-matrix-workspace.tsx");
const styles = read("src/app/globals.css");
const contract = read("src/lib/part-number-matrix-contract.ts");
const repository = read("src/lib/repositories/part-number-matrix-async-repository.ts");
const route = read("src/app/api/pdm/parts/[partId]/matrix-workspace/route.ts");
const createRoute = read("src/app/api/pdm/parts/[partId]/change-works/route.ts");
const attachmentRoute = read("src/app/api/parts/[partNumber]/attachments/route.ts");
const attachmentManager = read("src/components/canonical-part-attachment-manager.tsx");

check("C01", "matrix route uses dynamic params and exact workId", () => {
  assert.match(route, /await params/); assert.match(route, /workId/); assert.match(route, /sourcePartId/);
});
check("C02", "part owner dispatches to matrix while drawing/review remain existing renderer", () => {
  assert.match(read("src/components/canonical-change-workspace.tsx"), /PartNumberMatrixWorkspace/);
  assert.match(read("src/components/canonical-change-workspace.tsx"), /CanonicalDrawingChangeWorkspace/);
});
check("C03", "fixed row registry and control types", () => {
  assert.match(contract, /PART_MATRIX_ROW_REGISTRY/);
  for (const key of ["partName", "itemKind", "customSpecification", "materialLabel", "colorLabel", "surfaceTreatment", "bomUsagePolicy", "isUniversal", "variantNote"]) assert.match(contract, new RegExp(`key: \\\"${key}\\\"`));
  assert.match(component, /confirmedRows/); assert.match(component, /data-confirmed-attribute/); assert.match(component, /placeholder=\"—\"/); assert.doesNotMatch(component, /part-number-matrix-display/);
});
check("C04", "bounded autosave constants and payload normalization", () => {
  assert.match(contract, /PART_MATRIX_AUTOSAVE_IDLE_MS = 800/); assert.match(contract, /PART_MATRIX_MAX_CONCURRENCY = 3/);
  assert.match(repository, /normalizePartChangePayload/); assert.match(createRoute, /initialPayload/);
});
check("C05", "canonical row difference and attachment exclusion", () => {
  assert.match(component, /matrixRowDiffers/); assert.match(component, /附件/); assert.match(component, /confirmedAttributeValue/); assert.doesNotMatch(component, /其他已確認屬性/); assert.match(contract, /matrixPayloadValue/);
});
check("C06", "single matrix without batch mode or range controls", () => {
  assert.doesNotMatch(component, /批次模式|範圍貼上|merged|formula/i); assert.match(component, /<table/);
});
check("C07", "only existing create/PATCH/submit/cancel writers are used", () => {
  assert.match(component, /\/api\/pdm\/parts\/.*change-works/); assert.match(component, /\/api\/pdm\/part-change-works/);
  assert.match(route, /readPartNumberMatrixWorkspace/); assert.doesNotMatch(route, /PATCH|POST/);
});
check("C08", "no schema or dependency change", () => {
  assert.match(spec, /不新增.*schema|no-touch/u); assert.doesNotMatch(component, /supabase|axios/iu);
});
check("C09", "review renderer stays outside matrix component", () => {
  assert.doesNotMatch(component, /reviewRequestId|approve|decision/); assert.match(read("src/components/canonical-change-workspace.tsx"), /GenericCanonicalChangeWorkspace/);
});
check("C10", "attachment preview remains on-demand with canonical file read", () => {
  assert.match(attachmentManager, /pdmFileReadHref/); assert.match(read("src/lib/pdm-file-read-contract.ts"), /part_attachment/);
});
check("C11", "semantic table, sticky matrix scroll and visible errors", () => {
  assert.match(component, /scope="row"/); assert.match(component, /scope="col"/); assert.match(component, /data-matrix-scroll-owner/); assert.match(component, /role="alert"/); assert.doesNotMatch(styles, /\.part-number-matrix-cell\.is-focused\s*\{[^}]*outline/);
});
check("C12", "server-side deleted-data guard and attachment read separation", () => {
  assert.match(attachmentRoute, /surface === "deleted_data"/); assert.match(attachmentRoute, /requireNumberingActionAsync\(request, "numbering\.attachments\.manage"\)/);
});

const report = { runtimeDeclaration: { project: root, purpose: "DEV-108 static contract gate", port: null, owningProcessTree: "this Node runner only", cleanupCondition: "evidence file retained; no runtime", PDM_DATA_DIR: null, PDM_REPOSITORY_DIR: null, mutationScope: "evidence directory only" }, denominator: 12, checks };
fs.writeFileSync(path.join(evidenceDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`DEV-108 contract: PASS (${checks.length}/12)`);
