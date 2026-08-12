import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const drawer = read("src/components/unified-pdm-entity-detail-drawer.tsx");
const drawing = read("src/components/drawing-projection.tsx");
const workbenches = ["drawing-workbench.tsx", "part-workbench.tsx", "relation-workbench.tsx"].map((file) => read(`src/components/${file}`));

assert.equal((drawer.match(/data-component="unified-pdm-entity-detail-drawer"/gu) ?? []).length, 1, "enabled path has exactly one canonical drawer marker");
assert.equal((drawer.match(/<PdmEntityDetailDrawer/gu) ?? []).length, 1, "canonical drawer owns the one geometry shell");
assert.ok(drawer.includes('data-component="ProjectionComposer"'), "canonical drawer owns ProjectionComposer");
assert.ok(drawer.includes('data-component="ContextActionBar"'), "canonical drawer owns ContextActionBar");
assert.ok(drawing.includes('import { DrawingDetailPreview'), "DrawingProjection uses the owner preview component");
assert.ok(!drawing.includes("unified-pdm-preview-grid"), "DrawingProjection does not fork a second preview layout");
assert.ok(drawer.indexOf("DrawingProjection") < drawer.indexOf("PartProjection"));
assert.ok(drawer.indexOf("PartProjection") < drawer.indexOf("RelationProjection"));
assert.ok(drawer.indexOf("RelationProjection") < drawer.indexOf("ReviewContextProjection"));
for (const source of workbenches) {
  assert.ok(source.includes("!unifiedEntityDetailEnabled"), "legacy drawer remains behind the feature gate");
  assert.ok(source.includes("UnifiedPdmEntityDetailDrawer"), "enabled workbench path mounts the canonical drawer");
}
console.log("QC DEV-067 unified drawer UI: PASS (single drawer, fixed composer order, shared preview owner)");
