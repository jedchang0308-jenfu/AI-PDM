#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function includesAll(source, tokens) {
  return tokens.every((token) => source.includes(token));
}

const productionSlice = read("src/lib/production-slice.ts");
const dbProvider = read("src/lib/db-async-provider.ts");
const commandService = read("src/lib/platform-command-service.ts");
const policy = read("src/lib/pdm-lifecycle-policy.ts");
const repository = read("src/lib/repositories/numbering-async-repository.ts");
const numberingAsync = read("src/lib/numbering-async.ts");
const directRoute = read("src/app/api/numbering/records/[rootCode]/obsolete/route.ts");
const impactRoute = read("src/app/api/numbering/roots/[rootCode]/obsolete-impact/route.ts");
const lifecycleRoute = read("src/app/api/lifecycle/obsolete-requests/route.ts");
const component = read("src/components/numbering-contextual-entrypoints.tsx");
const decisionsRoute = read("src/app/api/approvals/requests/[requestId]/decisions/route.ts");
const applyRoute = read("src/app/api/approvals/requests/[requestId]/apply/route.ts");
const inboxRoute = read("src/app/api/approvals/inbox/route.ts");
const devTask = read(".ai-doc/dev_task.md");

record("Lifecycle gate has containment, draft-obsolete, and formal-obsolete states", includesAll(productionSlice, [
  "PDM_PRODUCTION_NUMBERING_LIFECYCLE_GATE",
  '"containment", "draft-obsolete", "formal-obsolete"',
  "productionNumberingLifecycleCapability"
]));
record("Lifecycle mutation allowlist never includes draft DELETE", productionSlice.includes("numberingLifecycleApiMutationMatchers") && !productionSlice.includes('method: "DELETE"'));
record("SQLite and PostgreSQL transaction isolation are explicit", includesAll(dbProvider, ["BEGIN IMMEDIATE", "BEGIN ISOLATION LEVEL SERIALIZABLE", "serializable?: boolean"]));
record("Command service forwards serializable transaction option", includesAll(commandService, ["serializable?: boolean", "serializable: input.serializable"]));
record("Root policy distinguishes direct draft obsolete from formal approval", includesAll(policy, ["buildNumberingPartRootLifecyclePolicy", "obsolete_draft_official_number", "request_formal_obsolete", "LIFE_ROOT_MIXED_OR_TERMINAL"]));
record("Root impact exposes dependency summary, approval targets, and policy", includesAll(repository, ["RootObsoleteDependencySummary", "approvalTargets", "dependencySummary", "buildNumberingPartRootLifecyclePolicy"]));
record("Direct draft obsolete is an idempotent command with confirmation", includesAll(directRoute, ["idempotency-key", "confirmObsolete"]) && productionSlice.includes("feature_not_open_in_production_slice") && numberingAsync.includes("pdm.numbering.obsolete_official_draft_bundle"));
record("Formal obsolete request is an idempotent command and gate checked", includesAll(lifecycleRoute, ["idempotency-key", "requestRootObsoleteApprovalAsync", "requestNumberingObsoleteApprovalAsync"]) && productionSlice.includes('"formal-obsolete"') && numberingAsync.includes("pdm.numbering.request_root_obsolete"));
record("Formal apply rechecks snapshot fingerprint and target statuses", includesAll(repository, ["dependencyFingerprint", "ROOT_OBSOLETE_SNAPSHOT_STALE", "approvalTargets", "excludeApprovalRequestId"]));
record("Production approval routes are server-scoped to the three lifecycle actions", includesAll(decisionsRoute, ["isProductionNumberingLifecycleApprovalAction", "formal-obsolete"]) && includesAll(applyRoute, ["isProductionNumberingLifecycleApprovalAction", "formal-obsolete"]) && includesAll(inboxRoute, ["allowedActionCodes", "obsolete_part_root"]));
record("Root UI uses obsolete vocabulary and never calls DELETE draft route", includesAll(component, ["作廢草稿編號", "obsolete_draft_root", "confirmObsolete: true", "編號不會被刪除或回收"]) && !component.includes('method: "DELETE"') && !component.includes("刪除草稿"));
record("DEV-077 is documented at RD Implementation Ready", includesAll(devTask, ["DEV-077", "RD Implementation Ready", "HD-077-01", "HD-077-02", "HD-077-03"]));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
