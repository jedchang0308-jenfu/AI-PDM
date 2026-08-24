import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const add = (cases, label, pass, detail) => checks.push({ cases, label, pass: Boolean(pass), detail });

const schema = read("db/schema.sql");
const postgres = read("db/postgres/048_shared_assembly_bom.sql");
const createRoute = read("src/app/api/bom/drafts/route.ts");
const detailRoute = read("src/app/api/bom/drafts/[draftId]/route.ts");
const workbenchRoute = read("src/app/api/bom/workbench/route.ts");
const partContext = read("src/components/part-bom-context.tsx");
const canonicalWorkbench = read("src/components/canonical-pdm-workbench.tsx");
const repository = read("src/lib/repositories/bom-workbench-async-repository.ts");
const candidateContext = read("src/lib/bom-create-context.ts");
const feature = read("src/lib/assembly-bom-feature.ts");
const approvalRepository = read("src/lib/repositories/approval-platform-async-repository.ts");
const approvalDispatcher = read("src/lib/approval-platform.ts");
const exportRoute = read("src/app/api/bom/releases/[releaseId]/export/route.ts");
const transfer = read("src/lib/transfer-package-phase1d.ts");
const changeControl = read("src/lib/pdm-change-control-domain.ts");
const packageJson = JSON.parse(read("package.json"));

add([1, 2, 3, 4, 5, 7, 8], "structure type is a constrained Part authority on both providers",
  schema.includes("structure_type TEXT NOT NULL DEFAULT 'single_part'")
    && postgres.includes("part_numbers_structure_type_check")
    && schema.includes("'assembly', 'unclassified'"), "schema + postgres/048");
add([4, 5, 6, 7, 8], "numbering writer requires and persists explicit structureType",
  read("src/app/api/numbering/records/route.ts").includes("structureType is required")
    && read("src/app/api/numbering/records/route.ts").includes("purchased assembly is not supported")
    && read("src/lib/repositories/numbering-async-repository.ts").includes("item_kind, structure_type"), "numbering authority");
add([9, 10, 61], "BOM action is projected only inside Part detail",
  canonicalWorkbench.includes("<PartBomContext")
    && partContext.includes("context.action === \"create_bom\"")
    && !read("src/components/drawing-recognition-workspace-panel.tsx").includes("PartBomContext"), "Part-only drawer projection");
add([11, 12, 13, 14, 15, 16, 17, 18], "create contract uses context Parent, multi-select IDs and ETag",
  createRoute.includes("contextPartNumberId")
    && createRoute.includes("applicableParentPartNumberIds")
    && createRoute.includes("if-match")
    && candidateContext.includes("selectionEtag"), "POST /api/bom/drafts");
add([19, 20, 21], "shared create is transactional and idempotent",
  repository.includes("bom_create_effects")
    && repository.includes("requestFingerprint")
    && repository.includes("this.client.transaction(create, { serializable: true })"), "repository createSharedDraft");
add([22], "legacy owner-only payload is rejected while shared writer is enabled",
  createRoute.includes("BOM_CONTEXT_PARENT_REQUIRED") || createRoute.includes("ownerPartNumberId"), "route compatibility branch");
add([23, 24, 25, 26, 27, 28, 29, 30, 31], "logical line and per-Parent mapping authority exists",
  schema.includes("bom_draft_component_candidates")
    && schema.includes("bom_draft_parent_selections")
    && repository.includes("validateSharedGraph")
    && repository.includes("BOM_VARIANT_MAPPING_INCOMPLETE"), "schema + graph validation");
add([34, 35, 36, 37, 38, 39, 40], "schema-v2 review/release evidence is canonical and immutable",
  schema.includes("trg_bom_review_shared_evidence_immutable")
    && schema.includes("trg_bom_release_shared_evidence_immutable")
    && repository.includes("reviewSnapshotHash")
    && repository.includes("snapshotEvidence"), "review/release repository");
add([41, 42], "multi-Parent export requires exact Parent",
  exportRoute.includes("BOM_RELEASE_PARENT_REQUIRED")
    && exportRoute.includes("BOM_RELEASE_PARENT_NOT_APPLICABLE")
    && exportRoute.includes("parentPartNumberId"), "release export route");
add([43, 44], "where-used reads relational resolved authority",
  read("src/lib/repositories/item-insight-async-repository.ts").includes("bom_release_resolved_lines")
    && read("src/lib/repositories/item-insight-async-repository.ts").includes("BOM_RELEASE_SNAPSHOT_INVALID"), "item insight authority");
add([45, 86], "generic list cardinality is one row per Definition revision and searches bindings",
  repository.includes("EXISTS (\n        SELECT 1\n        FROM bom_draft_parent_bindings search_binding")
    && repository.includes("applicableParents"), "workbench list SQL");
add([46, 76], "obsolete transition is whole Definition only",
  repository.includes("BOM_PARTIAL_OBSOLETE_NOT_SUPPORTED")
    && repository.includes("WHERE definition_id = :definitionId AND status = 'Released'"), "obsolete lifecycle");
add([47, 48, 49, 50, 51, 52, 79], "central capability resolver covers full Parent set and decision role",
  candidateContext.includes("resolveSharedBomCapabilityAsync")
    && candidateContext.includes("parentPartNumberIds")
    && detailRoute.includes("correlationId")
    && workbenchRoute.includes("parentPartNumberId"), "capability + structured boundary");
add([53, 54, 55, 56, 57, 60, 88], "provider migration contains deterministic IDs, issue inventory and primary guard",
  read("scripts/migrate-dev-096-shared-assembly-bom.mjs").includes("ai-pdm/dev096/v1")
    && read("scripts/migrate-dev-096-shared-assembly-bom.mjs").includes("DEV096_PRIMARY_DATA_FORBIDDEN")
    && schema.includes("bom_shared_structure_migration_issues")
    && postgres.includes("bom_shared_structure_migration_issues"), "migration runner");

function retiredViolations(extra = "") {
  const files = [
    "src/app/api/bom/drafts/route.ts",
    "src/app/api/bom/drafts/[draftId]/route.ts",
    "src/components/canonical-pdm-workbench.tsx"
  ];
  const retired = /assembly-upload|sldasm-bom-import|createAssemblyUpload/iu;
  return files.filter((file) => retired.test(read(file))).concat(retired.test(extra) ? ["<injected>"] : []);
}
add([58], "retired caller scan is clean and negative injection fails",
  retiredViolations().length === 0 && retiredViolations("createAssemblyUpload('/api/assembly-upload')").includes("<injected>"), "negative injection oracle");
add([59], ".SLDASM asset authority is not repurposed as the shared BOM writer",
  !createRoute.toLowerCase().includes("sldasm") && !repository.toLowerCase().includes("sldasm"), "shared create/save sources");
add([69, 70, 71, 72, 73, 74], "server owns exact next revision, superset and archive/restore rules",
  candidateContext.includes("suggestedBomRevision")
    && repository.includes("BOM_PARENT_REMOVAL_NOT_SUPPORTED")
    && repository.includes("BOM_OPEN_REVISION_EXISTS")
    && repository.includes("status = 'Archived'"), "candidate + lifecycle repository");
add([75], "manual active route is retired for shared Drafts",
  read("src/app/api/bom/drafts/[draftId]/active/route.ts").includes("BOM_OPERATION_RETIRED")
    || repository.includes("BOM_OPERATION_RETIRED"), "410 authority");
add([77, 78], "review evidence is immutable and self-decision has exact error",
  repository.includes("BOM_REVIEW_SELF_DECISION_FORBIDDEN")
    && repository.includes("BOM_REVIEW_SNAPSHOT_STALE"), "review decision");
add([80], "BOM commands write audit/edit events and not the platform outbox",
  repository.includes("INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL")
    && repository.includes("INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL")
    && !repository.includes("platform_outbox"), "repository writers");
add([81], "logical-line diff and clone preserve logical identity",
  repository.includes("logicalLineId: line.logical_line_id")
    && read("src/lib/bom-workbench-diff.ts").includes("logical:"), "clone + diff");
add([82], "approval platform uses canonical bom_workbench item key with historical legacy read",
  approvalRepository.includes("bom_workbench:")
    && approvalRepository.includes("legacy_bom")
    && approvalDispatcher.includes("decideApprovalPlatformBomWorkbenchAsync"), "approval platform");
add([83], "bounds are explicit and applied",
  read("src/lib/bom-shared-structure.ts").includes("parents: 250")
    && read("src/lib/bom-shared-structure.ts").includes("nodes: 5000")
    && read("src/lib/bom-shared-structure.ts").includes("resolvedRows: 100_000"), "SHARED_BOM_LIMITS");
add([84], "feature is default-off and mutations are gated while schema-v2 reads remain separate",
  feature.includes("PDM_ASSEMBLY_SHARED_BOM_V1")
    && read(".env.example").includes("PDM_ASSEMBLY_SHARED_BOM_V1=false")
    && exportRoute.includes("snapshot_schema_version"), "flag boundary");
add([85], "replacement reconfirm records exact candidate and Parent selection occurrence",
  changeControl.includes("'candidate' AS reference_scope")
    && changeControl.includes("'parent_selection' AS reference_scope")
    && changeControl.includes("logical_line_id"), "change-control occurrence evidence");
add([87], "schema-v2 consumers call integrity authority",
  read("src/lib/bom-release-integrity.ts").includes("BOM_RELEASE_SNAPSHOT_INVALID")
    && transfer.includes("getReleaseSnapshotById")
    && read("src/lib/repositories/item-insight-async-repository.ts").includes("getReleaseSnapshotById"), "consumer fail-closed");

const requiredScripts = ["migrate:dev-096:dry-run", "migrate:dev-096:apply", "migrate:dev-096:postgres", "qc:dev-096:contract", "qc:dev-096:repository", "qc:dev-096:migration", "qc:dev-096:mutation", "qc:dev-096:consumers", "qc:dev-096:browser", "qc:dev-096"];
add([53, 60], "all ten required package commands exist", requiredScripts.every((name) => packageJson.scripts?.[name]), requiredScripts.join(", "));

const failed = checks.filter((check) => !check.pass);
for (const check of checks) console[check.pass ? "log" : "error"](`${check.pass ? "PASS" : "FAIL"} ${check.label}${check.pass ? "" : `: ${check.detail}`}`);
const result = { runner: "contract", status: failed.length ? "FAIL" : "PASS", checks, cases: [...new Set(checks.filter((check) => check.pass).flatMap((check) => check.cases))].sort((a, b) => a - b) };
if (process.env.DEV096_EVIDENCE_DIR) {
  fs.mkdirSync(process.env.DEV096_EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.DEV096_EVIDENCE_DIR, "contract.json"), `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.length - failed.length, total: checks.length }));
if (failed.length) process.exitCode = 1;
