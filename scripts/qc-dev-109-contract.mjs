import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function check(id, label, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ id, label, pass, detail: pass ? detail : `contract assertion failed: ${detail || label}` });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${label}`);
}

const page = read("src/app/bom/create/page.tsx");
const component = read("src/components/bom-create-page.tsx");
const route = read("src/app/api/bom/create-candidates/route.ts");
const context = read("src/lib/bom-create-context.ts");
const list = read("src/components/bom-workbench-list-page.tsx");
const part = read("src/components/part-bom-context.tsx");
const moduleCss = read("src/components/bom-create-page.module.css");

check("QA-109-001", "server page awaits Promise searchParams", /searchParams\?: Promise<|await searchParams/u.test(page));
check("QA-109-002", "single canonical create entry", /href="\/bom\/create"/u.test(list) && !/BomCreateFromPartDialog/u.test(list));
check("QA-109-003", "candidate response has current mode and reason contract", /mode: "suggested" \| "search" \| "exact"/u.test(context) && /assembly_file/u.test(context) && /reason:/u.test(component));
check("QA-109-004", "actor and exact filter are server inputs", /actorId: auth\.user\.id/u.test(route) && /partNumberId/u.test(route) && /exactPartNumberId/u.test(context));
check("QA-109-005", "released-only fails closed before projection", /isBomReleasedOnlyRole\(auth\.user\).*BOM_CREATE_FORBIDDEN/su.test(route));
const createBodies = [...component.matchAll(/body:\s*JSON\.stringify\(\{([\s\S]*?)\}\)/gu)].map((match) => match[1]);
check("QA-109-006", "no second writer or recommendation payload", createBodies.length > 0 && createBodies.every((body) => !/recommendation|reason|fileName/u.test(body)) && /fetch\("\/api\/bom\/drafts/u.test(component));
check("QA-109-007", "retired purpose labels remain absent", !/銷售組合包|組合包/u.test(`${list}\n${part}\n${read("src/components/bom-editor/bom-structured-editor.tsx")}`) && !/bomPurposeLabel|bomPurposeShortLabel/u.test(`${component}\n${list}`));
check("QA-109-008", "legacy modal caller and CSS are retired", !fs.existsSync(path.join(root, "src/components/bom-create-from-part-dialog.tsx")) && !/bom-create-picker|part-bom-dialog/u.test(`${read("src/app/globals.css")}\n${read("src/app/styles/responsive.css")}`));
check("QA-109-009", "DEV-109 presentation is scoped to CSS Module", /from "\.\/bom-create-page\.module\.css"/u.test(component) && /\.page\s*\{/u.test(moduleCss) && !/DEV-109 canonical create page/u.test(read("src/app/globals.css")));
check("QA-109-010", "candidate row and footer interaction contract", /data-candidate-action/u.test(component) && /className=\{styles\.footer\}/u.test(component) && /canSubmit/u.test(component));

assert.equal(checks.filter((item) => !item.pass).length, 0, "DEV-109 contract checks failed");
console.log(JSON.stringify({ runner: "contract", status: "PASS", cases: checks, productionWrites: false }, null, 2));
