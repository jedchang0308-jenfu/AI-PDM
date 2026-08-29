#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function readRequired(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) {
    results.push({ name: `READ ${relativePath}`, passed: false, detail: "missing" });
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function appearsBefore(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

const helper = readRequired("src/lib/production-slice.ts");
const middleware = readRequired("src/middleware.ts");
const statusRoute = readRequired("src/app/api/production-slice/status/route.ts");
const blockedPage = readRequired("src/app/production-slice-blocked/page.tsx");
const sidebar = readRequired("src/components/sidebar-nav.tsx");
const masterAttachmentPanel = readRequired("src/components/master-attachment-panel.tsx");
const globalCss = readRequired("src/app/globals.css");
const envExample = readRequired(".env.example");
const submitReviewRoute = readRequired("src/app/api/numbering/part-number-drafts/[draftId]/submit-review/route.ts");
const reconfirmRoute = readRequired("src/app/api/numbering/part-number-drafts/[draftId]/reconfirm/route.ts");
const restoreRoute = readRequired("src/app/api/numbering/part-number-drafts/[draftId]/restore/route.ts");
const voidRoute = readRequired("src/app/api/numbering/part-number-drafts/[draftId]/void/route.ts");
const recycleRoute = readRequired("src/app/api/numbering/part-number-drafts/[draftId]/recycle/route.ts");
const changeControlDomain = readRequired("src/lib/pdm-change-control-domain.ts");

const allowedSection = helper.split("const sliceAllowedApiMutationMatchers")[1]?.split("];")[0] ?? "";

record("SLICE-001 helper defines official numbering/draft mode", helper.includes('OFFICIAL_NUMBERING_DRAFT_SLICE = "official-numbering-draft"'));
record("SLICE-002 helper uses stable unopened machine code", helper.includes("feature_not_open_in_production_slice"));
record("SLICE-003 helper documents Chinese unopened message", helper.includes("此功能未納入本次編號建立 production slice。"));
record("SLICE-004 allowed mutation list opens official create", /method:\s*"POST"[\s\S]*\/records/.test(allowedSection));
record("SLICE-004A allowed mutation list opens duplicate-check guard", /method:\s*"POST"[\s\S]*duplicate-check/.test(allowedSection));
record("SLICE-004B official create page is open when its mutation contract is open", helper.includes('"/numbering/create"') && /method:\s*"POST"[\s\S]*\/records/.test(allowedSection));
record("SLICE-005 allowed mutation list opens existing-root append", /roots\\\/\[\^\/\]\+\\\/drawings/.test(allowedSection) && /roots\\\/\[\^\/\]\+\\\/parts/.test(allowedSection) && /drawing-part/.test(allowedSection));
record("SLICE-006 allowed mutation list opens provisional draft create/edit/void/recycle", /part-number-drafts/.test(allowedSection) && /void/.test(allowedSection) && /recycle/.test(allowedSection) && /method:\s*"PATCH"/.test(allowedSection));
record(
  "SLICE-007 allowed mutation list does not open formal workflows",
  !/(approval|submissions|obsolete|drawing-revisions|release|submit-review|reconfirm|restore)/.test(allowedSection),
  allowedSection
);
record("SLICE-008 middleware blocks unopened API mutations", middleware.includes("NextResponse.json") && middleware.includes("isProductionSliceAllowedApiMutation"));
record("SLICE-009 middleware rewrites unopened direct page routes", middleware.includes("NextResponse.rewrite") && middleware.includes("shouldBlockProductionSlicePagePath"));
record("SLICE-010 status API exposes non-secret slice state", statusRoute.includes("productionSliceClientStatus") && !statusRoute.includes("PDM_SUPABASE") && !statusRoute.includes("POSTGRES_URL"));
record("SLICE-011 blocked page routes users to DEV-048 owner surfaces", blockedPage.includes("未開放") && blockedPage.includes("/numbering/search?tab=reserved") && blockedPage.includes("/parts?tab=drafts") && !blockedPage.includes("/numbering/part-drafts"));
record("SLICE-012 sidebar keeps roadmap visible and marks unopened routes", sidebar.includes("/api/production-slice/status") && sidebar.includes("nav-unopened") && sidebar.includes("nav-unopened-badge"));
record("SLICE-013 sidebar sends unopened route clicks to blocked state", sidebar.includes("/production-slice-blocked?from="));
record("SLICE-018D master attachment panel disables unopened file workflow actions", masterAttachmentPanel.includes("productionSliceEnforced") && masterAttachmentPanel.includes("FileDropzone") && masterAttachmentPanel.includes("disabled={productionSliceEnforced}") && masterAttachmentPanel.includes("data-production-slice-unopened"));
record("SLICE-019 submit-review route gates before domain mutation", submitReviewRoute.includes("isProductionSliceEnforced") && appearsBefore(submitReviewRoute, "isProductionSliceEnforced()", "submitPartNumberDraft("));
record("SLICE-020 reconfirm route gates before domain mutation", reconfirmRoute.includes("isProductionSliceEnforced") && appearsBefore(reconfirmRoute, "isProductionSliceEnforced()", "reconfirmPartNumberDraft("));
record("SLICE-021 restore route gates before domain mutation", restoreRoute.includes("isProductionSliceEnforced") && appearsBefore(restoreRoute, "isProductionSliceEnforced()", "restorePartNumberDraft("));
record("SLICE-022 void route continues to use change-control service", voidRoute.includes("voidPartNumberDraft"));
record("SLICE-023 recycle route continues to use change-control service", recycleRoute.includes("recyclePartNumberDraft"));
record("SLICE-024 void/recycle domain uses existing controlled-boundary predicate", changeControlDomain.includes("async assertPartNumberDraftIsRecyclable") && changeControlDomain.includes("const boundary = await this.assertPartNumberDraftIsRecyclable(input.draftId, input.actor);"));
record("SLICE-025 official numbering delete is not allowlisted", !/DELETE/.test(allowedSection) && !/records\\\/\[\^\/\]\+\\\/draft/.test(allowedSection), allowedSection);
record("SLICE-026 env example documents slice mode without public prefix", envExample.includes("PDM_PRODUCTION_SLICE_MODE=") && !envExample.includes("NEXT_PUBLIC_PDM_PRODUCTION_SLICE_MODE"));
record("SLICE-026A local full-function validation is explicit and development-only", helper.includes('env.NODE_ENV') && helper.includes('PDM_LOCAL_FULL_FUNCTION_VALIDATION') && envExample.includes("PDM_LOCAL_FULL_FUNCTION_VALIDATION=false"));
record("SLICE-027 CSS styles unopened nav and detail controls", globalCss.includes(".nav-unopened-badge") && globalCss.includes(".icon-button.production-slice-unopened"));
const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
