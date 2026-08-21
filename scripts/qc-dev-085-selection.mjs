import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PDM_WORKBENCH_FILTER_NONE_TOKEN,
  canonicalizePdmWorkbenchFilterSelection,
  parsePdmWorkbenchFilterSelection,
  parsePdmWorkbenchFilterSelectionForBrowser,
  serializePdmWorkbenchFilterSelection,
  selectionHashValue
} from "../src/lib/pdm-workbench-filter-selection.ts";
import { parseWorkStatusSelection } from "../src/lib/work-status-presentation.ts";
import { pdmWorkbenchFilterHash } from "../src/lib/pdm-workbench-cursor.ts";
import { normalizeDrawingWorkbenchQuery } from "../src/lib/drawing-workbench.ts";
import { normalizePartWorkbenchQuery } from "../src/lib/part-workbench.ts";
import { normalizeRelationWorkbenchQuery } from "../src/lib/relation-workbench.ts";

const root = process.cwd();
const runId = `selection-${new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}-local`;
const runDir = path.join(root, "output", "qa", "dev-085-workbench-multiselect-filter", runId);
fs.mkdirSync(runDir, { recursive: true });

const checks = [];
function check(id, fn) {
  fn();
  checks.push({ id, status: "PASS" });
}

const staticOptions = ["Draft", "NeedInfo", "Active"];
check("MSF-001 missing means all and all omits key", () => {
  const params = new URLSearchParams();
  assert.deepEqual(parsePdmWorkbenchFilterSelection(params, "status", { allowedValues: staticOptions }), { mode: "all" });
  serializePdmWorkbenchFilterSelection(params, "status", { mode: "all" });
  assert.equal(params.has("status"), false);
});

check("MSF-002 repeated values deduplicate and use static authority order", () => {
  const params = new URLSearchParams("status=Active&status=Draft&status=Active");
  const selection = parsePdmWorkbenchFilterSelection(params, "status", { allowedValues: staticOptions });
  assert.deepEqual(selection, { mode: "some", values: ["Draft", "Active"] });
  const output = new URLSearchParams();
  serializePdmWorkbenchFilterSelection(output, "status", selection, { allowedValues: staticOptions });
  assert.deepEqual(output.getAll("status"), ["Draft", "Active"]);
});

check("MSF-003 none is explicit and round-trips", () => {
  const params = new URLSearchParams(`status=${PDM_WORKBENCH_FILTER_NONE_TOKEN}`);
  const selection = parsePdmWorkbenchFilterSelection(params, "status", { allowedValues: staticOptions });
  assert.deepEqual(selection, { mode: "none" });
  const output = new URLSearchParams();
  serializePdmWorkbenchFilterSelection(output, "status", selection);
  assert.deepEqual(output.getAll("status"), [PDM_WORKBENCH_FILTER_NONE_TOKEN]);
});

check("MSF-004 legacy scalar/all compatibility", () => {
  assert.deepEqual(parsePdmWorkbenchFilterSelection(new URLSearchParams("status=Active"), "status", { allowedValues: staticOptions }), { mode: "some", values: ["Active"] });
  assert.deepEqual(parsePdmWorkbenchFilterSelection(new URLSearchParams("status=all"), "status", { allowedValues: staticOptions }), { mode: "all" });
  assert.deepEqual(parsePdmWorkbenchFilterSelection(new URLSearchParams("status="), "status", { allowedValues: staticOptions }), { mode: "all" });
});

check("MSF-005 malformed values fail closed", () => {
  for (const input of [
    "status=__none__&status=Active",
    "status=Unknown",
    `status=${"x".repeat(121)}`,
    "status=%01",
    Array.from({ length: 51 }, (_, index) => `status=v${index}`).join("&")
  ]) assert.throws(() => parsePdmWorkbenchFilterSelection(new URLSearchParams(input), "status", { allowedValues: staticOptions }));
});

check("MSF-006 hash is order invariant", () => {
  const one = pdmWorkbenchFilterHash({ namespace: "part-v1", filters: { status: selectionHashValue({ mode: "some", values: ["Draft", "Active"] }) }, companyId: "c1", actorId: "u1" });
  const two = pdmWorkbenchFilterHash({ namespace: "part-v1", filters: { status: selectionHashValue(canonicalizePdmWorkbenchFilterSelection({ mode: "some", values: ["Active", "Draft"] }, staticOptions)) }, companyId: "c1", actorId: "u1" });
  assert.equal(one, two);
  assert.notEqual(one, pdmWorkbenchFilterHash({ namespace: "part-v1", filters: { status: selectionHashValue({ mode: "none" }) }, companyId: "c1", actorId: "u1" }));
});

check("MSF-007 browser malformed deep link becomes none", () => {
  const params = new URLSearchParams("status=Unknown");
  assert.deepEqual(parsePdmWorkbenchFilterSelectionForBrowser(params, "status", { allowedValues: staticOptions }), { mode: "none" });
  assert.deepEqual(params.getAll("status"), [PDM_WORKBENCH_FILTER_NONE_TOKEN]);
});

check("MSF-008 work status none is accepted by server parser", () => {
  const params = new URLSearchParams(`humanStatus=${PDM_WORKBENCH_FILTER_NONE_TOKEN}&history=exclude&view=all`);
  const result = parseWorkStatusSelection(params, { history: "exclude", view: "all", supportsMineView: true, strict: true });
  assert.deepEqual(result.selection, { mode: "none" });
});

check("MSF-009 all three server normalizers preserve repeated and none modes", () => {
  const drawing = normalizeDrawingWorkbenchQuery(new URL("http://localhost/numbering/drawings?seriesCode=S1&seriesCode=S2&purposeCode=__none__&recordStatus=Active&humanStatus=editing"));
  assert.deepEqual(drawing.seriesCode, { mode: "some", values: ["S1", "S2"] });
  assert.deepEqual(drawing.purposeCode, { mode: "none" });
  const part = normalizePartWorkbenchQuery(new URL("http://localhost/parts?itemKind=manufactured&itemKind=purchased&recordStatus=__none__&humanStatus=__none__"));
  assert.deepEqual(part.itemKind, { mode: "some", values: ["purchased", "manufactured"] });
  assert.deepEqual(part.recordStatus, { mode: "none" });
  assert.deepEqual(part.humanStatus, { mode: "none" });
  const relation = normalizeRelationWorkbenchQuery(new URL("http://localhost/numbering/search?entityType=part_number&entityType=drawing_number&recordStatus=Released"));
  assert.deepEqual(relation.entityType, { mode: "some", values: ["part_number", "drawing_number"] });
  assert.deepEqual(relation.recordStatus, { mode: "some", values: ["Released"] });
});

const report = {
  runId,
  status: "PASS",
  checks,
  scope: "DEV-085 selection wire, fail-closed parsing, canonical ordering, cursor hash"
};
fs.writeFileSync(path.join(runDir, "selection-results.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${checks.length}/${checks.length} PASS`);
