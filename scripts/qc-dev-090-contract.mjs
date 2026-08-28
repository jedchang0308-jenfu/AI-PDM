import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [
  ["canonical contract exposes relation matrix", "src/lib/pdm-canonical-workbench-contract.ts", /relationMatrix:\s*CanonicalRelationMatrixProjection/],
  ["matrix edit action exists", "src/lib/pdm-canonical-workbench-contract.ts", /edit_relation_matrix/],
  ["formal authority repository exists", "src/lib/repositories/relation-formal-authority-async-repository.ts", /class RelationFormalAuthorityRepository/],
  ["sync authority repository exists", "src/lib/repositories/relation-formal-authority-sync-repository.ts", /class RelationFormalAuthoritySyncRepository/],
  ["matrix API uses If-Match", "src/app/api/pdm/relations/[rootId]/matrix/route.ts", /if-match/i],
  ["matrix API uses idempotency", "src/app/api/pdm/relations/[rootId]/matrix/route.ts", /idempotency/i],
  ["matrix command uses canonical receipt namespace", "src/lib/repositories/relation-formal-authority-async-repository.ts", /pdm\.relation_matrix\.update\.v1/],
  ["canonical idempotency helper is available", "src/lib/pdm-canonical-command.ts", /runCanonicalIdempotentCommand/],
  ["drawer edits matrix inline", "src/components/canonical-pdm-workbench.tsx", /RelationMatrixEditor/],
  ["drawer removes the redundant permanent matrix helper", "src/components/canonical-pdm-workbench.tsx", (text) => text.includes("canonical-drawer-matrix") && !text.includes("明確儲存後立即更新正式關聯，不需審核")],
  ["drawer places matrix edit action in the preview area", "src/components/canonical-pdm-workbench.tsx", (text) => text.includes('data-canonical-relation-edit="true"') && text.includes("headerActions={relationAction}") && text.includes("editing={matrixEditing}")],
  ["drawer provides matrix cancel", "src/components/canonical-pdm-workbench.tsx", />取消</],
  ["authority runtime is bound to DEV-090 schema hash", "src/lib/pdm-workbench-authority-control.ts", (text) => text.includes("DEV090_SCHEMA_HASH") && !text.includes("DEV087_SCHEMA_HASH")],
  ["relation search is minimal", "src/app/numbering/search/page.tsx", (text) => text.includes("/api/numbering/search")],
  ["relation search has no drawer", "src/app/numbering/search/page.tsx", (text) => !text.includes("CanonicalPdmWorkbench")],
  ["legacy relation endpoint removed", "src/app/api/numbering/relations/route.ts", "absent"],
  ["postgres uniqueness migration exists", "db/postgres/043_inline_relation_matrix.sql", /idx_drawing_part_links_unique_pair/],
  ["postgres migration has transaction lock and active-work guard", "db/postgres/043_inline_relation_matrix.sql", (text) => text.includes("pg_advisory_xact_lock") && text.includes("DEV090_ACTIVE_RELATION_WORK")],
  ["postgres migration has orphan and multi-primary guards", "db/postgres/043_inline_relation_matrix.sql", (text) => text.includes("DEV090_ORPHAN_OR_CROSS_COMPANY_LINK") && text.includes("DEV090_MULTI_PRIMARY")],
  ["postgres migration retires current Relation table and schema", "db/postgres/043_inline_relation_matrix.sql", (text) => text.includes("DROP TABLE IF EXISTS relation_change_works") && text.includes("dev090_state_data_layer")],
  ["SQLite activation removes retired current projection", "src/lib/db.ts", (text) => text.includes("ensureDev090InlineRelationMatrixSchema") && text.includes("DROP TABLE relation_change_works")],
  ["unscoped workbench records receive an empty matrix projection", "src/lib/pdm-canonical-workbench.ts", (text) => text.includes('scope: "unscoped"') && text.includes('rootId: ""')],
  ["unscoped workbench records explain the empty matrix", "src/components/canonical-pdm-workbench.tsx", (text) => text.includes("目前尚未建立圖料根號，暫無可顯示的關聯矩陣")],
  ["implementation contract documents direct edit", ".ai-doc/specs/SPEC-PDM-INLINE-RELATION-MATRIX-001-direct-formal-edit.md", (text) => text.includes("直接編輯矩陣") && text.includes("立即更新正式關聯")],
  ["QA plan is present", ".ai-doc/qa/qa-dev-090-inline-relation-matrix-validation-plan-2026-08-23.md", /RIM-001/]
];

const failures = [];
for (const [label, relative, predicate] of checks) {
  const file = path.join(root, relative);
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch {
    if (predicate === "absent") { console.log(`PASS ${label}`); continue; }
    failures.push(`${label}: missing ${relative}`); continue;
  }
  if (predicate === "absent") { failures.push(`${label}: still present ${relative}`); continue; }
  const ok = typeof predicate === "function" ? predicate(text) : predicate.test(text);
  if (ok) console.log(`PASS ${label}`);
  else failures.push(`${label}: ${relative}`);
}
if (failures.length) {
  console.error(`FAIL DEV-090 contract (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS DEV-090 contract (${checks.length}/${checks.length})`);
