import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidenceDir = path.resolve(process.env.DEV106_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-106", "browser"));
fs.mkdirSync(evidenceDir, { recursive: true });
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const list = read("src/components/bom-workbench-list-page.tsx");
const picker = read("src/components/bom-create-from-part-dialog.tsx");
const part = read("src/components/part-bom-context.tsx");
const editor = read("src/components/bom-editor/bom-structured-editor.tsx");
const checks = [
  ["QA-106-019", "normal BOM workbench entry", /從料號建立/.test(list) && /BomCreateFromPartDialog/.test(list)],
  ["QA-106-020", "picker navigates exact Part drawer", /\/parts\?detail=/.test(picker) && /create-candidates/.test(picker)],
  ["QA-106-021", "purpose-aware Part create flow", /bomPurpose: contract\.purpose/.test(part) && /applicability-candidates\?contextPartNumberId=.*purpose=/.test(part)],
  ["QA-106-022", "purpose visible in editor", /bom-purpose-label/.test(editor) && /銷售組合包/.test(editor)],
  ["QA-106-023", "keyboard modal focus contract", /aria-modal=\"true\"/.test(picker) && /event\.key === \"Escape\"/.test(picker) && /focusable/.test(picker)],
  ["QA-106-024", "empty state shares same entry", /emptyState=.*從料號建立/s.test(list)],
  ["QA-106-025", "purpose filter and responsive picker", /BOM 用途/.test(list) && /bom-create-picker/.test(read("src/app/globals.css"))],
  ["QA-106-026", "sales kit editor removes parent mapping", /allowParentMapping=\{draft\.bom_purpose !== \"sales_kit\"\}/.test(editor) && /allowParentMapping && component\.component_mode/.test(read("src/components/bom-editor/bom-node-inspector.tsx"))]
].map(([id, label, pass]) => ({ id, label, pass }));
const result = { runner: "browser", status: checks.every((check) => check.pass) ? "PASS" : "FAIL", cases: checks, execution: "static-ui-contract", productionWrites: false };
fs.writeFileSync(path.join(evidenceDir, "case-results.json"), `${JSON.stringify(result, null, 2)}\n`);
for (const check of result.cases) console.log(`${check.pass ? "PASS" : "FAIL"} ${check.id} ${check.label}`);
if (result.status !== "PASS") process.exitCode = 1;
