#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const contractSource = read("src/lib/approval-workbench-contract.ts");
const controllerSource = read("src/components/use-pdm-workbench-controller.ts");
const pageSource = read("src/app/approvals/page.tsx");
const routeSource = read("src/app/api/approvals/inbox/route.ts");
const decisionRouteSource = read("src/app/api/approvals/requests/[requestId]/decisions/route.ts");
const approvalPlatformSource = read("src/lib/approval-platform.ts");
const unifiedDrawerSource = read("src/components/unified-pdm-entity-detail-drawer.tsx");
const detailResolverSource = read("src/lib/pdm-detail-action-resolver.ts");
const repositorySource = read("src/lib/repositories/approval-platform-async-repository.ts");
const changeControlSource = read("src/lib/pdm-change-control-domain.ts");
const sidebarSource = read("src/components/sidebar-nav.tsx");

assert.match(contractSource, /approvalWorkbenchRowKey/);
assert.match(contractSource, /previousCursor\?\:/);
assert.match(controllerSource, /server-bidirectional/);
assert.match(controllerSource, /setCursorHistory\(cursorHistoryForLocation\(location\.cursor/u, "controller restores URL cursor through the bounded history helper");
assert.match(pageSource, /PdmWorkbenchList/);
assert.match(pageSource, /PdmWorkbenchPagination/);
assert.match(pageSource, /目前沒有符合條件的待處理審核/);
assert.match(pageSource, /isPdmOwnerApprovalAction/);
assert.match(pageSource, /無法對應原工作台資料/);
assert.match(routeSource, /buildPdmApprovalOwnerHref/);
assert.match(pageSource, /UnifiedPdmEntityDetailDrawer/);
assert.doesNotMatch(pageSource, /window\.location\.assign\(href\)/);
assert.doesNotMatch(unifiedDrawerSource, /showOwnerNavigation|primaryContextAction/);
assert.doesNotMatch(unifiedDrawerSource, /查看原工作台/);
assert.doesNotMatch(unifiedDrawerSource, /decision === "needs_info"|action\.kind === "return_for_correction"/);
assert.match(unifiedDrawerSource, /action\.execution\.type !== "command"/);
assert.doesNotMatch(read("src/lib/pdm-entity-detail.ts"), /review\.allowedDecisions\.filter/);
assert.match(detailResolverSource, /kind: "reject", label: "退回修改"/);
assert.match(detailResolverSource, /kind: "return_for_correction", label: "要求補充資料"/);
assert.match(detailResolverSource, /review\.allowedDecisions\.includes/);
assert.match(decisionRouteSource, /companyId: company\.company\.companyId/);
assert.doesNotMatch(decisionRouteSource, /此流程只提供核准或退回修改/);
assert.match(approvalPlatformSource, /if \(decision === "needs_info"\) return "request_more_information"/);
assert.match(approvalPlatformSource, /if \(decision === "rejected"\) return "return_for_replacement_part"/);
assert.match(changeControlSource, /action === "return_for_replacement_part" \|\| action === "request_more_information"/);
assert.match(read("db/schema.sql"), /'request_more_information'/);
assert.match(read("db/postgres/036_human_approval_decisions.sql"), /review_confirmation_events_action_check/);
assert.doesNotMatch(decisionRouteSource, /companyId: String\(body\.company/);
assert.match(approvalPlatformSource, /getRequestDetail\(input\.requestId, input\.companyId\)/);
assert.match(approvalPlatformSource, /const companyId = input\.companyId \?\? "company-jenfu";/);
for (const workbenchSource of [read("src/components/drawing-workbench.tsx"), read("src/components/part-workbench.tsx"), read("src/components/relation-workbench.tsx")]) {
  assert.match(workbenchSource, /function shouldSkipUnifiedReviewDetail\(\)/);
  assert.doesNotMatch(workbenchSource, /shouldSkipUnifiedReviewDetail\(unifiedEntityDetailEnabled\)/);
}
assert.match(routeSource, /decodePdmWorkbenchCursor/);
assert.match(routeSource, /previousCursor/);
assert.match(repositorySource, /approvalPlatformInboxRowKey/);
assert.match(repositorySource, /approval_platform_impact_snapshots/);
assert.match(sidebarSource, /body\?\.summary\?\.pending/);
assert.doesNotMatch(pageSource, /return nextItems\[0\]\?\.id/);

const { encodePdmWorkbenchCursor, decodePdmWorkbenchCursor, pdmWorkbenchFilterHash } = await import(
  pathToFileURL(path.join(root, "src/lib/pdm-workbench-cursor.ts")).href
);
const filterHash = pdmWorkbenchFilterHash({
  namespace: "approval-inbox-v1",
  filters: { status: "active", domain: "all", action: "all", query: "", limit: 100 },
  companyId: "company-jenfu",
  actorId: "qc-reviewer"
});
const encoded = encodePdmWorkbenchCursor({
  version: 1,
  filterHash,
  updatedAt: "2026-08-12T10:00:00.000Z",
  sortValue: "2026-08-12T10:00:00.000Z",
  rowKey: "approval:platform:APR-qc-001",
  direction: "before",
  pageIndex: 2
});
const decoded = decodePdmWorkbenchCursor(encoded, filterHash);
assert.equal(decoded.direction, "before");
assert.equal(decoded.pageIndex, 2);
assert.throws(() => decodePdmWorkbenchCursor(encoded, `${filterHash}-changed`), /篩選條件已改變|清單位置已失效/);

console.log("QC DEV-070 contract: PASS (shared list, fixed human decisions, signed bidirectional cursor, exact badge summary, no first-row auto-open)");
