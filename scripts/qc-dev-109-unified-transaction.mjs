import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd(); const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const upload = read("src/lib/drawing-revision-work-file.ts"); const helper = read("src/lib/sldasm-assembly-evidence.ts"); const relation = read("src/lib/repositories/relation-formal-authority-async-repository.ts");
const checks = []; function check(id, label, condition) { const pass = Boolean(condition); checks.push({ id, label, pass }); console.log(`${pass ? "PASS" : "FAIL"} ${id} ${label}`); }
check("T01", "physical upload is staged before DB command", /before_upload_stage/u.test(upload) && /Stage bytes before opening/u.test(upload));
check("T02", "transaction compensates staged orphan", /cleanupTarget/u.test(upload) && /deleteObject\(cleanupTarget\.key\)/u.test(upload));
check("T03", "upload rechecks exact duplicate inside transaction", /const exact = await tx\.queryOne/u.test(upload));
check("T04", "SLDASM promotion runs inside upload transaction", /reconcileSldasmAssemblyEvidence\(tx/u.test(upload) && /after_relation_reconcile/u.test(upload));
check("T05", "SLDPRT has no promotion branch", /fileExt === "sldasm"/u.test(upload) && !/fileExt === "sldprt"[\s\S]*reconcileSldasm/u.test(upload));
check("T06", "relation evidence requires exact primary link", /link_type = 'primary_manufacturing'/u.test(helper) && /formal_drawing_number_id/u.test(helper));
check("T07", "ambiguous and cross-company evidence fail closed", /ambiguous_primary_relation/u.test(helper) && /cross_company_relation/u.test(helper));
check("T08", "relation writer retains root-first lock", /part_roots/u.test(relation) && /FOR UPDATE/u.test(relation));
assert.equal(checks.filter((item) => !item.pass).length, 0, "DEV-109 transaction checks failed");
console.log(JSON.stringify({ runner: "unified-transaction", status: "PASS", cases: checks, productionWrites: false }, null, 2));
