import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const service = read("src/lib/pdm-entity-detail.ts");
const contract = read("src/lib/pdm-entity-detail-contract.ts");
const ownerPreview = read("src/components/drawing-detail-preview.tsx");
const projection = read("src/components/drawing-projection.tsx");

assert.ok(contract.includes('"queued" | "running" | "ready" | "delayed" | "failed" | "unavailable" | "missing"'), "preview state vocabulary is fixed");
assert.ok(service.includes('state: "running"') && service.includes('state: "unavailable"') && service.includes('state: "missing"'), "server derives non-ready states");
assert.ok(!service.includes("previewableSource"), "server never marks a raw file as an automatic preview");
assert.ok(ownerPreview.includes('data-component="drawing-detail-preview"'), "owner preview has one stable state renderer");
assert.ok(projection.includes("DrawingDetailPreview") && projection.includes("dataSection=\"unified-drawing-preview\""), "unified projection adapts into the owner preview");
console.log("QC DEV-067 preview parity: PASS (shared renderer, strict derivative readiness, fixed states)");
