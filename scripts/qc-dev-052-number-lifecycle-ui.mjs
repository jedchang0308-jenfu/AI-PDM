#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const has = (source, fragments) => fragments.every((fragment) => source.includes(fragment));
function record(id, passed, detail = "") { results.push({ id, passed: Boolean(passed), detail }); }

const workspace = read("src/components/number-state-workspace.tsx");
const editor = read("src/components/numbering-candidate-revision-editor.tsx");
const drawingsPage = read("src/app/numbering/drawings/page.tsx");
const drawingWorkbench = read("src/components/drawing-workbench.tsx");
const approvalsPage = read("src/app/approvals/page.tsx");
const candidateFileRoute = read("src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/route.ts");
const stateRepository = read("src/lib/repositories/number-state-flow-async-repository.ts");
const entityDetail = read("src/lib/pdm-entity-detail.ts");
const eslintConfig = read("eslint.config.mjs");
const css = read("src/app/globals.css");

record(
  "DEV052-UI-001 legacy reserved route resolves into the unified drawing workbench",
  drawingsPage.includes('if (workbenchEnabled) return <DrawingWorkbench />;') &&
    drawingsPage.includes('params.get("tab") === "reserved"') &&
    !fs.existsSync(path.join(root, "src/app/numbering/v2")),
  "/numbering/drawings is the single visible owner surface"
);
record(
  "DEV052-UI-002 V2 title and purpose sentence are flag-gated",
  has(workspace, ['feature?.lifecycleV2?.enabled === true', '"圖號／首版準備"', '"完成首版準備並送審，核准後由系統發布。"']),
  "V1 fallback remains in the same component"
);
record(
  "DEV052-UI-003 default V2 drawing list filters to active work",
  has(workspace, ['if (lifecycleV2Enabled && module === "drawings") setLifecycle("active")', 'workspace.lifecycleV2']),
  "published results leave the default in-progress list"
);
record(
  "DEV052-UI-004 candidate editor reuses FileDropzone and never redirects to formal revision workbench",
  has(editor, ["FileDropzone", "candidate-revisions", "publicationEvidenceId"]) &&
    workspace.includes("編號仍在申請流程，發布前不能使用") &&
    !editor.includes("/numbering/revisions"),
  "candidate aggregate is edited in the existing drawer"
);
record(
  "DEV052-UI-005 V2 normal lifecycle exposes one primary-action contract and no manual publish CTA",
  has(workspace, ["workspaceHeaderPrimaryAction", 'data-primary-action="submit-bundle-review"', 'data-primary-action="view-review"', 'data-primary-action="view-formal-drawing"']) &&
    workspace.includes("lifecycleV2Enabled ?") && workspace.includes("formalActionsUnopened"),
  "manual 正式發布 remains only inside V1 branch"
);
record(
  "DEV052-UI-006 legacy adoption branches collapse before visible status and pending rendering",
  has(workspace, ["projectNumberLifecycleUserView", "lifecycleAdoptionHidden", "shouldRenderLifecycleV2Pending", '"目前階段"']) &&
    !workspace.includes('"首版準備 / 整包狀態"'),
  "legacy/reconciliation facts remain internal while the user sees one first-revision preparation station"
);
record(
  "DEV052-UI-007 visible states distinguish ReviewApproved from Released",
  has(editor, ["ReviewApproved", "實體 package 仍為 Pending", "研發版已核准"]) &&
    has(workspace, ["official_controlled"]) && drawingWorkbench.includes("圖料號已正式建立"),
  "effective design approval is not manufacturing release"
);
record(
  "DEV052-UI-008 keyboard, focus and responsive drawer/editor structure remain present",
  has(workspace, ["useOverlayLifecycle", "aria-modal=\"true\"", 'const entityLabel = presentation?.entityLabel ?? "圖號"', "closeLabel={`關閉${entityLabel}明細`}"]) &&
    has(css, ["@media (max-width: 720px)", ".candidate-revision-fields", "focus-visible", ".candidate-revision-upload"]),
  "focus trap + close label + mobile single-column editor"
);
record(
  "DEV052-UI-009 production-slice unopened reason is visible instead of a silent disabled control",
  has(workspace, ["UnopenedAction", "data-production-slice-unopened", "unopenedMessage"]),
  "release gate remains visible and fail-closed"
);
record(
  "DEV052-UI-010 V2 submit and withdraw send the workspace-version field required by their routes",
  has(workspace, [
    'action === "submit" || action === "withdraw"',
    "{ expectedWorkspaceRowVersion: selected.rowVersion }",
    "{ expectedRowVersion: selected.rowVersion }",
    "onClick={onWithdraw}",
    "送審者可撤回後補正"
  ]),
  "bundle routes receive expectedWorkspaceRowVersion and the in-review UI exposes owner withdrawal"
);
record(
  "DEV052-UI-011 bundle approval keeps technical snapshot data in a collapsed audit layer",
  has(approvalsPage, [
    "ApprovalImpactSummary",
    "data-approval-bundle-summary",
    "data-approval-audit-details",
    "查看稽核明細",
    "draft_owner_confirmed_candidate_bundle_review",
    "申請者已確認圖料號、關係、版次與檔案證據完整",
    'detail.actionCode === "numbering.candidate_bundle_review"',
    "重試正式化"
  ]) && has(css, [".approval-impact-summary", ".approval-audit-details"]),
  "raw snapshot/status/storage fields are default-collapsed and the main review surface is human-readable"
);
record(
  "DEV052-UI-012 global lint ignores every Next.js generated dist directory",
  eslintConfig.includes('".next*/**"'),
  "custom .next-* QC outputs do not enter eslint source checks"
);
record(
  "DEV052-UI-013 complete-first-drawing blocks same-tick duplicate UI commands",
  has(editor, ["createInFlightRef", "if (createInFlightRef.current) return", "createInFlightRef.current = true", "createInFlightRef.current = false"]),
  "a synchronous ref closes the gap before React renders the disabled state"
);
record(
  "DEV052-UI-014 legacy pending review is retained internally without a user-visible adoption route",
  has(workspace, [
    "projectNumberLifecycleUserView(workspace.lifecycleV2)",
    "!lifecycleAdoptionHidden(workspace) && workspace.capabilities.canWithdrawReview",
    "!lifecycleAdoptionHidden(workspace) && workspace.latestApproval?.status"
  ]),
  "legacy review and retry controls are hidden from the normal drawing surface"
);
record(
  "DEV052-UI-015 bundle pending review grants owner withdrawal capability",
  has(stateRepository, ["latestBundleApproval", 'latestBundleApproval?.status === "pending"', 'latestApproval?.status === "pending"']),
  "the read model recognizes both simplified bundle reviews and retained legacy reviews"
);
record(
  "DEV052-UI-016 candidate upload failure tells the user what happened and what to do next",
  has(candidateFileRoute, ["首版主要檔案尚未加入", "請保留原檔並重新上傳", "請聯絡系統管理員"]) &&
    !candidateFileRoute.includes("Candidate revision file upload failed."),
  "the visible fallback is actionable and does not expose a raw English server failure"
);
record(
  "DEV052-UI-017 unified entity detail uses the same hidden-adoption user projection",
  has(entityDetail, [
    "projectNumberLifecycleUserView(candidate.lifecycleV2)",
    "isNumberLifecycleAdoptionHiddenFromUser(candidate.lifecycleV2)",
    "const candidateRequestId = adoptionHidden",
    "applyFailed: !adoptionHidden"
  ]),
  "the current DEV-067 drawer cannot re-expose legacy review or recovery branches"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
