#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const results = [];
function check(id, passed, detail = "") { results.push({ id, passed: Boolean(passed), detail }); }

const statusDisplay = read("src/lib/status-display.ts");
const scopeDisplay = read("src/lib/status-scope-display.ts");
const policy = read("src/lib/status-visibility-policy.ts");
const signalGroup = read("src/components/status-signal-group.tsx");
const badge = read("src/components/human-status-badge.tsx");
const hints = read("src/components/status-help-popover.tsx");
const css = read("src/app/globals.css");
const recognitionChip = read("src/components/drawing-recognition-status-chip.tsx");
const recognitionReview = read("src/components/drawing-recognition-review.tsx");
const publicShare = read("src/app/share/[token]/page.tsx");
const accounts = read("src/app/settings/accounts/page.tsx");
const invitations = read("src/app/settings/account-invitations/page.tsx");
const approvals = read("src/app/approvals/page.tsx");
const settings = read("src/components/settings-screen.tsx");

for (const context of ["masterRecord", "approvalStatus", "publicationStatus", "readinessStatus", "fileStatus", "accountStatus", "invitationStatus", "recognitionStatus", "recognitionReviewStatus"]) {
  check(`CTX-${context}`, statusDisplay.includes(`| "${context}"`) && statusDisplay.includes(`${context}:`));
}
for (const scope of ["approvalInbox", "accountList", "invitationList", "handoffWorkbench", "drawingRecognition"]) {
  check(`SCOPE-${scope}`, scopeDisplay.includes(`${scope}: {`) && scopeDisplay.includes(`id: "${scope}"`));
}
check("POLICY-current-projector", policy.includes("export function projectStatusVisibility") && policy.includes("export function projectStatusSignals"));
check("POLICY-unknown-fail-closed", policy.includes('label: "待確認"') && policy.includes('reason: "unregistered_status"') && policy.includes('level: "exception"'));
check("POLICY-one-primary-ranked-exceptions", policy.includes("primary:") && policy.includes("exception:") && policy.includes("exceptions"));
check("GROUP-click-touch-isolated", signalGroup.includes("onClick") && signalGroup.includes("event.stopPropagation()") && signalGroup.includes("pointerdown"));
check("GROUP-escape-focus-return", signalGroup.includes('event.key !== "Escape"') && signalGroup.includes("triggerRef.current?.focus()"));
check("GROUP-accessible-dialog", signalGroup.includes('role="dialog"') && signalGroup.includes("aria-expanded={open}") && signalGroup.includes("aria-controls"));
check("BADGE-central-projection", badge.includes("StatusSignalGroup") && badge.includes("exceptionSignals"));
check("HINT-accessible-portal", hints.includes("createPortal") && hints.includes("aria-expanded={open}"));
for (const cssToken of [".status-signal-group", ".status-signal-popover", ".status-scope-help-popover", "max-width: calc(100vw - 24px)"]) check(`CSS-${cssToken}`, css.includes(cssToken));
check("RECOG-central-status", recognitionChip.includes('getStatusDisplay(session.status, "recognitionStatus")'));
check("RECOG-central-review", recognitionReview.includes('getStatusDisplay(candidate.reviewState, "recognitionReviewStatus")'));
check("RECOG-current-scope-help", recognitionReview.includes('StatusScopeHelp scope="drawingRecognition"'));
check("SURFACE-admin-scopes", accounts.includes('StatusScopeHelp scope="accountList"') && invitations.includes('StatusScopeHelp scope="invitationList"'));
check("SURFACE-approval-settings-scopes", approvals.includes('StatusScopeHelp scope="approvalInbox"') && settings.includes('StatusScopeHelp scope="settingsCenter"'));
check("SURFACE-public-safe-status", publicShare.includes('getStatusDisplay(value, "workflow").label') && !publicShare.includes("labels[value] ?? value"));
check("RETIRED-no-bom-scope", !scopeDisplay.includes("bomCreate") && !scopeDisplay.includes("bomWorkbench"));
check("RETIRED-no-bom-page-or-api", !exists("src/app/bom/create/page.tsx") && !exists("src/app/bom/workbench/page.tsx") && !exists("src/app/api/bom/create-candidates/route.ts"));
check("RETIRED-no-legacy-status-owners", !exists("src/components/bom-create-workflow.tsx") && !exists("src/components/relation-workbench.tsx"));

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id}${result.detail ? ` — ${result.detail}` : ""}`);
console.log(JSON.stringify({ suite: "DEV-080 current residual status contract", passed: results.filter((item) => item.passed).length, failed: results.filter((item) => !item.passed).length, results }, null, 2));
if (results.some((item) => !item.passed)) process.exitCode = 1;
