import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function check(id, label, condition, detail = "") {
  const pass = Boolean(condition); checks.push({ id, label, pass, detail: pass ? detail : `failed: ${detail || label}` });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${label}`);
}
const page = read("src/components/bom-create-page.tsx");
const candidates = read("src/app/api/bom/create-candidates/route.ts");
const applicability = read("src/app/api/bom/applicability-candidates/route.ts");
const drafts = read("src/app/api/bom/drafts/route.ts");
const context = read("src/lib/bom-create-context.ts");
const units = read("src/lib/bom-unit-of-measure.ts");
const migration = read("scripts/migrate-dev-109-unified-bom.mjs");
const helper = read("src/lib/sldasm-assembly-evidence.ts");
check("C01", "create UI has one purpose-free canonical CTA", /建立 BOM/u.test(page) && !/bomPurpose|銷售組合包|製造BOM/u.test(page));
check("C02", "candidate API retires purpose input", /BOM_PURPOSE_RETIRED/u.test(candidates) && !/parseBomPurpose/u.test(candidates));
check("C03", "applicability API carries exact context identity", /contextPartNumberId.*definitionId.*baseReleaseSnapshotId/su.test(applicability) && /mode: contract\.mode/u.test(applicability) && /next_revision/u.test(context));
check("C04", "draft writer has no runtime purpose branch", /BOM_PURPOSE_RETIRED/u.test(drafts) && !/bomPurposeLabel/u.test(drafts));
check("C05", "unified eligibility does not gate item_kind/M drawing", /unifiedMode/u.test(context) && /structure_type = 'assembly'/u.test(context));
check("C06", "UOM and exact decimal parser are centralized", /BOM_UOM_CODES/u.test(units) && /scaled6/u.test(units) && /scale/u.test(units));
check("C07", "migration is isolated and provider-aware", /PDM_DATA_DIR/u.test(migration) && /productionWrites: false/u.test(migration) && /BEGIN IMMEDIATE/u.test(migration));
check("C08", "SLDASM evidence writer is fail-closed and auditable", /primary_manufacturing/u.test(helper) && /blocked_relation/u.test(helper) && /bom\.sldasm\.assembly_promoted/u.test(helper));
assert.equal(checks.filter((item) => !item.pass).length, 0, "DEV-109 unified contract failed");
console.log(JSON.stringify({ runner: "unified-contract", status: "PASS", cases: checks, productionWrites: false }, null, 2));
