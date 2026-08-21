import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const drawer = read("src/components/unified-pdm-entity-detail-drawer.tsx");
const drawing = read("src/components/drawing-projection.tsx");
const workbenchFiles = ["drawing-workbench.tsx", "part-workbench.tsx", "relation-workbench.tsx"];
const workbenches = workbenchFiles.map((file) => ({ file, source: read(`src/components/${file}`) }));

assert.equal((drawer.match(/data-component="unified-pdm-entity-detail-drawer"/gu) ?? []).length, 1, "enabled path has exactly one canonical drawer marker");
assert.equal((drawer.match(/<PdmEntityDetailDrawer/gu) ?? []).length, 1, "canonical drawer owns the one geometry shell");
assert.ok(drawer.includes('data-component="ProjectionComposer"'), "canonical drawer owns ProjectionComposer");
assert.ok(drawer.includes('data-component="ContextActionBar"'), "canonical drawer owns ContextActionBar");
assert.ok(drawing.includes('import { DrawingDetailPreview'), "DrawingProjection uses the owner preview component");
assert.ok(!drawing.includes("unified-pdm-preview-grid"), "DrawingProjection does not fork a second preview layout");
assert.ok(drawer.indexOf("DrawingProjection") < drawer.indexOf("PartProjection"));
assert.ok(drawer.indexOf("PartProjection") < drawer.indexOf("RelationProjection"));
assert.ok(drawer.indexOf("RelationProjection") < drawer.indexOf("ReviewContextProjection"));
for (const { file, source } of workbenches) {
  assert.ok(source.includes("!unifiedEntityDetailEnabled"), "legacy drawer remains behind the feature gate");
  assert.ok(source.includes("UnifiedPdmEntityDetailDrawer"), "enabled workbench path mounts the canonical drawer");
  assert.match(source, /detail\?\.candidate \?/u, "candidate branch remains explicit");
  assert.doesNotMatch(source, /detail\?\.candidate[\s\S]{0,600}NumberingCandidateRevisionEditor/u, "candidate drawer must not mount the editable revision editor");
  if (file === "drawing-workbench.tsx") {
    assert.match(source, /detail\?\.candidate[\s\S]{0,600}DrawingReadonlyCandidateDrawer/u, "Drawing candidate branch remains its read-only drawer");
  } else {
    assert.match(source, /detail\?\.candidate[\s\S]{0,600}WorkspaceReadonlyDrawer/u, `${file} candidate branch uses the shared read-only drawer`);
  }
  assert.match(source, /unifiedEntityDetailEnabled && selectedKey && detail && !detail(?:\?\.|\.)candidate/u, "canonical read drawer must wait for resolved detail and must not replace candidate read-only detail");
}
console.log("QC DEV-067 unified drawer UI: PASS (single formal drawer, read-only candidate drawers, fixed composer order, shared preview owner)");
