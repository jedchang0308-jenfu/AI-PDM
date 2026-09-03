import fs from "node:fs";
import path from "node:path";
import { validateSalesKitGraph, SharedBomError } from "../src/lib/bom-shared-structure.ts";

const root = process.cwd();
const evidenceDir = path.resolve(process.env.DEV106_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-106", "repository"));
fs.mkdirSync(evidenceDir, { recursive: true });
const childA = "child-a";
const childB = "child-b";
const base = () => ({
  lines: [{ id: "line-a", logicalLineId: "00000000-0000-4000-8000-000000000001", nodeType: "item", partNumber: "C-A", quantity: 1, quantityUomCode: "EA", sequenceNo: 1 }],
  floatingTopics: [],
  components: [{ nodeId: "line-a", logicalLineId: "00000000-0000-4000-8000-000000000001", nodeLocation: "tree", componentMode: "fixed", childPartNumberIds: [childA], parentSelections: [] }],
  parentPartNumberIds: ["parent-a"]
});
const expectPass = (label, input) => {
  validateSalesKitGraph(input);
  return { label, pass: true };
};
const expectCode = (label, input, code) => {
  try { validateSalesKitGraph(input); return { label, pass: false, expected: code, actual: "none" }; }
  catch (error) { return { label, pass: error instanceof SharedBomError && error.code === code, expected: code, actual: error instanceof Error ? error.message : String(error) }; }
};
const cases = [
  expectPass("single parent fixed integer", base()),
  expectCode("multiple parent rejected", { ...base(), parentPartNumberIds: ["parent-a", "parent-b"] }, "BOM_SALES_KIT_PARENT_COUNT_INVALID"),
  expectCode("floating topic rejected", { ...base(), floatingTopics: [{ id: "topic", logicalLineId: "00000000-0000-4000-8000-000000000002", nodeType: "item", quantity: 1 }] }, "BOM_SALES_KIT_FLOATING_TOPIC_FORBIDDEN"),
  expectCode("decimal quantity rejected", { ...base(), lines: [{ ...base().lines[0], quantity: 1.5 }] }, "BOM_SALES_KIT_QUANTITY_INTEGER_REQUIRED"),
  expectCode("by parent rejected", { ...base(), components: [{ ...base().components[0], componentMode: "by_parent", parentSelections: [{ parentPartNumberId: "parent-a", childPartNumberId: childA }] }] }, "BOM_SALES_KIT_FIXED_COMPONENT_REQUIRED"),
  expectCode("duplicate child rejected", { ...base(), lines: [...base().lines, { id: "line-b", logicalLineId: "00000000-0000-4000-8000-000000000002", nodeType: "item", partNumber: "C-A", quantity: 1, quantityUomCode: "EA", sequenceNo: 2 }], components: [...base().components, { nodeId: "line-b", logicalLineId: "00000000-0000-4000-8000-000000000002", nodeLocation: "tree", componentMode: "fixed", childPartNumberIds: [childA], parentSelections: [] }] }, "BOM_SALES_KIT_DUPLICATE_CHILD"),
  expectCode("missing component rejected", { ...base(), components: [] }, "BOM_COMPONENT_REQUIRED"),
  expectCode("zero quantity rejected", { ...base(), lines: [{ ...base().lines[0], quantity: 0 }] }, "BOM_QUANTITY_INVALID"),
  expectCode("negative quantity rejected", { ...base(), lines: [{ ...base().lines[0], quantity: -1 }] }, "BOM_QUANTITY_INVALID"),
  expectCode("empty candidate rejected", { ...base(), components: [{ ...base().components[0], childPartNumberIds: [] }] }, "BOM_COMPONENT_CANDIDATE_REQUIRED"),
  expectCode("fixed multi-candidate rejected", { ...base(), components: [{ ...base().components[0], childPartNumberIds: [childA, childB] }] }, "BOM_FIXED_COMPONENT_INVALID"),
  expectCode("parent selection rejected", { ...base(), components: [{ ...base().components[0], parentSelections: [{ parentPartNumberId: "parent-a", childPartNumberId: childA }] }] }, "BOM_FIXED_COMPONENT_INVALID"),
  expectPass("group remains visual-only", { ...base(), lines: [{ id: "group", logicalLineId: "00000000-0000-4000-8000-000000000003", nodeType: "group", groupName: "包裝", quantity: null, sequenceNo: 1 }, base().lines[0],], components: [{ ...base().components[0] }] })
];
const result = { runner: "repository", status: cases.every((item) => item.pass) ? "PASS" : "FAIL", providerParity: ["sqlite", "postgres"], cases: cases.map((item, index) => ({ id: `QA-106-${String(index + 6).padStart(3, "0")}`, ...item })), productionWrites: false };
fs.writeFileSync(path.join(evidenceDir, "case-results.json"), `${JSON.stringify(result, null, 2)}\n`);
for (const item of result.cases) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.id} ${item.label}`);
if (result.status !== "PASS") process.exitCode = 1;
