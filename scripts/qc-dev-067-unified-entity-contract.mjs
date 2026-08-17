import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const expect = (name, condition) => checks.push({ name, condition: Boolean(condition) });

const contract = read("src/lib/pdm-entity-detail-contract.ts");
const policy = read("src/lib/pdm-entity-detail-policy.ts");
const service = read("src/lib/pdm-entity-detail.ts");
const route = read("src/app/api/pdm/entity-details/[entityKey]/route.ts");
const repository = read("src/lib/repositories/pdm-entity-detail-async-repository.ts");
const drawer = read("src/components/unified-pdm-entity-detail-drawer.tsx");
const review = read("src/components/review-context-projection.tsx");
const lock = read("src/lib/pdm-review-lock.ts");
const scope = read("src/lib/pdm-review-scope.ts");
const workbenches = ["drawing-workbench.tsx", "part-workbench.tsx", "relation-workbench.tsx"].map((file) => read(`src/components/${file}`));

expect("canonical response schema", contract.includes('schemaVersion: "pdm-entity-detail.v2"'));
expect("fixed projection order", drawer.indexOf("DrawingProjection") < drawer.indexOf("PartProjection") && drawer.indexOf("PartProjection") < drawer.indexOf("RelationProjection") && drawer.indexOf("RelationProjection") < drawer.indexOf("ReviewContextProjection"));
expect("surface policy matrix", policy.includes('surface === "drawing"') && policy.includes('surface === "part"') && policy.includes('return { drawing: "full", part: "full", relation: "full"'));
expect("server policy enforcement", service.includes("derivePdmDetailProjectionPolicy") && service.includes("if (policy.drawing") && service.includes("if (policy.part") && service.includes("if (policy.relation"));
expect("single repeatable read snapshot", service.includes("withPdmWorkbenchReadSnapshot") && service.indexOf("withPdmWorkbenchReadSnapshot") < service.indexOf("return this.compose"));
expect("aggregate repository boundary", repository.includes("PdmEntityDetailAsyncRepository") && repository.includes("readCandidate") && repository.includes("readDrawing"));
expect("review excludes raw payload", !service.includes("payload_json") && !contract.includes("payload_json") && !contract.includes("snapshotJson"));
expect("candidate preview authority", service.includes("/api/numbering/draft-workspaces/") && service.includes("decorateMasterAttachmentsWithPreviewState"));
expect("review action authority", service.includes("resolvePdmDetailActions") && drawer.includes("action.execution.href") && drawer.includes("Idempotency-Key"));
expect("review lock transaction guard", lock.includes("lockPdmEntityScopeAsync") && lock.includes("assertPdmEntityWriteAllowedAsync") && lock.includes("FOR UPDATE") && service.includes("PdmEntityDetail"));
expect("request-scoped review receipt", scope.includes("PdmReviewScopeReceipt") && scope.includes("resolvePdmReviewScopeReceiptAsync") && service.includes("resolvePdmReviewScopeReceiptAsync"));
expect("review context marker", review.includes('data-component="ReviewContextProjection"') && review.includes('data-component="ApprovalSnapshotProjection"'));
expect("workbench feature gate", workbenches.every((source) => source.includes("unifiedEntityDetailEnabled") && source.includes("UnifiedPdmEntityDetailDrawer")));
expect("return-to-owner navigation", service.includes("ownerHref") && service.includes('fallbackHref: "/approvals"'));

const failures = checks.filter(({ condition }) => !condition);
for (const check of checks) console.log(`${check.condition ? "PASS" : "FAIL"} ${check.name}`);
if (failures.length) process.exitCode = 1;
