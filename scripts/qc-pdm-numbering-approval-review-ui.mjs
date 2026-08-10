#!/usr/bin/env node

import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function read(relativePath) {
  return readProjectFile(root, relativePath);
}

const legacyNumberingApprovalsPage = read("src/app/numbering/approvals/page.tsx");
const legacyRedirect = read("src/lib/approval-workbench-legacy-redirect.ts");
const approvalWorkbenchPage = read("src/app/approvals/page.tsx");
const submissionResultComponent = read("src/components/numbering-submission-result.tsx");
const sharedDrawingDetailContent = read("src/components/drawing-detail-content.tsx");
const sharedDrawingDetailPreview = read("src/components/drawing-detail-preview.tsx");
const sharedDrawingPreviewAsset = read("src/lib/drawing-preview-asset.ts");
const drawingWorkbench = read("src/components/drawing-workbench.tsx");
const numberStateWorkspace = read("src/components/number-state-workspace.tsx");
const candidateRevisionEditor = read("src/components/numbering-candidate-revision-editor.tsx");
const masterAttachmentPanel = read("src/components/master-attachment-panel.tsx");
const approvalPlatformRepository = read("src/lib/repositories/approval-platform-async-repository.ts");
const approvalEvidenceRoute = read("src/app/api/approvals/requests/[requestId]/evidence/[fileId]/route.ts");
const candidatePreviewRoute = read("src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/[fileId]/route.ts");
const approvalPlatformQc = read("scripts/qc-pdm-approval-platform.mjs");
const packageJson = JSON.parse(read("package.json"));

record(
  "Legacy numbering approvals route redirects to approval workbench",
  legacyNumberingApprovalsPage.includes("redirect(buildLegacyApprovalWorkbenchRedirect") &&
    legacyNumberingApprovalsPage.includes('"numbering_approvals"')
);
record(
  "Legacy numbering approvals route is no longer an independent client inbox",
  !legacyNumberingApprovalsPage.includes('"use client"')
);
record(
  "Legacy redirect preserves numbering domain filter",
  legacyRedirect.includes("numbering_approvals") && legacyRedirect.includes('domain: "numbering"')
);
record(
  "Legacy redirect preserves request deep-link aliases",
  legacyRedirect.includes("requestId") && legacyRedirect.includes("approvalRequestId") && legacyRedirect.includes("reviewId")
);
record(
  "Approval workbench is the canonical reviewer surface",
  approvalWorkbenchPage.includes("<h1>審核工作台") && approvalWorkbenchPage.includes("legacyRedirectMessages")
);
record(
  "Approval workbench exposes numbering approval filters",
  approvalWorkbenchPage.includes("numbering.release") &&
    approvalWorkbenchPage.includes("numbering.drawing_revision_impact_review") &&
    approvalWorkbenchPage.includes("numbering.obsolete_part_number") &&
    approvalWorkbenchPage.includes("numbering.obsolete_ma_drawing")
);
record(
  "Approval workbench supports detail decisions",
  approvalWorkbenchPage.includes("allowedDecisionsForDetail") &&
    approvalWorkbenchPage.includes("/api/approvals/requests/") &&
    approvalWorkbenchPage.includes("/decisions")
);
record(
  "Approval workbench supports filtered deep links",
  approvalWorkbenchPage.includes("buildInboxUrl") && approvalWorkbenchPage.includes("syncFilterQuery")
);
record(
  "Approval detail uses the shared drawing workspace drawer",
  approvalWorkbenchPage.includes("ApprovalDetailDrawer") &&
    approvalWorkbenchPage.includes("DrawingWorkspaceDrawer") &&
    approvalWorkbenchPage.includes("DRAWING_DETAIL_DRAWER_WIDTH_STORAGE_KEY") &&
    !approvalWorkbenchPage.includes("approval-detail-panel")
);
record(
  "Approval drawer keeps the shared review section order",
  approvalWorkbenchPage.includes('overviewLabel="審核摘要"') &&
    approvalWorkbenchPage.includes('heading="圖面與附件"') &&
    approvalWorkbenchPage.includes("ApprovalPendingSummary") &&
    approvalWorkbenchPage.includes("ApprovalMoreDetails")
);
record(
  "Candidate, formal and approval surfaces reuse one content-layer component",
  sharedDrawingDetailContent.includes("export type DrawingDetailContentModel") &&
    sharedDrawingDetailContent.includes("export function DrawingDetailContent") &&
  sharedDrawingDetailContent.includes("export function DrawingDetailSummary") &&
    sharedDrawingDetailContent.includes("export function DrawingDetailSection") &&
    sharedDrawingDetailPreview.includes("export function DrawingDetailPreview") &&
    sharedDrawingDetailPreview.includes("3D 模型") &&
    sharedDrawingDetailPreview.includes("2D 圖面") &&
    submissionResultComponent.includes("DrawingDetailSummary") &&
    drawingWorkbench.includes("DrawingDetailSummary") &&
    drawingWorkbench.includes("content={{") &&
    numberStateWorkspace.includes("DrawingDetailPreview") &&
    numberStateWorkspace.includes("content={{") &&
    candidateRevisionEditor.includes("DrawingDetailSection") &&
    masterAttachmentPanel.includes("DrawingDetailPreview") &&
    approvalWorkbenchPage.includes("content={{")
);
record(
  "Candidate bundle inbox rows use candidate drawing codes from the locked review snapshot",
  approvalPlatformRepository.includes("lockedReservations") &&
    approvalPlatformRepository.includes("targetSummary(row.action_code, targets, impactByRequestId.get(row.id))")
);
record(
  "Candidate bundle review detail exposes drawing and attachment evidence",
  approvalWorkbenchPage.includes("圖面與附件") &&
    approvalWorkbenchPage.includes("<NumberingSubmissionResult") &&
    submissionResultComponent.includes("numberingSubmissionFileRoleLabel")
);
record(
  "Candidate evidence has authenticated preview and download access",
  submissionResultComponent.includes("?preview=1") &&
    submissionResultComponent.includes("?download=1") &&
    approvalEvidenceRoute.includes("evidenceBelongsToRequest") &&
    (approvalEvidenceRoute.includes("預覽正在準備") || approvalEvidenceRoute.includes("預覽尚未產生"))
);
record(
  "Candidate evidence route enforces reviewer authorization and storage-safe responses",
  approvalEvidenceRoute.includes("requireRoleAsync") &&
    approvalEvidenceRoute.includes("reviewerRoles") &&
    approvalEvidenceRoute.includes("storagePointerFromRecord") &&
    approvalEvidenceRoute.includes("contentDispositionFilename")
);
record(
  "Candidate evidence preview covers PDF/image originals and native CAD derivatives",
    sharedDrawingPreviewAsset.includes('mimeType === "application/pdf"') &&
    sharedDrawingPreviewAsset.includes('mimeType.startsWith("image/")') &&
    sharedDrawingPreviewAsset.includes("file_derivatives") &&
    approvalEvidenceRoute.includes("enqueuePreviewJobForSourceAsync") &&
    candidatePreviewRoute.includes("resolveDrawingPreviewAsync")
);
record(
  "Focused approval platform QC covers legacy numbering redirect",
  approvalPlatformQc.includes("Phase 1C-B numbering approvals route redirects to workbench")
);
record(
  "Package keeps compatibility QC command registered",
  packageJson.scripts?.["qc:pdm-numbering-approval-review-ui"] === "node scripts/qc-pdm-numbering-approval-review-ui.mjs"
);

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      results
    },
    null,
    2
  )
);
