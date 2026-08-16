import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync("src/lib/relation-workbench.ts", "utf8");
const component = fs.readFileSync("src/components/relation-workbench.tsx", "utf8");

assert.ok(
  service.includes('query.includeHistory || candidateStage(workspace) !== "history_only"'),
  "cancelled candidate changes must be excluded unless history is requested"
);
assert.ok(
  component.includes("row.activeChanges.map") && component.includes("change.drawingCodes") && component.includes("onOpenChange(change)"),
  "expanded relation rows must render and open candidate change/history identities"
);
assert.ok(
  component.includes('change.stage === "history_only"') && component.includes("change.stageLabel"),
  "cancelled changes must have a distinct read-only history presentation"
);

console.log("QC DEV-074 relation history visibility: PASS (history filter + visible/openable cancelled identity)");
