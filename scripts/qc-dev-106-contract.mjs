import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidenceDir = path.resolve(process.env.DEV106_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-106", "contract"));
fs.mkdirSync(evidenceDir, { recursive: true });
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [
  {
    id: "QA-106-003",
    label: "purpose contract has a single discriminant",
    pass: /BomPurpose\s*=\s*\"manufacturing\"\s*\|\s*\"sales_kit\"/.test(read("src/lib/types.ts"))
      && /bom_purpose:\s*BomPurpose/.test(read("src/lib/types.ts"))
  },
  {
    id: "QA-106-004",
    label: "sales kit structure rules stay isolated from manufacturing validator",
    pass: /export function validateSalesKitGraph/.test(read("src/lib/bom-shared-structure.ts"))
      && /validateSharedGraph\(graphInput\)/.test(read("src/lib/repositories/bom-workbench-async-repository.ts"))
      && /if \(before\.bom_purpose === \"sales_kit\"\) validateSalesKitGraph/.test(read("src/lib/repositories/bom-workbench-async-repository.ts"))
  },
  {
    id: "QA-106-005",
    label: "single writer and no sales-kit route family",
    pass: /createSharedBomDraftAsync/.test(read("src/app/api/bom/drafts/route.ts"))
      && !fs.existsSync(path.join(root, "src/app/api/bom/sales-kits/route.ts"))
      && /PDM_SALES_KIT_BOM_V1_ENABLED=false/.test(read(".env.example"))
  }
];
const result = { runner: "contract", status: checks.every((check) => check.pass) ? "PASS" : "FAIL", cases: checks, productionWrites: false };
fs.writeFileSync(path.join(evidenceDir, "case-results.json"), `${JSON.stringify(result, null, 2)}\n`);
for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"} ${check.id} ${check.label}`);
if (result.status !== "PASS") process.exitCode = 1;
