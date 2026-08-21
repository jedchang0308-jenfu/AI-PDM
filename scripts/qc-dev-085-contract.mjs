import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const runId = `contract-${new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}-local`;
const runDir = path.join(root, "output", "qa", "dev-085-workbench-multiselect-filter", runId);
fs.mkdirSync(runDir, { recursive: true });
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const files = [
  "src/components/drawing-workbench.tsx",
  "src/components/part-workbench.tsx",
  "src/components/relation-workbench.tsx"
];
const source = files.map(read).join("\n");
const result = [];
function pass(id, condition) {
  assert.ok(condition, id);
  result.push({ id, status: "PASS" });
}

pass("MSF-CONTRACT-001 shared component is used by all workbenches", files.every((file) => read(file).includes("PdmWorkbenchMultiSelectFilter")));
const requiredFilterLabels = ["工作狀態", "系列代號", "圖面用途", "類型", "資料狀態"];
const requiredFilterCount = requiredFilterLabels.reduce((count, label) => count + source.split(`<PdmWorkbenchMultiSelectFilter label="${label}"`).length - 1, 0);
const optionalLaneCount = (source.match(/<PdmWorkbenchMultiSelectFilter label="版本列"/gu) ?? []).length;
pass("MSF-CONTRACT-002 all 12 DEV-085 filters are replaced; DEV-086 lane extension is explicit", requiredFilterCount === 12 && optionalLaneCount === 3);
pass("MSF-CONTRACT-003 history remains a native boolean control", (source.match(/checked=\{(?:includeHistory|query\.includeHistory)\}/g) ?? []).length === 3);
pass("MSF-CONTRACT-004 search remains text input", (source.match(/placeholder="(?:圖號、品名、料號|料號、圖料根號、名稱、材質、顏色|圖料根號、料號、圖號、名稱)"/g) ?? []).length === 3);
pass("MSF-CONTRACT-005 shared selection wire and sentinel exist", read("src/lib/pdm-workbench-filter-selection.ts").includes("PDM_WORKBENCH_FILTER_NONE_TOKEN") && read("src/lib/pdm-workbench-contract.ts").includes("PdmWorkbenchFilterSelection"));
const workbenchLibraries = ["src/lib/drawing-workbench.ts", "src/lib/part-workbench.ts", "src/lib/relation-workbench.ts"].map(read).join("\n");
pass("MSF-CONTRACT-006 cursor hash includes canonical selection arrays", read("src/lib/pdm-workbench-cursor.ts").includes("readonly string[]") && (workbenchLibraries.match(/selectionHashValue\(/g) ?? []).length >= 12);

console.log(`${result.length}/${result.length} PASS`);
fs.writeFileSync(path.join(runDir, "contract-results.json"), JSON.stringify({
  runId,
  status: "PASS",
  checks: result,
  scope: "DEV-085 shared client filter/component and cursor contract"
}, null, 2));
console.log(`evidence: ${path.relative(root, path.join(runDir, "contract-results.json"))}`);
