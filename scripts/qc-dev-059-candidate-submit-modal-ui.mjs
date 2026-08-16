#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const results = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });
const has = (source, fragments) => fragments.every((fragment) => source.includes(fragment));

const workspace = read("src/components/number-state-workspace.tsx");
const drawer = read("src/components/pdm-entity-detail-drawer.tsx");
const workbench = read("src/components/drawing-workbench.tsx");

record("DEV059-UI-001 confirmation is a modal alertdialog with a visible close contract",
  has(workspace, [
    'role="alertdialog"',
    'aria-modal="true"',
    'aria-labelledby="number-state-confirm-title"',
    'aria-label="關閉確認"',
    "返回檢查"
  ]));
record("DEV059-UI-002 modal controls are real non-submit buttons",
  has(workspace, [
    'className="icon-button" type="button"',
    'className="secondary-button" type="button"',
    'data-number-state-modal-close="true"'
  ]));
record("DEV059-UI-003 native capture shield prevents detail-drawer outside-click interference",
  has(workspace, [
    'backdrop.addEventListener("pointerdown", stopUnderlyingDrawerPointer, true)',
    'backdrop.addEventListener("click", closeFromNativeClick, true)',
    'event.stopPropagation();',
    'event.preventDefault();'
  ]));
record("DEV059-UI-004 native bridge removes only the confirmation modal and respects busy state",
  has(workspace, [
    'target.closest("[data-number-state-modal-close=\'true\']")',
    '|| busy) return;',
    'onClose();',
    'backdrop.removeEventListener("pointerdown", stopUnderlyingDrawerPointer, true)',
    'backdrop.removeEventListener("click", closeFromNativeClick, true)'
  ]));
record("DEV059-UI-005 Escape and focus lifecycle remain wired",
  has(workspace, [
    'event.key === "Escape"',
    'closeRef.current();',
    'data-autofocus',
    'window.addEventListener("keydown", handleKey)'
  ]));
record("DEV059-UI-006 underlying entity drawer still closes only for genuine outside pointerdown",
  has(drawer, [
    'document.addEventListener("pointerdown", handlePointerDown)',
    'target.closest(".pdm-detail-drawer")',
    'onClose();'
  ]));
record("DEV059-UI-007 no temporary DEV-059 console instrumentation remains",
  !workspace.includes("[DEV059]"));
record("DEV059-UI-008 structured API errors remain human-readable",
  has(workbench, [
    "typeof body.error === \"object\"",
    "candidate_review_service_unavailable",
    "送審服務目前不可用"
  ]));
record("DEV059-UI-009 response loss closes local modal and performs authoritative readback",
  has(workbench, [
    "try {",
    "response = await fetch(`/api/numbering/draft-workspaces/",
    "送審結果尚未確認；請重新整理狀態後再決定下一步。",
    "try { await refreshDetailAndRows(workspace.id); } catch {}",
    "setError(unknownResultMessage);"
  ]));
record("DEV059-UI-010 unified drawing workbench routes every candidate mutation through the shared confirmation modal",
  has(workbench, [
    "ConfirmDialog,",
    "const [confirmAction, setConfirmAction] = useState<WorkspaceAction | null>(null);",
    'onSubmit={() => setConfirmAction("submit")}',
    'onWithdraw={() => setConfirmAction("withdraw")}',
    'onPublish={() => setConfirmAction("publish")}',
    'onCancel={() => setConfirmAction("cancel")}',
    "detail?.candidate && confirmAction",
    "onConfirm={() => void runWorkspaceAction(confirmAction)}"
  ]) && !workbench.includes("window.confirm("));

const failed = results.filter((result) => !result.passed);
for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id}${result.detail ? ` — ${result.detail}` : ""}`);
console.log(`DEV-059 UI checks: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exitCode = 1;
