#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function includesAll(source, tokens) {
  return tokens.every((token) => source.includes(token));
}

const packageJson = JSON.parse(read("package.json"));
const component = read("src/components/numbering-contextual-entrypoints.tsx");
const searchPage = read("src/app/numbering/search/page.tsx");
const drawingsPage = read("src/app/numbering/drawings/page.tsx");
const partsPage = read("src/app/parts/page.tsx");
const numberStateWorkspace = read("src/components/number-state-workspace.tsx");
const legacyRouteMapping = read("src/lib/number-state-flow-legacy-route.ts");
const asyncRepository = read("src/lib/repositories/numbering-async-repository.ts");
const repositoryTypes = read("src/lib/repositories/numbering-repository.ts");
const numberingAsync = read("src/lib/numbering-async.ts");
const lifecycleRoute = read("src/app/api/lifecycle/obsolete-requests/route.ts");
const approvalPlatformRepository = read("src/lib/repositories/approval-platform-async-repository.ts");
const permissionCodes = read("src/lib/numbering-permission-codes.ts");
const schema = read("db/schema.sql");
const css = read("src/app/globals.css");

record(
  "Contextual component exposes root, drawing, and part natural actions",
  includesAll(component, ["新增圖號", "新增料號", "申請主根作廢", "新增同根圖號", "新增同圖料號", "申請圖號作廢", "新增同根料號", "申請料號作廢"]),
  "src/components/numbering-contextual-entrypoints.tsx"
);
record(
  "Part creation selectors only expose self-made and purchased items",
  includesAll(component, ['<option value="manufactured">自製件</option>', '<option value="purchased">採購件</option>']) &&
    !["outsourced", "shared", "custom"].some((value) => component.includes(`<option value="${value}">`)) &&
    includesAll(numberStateWorkspace, ['const createItemKindOptions = itemKindOptions.filter((option) => option.value === "manufactured" || option.value === "purchased");']) &&
    !numberStateWorkspace.includes("自製/發包/客製建議"),
  "src/components/numbering-contextual-entrypoints.tsx and src/components/number-state-workspace.tsx"
);
record(
  "Contextual component posts append and obsolete APIs",
  includesAll(component, ["/append-policy", "/drawings", "/parts", "/obsolete-impact", "/api/lifecycle/obsolete-requests", "entityType: \"part_root\""]),
  "src/components/numbering-contextual-entrypoints.tsx"
);
record(
  "Contextual component prevents reference drawings from primary manufacturing basis",
  includesAll(component, ["purposeCode === \"R\"", "linkRelationType", "reference"]),
  "src/components/numbering-contextual-entrypoints.tsx"
);
record(
  "Contextual component keeps only one inline dialog active across root, drawing, and part cards",
  includesAll(component, ["pdm-numbering-contextual-open", "closeWhenPeerOpens", "window.dispatchEvent", "setDialog(null)"]),
  "src/components/numbering-contextual-entrypoints.tsx"
);
record(
  "Contextual part flow locks part name to the confirmed name",
  includesAll(component, ["品名跟隨確定品名", "以此料號新增同根料號"]) && !component.includes('TextInput label="料號品名"') && !component.includes("const [partName"),
  "src/components/numbering-contextual-entrypoints.tsx"
);
record(
  "Contextual drawing flow can link a new same-root drawing to the current part",
  includesAll(component, ["linkPartNumber: linkPart ? part?.partNumber", "建立與 {part.partNumber} 的圖料關係", "body.linkedPart?.partNumber"]),
  "src/components/numbering-contextual-entrypoints.tsx"
);
record(
  "Contextual add forms are cancellable before commit",
  includesAll(component, ["放棄未儲存的新增圖號內容", "放棄未儲存的新增料號內容", "取消", "onClick={cancel}"]),
  "src/components/numbering-contextual-entrypoints.tsx"
);
record(
  "Contextual root draft uses delete wording instead of formal obsolete wording",
  includesAll(component, ["刪除草稿", "delete_draft_root", "尚未送審的草稿可直接刪除", "confirmDelete: true"]),
  "src/components/numbering-contextual-entrypoints.tsx"
);

record("Search root detail renders contextual root mode", includesAll(searchPage, ["NumberingContextualEntrypoints", "mode=\"root\"", "新增相關資料"]), "src/app/numbering/search/page.tsx");
record("Search root detail no longer labels optional append actions as next required actions", !searchPage.includes("接續操作"), "src/app/numbering/search/page.tsx");
record("Search drawing cards render contextual drawing mode", includesAll(searchPage, ["mode=\"drawing\"", "linkedPartNumbers"]), "src/app/numbering/search/page.tsx");
record("Search part cards render contextual part mode", includesAll(searchPage, ["mode=\"part\"", "linkedDrawingNumbers"]), "src/app/numbering/search/page.tsx");
record("Drawing module drawer renders contextual drawing mode", includesAll(drawingsPage, ["NumberingContextualEntrypoints", "mode=\"drawing\"", "onChanged={onDataChanged}"]), "src/app/numbering/drawings/page.tsx");
record("Parts module detail renders contextual part mode", includesAll(partsPage, ["NumberingContextualEntrypoints", "mode=\"part\"", "onChanged={onUpdated}"]), "src/app/parts/page.tsx");

const drawingHeroStart = drawingsPage.indexOf('<section className="panel drawing-detail-hero">');
const drawingHeroEnd = drawingsPage.indexOf("</section>", drawingHeroStart);
const drawingSameRootPartPanelIndex = drawingsPage.indexOf("<SameRootPartPanel", drawingHeroEnd);
const drawingContextualEntrypointIndex = drawingsPage.indexOf("<NumberingContextualEntrypoints", drawingHeroEnd);
record(
  "Drawing module places contextual append/obsolete actions at drawer bottom",
  drawingHeroStart !== -1 &&
    drawingHeroEnd !== -1 &&
    drawingSameRootPartPanelIndex !== -1 &&
    drawingContextualEntrypointIndex > drawingSameRootPartPanelIndex &&
    !drawingsPage.slice(drawingHeroStart, drawingHeroEnd).includes("NumberingContextualEntrypoints"),
  "src/app/numbering/drawings/page.tsx"
);

const partPanelStart = partsPage.indexOf("function PartDetailPanel");
const partHeroStart = partsPage.indexOf('data-part-detail-section="hero"', partPanelStart);
const partHeroEnd = partsPage.indexOf("</section>", partHeroStart);
const partContextualEntrypointIndex = partsPage.indexOf("<NumberingContextualEntrypoints", partPanelStart);
record(
  "Part module places contextual append/obsolete actions at drawer bottom",
  partPanelStart !== -1 &&
    partHeroStart !== -1 &&
    partHeroEnd !== -1 &&
    partContextualEntrypointIndex > partHeroEnd &&
    !partsPage.slice(partHeroStart, partHeroEnd).includes("NumberingContextualEntrypoints"),
  "src/app/parts/page.tsx"
);

record(
  "DEV-048 owner workspace has new root and existing-root append modes",
  includesAll(numberStateWorkspace, ["new_bundle", "append_drawing", "append_part", "append_drawing_part", "建立新圖料", "既有主根加圖號", "既有主根加料號"]),
  "src/components/number-state-workspace.tsx"
);
record(
  "DEV-048 owner workspace uses one draft mutation authority",
  includesAll(numberStateWorkspace, ["/append-policy", "/api/numbering/draft-workspaces", "sourceRootId", "autoAcquireCandidates: true"]),
  "src/components/number-state-workspace.tsx"
);
record(
  "DEV-048 owner workspace locks part name to the confirmed root name",
  includesAll(numberStateWorkspace, ["const lockedPartName = effectiveCoreName.trim()", "partName: lockedPartName", "此欄位是唯一名稱來源"]) &&
    !numberStateWorkspace.includes("品名（系統建議，可微調）") &&
    !numberStateWorkspace.includes("系統建議流水號"),
  "src/components/number-state-workspace.tsx"
);
record(
  "Retired standalone numbering pages stay absent and redirect through middleware mapping",
  !exists("src/app/numbering/request/page.tsx") &&
    !exists("src/app/numbering/part-drafts/page.tsx") &&
    includesAll(legacyRouteMapping, ["/numbering/request", "/numbering/part-drafts", "create", "new_bundle", "reserved", "tab", "drafts"]),
  "DEV-048 compatibility boundary"
);

record("Append policy route exists", exists("src/app/api/numbering/roots/[rootCode]/append-policy/route.ts"));
record("Append drawing route exists", exists("src/app/api/numbering/roots/[rootCode]/drawings/route.ts"));
record("Append part route exists", exists("src/app/api/numbering/roots/[rootCode]/parts/route.ts"));
record("Append drawing-part route exists", exists("src/app/api/numbering/roots/[rootCode]/drawing-part/route.ts"));
record("Root obsolete impact route exists", exists("src/app/api/numbering/roots/[rootCode]/obsolete-impact/route.ts"));
record("Draft delete route exists", exists("src/app/api/numbering/records/[rootCode]/draft/route.ts"));

const appendPolicyRoute = read("src/app/api/numbering/roots/[rootCode]/append-policy/route.ts");
const appendDrawingRoute = read("src/app/api/numbering/roots/[rootCode]/drawings/route.ts");
const appendPartRoute = read("src/app/api/numbering/roots/[rootCode]/parts/route.ts");
const appendDrawingPartRoute = read("src/app/api/numbering/roots/[rootCode]/drawing-part/route.ts");
const obsoleteImpactRoute = read("src/app/api/numbering/roots/[rootCode]/obsolete-impact/route.ts");
const draftDeleteRoute = read("src/app/api/numbering/records/[rootCode]/draft/route.ts");

function hasCreatePermissionGate(source) {
  return source.includes('requireNumberingActionAsync(request, "numbering.create")') ||
    source.includes('requireNumberingPlatformCommandAsync(request, { action: "numbering.create", body })');
}

record("Append policy route is search permission gated", appendPolicyRoute.includes('requireNumberingPageAsync(request, "numbering.search")'), "append-policy route");
record("Append drawing route is create permission gated", hasCreatePermissionGate(appendDrawingRoute), "drawings route");
record("Append drawing route checks link permission when linking to an existing part", includesAll(appendDrawingRoute, ['requireNumberingActionAsync(request, "numbering.link_variant")', "linkPartNumber", "linkRelationType"]), "drawings route");
record("Append part route checks create and link permissions", hasCreatePermissionGate(appendPartRoute) && appendPartRoute.includes('requireNumberingActionAsync(request, "numbering.link_variant")'), "parts route");
record("Append drawing-part route checks create and link permissions", hasCreatePermissionGate(appendDrawingPartRoute) && appendDrawingPartRoute.includes('requireNumberingActionAsync(request, "numbering.link_variant")'), "drawing-part route");
record(
  "Append part APIs no longer require editable partName",
  !appendPartRoute.includes("partName is required") && !appendDrawingPartRoute.includes("partName is required") && !read("src/app/api/numbering/drawings/[drawingNumber]/parts/route.ts").includes("partName is required"),
  "append part routes"
);
record("Root obsolete impact route is search permission gated", obsoleteImpactRoute.includes('requireNumberingPageAsync(request, "numbering.search")'), "obsolete-impact route");
record("Draft delete route requires explicit confirmation and draft lifecycle permission", includesAll(draftDeleteRoute, ["export async function DELETE", "confirmDelete", 'requireNumberingActionAsync(request, "numbering.draft.obsolete")', "deleteDraftNumberingRecordAsync"]), "draft delete route");

record(
  "Repository exposes append input/result contracts",
  includesAll(repositoryTypes, ["AddDrawingNumberInput", "linkPartNumber", "AddDrawingNumberToRootResult", "linkedPart", "AddPartNumberInput", "AddDrawingAndPartToRootInput", "AddDrawingAndPartToRootResult", "DeleteDraftNumberingRecordInput", "DeleteDraftNumberingRecordResult", "RootObsoleteImpactResult", "RequestRootObsoleteApprovalInput"]),
  "numbering-repository.ts"
);
record(
  "Async repository appends drawing, part, and drawing-part inside transactions",
  includesAll(asyncRepository, ["addDrawingNumberToRoot", "linkPartNumber", "linkedPart", "INSERT_ASYNC_DRAWING_PART_LINK_SQL", "addPartNumberToRoot", "addDrawingAndPartToRoot", "this.client.transaction(run)", "numbering.drawing_part.create"]),
  "numbering-async-repository.ts"
);
record(
  "Async repository enforces formal-root reason, closed-root lock, and reference drawing relation rule",
  includesAll(asyncRepository, ["APPEND_REASON_REQUIRED_FOR_FORMAL_ROOT", "ROOT_APPEND_LOCKED", "PRIMARY_RELATION_REQUIRES_MANUFACTURING_DRAWING"]),
  "numbering-async-repository.ts"
);
record(
  "Async repository supports aggregate root obsolete approval without direct root mutation",
  includesAll(asyncRepository, ["requestRootObsoleteApproval", "getRootObsoleteImpactInClient", "obsolete_part_root", "aggregateIntent: \"whole_root_obsolete\"", "childTargets"]),
  "numbering-async-repository.ts"
);
record(
  "Async repository deletes draft root bundles only after controlled-reference checks",
  includesAll(asyncRepository, ["deleteDraftNumberingRecord", "NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES", "SELECT_ASYNC_DRAFT_DELETE_DEPENDENCY_COUNTS_SQL", "DELETE_ASYNC_DRAFT_PART_ROOT_SQL", "numbering.draft.delete"]),
  "numbering-async-repository.ts"
);
record(
  "Async repository derives created part names from root core name",
  includesAll(asyncRepository, ["partName: root.coreName", "UPDATE_ASYNC_ROOT_PART_NAMES_SQL"]) && includesAll(repositoryTypes, ["partName?: string", "UPDATE part_numbers SET part_name = ?"]),
  "numbering-async-repository.ts"
);
record(
  "Facade exports contextual append, draft delete, and root obsolete functions",
  includesAll(numberingAsync, ["addDrawingNumberToRootAsync", "addPartNumberToRootAsync", "addDrawingAndPartToRootAsync", "deleteDraftNumberingRecordAsync", "getRootObsoleteImpactAsync", "requestRootObsoleteApprovalAsync"]),
  "numbering-async.ts"
);

record(
  "Lifecycle obsolete API accepts part_root and maps to root approval",
  includesAll(lifecycleRoute, ["part_root", "obsolete_part_root", "requestRootObsoleteApprovalAsync"]),
  "obsolete-requests route"
);
record("Approval platform labels root obsolete action", approvalPlatformRepository.includes('obsolete_part_root: "主根作廢審核"'), "approval-platform-async-repository.ts");
record("Permission codes include root obsolete action", permissionCodes.includes('"obsolete_part_root"'), "numbering-permission-codes.ts");
record(
  "Schema seeds root obsolete approval rule, platform action, and admin permissions",
  includesAll(schema, ["approval-rule-obsolete-root-admin", "numbering.obsolete_part_root", "obsolete_part_root", "system_admin", "pdm_admin"]),
  "db/schema.sql"
);
record("Contextual entrypoint CSS exists", includesAll(css, [".pdm-contextual-actions", ".pdm-contextual-dialog", ".pdm-contextual-impact-list"]), "globals.css");
record(
  "Package exposes contextual entrypoint QC script",
  packageJson.scripts?.["qc:pdm-numbering-contextual-entrypoints"] === "node scripts/qc-pdm-numbering-contextual-entrypoints.mjs",
  "package.json"
);

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);
