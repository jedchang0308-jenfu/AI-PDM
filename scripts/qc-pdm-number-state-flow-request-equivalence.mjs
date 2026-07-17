#!/usr/bin/env node

import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(id, passed, detail) {
  results.push({ id, passed: Boolean(passed), detail });
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

const workspace = readProjectFile(root, "src/components/number-state-workspace.tsx");
const runtimeDb = readProjectFile(root, "src/lib/db.ts");
const partsPage = readProjectFile(root, "src/app/parts/page.tsx");
const drawingsPage = readProjectFile(root, "src/app/numbering/drawings/page.tsx");
const searchPage = readProjectFile(root, "src/app/numbering/search/page.tsx");
const domain = readProjectFile(root, "src/lib/number-state-flow.ts");
const repository = readProjectFile(root, "src/lib/repositories/number-state-flow-async-repository.ts");
const draftWorkspacesApi = readProjectFile(root, "src/app/api/numbering/draft-workspaces/route.ts");
const previewApi = readProjectFile(root, "src/app/api/numbering/draft-workspaces/preview/route.ts");
const sqliteSchema = readProjectFile(root, "db/schema.sql");
const postgresInitial = readProjectFile(root, "db/postgres/001_initial_schema.sql");
const postgresPhase1a = readProjectFile(root, "db/postgres/012_number_state_flow_phase1a.sql");
const postgresEquivalence = readProjectFile(root, "db/postgres/019_number_state_flow_request_equivalence.sql");
const supabaseEquivalence = readProjectFile(root, "supabase/migrations/20260714020000_number_state_flow_request_equivalence.sql");
const syncScript = readProjectFile(root, "scripts/sync-supabase-runtime-migrations.mjs");
const supabaseQc = readProjectFile(root, "scripts/qc-supabase-runtime-migrations.mjs");
const packageJson = readProjectJson(root, "package.json");

record(
  "NSF-REQ-EQ-001 schema stores request-equivalence reasons",
  [sqliteSchema, postgresInitial, postgresPhase1a, postgresEquivalence, supabaseEquivalence].every((source) =>
    includesAll(source, ["numbering_draft_workspaces", "append_reason", "numbering_draft_parts", "universal_reason"])
  ),
  "append_reason and universal_reason must exist in fresh schemas and additive migration 019"
);

record(
  "NSF-REQ-EQ-001B runtime SQLite repair keeps existing local databases compatible",
  includesAll(runtimeDb, [
    'ensureColumn(database, "numbering_draft_workspaces", "append_reason", "TEXT")',
    'ensureColumn(database, "numbering_draft_parts", "universal_reason", "TEXT")'
  ]),
  "existing SQLite databases must add request-equivalence columns during normal startup"
);

record(
  "NSF-REQ-EQ-002 create UI preserves four request modes and old safety affordances",
  ["new_bundle", "append_drawing", "append_part", "append_drawing_part"].every((mode) => workspace.includes(`value: "${mode}"`)) &&
    includesAll(workspace, [
      "sourceRootCode",
      "/append-policy",
      "/api/numbering/duplicate-check",
      "SuggestedNameReviewPanel",
      "AppendPolicyPanel",
      "lockedPartName",
      "關閉視窗不會寫入資料"
    ]),
  "UI must keep visible root-code append lookup, duplicate check, locked part name, and no-write close feedback"
);

record(
  "NSF-REQ-EQ-003 create payload carries append, naming-scope, and relation semantics",
  includesAll(workspace, [
    "sourceRootId: form.mode === \"new_bundle\" ? undefined : appendPolicy?.root.id",
    "appendReason: form.mode === \"new_bundle\" ? undefined : form.appendReason.trim() || null",
    "sharedName",
    "isUniversal: false",
    "universalReason: null",
    "seriesCode: form.partItemKind === \"manufactured\" ? form.seriesCode.trim() || null : null",
    "linkType: relationLinkType",
    "isManufacturingPurposeCode"
  ]) &&
    workspace.includes("number-state-name-scope") &&
    !workspace.includes("sharedPart"),
  "create request must translate root code to ID, keep cross-project shared as naming-only, and retain relation type"
);

record(
  "NSF-REQ-EQ-004 domain validation allows optional shared reasons and blocks invalid primary links",
  includesAll(domain, [
    "appendReason",
    "universalReason",
    "isManufacturingPurpose",
    "primary_manufacturing",
    "numbering_invalid_relation"
  ]) &&
    !domain.includes("numbering_universal_reason_required"),
  "normalizer must allow shared/universal reason to be optional and prevent non-manufacturing drawings from becoming primary links"
);

record(
  "NSF-REQ-EQ-005 repository persists request-equivalence fields and audit facts",
  includesAll(repository, [
    "append_reason",
    "universal_reason",
    "APPEND_REASON_REQUIRED",
    "sourceRootCode",
    "appendReason",
    "number_candidate_events"
  ]),
  "repository must persist append/shared reasons and include root code/reason in events and audit details"
);

record(
  "NSF-REQ-EQ-006 Supabase mirror includes additive migration 019 and QC coverage",
  syncScript.includes("019_number_state_flow_request_equivalence.sql") &&
    syncScript.includes("20260714020000_number_state_flow_request_equivalence.sql") &&
    supabaseQc.includes("request-equivalence migration embeds source hash") &&
    packageJson.scripts?.["qc:pdm-number-state-flow-request-equivalence"] === "node scripts/qc-pdm-number-state-flow-request-equivalence.mjs",
  "migration 019 must be synchronized, QC-checked, and exposed as an npm script"
);

record(
  "NSF-REQ-EQ-007 create CTA uses centralized draft wording",
  includesAll(workspace, [
    "getNumberStateCreateCta",
    "建立圖料號草稿",
    "建立後直接保留號碼，不會占用正式號碼"
  ]) &&
    partsPage.includes('surface="parts"') &&
    drawingsPage.includes('surface="drawings"') &&
    searchPage.includes('surface="search"') &&
    !drawingsPage.includes('label="新增圖號草稿"') &&
    !workspace.includes('label = "建立圖料號"'),
  "top-level create buttons must use centralized draft wording and never omit 草稿"
);

record(
  "NSF-REQ-EQ-008 create UI restores naming guidance and warning-only duplicate check",
  includesAll(workspace, [
    "defaultIncludeDrawing",
    "suggestedCoreName",
    "duplicateCheckName",
    "data-qc=\"numbering-name-guide\"",
    "data-qc=\"suggested-part-name\"",
    "data-qc=\"suggested-duplicate-check\"",
    "number-state-suggestion-review",
    "number-state-suggestion-review-status",
    "套用建議品名",
    "確定品名",
    "半形底線 _ 串接",
    "品名不需唯一，唯一性由圖號 / 料號負責",
    "系列代號（選填）",
    "data-qc=\"root-series-code\"",
    "非共用件會納入建議品名",
    "勾選跨專案共用時不納入品名",
    "manufacturedPartMustIncludeDrawing",
    "effectiveIncludeDrawing",
    "showDrawingDraftSection",
    "canToggleDrawingDraft",
    "effectivePrimaryManufacturing",
    "isPrimaryManufacturing: effectivePrimaryManufacturing",
    "number-state-draft-summary",
    "number-state-section-toggle",
    "manufactured-fixed-drawing-draft",
    "包含圖號草稿",
    "本次不建立",
    "未建立圖號草稿",
    "製造圖 M",
    "參考圖 R",
    "參考用途",
    "請填寫參考用途。",
    "請說明此圖作為參考的用途；R 圖不作製造基準。",
    "purposeDescription: isManufacturingPurposeCode(purposeCode) ? \"\" : form.purposeDescription",
    "purposeDescription: drawing.purposeCode === \"R\" ? drawing.purposeDescription : \"\"",
    "data-qc=\"part-number-preview\"",
    "data-qc=\"drawing-number-preview\"",
    "data-qc=\"number-preview-note\"",
    "預覽不占號；建立申請後才會保留號碼。",
    "autoAcquireCandidates: true",
    "建立並保留號碼",
    "申請已建立並保留號碼",
    "建立申請時會直接保留號碼",
    "showPartKindSelector",
    "showPartCustomSpecification",
    "form.mode !== \"new_bundle\"",
    "客製規格",
    "duplicate-warning-only",
    "仍可繼續建立草稿"
  ]) &&
    !workspace.includes("須製程管制") &&
    !workspace.includes("共用件已標示須製程管制") &&
    !workspace.includes("共用件未標示製程管制") &&
    !workspace.includes("共用料件會自動標示為跨專案共用") &&
    !workspace.includes("說明為什麼此料件可跨專案共用") &&
    !workspace.includes("共用件請填寫跨專案共用原因。") &&
    !workspace.includes("data-qc=\"draft-outcome-options\"") &&
    !workspace.includes("品名系列代號（選填）") &&
    !workspace.includes("料號系列代號（選填）") &&
    !workspace.includes("品名系列請以上方品名建議為準。") &&
    !workspace.includes("客製規格（選填）") &&
    !workspace.includes("組立製造圖 MA") &&
    !workspace.includes("其他圖 OT") &&
    !workspace.includes("用途說明（選填）") &&
    !workspace.includes("圖面用途說明") &&
    !workspace.includes("參考圖請填寫用途說明") &&
    !workspace.includes("主要製造圖") &&
    !workspace.includes("form.primaryManufacturing") &&
    !workspace.includes("依管理辦法由大到小、由主到次產生；確定品名仍可手動微調。") &&
    !workspace.includes('label="主根名稱"') &&
    !workspace.includes("請輸入主根名稱。") &&
    !workspace.includes("料號品名必須由主根名稱帶入") &&
    !workspace.includes("const coreName = form.coreName.trim();") &&
    !workspace.includes("Boolean(duplicateResult?.blocked)") &&
    !workspace.includes("請改用既有主根或修正名稱。") &&
    !workspace.includes("已有高度相似資料，請改用既有主根追加") &&
    !workspace.includes("確認取得候選號") &&
    !workspace.includes("儲存後再取得候選號") &&
    !workspace.includes("先儲存草稿，再明確取得候選號") &&
    !workspace.includes("草稿已儲存，尚未占用候選號") &&
    !workspace.includes("onAcquire") &&
    includesAll(draftWorkspacesApi, [
      "autoAcquireCandidates",
      "acquireNumberingDraftCandidates",
      "numbering.candidate.acquire",
      "derivedIdempotencyKey",
      "autoAcquiredCandidates"
    ]),
  "Phase 1E must restore managed naming/drawing guidance, keep similar-name duplicate checks as warnings only, force drawing drafts for manufactured parts, avoid duplicate part-kind decisions, and reserve candidate numbers immediately when creating the draft"
);

record(
  "NSF-REQ-EQ-009 create UI follows management-method naming templates",
  includesAll(workspace, [
    "normalizeNameSegment",
    "replace(/[\\s_]+/gu, \"_\")",
    "const series = form.sharedName ? \"\" : normalizeNameSegment(form.seriesCode)",
    "[core, brand, specification]",
    "[core, series, feature || specification, serial]",
    "外購件建議：[核心名詞]_[品牌]_[規格/型號]",
    "自製/發包/客製建議：[核心名詞]_[系列代號]_[特性]_[流水識別]"
  ]) &&
    !workspace.includes('form.sharedName ? "共用"') &&
    !workspace.includes("sharedScope") &&
    !workspace.includes("依管理辦法由大到小、由主到次產生"),
  "suggested confirmed names must mirror the management method without changing v3 numbering authority"
);

record(
  "NSF-REQ-EQ-010 preview API is read-only and follows candidate sequence scopes",
  includesAll(previewApi, [
    "export async function GET",
    "requireNumberStateReadAccessAsync(request, \"numbering.workspace.create\")",
    "reserved: false",
    "part_roots WHERE company_id = :companyId",
    "part_numbers WHERE company_id = :companyId",
    "drawing_numbers WHERE company_id = :companyId",
    "number_candidate_reservations",
    "numbering_recovery_reservations",
    "reservation_state IN ('active', 'review_locked', 'approved_locked', 'promoted')",
    "`${companyId}:root:${ruleVersionId}`",
    "`${companyId}:part:${rootCode}:${ruleVersionId}`",
    "`${companyId}:drawing:${rootCode}:${purposeCode}:${ruleVersionId}`"
  ]) &&
    !/\b(?:INSERT|UPDATE|DELETE|UPSERT|CREATE|DROP|ALTER)\b/u.test(previewApi) &&
    !previewApi.includes(".execute("),
  "number preview may read official/reserved/recovery numbers, but must not reserve, mutate, or use a different sequence scope"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ suite: "number-state-flow-request-equivalence", passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
