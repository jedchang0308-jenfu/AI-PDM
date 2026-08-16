import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

const statusDisplay = read("src/lib/status-display.ts");
const workspace = read("src/components/number-state-workspace.tsx");
const repository = read("src/lib/repositories/number-state-flow-async-repository.ts");
const approvals = read("src/app/approvals/page.tsx");
const handoff = read("src/app/handoff/layout.tsx");
const transferWorkbench = read("src/components/transfer-package-workbench.tsx");
const visibleSources = [workspace, approvals, handoff, transferWorkbench].join("\n");

record(
  "NE-001 centralized numbering vocabulary",
  includesAll(statusDisplay, [
    '| "numberEffectiveness"',
    "const numberEffectivenessStatuses",
    'keys: ["preview"]',
    'label: "編號申請"',
    'keys: ["candidate", "active", "review_locked", "approved_locked"]',
    'label: "申請中"',
    'keys: ["official", "promoted", "legacy_official_reservation"]',
    'label: "已發布"',
    'keys: ["recycled", "released"]',
    'label: "已取消"',
    "numberEffectiveness: numberEffectivenessStatuses"
  ]),
  "status-display must own the compatibility projection without old number-effectiveness labels"
);

record(
  "NE-002 list and detail use the simplified projection",
  includesAll(workspace, [
    'type NumberQualification = "unnumbered" | "candidate" | "official" | "legacy_official_reservation"',
    'const helpScope: StatusScopeId = active === "reserved" ? "numberStateWorkspace" : config.officialHelpScope;',
    'buttonLabel={`查看${activeLabel}分頁說明`}',
    'className="number-state-tab-help"',
    "尚未產生編號",
    "申請名稱、編號或 ID",
    "編號申請清單",
    "申請狀態"
  ]) &&
    !workspace.includes("numberEffectiveness") &&
    !workspace.includes("qualification-") &&
    !workspace.includes("function qualificationLabel") &&
    !workspace.includes('<StatusHelpPopover context="numberEffectiveness"') &&
    !workspace.includes('已保留號碼與正式資料分開保存。</p>'),
  "normal UI must use process status and consolidate help into the active-tab trigger"
);

const forbiddenVisibleTerms = ["候選號", "候選圖號", "候選料號", "未領號", "號碼資格", "號碼效力", "舊制保留", "已回收", "保留號"];
record(
  "NE-003 retired terms are absent from affected user surfaces",
  forbiddenVisibleTerms.every((term) => !visibleSources.includes(term)),
  `forbidden visible terms: ${forbiddenVisibleTerms.filter((term) => visibleSources.includes(term)).join(", ") || "none"}`
);

record(
  "NE-004 internal state machine remains intact",
  workspace.includes('type NumberQualification = "unnumbered" | "candidate" | "official" | "legacy_official_reservation"') &&
    repository.includes('export type NumberCandidateState = "active" | "review_locked" | "approved_locked" | "promoted" | "recycled"'),
  "this change must not alter persisted or API state values"
);

record(
  "NE-005 related workflow copy uses stable numbering nouns",
  includesAll(workspace, ["編號服務", "編號申請"]) &&
    includesAll(approvals, ["編號申請案件", "首版準備"]) &&
    includesAll(handoff, ["尚未發布的編號"]) &&
    includesAll(transferWorkbench, ["案件範圍與編號已鎖定"]),
  "adjacent surfaces must use the same user vocabulary"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ suite: "pdm-number-effectiveness-ui", passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
