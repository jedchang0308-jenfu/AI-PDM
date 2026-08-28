import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { consensusStoredPartStructureType } from "../src/lib/numbering-structure-type.ts";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function check(id, label, fn) {
  try { fn(); checks.push({ id, label, status: "PASS" }); }
  catch (error) { checks.push({ id, label, status: "FAIL", message: error instanceof Error ? error.message : String(error) }); }
}
const createContract = read("src/lib/canonical-numbering-create-contract.ts");
const createForm = read("src/components/canonical-numbering-create-form.tsx");
const createRoute = read("src/app/api/numbering/records/route.ts");
const previewRoute = read("src/app/api/numbering/records/preview/route.ts");
const appendRepo = read("src/lib/repositories/numbering-async-repository.ts");
const appendPolicy = read("src/app/api/numbering/roots/[rootCode]/append-policy/route.ts");
const classification = read("src/lib/part-structure-classification.ts");
const classificationRoute = read("src/app/api/pdm/parts/[partId]/structure-type/route.ts");
const classificationUi = read("src/components/part-structure-classification.tsx");
const workbenchUi = read("src/components/canonical-pdm-workbench.tsx");
const bomContext = read("src/lib/bom-create-context.ts");
const bomUi = read("src/components/part-bom-context.tsx");
const changeControl = read("src/lib/pdm-change-control-domain.ts");
const numberStateFlow = read("src/lib/repositories/number-state-flow-async-repository.ts");
const syncNumberingRepository = read("src/lib/repositories/numbering-repository.ts");
const taskDoc = read(".ai-doc/dev_task.md");

check("QA-099-001", "new-root create contract makes structure optional", () => assert.match(createContract, /structureType\?: NumberingStructureType/));
check("QA-099-002", "new-root UI has no structure selector", () => assert.equal(createForm.includes("結構型態</span><select"), false));
check("QA-099-003", "new-root form does not submit structure assertion", () => assert.equal(createForm.includes("params.set(\"structureType\""), false));
check("QA-099-004", "API defaults omitted structure to unclassified", () => assert.match(createRoute, /effectiveStructureType = structureType \?\? "unclassified"/));
check("QA-099-005", "invalid explicit structure still rejects", () => assert.match(createRoute, /structureType must be single_part or assembly/));
check("QA-099-006", "purchased assembly is not blocked at create", () => assert.equal(createRoute.includes("purchased assembly is not supported"), false));
check("QA-099-007", "preview exposes deferred initialization", () => assert.match(previewRoute, /structureInitializationSource: "deferred_default"/));
check("QA-099-008", "async writer persists unclassified default", () => assert.match(appendRepo, /input\.structureType \?\? "unclassified"/));
check("QA-099-009", "consensus helper has empty and mixed semantics", () => {
  assert.equal(consensusStoredPartStructureType([]), "unclassified");
  assert.equal(consensusStoredPartStructureType(["single_part", "single_part"]), "single_part");
  assert.equal(consensusStoredPartStructureType(["assembly", "assembly"]), "assembly");
  assert.equal(consensusStoredPartStructureType(["single_part", "assembly"]), "unclassified");
});
check("QA-099-010", "existing append reads current same-root parts", () => assert.match(appendRepo, /SELECT_ASYNC_CURRENT_PART_NUMBERS_FOR_ROOT_SQL/));
check("QA-099-011", "existing append allows unclassified roots", () => assert.equal(appendRepo.includes("PART_ROOT_STRUCTURE_TYPE_UNCLASSIFIED"), false));
check("QA-099-012", "existing append allows purchased assembly", () => assert.equal(appendRepo.includes("PURCHASED_ASSEMBLY_NOT_SUPPORTED"), false));
check("QA-099-013", "append policy exposes unclassified without blocking", () => assert.match(appendPolicy, /profileBlocked: false/));
check("QA-099-014", "classification route is existing-Part scoped", () => assert.match(classificationRoute, /Promise<\{ partId: string \}>/) && assert.match(classificationRoute, /structure-type/));
check("QA-099-015", "classification GET is no-store and strong ETag", () => assert.match(classificationRoute, /cache-control.*private, no-store/s) && assert.match(classificationRoute, /etag: data\.etag/));
check("QA-099-016", "classification GET limits candidate collection", () => assert.match(classification, /MAX_TARGETS = 100/) && assert.match(classification, /LIMIT :limit/));
check("QA-099-017", "classification PATCH requires workbench contract", () => assert.match(classificationRoute, /verifyCanonicalWorkbenchCommandContract/));
check("QA-099-018", "classification PATCH requires platform workspace update", () => assert.match(classificationRoute, /numbering\.workspace\.update/));
check("QA-099-019", "classification command has stable command name", () => assert.match(classification, /part\.structure_type\.classify/));
check("QA-099-020", "classification command uses idempotency receipt", () => assert.match(classification, /PlatformOutboxAsyncRepository/) && assert.match(classification, /claimCommand/));
check("QA-099-021", "classification does not enqueue external event", () => assert.equal(classification.includes("\.enqueue("), false));
check("QA-099-022", "classification locks all target Parts", () => assert.match(classification, /lockPdmEntityScopeAsync/));
check("QA-099-023", "classification is bounded to one company", () => assert.match(classification, /p\.company_id = :companyId/));
check("QA-099-024", "classification is bounded to one root", () => assert.match(classification, /PART_STRUCTURE_TARGET_ROOT_MISMATCH/));
check("QA-099-025", "target count is capped", () => assert.match(classification, /targetIds\.length > MAX_TARGETS/));
check("QA-099-026", "stale ETag is rejected before update", () => assert.match(classification, /PART_STRUCTURE_STALE_ETAG/));
check("QA-099-027", "batch/decided changes require reason", () => assert.match(classification, /PART_STRUCTURE_REASON_REQUIRED/));
check("QA-099-028", "single-part downgrade checks BOM binding", () => assert.match(classification, /PART_STRUCTURE_BOM_CONFLICT/) && assert.match(classification, /bom_definition_parent_bindings/));
check("QA-099-029", "classification update is all-or-nothing", () => assert.match(classification, /transaction\(async/));
check("QA-099-030", "classification writes audit log", () => assert.match(classification, /INSERT INTO audit_logs/));
check("QA-099-031", "classification UI is a drawer component", () => assert.match(workbenchUi, /<PartStructureClassification/));
check("QA-099-032", "classification UI has no new navigation entry", () => assert.equal(workbenchUi.includes("/structure-classification"), false));
check("QA-099-033", "classification UI supports multi-select", () => assert.match(classificationUi, /targetPartNumberIds/) && assert.match(classificationUi, /type="checkbox"/));
check("QA-099-034", "classification UI exposes color/material context", () => assert.match(classificationUi, /candidate\.color/) && assert.match(classificationUi, /candidate\.material/));
check("QA-099-035", "classification UI explains colors do not create BOMs", () => assert.match(classificationUi, /不會因顏色差異建立不同 BOM/));
check("QA-099-036", "classification UI shows permission-controlled trigger", () => assert.match(classificationUi, /view\.canMutate/));
check("QA-099-037", "classification UI sends If-Match", () => assert.match(classificationUi, /"if-match": view\.etag/));
check("QA-099-038", "classification UI sends idempotency key", () => assert.match(classificationUi, /"idempotency-key": crypto\.randomUUID\(\)/));
check("QA-099-039", "single/unclassified hides BOM context", () => assert.match(bomContext, /structureType !== "assembly"/));
check("QA-099-040", "manufactured assembly without M is blocked", () => assert.match(bomContext, /BOM_ASSEMBLY_REQUIRES_M_DRAWING/));
check("QA-099-041", "purchased assembly is visible but has no manufacturing action", () => assert.match(bomContext, /BOM_PURCHASED_ASSEMBLY_NOT_APPLICABLE/));
check("QA-099-042", "BOM entry stays in Part drawer", () => assert.match(workbenchUi, /<PartBomContext/) && assert.equal(read("src/components/drawing-recognition-workspace-panel.tsx").includes("PartBomContext"), false));
check("QA-099-043", "BOM create action remains assembly-only", () => assert.match(bomUi, /context\.action === "create_bom"/));
check("QA-099-044", "classification does not add schema migration", () => assert.equal(classification.includes("CREATE TABLE"), false));
check("QA-099-045", "all active Part writers persist explicit deferred structure", () => {
  for (const source of [appendRepo, changeControl, numberStateFlow, syncNumberingRepository]) {
    assert.match(source, /structure_type/);
  }
  assert.match(classification, /UPDATE part_numbers SET structure_type/);
});
check("QA-099-046", "classification returns updated IDs and new ETag", () => assert.match(classification, /updatedPartIds/) && assert.match(classification, /classificationEtag\(afterRows\)/));
check("QA-099-047", "DEV-099 is recorded as active implementation", () => assert.match(taskDoc, /DEV-099/));
check("QA-099-048", "no legacy assembly upload caller is reintroduced", () => assert.equal([createRoute, classificationRoute, workbenchUi].some((text) => /assembly-upload|sldasm-bom-import|createAssemblyUpload/iu.test(text)), false));

const failed = checks.filter((item) => item.status === "FAIL");
const runId = `DEV099-contract-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const evidenceDir = path.resolve(process.env.DEV099_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-099", runId));
fs.mkdirSync(evidenceDir, { recursive: true });
const manifest = { devId: "DEV-099", runId, generatedAt: new Date().toISOString(), status: failed.length ? "FAIL" : "PASS", expected: checks.length, executed: checks.length, checks, dataMutation: "none" };
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length) process.exitCode = 1;
