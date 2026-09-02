#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidenceDir = path.resolve(process.env.DEV113_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-113", "contract"));
fs.mkdirSync(evidenceDir, { recursive: true });
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function check(id, label, fn) {
  try { fn(); checks.push({ id, label, status: "PASS" }); console.log(`PASS ${id} ${label}`); }
  catch (error) { checks.push({ id, label, status: "FAIL", message: error instanceof Error ? error.message : String(error) }); throw error; }
}

const spec = read(".ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md");
const state = read("src/lib/pdm-canonical-workbench-state.ts");
const drawer = read("src/components/canonical-pdm-workbench.tsx");
const matrix = read("src/components/part-number-matrix-workspace.tsx");
const sections = read("src/components/part-maintenance-workspace-sections.tsx");
const preview = read("src/components/canonical-part-preview-section.tsx");
const relation = read("src/components/canonical-relation-matrix-section.tsx");
const bom = read("src/components/part-bom-context.tsx");
const contract = read("src/lib/part-number-matrix-contract.ts");
const repository = read("src/lib/repositories/part-number-matrix-async-repository.ts");
const page = read("src/app/parts/[partId]/workspace/page.tsx");
const packageJson = JSON.parse(read("package.json"));

check("C01", "Part drawer is readonly and has one primary maintenance entry", () => {
  assert.match(state, /record\.entityType === "part"[\s\S]*繼續編輯/);
  assert.match(state, /part_formal[\s\S]*編輯料號/);
  assert.doesNotMatch(state, /record\.entityType === "part"[\s\S]*edit_relation_matrix/);
  assert.match(drawer, /canonical-drawer-more-actions/);
  assert.match(drawer, /mode="readonly"/);
});
check("C02", "workspace exposes stable data maintenance and BOM tabs", () => {
  assert.match(contract, /PartMaintenanceTab/);
  assert.match(contract, /PART_MAINTENANCE_TABS/);
  assert.match(matrix, /part-maintenance-tabs/);
  assert.match(matrix, /tab=|searchParams/);
});
check("C03", "maintenance lazily loads exact source row and validates identity", () => {
  assert.match(repository, /sourceRowKey/);
  assert.match(sections, /\/api\/parts\/workbench\/\$\{encodeURIComponent\(sourceRowKey\)\}/);
  assert.match(sections, /entityType !== "part"/);
  assert.match(sections, /entityId !== partId/);
});
check("C04", "shared preview and relation presenters avoid duplicated writer ownership", () => {
  assert.match(preview, /CanonicalPreviewPanel/);
  assert.match(preview, /PartPreviewSourceControl/);
  assert.match(relation, /RelationMatrixTable/);
  assert.match(drawer, /CanonicalPartPreviewSection/);
  assert.match(drawer, /CanonicalRelationMatrixSection/);
});
check("C05", "root-wide relation and exact Part source scope are labelled", () => {
  assert.match(relation, /全根號圖料關聯/);
  assert.match(matrix, /來源/);
  assert.match(sections, /data-part-maintenance-tab/);
});
check("C06", "safe return and response-loss messaging are present", () => {
  assert.match(page, /normalizePdmPartReturnTo/);
  assert.match(page, /safeDrawingReturnTo/);
  assert.match(drawer, /entryCommandKeysRef/);
  assert.match(drawer, /操作結果尚未確認/);
});
check("C07", "Part relation capability is exact and Drawing keeps explicit activation", () => {
  assert.match(sections, /partRelationCanManage/);
  assert.match(sections, /action\.key === "edit"/);
  assert.match(sections, /activationMode="immediate"/);
  assert.match(sections, /mode=\{partRelationCanManage \? "manage" : "readonly"\}/);
  assert.doesNotMatch(sections, /relationEditing|編輯關聯/);
  assert.match(relation, /activationMode\?: "explicit" \| "immediate"/);
  assert.match(relation, /default="explicit"|activationMode = "explicit"/);
  assert.match(spec, /不新增.*schema|no-touch/iu);
});
check("C08", "relation recovery, BOM empty-state routing, and focused parent gates are registered", () => {
  assert.match(relation, /relationCommandFingerprint/);
  assert.match(relation, /idempotency-key/);
  assert.match(relation, /readback-failed/);
  assert.match(relation, /放棄草稿並載入最新資料/);
  assert.match(relation, /response\.status === 409 \|\| response\.status === 412/);
  assert.match(bom, /此料號為單一零件，不適用 BOM/);
  assert.match(bom, /前往維護調整結構型態/);
  assert.match(bom, /buildMaintenanceHref/);
  assert.match(bom, /searchParams\.set\("tab", "maintenance"\)/);
  assert.match(read("src/components/relation-matrix-table.tsx"), /dirtyKeys|is-dirty/);
  for (const name of ["qc:dev-113:contract", "qc:dev-113:integration", "qc:dev-113:browser-real", "qc:dev-113"]) assert.ok(packageJson.scripts?.[name], name);
});

const result = { runner: "contract", status: "PASS", denominator: 8, checks, sourceRevision: process.env.GIT_COMMIT ?? "working-tree" };
fs.writeFileSync(path.join(evidenceDir, "contract.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.length, total: checks.length }));
