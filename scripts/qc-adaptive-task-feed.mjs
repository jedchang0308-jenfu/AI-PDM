import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const checks = [];

function assert(condition, message) {
  checks.push({ message, passed: Boolean(condition) });
  if (!condition) throw new Error(message);
}

const feed = readProjectFile(root, "src/lib/adaptive-task-feed.ts");
const dashboard = readProjectFile(root, "src/components/dashboard.tsx");
const css = readProjectFile(root, "src/app/globals.css");
const packageJson = readProjectJson(root, "package.json");

for (const token of ["TaskSummary", "TaskSummaryRole", "TaskSummarySource", "TaskSummarySignal", "buildAdaptiveTaskFeed"]) {
  assert(feed.includes(token), `adaptive task feed exports ${token}`);
}

for (const role of ["Engineer", "R&D Manager", "Admin", "QA/QC", "PM", "Manufacturing", "Procurement", "Supplier"]) {
  assert(feed.includes(role), `adaptive task feed covers role ${role}`);
}

for (const signal of ["overdue", "blocked", "risk", "review", "handoff", "system_exception", "draft"]) {
  assert(feed.includes(signal), `adaptive task feed scores signal ${signal}`);
}

for (const source of ["numbering_task", "notification", "handoff_readiness", "storage_evidence", "submission"]) {
  assert(feed.includes(source), `adaptive task feed supports source ${source}`);
}

assert(feed.includes("ROLE_TASK_WEIGHTS"), "adaptive task feed defines role weighting");
assert(feed.includes("notificationSummary") && feed.includes("notifications"), "adaptive task feed consumes notification adapter data");
assert(feed.includes("numberingDraftCount"), "adaptive task feed consumes numbering task adapter data");
assert(feed.includes("hasMissingHandoff"), "adaptive task feed derives handoff readiness adapter data");
assert(feed.includes("storageEvidence"), "adaptive task feed consumes storage evidence adapter data");
assert(feed.includes("tasks.length === 0"), "adaptive task feed keeps empty-state fallback");
assert(feed.includes("sort((a, b) => b.score - a.score"), "adaptive task feed sorts by computed score");

assert(dashboard.includes("buildAdaptiveTaskFeed"), "dashboard imports adaptive task feed builder");
assert(dashboard.includes("AdaptiveTaskFeedPanel"), "dashboard renders adaptive task feed panel");
assert(dashboard.includes("notificationSummary") && dashboard.includes("numberingDrafts.length"), "dashboard passes existing task sources into adaptive feed");
assert(dashboard.includes("storageEvidence.run?.severity"), "dashboard passes storage evidence severity into adaptive feed");
assert(dashboard.includes("下一個該處理的任務"), "dashboard labels the adaptive next task panel");

assert(css.includes(".adaptive-task-feed-grid"), "adaptive task feed grid CSS exists");
assert(css.includes(".adaptive-task-card.critical"), "adaptive task feed critical state CSS exists");
assert(css.includes(".adaptive-task-card.warning"), "adaptive task feed warning state CSS exists");
assert(css.includes(".adaptive-task-card.success"), "adaptive task feed success state CSS exists");
assert(packageJson.scripts["qc:adaptive-task-feed"] === "node scripts/qc-adaptive-task-feed.mjs", "package script qc:adaptive-task-feed is registered");

console.log(`qc:adaptive-task-feed passed ${checks.length}/${checks.length} checks`);
