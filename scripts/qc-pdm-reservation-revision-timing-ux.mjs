#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  return startIndex >= 0 && endIndex > startIndex ? source.slice(startIndex, endIndex) : "";
}

function record(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

const workspace = read("src/components/number-state-workspace.tsx");
const revisionsPage = read("src/app/numbering/revisions/page.tsx");
const resolveRoute = read("src/app/api/numbering/drawings/resolve/route.ts");
const revisionWorkbench = read("src/lib/drawing-revision-workbench.ts");
const submissionWorkbenchRoute = read("src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts");
const packageJson = JSON.parse(read("package.json"));

record(
  "reserve_row_version_exposed_as_revision",
  !workspace.includes("draftModeLabel(workspace.draftMode)} · v{workspace.rowVersion}"),
  "保留號主清單不得把 optimistic-lock rowVersion 顯示成業務版次。"
);

record(
  "system_record_version_label_missing",
  !workspace.includes("v{workspace.rowVersion}"),
  "內部 rowVersion 不得以業務版次文字出現在編號申請介面。"
);

record(
  "revision_preparation_copy_missing",
  ["首版圖面／版次檔案", "建議研發版次", "尚未建立版次", "建立首版圖面"].every((text) => workspace.includes(text)),
  "drawer 必須回答建議版次、是否已建立與下一步。"
);

record(
  "first_drawing_cta_context_incomplete",
  workspace.includes("/numbering/revisions?") &&
    workspace.includes("drawingNumber,") &&
    workspace.includes('workflowIntent: "rd_workspace"') &&
    workspace.includes('source: "number_state_workspace"') &&
    workspace.includes("workspaceId: workspace.id"),
  "首版圖面 handoff 必須攜帶圖號、workflow intent、來源與 workspace ID。"
);

record(
  "candidate_cta_authority_gate_missing",
  workspace.includes('workspace.lifecycleStatus === "published"') &&
    workspace.includes('reservation.state === "promoted"') &&
    workspace.includes('actionPermissions?.["numbering.draft.update"] === true') &&
    workspace.includes("!formalActionsUnopened") &&
    workspace.includes("圖面進版尚未納入本次編號建立開放範圍") &&
    workspace.includes("canOpenRevisionWorkbench") &&
    workspace.includes("先完成編號申請審核與發布，再進入圖面進版工作台。"),
  "candidate 尚未成為 drawing_numbers authority 或使用者無建立權限時，CTA 必須 fail closed 並說明下一步。"
);

record(
  "reservation_suggestion_server_call_missing",
  workspace.includes('new URLSearchParams({ drawingNumber, workflowIntent: "rd_workspace" })') &&
    workspace.includes('fetch(`/api/submissions/revision-suggestion?${params.toString()}`') &&
    workspace.includes('cache: "no-store"') &&
    !workspace.includes('fetch("/api/submissions/revision-suggestion", {'),
  "保留號 drawer 必須以 production-slice 可通行的唯讀 GET 呼叫 DEV-050 server suggestion。"
);

record(
  "revision_workbench_intent_handoff_missing",
  ["workflowIntent", "workflow_intent", "lifecycleStage"].every((alias) => revisionsPage.includes(`searchParams.get("${alias}")`)) &&
    revisionsPage.includes('params.set("workflowIntent", workflowIntent)') &&
    revisionsPage.includes("new URLSearchParams({ revision: targetRevision, workflowIntent })"),
  "圖面進版頁必須解析 intent aliases，並傳給 resolve 與 submission context。"
);

record(
  "resolver_suggestion_policy_alignment_missing",
  ["workflowIntent", "workflow_intent", "lifecycleStage"].every((alias) => resolveRoute.includes(`url.searchParams.get("${alias}")`)) &&
    revisionWorkbench.includes("createRevisionSuggestion") &&
    revisionWorkbench.includes("normalizeRevisionWorkflowIntent") &&
    !revisionWorkbench.includes("suggestRevisionCode(revisions"),
  "resolve 與 submit context 必須共用 DEV-050 suggestion engine。"
);

record(
  "submission_context_intent_support_missing",
  submissionWorkbenchRoute.includes('url.searchParams.get("workflowIntent")') &&
    submissionWorkbenchRoute.includes('url.searchParams.get("workflow_intent")') &&
    submissionWorkbenchRoute.includes('url.searchParams.get("lifecycleStage")') &&
    submissionWorkbenchRoute.includes("workflowIntent"),
  "submission workbench route 必須保留 workflow intent 支援。"
);

record(
  "manual_revision_edit_guard_missing",
  revisionsPage.includes("revisionManuallyEditedRef") &&
    revisionsPage.includes("!revisionManuallyEditedRef.current") &&
    revisionsPage.includes("revisionManuallyEditedRef.current = true"),
  "server suggestion 非同步回來時不得覆蓋使用者已手動修改的版次。"
);

record(
  "upload_revision_intent_lock_missing",
  revisionsPage.includes("revisionIntentLockedRef") &&
    revisionsPage.includes("revisionIntentLockedRef.current = true") &&
    revisionsPage.includes("!revisionIntentLockedRef.current") &&
    revisionsPage.includes("加入附件庫"),
  "加入某一版次檔案後，重新讀取送審 context 不得把使用者目標版次自動推進成下一版。"
);

const workspaceContract = between(workspace, "type NumberingDraftWorkspace =", "type ApiErrorEnvelope =");
const workspaceEditForm = between(workspace, "function WorkspaceEditForm", "function ConfirmDialog");
record(
  "reservation_revision_authority_introduced",
  !/(?:selectedRevision|suggestedRevision|drawingRevision)\s*:/.test(workspaceContract) &&
    !/(?:selectedRevision|suggestedRevision|drawingRevision)\s*:/.test(workspaceEditForm),
  "編號申請 contract 與 edit form 不得新增可寫入的 drawing revision persistence 欄位。"
);

const productSources = [workspace, revisionsPage, resolveRoute, revisionWorkbench, submissionWorkbenchRoute].join("\n");
record(
  "phase1_emergency_lane_exposed",
  !["ConditionalUse", "TrialApproved", "條件使用", "試用核准", "緊急使用"].some((text) => productSources.includes(text)),
  "DEV-051 Phase 1 不得開放 emergency-use lane。"
);

record(
  "focused_qc_script_not_registered",
  packageJson.scripts?.["qc:pdm-reservation-revision-timing-ux"] ===
    "node scripts/qc-pdm-reservation-revision-timing-ux.mjs",
  "package.json 必須註冊 DEV-051 focused QC。"
);

const failed = checks.filter((check) => !check.passed);
if (failed.length > 0) {
  console.error(JSON.stringify({ total: checks.length, passed: checks.length - failed.length, failed }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`qc:pdm-reservation-revision-timing-ux passed ${checks.length}/${checks.length} checks`);
}
