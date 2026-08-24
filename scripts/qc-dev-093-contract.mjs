import fs from "node:fs";
import path from "node:path";
import {
  intentToRequest,
  normalizeCreateIntent,
  suggestCanonicalProductName,
  validateCreateIntent,
} from "../src/lib/canonical-numbering-create-contract.ts";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });
const exists = (file) => fs.existsSync(path.join(root, file));

check("QA-093-001", exists("src/app/numbering/create/page.tsx"), "canonical create page exists");
check("QA-093-002", exists("src/components/canonical-numbering-create-form.tsx"), "progressive form exists");
check("QA-093-003", exists("src/lib/canonical-numbering-create-contract.ts"), "typed intent contract exists");
check("QA-093-004", exists("src/app/api/numbering/records/preview/route.ts"), "new-root preview route exists");
const action = read("src/components/canonical-numbering-create-action.tsx");
check("QA-093-005", action.includes("/numbering/create?") && action.includes("onBeforeNavigate"), "entry action is a safe link with dirty guard");
check("QA-093-006", !action.includes("fetch(\"/api/numbering/records\"") && !action.includes("canonical-modal"), "entry action owns no mutation or modal");
const contract = read("src/lib/canonical-numbering-create-contract.ts");
check("QA-093-007", ["new_root", "existing_root", "drawing_part", "intentToRequest", "validateCreateIntent"].every((value) => contract.includes(value)), "typed scope/content mapping is present");
const form = read("src/components/canonical-numbering-create-form.tsx");
const changeWorkspace = read("src/components/canonical-change-workspace.tsx");
const partChangeRepository = read("src/lib/repositories/part-change-work-async-repository.ts");
const detailProjection = read("src/lib/pdm-canonical-workbench.ts");
const drawingPartRoute = read("src/app/api/numbering/drawings/[drawingNumber]/parts/route.ts");
const rootPartsRoute = read("src/app/api/numbering/roots/[rootCode]/parts/route.ts");
const rootDrawingPartRoute = read("src/app/api/numbering/roots/[rootCode]/drawing-part/route.ts");
const numberingRepository = read("src/lib/repositories/numbering-repository.ts");
const asyncNumberingRepository = read("src/lib/repositories/numbering-async-repository.ts");
check("QA-093-008", ["建立新圖料", "加到既有圖料", "預估號碼", "duplicate-check", "Idempotency-Key"].every((value) => form.includes(value)), "progressive UI has required validation and retry elements");
const routes = [
  "src/app/api/numbering/records/route.ts",
  "src/app/api/numbering/roots/[rootCode]/parts/route.ts",
  "src/app/api/numbering/roots/[rootCode]/drawings/route.ts",
  "src/app/api/numbering/roots/[rootCode]/drawing-part/route.ts",
].map(read).join("\n");
const changeControlRoutes = [
  "src/app/api/numbering/part-number-drafts/route.ts",
  "src/app/api/numbering/part-number-drafts/[draftId]/route.ts",
  "src/app/api/numbering/drawing-revisions/fff-assessments/route.ts",
  "src/app/api/numbering/drawing-revisions/submissions/route.ts",
].map(read).join("\n");
check("QA-093-009", routes.includes("Idempotency-Key") || routes.includes("idempotency"), "canonical write routes retain idempotency boundary");
check("QA-093-010", read("src/app/api/numbering/roots/[rootCode]/append-policy/route.ts").includes("@/lib/numbering-preview"), "append policy uses canonical preview helper");
const itemKindAuthority = read("src/lib/numbering-item-kind.ts");
check("QA-093-011", ["依圖製作件", "外購標準件", "共用件", "isUniversal"].every((value) => `${itemKindAuthority}\n${form}`.includes(value)) && !form.includes("共用原因") && !form.includes("universalReason"), "human labels are two-value with an independent reason-free shared checkbox contract");
check("QA-093-012", !form.includes("自製件") && !form.includes("外購件") && !form.includes("委外件") && !form.includes("itemKind === \"shared\"") && !form.includes("itemKind === \"custom\""), "retired human labels and legacy item kind options are absent from the canonical form");
check("QA-093-013", ["parseCanonicalNumberingItemKind", "itemKind must be manufactured or purchased"].every((value) => routes.includes(value)), "canonical routes reject legacy item kinds");
const itemKindMigration = read("db/postgres/044_canonical_item_kind_two_values.sql");
check("QA-093-014", itemKindMigration.includes("WHEN 'outsourced' THEN 'manufactured'") && itemKindMigration.includes("explicit base classification for legacy shared rows") && itemKindMigration.includes("unresolved"), "formal migration maps drawing-made legacy kinds correctly and fails closed on ambiguous shared rows");
check("QA-093-CONTRACT-015", changeControlRoutes.includes('new Set(["self_made", "purchased"])') && !changeControlRoutes.includes('"standard"'), "legacy change-control APIs expose only self_made/purchased");
check("QA-093-CONTRACT-016", read("db/postgres/045_part_number_draft_item_type_two_values.sql").includes("unresolved") && read("db/postgres/045_part_number_draft_item_type_two_values.sql").includes("standard"), "draft item type migration maps standard and fails closed");

const manufacturedName = suggestCanonicalProductName({
  itemKind: "manufactured",
  primaryNoun: " 馬達 ",
  seriesCode: "JF",
  feature: "伺服  400W",
  serialIdentifier: "A",
});
const purchasedName = suggestCanonicalProductName({
  itemKind: "purchased",
  primaryNoun: "馬達",
  seriesCode: "SHOULD_NOT_APPEAR",
  brand: "東元",
  specificationModel: "1HP 4P 220VAC",
});
check("QA-093-073", ["主要名詞", "建議品名", "確定品名", "coreName: confirmedName"].every((value) => form.includes(value)), "new-root UI separates noun, suggestion and confirmed coreName authority");
check("QA-093-074", manufacturedName === "馬達_JF_伺服_400W_A", `manufactured suggestion=${manufacturedName}`);
check("QA-093-075", purchasedName === "馬達_東元_1HP_4P_220VAC" && !purchasedName.includes("SHOULD_NOT_APPEAR"), `purchased suggestion=${purchasedName}`);
check("QA-093-076", suggestCanonicalProductName({ itemKind: "manufactured", primaryNoun: "__ 馬達__", feature: "__伺服   400W__" }) === "馬達_伺服_400W", "name segments normalize whitespace and underscores");
check("QA-093-077", suggestCanonicalProductName({ itemKind: "manufactured", primaryNoun: "馬達" }) === "馬達" && form.includes("建議用選填") === false, "optional naming segments do not block or add UI noise");
check("QA-093-078", form.includes("setConfirmedName(suggestedName)") && !form.includes("reserve") && !form.includes("candidate"), "apply suggestion only updates local confirmed name");

const normalizedUniversal = normalizeCreateIntent({
  scope: "new_root",
  content: "drawing_part",
  coreName: "馬達_JF",
  itemKind: "manufactured",
  isUniversal: true,
  seriesCode: "JF",
  purposeCode: "M",
});
const newManufacturedRequest = intentToRequest({
  scope: "new_root",
  content: "drawing_part",
  coreName: manufacturedName,
  itemKind: "manufactured",
  isUniversal: false,
  seriesCode: "JF",
  customSpecification: "伺服 400W",
  purposeCode: "M",
});
const newPurchasedPartRequest = intentToRequest({
  scope: "new_root",
  content: "part",
  coreName: purchasedName,
  itemKind: "purchased",
  isUniversal: false,
  customSpecification: "1HP 4P 220VAC",
});
const newPurchasedReferenceRequest = intentToRequest({
  scope: "new_root",
  content: "drawing_part",
  coreName: purchasedName,
  itemKind: "purchased",
  isUniversal: false,
  customSpecification: "VFD-E",
  purposeCode: "R",
  referencePurpose: "安裝尺寸參考",
});
check("QA-093-079", newManufacturedRequest.body.coreName === manufacturedName, "confirmed name is the only coreName in the request");
check("QA-093-080", manufacturedName.includes("_JF_") && newManufacturedRequest.body.seriesCode === "JF", "series is both suggestion segment and independent metadata");
check("QA-093-081", exists("src/app/api/numbering/series-codes/route.ts") && form.includes("<datalist") && form.includes("可直接輸入新代號"), "existing series options and free input share canonical create UI");
check("QA-093-082", form.includes('itemKind === "purchased"') && form.includes("nameBrand") && form.includes("規格／特性（選填）") && form.includes("規格／型號（選填）") && !purchasedName.includes("JF"), "item-kind disclosure and one visible specification source are explicit");
check("QA-093-083", normalizedUniversal.content === "drawing_part" && normalizedUniversal.seriesCode === null && !Object.hasOwn(normalizedUniversal, "universalReason"), "shared item clears hidden series metadata without a reason field");
check("QA-093-084", form.includes("maxLength={300}") && validateCreateIntent({ scope: "new_root", content: "drawing_part", coreName: "字".repeat(301), itemKind: "manufactured", isUniversal: false, purposeCode: "M" }).some((message) => message.includes("300")), "300-character confirmed-name boundary exists on both UI and contract");
check("QA-093-085", form.includes("slice(0, 5)") && ["displayCode", "displayName", "match.score", "重新查重"].every((value) => form.includes(value)), "duplicate warning lists at most five human-readable candidates and supports retry");

const drawingOnlyRequest = intentToRequest({
  scope: "existing_root",
  content: "drawing",
  rootCode: "A0002",
  purposeCode: "M",
});
const drawingOnlyKeys = Object.keys(drawingOnlyRequest.body);
const forbiddenDrawingKeys = ["coreName", "itemKind", "isUniversal", "seriesCode", "universalReason", "customSpecification"];
check("QA-093-086", !form.includes("partName: coreName") && form.includes('scope !== "new_root"') && !Object.hasOwn(drawingOnlyRequest.body, "coreName"), "existing-root flow does not run name authority or self-duplicate input");
check("QA-093-087", form.includes("canShowDetails") && form.indexOf('scope === "existing_root" ? <section') < form.indexOf("{canShowDetails ? <>"), "unknown-root flow locks root before revealing content");
check("QA-093-088", forbiddenDrawingKeys.every((key) => !drawingOnlyKeys.includes(key)), `drawing-only keys=${drawingOnlyKeys.join(",")}`);
check("QA-093-089", Object.keys(newManufacturedRequest.body).every((key) => ["coreName", "itemKind", "seriesCode", "isUniversal", "customSpecification", "drawingRequested", "drawingPurposeCode", "drawingPurposeDescription"].includes(key)) && !Object.hasOwn(newManufacturedRequest.body, "universalReason"), "new-root request obeys its discriminated allowlist without a shared reason");
check("QA-093-090", ["aria-invalid", "canonical-create-field-error", "focus()", "fieldErrors"].every((value) => form.includes(value)), "inline errors are associated and focus the first invalid field");
check("QA-093-091", form.includes("預估暫時無法取得") && form.includes("setPreviewRetry"), "preview error is distinct and retryable");
check("QA-093-092", form.includes('policyState.status !== "ready"') && form.includes("setPolicyRetry"), "unknown append policy fails closed and is retryable");
check("QA-093-093", form.match(/new AbortController\(\)/gu)?.length >= 5 && form.match(/controller\.abort\(\)/gu)?.length >= 5, "root, series, policy, preview and duplicate reads cancel stale requests");
const css = read("src/app/globals.css");
check("QA-093-094", css.includes('input:not([type="checkbox"]):not([type="radio"])') && css.includes(".canonical-create-checkbox input") && css.includes("width: 18px"), "shared checkbox keeps native control dimensions across viewports");
check("QA-093-098", form.indexOf("<span>料件類型</span>") < form.indexOf("<span>主要名詞</span>") && form.indexOf("<span>主要名詞</span>") < form.lastIndexOf("<span>規格／特性（選填）</span>") && form.lastIndexOf("<span>規格／特性（選填）</span>") < form.indexOf("canonical-create-suggestion") && suggestCanonicalProductName({ itemKind: "manufactured", primaryNoun: "", seriesCode: "JF" }) === "", "part conditions precede naming and the unified specification precedes the suggestion");
check("QA-093-099", form.indexOf("canonical-create-duplicate") > form.indexOf("canonical-create-suggestion") && form.indexOf("canonical-create-duplicate") < form.indexOf("canonical-create-confirmed-name"), "duplicate result is adjacent to the suggestion before the confirmed name decision");
const invalidManufacturedPart = validateCreateIntent({ scope: "new_root", content: "part", coreName: "加工座", itemKind: "manufactured", isUniversal: false });
const invalidManufacturedReference = validateCreateIntent({ scope: "new_root", content: "drawing_part", coreName: "加工座", itemKind: "manufactured", isUniversal: false, purposeCode: "R", referencePurpose: "錯誤用途" });
const invalidPurchasedManufacturing = validateCreateIntent({ scope: "new_root", content: "drawing_part", coreName: "標準馬達", itemKind: "purchased", isUniversal: false, purposeCode: "M", referencePurpose: "" });
check("QA-093-100", form.includes('scope === "existing_root" ? <fieldset>') && form.includes("resolvedContent") && form.includes("resolvedPurposeCode"), "new-root UI derives content while existing-root keeps the explicit chooser");
check("QA-093-101", invalidManufacturedPart.some((message) => message.includes("同時建立製造圖")) && invalidManufacturedReference.some((message) => message.includes("製造圖 M")) && invalidPurchasedManufacturing.some((message) => message.includes("參考圖 R")), "typed contract rejects every invalid new-root item-kind/content combination");
check("QA-093-102", newManufacturedRequest.body.drawingRequested === true && newManufacturedRequest.body.drawingPurposeCode === "M" && newPurchasedPartRequest.body.drawingRequested === false && newPurchasedReferenceRequest.body.drawingRequested === true && newPurchasedReferenceRequest.body.drawingPurposeCode === "R", "new-root requests map manufactured to M bundle, purchased to part, and optional purchased reference to R bundle");
check("QA-093-103", ["manufactured new roots require a manufacturing drawing", "manufactured new roots require drawingPurposeCode M", "purchased new roots may only add drawingPurposeCode R"].every((value) => routes.includes(value)), "server independently enforces the new-root creation matrix");
check("QA-093-104", form.includes("同時建立參考圖 R") && form.includes('resolvedPurposeCode === "R"') && form.includes("參考圖用途"), "purchased reference drawing uses progressive disclosure without a new-root content mode");
check("QA-093-105", !form.includes("<span>自訂規格（選填）</span>") && !form.includes("<span>特性（選填）</span>") && !form.includes("nameFeature") && !form.includes("nameSpecificationModel") && form.includes('feature: itemKind === "manufactured" ? customSpecification') && form.includes('specificationModel: itemKind === "purchased" ? customSpecification') && newManufacturedRequest.body.customSpecification === "伺服 400W" && newPurchasedPartRequest.body.customSpecification === "1HP 4P 220VAC", "one visible specification value drives both suggestion and persisted customSpecification");
check("QA-093-106", !form.includes("共用原因") && !form.includes("universalReason") && !routes.includes("universalReason is required"), "shared checkbox no longer exposes or requires a reason");
check("QA-093-107", !changeWorkspace.includes("共用原因") && !changeWorkspace.includes("universalReason") && !partChangeRepository.includes("共用件必須填寫共用原因") && !detailProjection.includes('field("universalReason"') && !drawingPartRoute.includes("universalReason is required"), "part change workspace, detail projection and drawing-linked append route also remove shared reason semantics");
check("QA-093-108", form.includes("料件設定（沿用根號）") && form.includes("policy?.inheritedPart") && rootPartsRoute.includes("body.itemKind !== undefined || body.item_kind !== undefined") && rootDrawingPartRoute.includes("body.itemKind !== undefined || body.item_kind !== undefined") && numberingRepository.includes("PART_ROOT_ITEM_KIND_MISMATCH") && asyncNumberingRepository.includes("PART_ROOT_ITEM_KIND_MISMATCH"), "existing-root part creation presents one inherited root profile instead of editable part settings");
check("QA-093-109", form.includes("setIsUniversal(body.inheritedPart.isUniversal)") && form.includes("setSeriesCode(body.inheritedPart.seriesCode ?? \"\")") && form.includes("setCustomSpecification(body.inheritedPart.customSpecification ?? \"\")") && asyncNumberingRepository.includes("getRootAppendPartProfile") && asyncNumberingRepository.includes("isUniversal: inheritedPart.isUniversal") && asyncNumberingRepository.includes("customSpecification: inheritedPart.customSpecification ?? undefined") && asyncNumberingRepository.includes("seriesCode: inheritedPart.seriesCode ?? undefined"), "existing-root append inherits shared, series, and specification settings from the first canonical part and writes the server profile");
check("QA-093-095", checks.filter((item) => /^QA-093-(?:0(?:7[3-9]|8[0-9]|9[0-4]|98|99)|10[0-8])$/u.test(item.id)).every((item) => item.ok), "corrective gate independently requires every restored naming/disclosure, derivation, single-source specification, reason-free shared checkbox and inherited root item-kind capability");
const failed = checks.filter((item) => !item.ok);
console.log(JSON.stringify({ task: "DEV-093", passed: failed.length === 0, checks }, null, 2));
if (failed.length) process.exitCode = 1;
