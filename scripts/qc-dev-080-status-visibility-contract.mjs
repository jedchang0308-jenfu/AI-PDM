#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const record = [];
function check(id, passed, detail = "") {
  assert.equal(passed, true, `${id}${detail ? `: ${detail}` : ""}`);
  record.push({ id, passed });
}

const statusDisplay = read("src/lib/status-display.ts");
const scopeDisplay = read("src/lib/status-scope-display.ts");
const policy = read("src/lib/status-visibility-policy.ts");
const signalGroup = read("src/components/status-signal-group.tsx");
const badge = read("src/components/human-status-badge.tsx");
const hints = read("src/components/compact-hints.tsx");
const css = read("src/app/globals.css");

for (const context of ["recognitionStatus", "recognitionReviewStatus"]) {
  check(`CTX-${context}`, statusDisplay.includes(`| "${context}"`) && statusDisplay.includes(`${context}:`));
}
for (const scope of ["bomCreate", "drawingRecognition"]) check(`SCOPE-${scope}`, scopeDisplay.includes(`${scope}: {`) && scopeDisplay.includes(`id: "${scope}"`));
check("POLICY-exports-projector", policy.includes("export function projectStatusVisibility"));
check("POLICY-unknown-fail-closed", policy.includes('label: "待確認"') && policy.includes("unregistered_status"));
check("POLICY-capacity-aggregate", policy.includes("projectStatusSignals") && policy.includes("exceptions"));
check("GROUP-focus-click-touch", signalGroup.includes("onClick") && signalGroup.includes("onKeyDown") === false && signalGroup.includes("pointerdown"));
check("GROUP-escape-focus-return", signalGroup.includes('event.key !== "Escape"') && signalGroup.includes("triggerRef.current?.focus()"));
check("BADGE-accepts-exceptions", badge.includes("exceptionSignals") && badge.includes("StatusSignalGroup"));
check("HINT-no-title-only", hints.includes("createPortal") && hints.includes("aria-expanded={open}"));
for (const cssToken of [".status-signal-group", ".status-signal-popover", ".ui-hint-popover", "max-width: calc(100vw - 24px)"]) check(`CSS-${cssToken}`, css.includes(cssToken));

const recognitionChip = read("src/components/drawing-recognition-status-chip.tsx");
const recognitionReview = read("src/components/drawing-recognition-review.tsx");
const recognitionWorkspace = read("src/components/drawing-recognition-workspace-panel.tsx");
const ownerWorkspace = read("src/components/drawing-owner-workspace.tsx");
const recognitionPreSubmit = read("src/components/drawing-recognition-pre-submit-panel.tsx");
check("RECOG-central-status-chip", recognitionChip.includes('getStatusDisplay(session.status, "recognitionStatus")') && !recognitionChip.includes("labels[session.status]"));
check("RECOG-central-review", recognitionReview.includes('getStatusDisplay(candidate.reviewState, "recognitionReviewStatus")') && !recognitionReview.includes("reviewLabels"));
check("RECOG-central-workspace", recognitionWorkspace.includes('getStatusDisplay(candidate.reviewState, "recognitionReviewStatus")') && !recognitionWorkspace.includes("statusLabels"));
check("RECOG-pre-submit-exception", recognitionPreSubmit.includes("StatusSignalGroup") && recognitionPreSubmit.includes('context: "recognitionReviewStatus"'));
check("RECOG-scope-help", recognitionReview.includes('StatusScopeHelp scope="drawingRecognition"') && !ownerWorkspace.includes('StatusScopeHelp scope="drawingRecognition"') && !recognitionWorkspace.includes('StatusScopeHelp scope="drawingRecognition"'));

const bomCreate = read("src/components/bom-create-workflow.tsx");
const accounts = read("src/app/settings/accounts/page.tsx");
const invitations = read("src/app/settings/account-invitations/page.tsx");
const publicShare = read("src/app/share/[token]/page.tsx");
check("SURFACE-bom-scope", bomCreate.includes('StatusScopeHelp scope="bomCreate"') && bomCreate.includes('getStatusDisplay(draft.status, "bomDraft")'));
check("SURFACE-admin-scopes", accounts.includes('StatusScopeHelp scope="accountList"') && invitations.includes('StatusScopeHelp scope="invitationList"'));
check("SURFACE-public-safe-status", publicShare.includes('getStatusDisplay(value, "workflow").label') && !publicShare.includes("labels[value] ?? value"));
check("SURFACE-drawing-exception-group", read("src/app/numbering/drawings/page.tsx").includes("StatusSignalGroup") && read("src/components/part-detail-content.tsx").includes("缺製造圖"));
check("SURFACE-relation-exception-group", read("src/components/relation-workbench.tsx").includes("exceptionSignals"));

console.log(JSON.stringify({ suite: "DEV-080 status visibility contract", passed: record.length, failed: 0, record }, null, 2));
