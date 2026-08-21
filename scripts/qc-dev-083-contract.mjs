#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const expect = (name, condition) => checks.push({ name, condition: Boolean(condition) });
const frame = read("src/components/pdm-edit-page-frame.tsx");
const unified = read("src/components/unified-pdm-entity-detail-drawer.tsx");
const partProjection = read("src/components/part-projection.tsx");
const relationProjection = read("src/components/relation-projection.tsx");
const part = read("src/components/part-workbench.tsx");
const relation = read("src/components/relation-workbench.tsx");
const numberState = read("src/components/number-state-workspace.tsx");
const resolver = read("src/lib/pdm-detail-action-resolver.ts");
const entity = read("src/lib/pdm-entity-detail.ts");
const navigation = read("src/lib/pdm-review-navigation.ts");
const approvalRoute = read("src/lib/pdm-approval-owner-route.ts");
const files = [
  "src/app/numbering/workspaces/[workspaceId]/page.tsx",
  "src/app/parts/[partId]/workspace/page.tsx",
  "src/app/numbering/relations/[rootId]/workspace/page.tsx",
  "src/components/numbering-workspace-editor.tsx",
  "src/components/part-workspace-editor.tsx",
  "src/components/relation-workspace-editor.tsx"
];
for (const file of files) expect(`${file} exists`, fs.existsSync(path.join(root, file)));
expect("thin routes await params", read(files[0]).includes("params: Promise") && read(files[0]).includes("await params"));
expect("shared frame has no domain switch or API ownership", !frame.includes("domain ===") && !frame.includes("/api/") && !frame.includes("command"));
expect("candidate single owner page", read("src/components/numbering-workspace-editor.tsx").includes("/api/numbering/draft-workspaces/") && !numberState.includes("<WorkspaceDrawer"));
expect("drawer no command runner", !unified.includes("PdmDetailCommandDialog") && !unified.includes("PendingCommand") && !unified.includes("method: execution.method"));
expect("part projection read only", !partProjection.includes("method: \"PUT\"") && !partProjection.includes("showMaintenancePanel") && !partProjection.includes("onMaintenanceChanged"));
expect("relation projection read only", !relationProjection.includes("method: \"POST\"") && !relationProjection.includes("onRelationChange") && !relationProjection.includes("showMaintenancePanel"));
expect("list candidate drawer is readonly", part.includes("WorkspaceReadonlyDrawer") && relation.includes("WorkspaceReadonlyDrawer") && numberState.includes("WorkspaceReadonlyDrawer"));
expect("action resolver routes non drawing owner actions", resolver.includes("workspaceNavigationHref") && resolver.includes("/approvals/${encodeURIComponent(requestId)}"));
expect("stable owner routes composed", entity.includes("/numbering/workspaces/") && entity.includes("/parts/${encodeURIComponent(partRecord.id)}/workspace") && entity.includes("/numbering/relations/${encodeURIComponent(root.root.id)}/workspace"));
expect("safe return closed allowlist", navigation.includes("normalizePdmCandidateReturnTo") && navigation.includes("normalizePdmPartReturnTo") && navigation.includes("normalizePdmRelationReturnTo"));
expect("approval owner exact reviewer", approvalRoute.includes("/approvals/${encodeURIComponent(item.id)}?returnTo=") && !approvalRoute.includes("reviewRequestId: item.id"));
expect("bidirectional cursor server envelope", read("src/lib/part-workbench.ts").includes("previousCursor") && read("src/lib/relation-workbench.ts").includes("previousCursor") && read("src/lib/repositories/part-workbench-async-repository.ts").includes('direction?: "after" | "before"'));
expect("no new PDM write route", !fs.existsSync(path.join(root, "src/app/api/pdm/entity-details/write")));
for (const check of checks) console.log(`${check.condition ? "PASS" : "FAIL"} ${check.name}`);
if (checks.some((check) => !check.condition)) process.exitCode = 1;
